-- ============================================
-- 聚合初始化 RPC - 解決前端 waterfall 問題
-- 一次回傳所有 dashboard 需要的資料
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_init_v1(
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN := false;
    v_tenants JSONB := '[]'::JSONB;
    v_current_tenant JSONB := NULL;
    v_stats JSONB := NULL;
    v_user_role TEXT := NULL;
    v_is_cross_tenant BOOLEAN := false;
    v_tenant_id UUID;
    v_today TIMESTAMPTZ;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Not authenticated'
        );
    END IF;

    -- ========================================
    -- 1. 檢查是否為超級管理員
    -- ========================================
    SELECT EXISTS (
        SELECT 1 FROM super_admins WHERE user_id = v_user_id
    ) INTO v_is_super_admin;

    -- ========================================
    -- 2. 取得用戶的所有租戶
    -- ========================================
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'slug', t.slug,
                'plan', t.plan,
                'is_active', t.is_active,
                'subscription_status', t.subscription_status,
                'user_role', tu.role,
                'created_at', t.created_at
            ) ORDER BY t.created_at DESC
        ),
        '[]'::JSONB
    ) INTO v_tenants
    FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE tu.user_id = v_user_id
      AND (tu.is_suspended IS NULL OR tu.is_suspended = false);

    -- ========================================
    -- 3. 如果有指定 slug，取得該租戶詳細資料
    -- ========================================
    IF p_tenant_slug IS NOT NULL THEN
        -- 先檢查用戶是否有權限存取該租戶
        SELECT
            t.id,
            tu.role,
            jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'slug', t.slug,
                'plan', t.plan,
                'is_active', t.is_active,
                'subscription_status', t.subscription_status,
                'line_channel_access_token', t.line_channel_access_token,
                'line_channel_secret', t.line_channel_secret,
                'line_oa_id', t.line_oa_id,
                'settings', t.settings,
                'created_at', t.created_at,
                'updated_at', t.updated_at,
                'user_role', tu.role,
                'is_cross_tenant_access', false,
                'actual_is_active', t.is_active
            )
        INTO v_tenant_id, v_user_role, v_current_tenant
        FROM tenants t
        LEFT JOIN tenant_users tu ON tu.tenant_id = t.id AND tu.user_id = v_user_id
        WHERE t.slug = p_tenant_slug;

        -- 如果用戶不是該租戶成員，但是超級管理員，允許跨租戶存取
        IF v_user_role IS NULL AND v_is_super_admin THEN
            SELECT
                t.id,
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'slug', t.slug,
                    'plan', t.plan,
                    'is_active', t.is_active,
                    'subscription_status', t.subscription_status,
                    'line_channel_access_token', t.line_channel_access_token,
                    'line_channel_secret', t.line_channel_secret,
                    'line_oa_id', t.line_oa_id,
                    'settings', t.settings,
                    'created_at', t.created_at,
                    'updated_at', t.updated_at,
                    'user_role', 'super_admin',
                    'is_cross_tenant_access', true,
                    'actual_is_active', t.is_active,
                    'is_super_admin', true
                )
            INTO v_tenant_id, v_current_tenant
            FROM tenants t
            WHERE t.slug = p_tenant_slug;

            v_user_role := 'super_admin';
            v_is_cross_tenant := true;
        END IF;

        -- 如果有找到租戶且有權限，取得統計資料
        IF v_tenant_id IS NOT NULL AND (v_user_role IS NOT NULL OR v_is_super_admin) THEN
            v_today := date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei');

            SELECT jsonb_build_object(
                'member_count', (
                    SELECT COUNT(*) FROM members WHERE tenant_id = v_tenant_id
                ),
                'product_count', (
                    SELECT COUNT(*) FROM products WHERE tenant_id = v_tenant_id
                ),
                'active_product_count', (
                    SELECT COUNT(*) FROM products
                    WHERE tenant_id = v_tenant_id AND status = 'active'
                ),
                'today_orders', (
                    SELECT COUNT(*) FROM order_items
                    WHERE tenant_id = v_tenant_id
                      AND created_at >= v_today
                ),
                'today_revenue', (
                    SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items
                    WHERE tenant_id = v_tenant_id
                      AND created_at >= v_today
                ),
                'pending_orders', (
                    SELECT COUNT(*) FROM order_items
                    WHERE tenant_id = v_tenant_id
                      AND is_arrived = false
                      AND checkout_id IS NULL
                ),
                'recent_orders', (
                    SELECT COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'id', id,
                                'customer_name', customer_name,
                                'item_name', item_name,
                                'quantity', quantity,
                                'unit_price', unit_price,
                                'created_at', created_at
                            ) ORDER BY created_at DESC
                        ),
                        '[]'::JSONB
                    )
                    FROM (
                        SELECT id, customer_name, item_name, quantity, unit_price, created_at
                        FROM order_items
                        WHERE tenant_id = v_tenant_id
                        ORDER BY created_at DESC
                        LIMIT 5
                    ) recent
                )
            ) INTO v_stats;
        END IF;
    END IF;

    -- ========================================
    -- 回傳結果
    -- ========================================
    RETURN jsonb_build_object(
        'success', true,
        'is_super_admin', v_is_super_admin,
        'tenants', v_tenants,
        'current_tenant', v_current_tenant,
        'user_role', v_user_role,
        'is_cross_tenant_access', v_is_cross_tenant,
        'stats', v_stats
    );
END;
$$;

-- 加上註解說明
COMMENT ON FUNCTION get_dashboard_init_v1 IS '聚合初始化 RPC - 一次回傳 dashboard 所需的所有資料，解決前端 waterfall 問題';
