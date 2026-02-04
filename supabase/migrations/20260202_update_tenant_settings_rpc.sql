-- Migration: 新增/更新 update_tenant_settings_v1 RPC 函數
-- 用於店家設定頁面儲存 LINE OA ID 等設定

-- 刪除舊版本（如果存在）
DROP FUNCTION IF EXISTS update_tenant_settings_v1(UUID, JSONB);

-- 建立 update_tenant_settings_v1 函數
CREATE OR REPLACE FUNCTION update_tenant_settings_v1(
    p_tenant_id UUID,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_updated_fields JSONB := '{}'::JSONB;
BEGIN
    -- 取得當前使用者 ID
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '未授權：請先登入'
        );
    END IF;

    -- 檢查使用者在此租戶的角色
    SELECT role INTO v_user_role
    FROM tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id
      AND is_suspended = false;

    -- 只有 owner 和 admin 可以更新設定
    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '權限不足：只有擁有者和管理員可以更新店家設定'
        );
    END IF;

    -- 更新租戶設定
    UPDATE tenants
    SET
        name = COALESCE(p_data->>'name', name),
        shop_description = CASE
            WHEN p_data ? 'shop_description' THEN p_data->>'shop_description'
            ELSE shop_description
        END,
        business_hours = CASE
            WHEN p_data ? 'business_hours' THEN (p_data->'business_hours')::JSONB
            ELSE business_hours
        END,
        payment_info = CASE
            WHEN p_data ? 'payment_info' THEN (p_data->'payment_info')::JSONB
            ELSE payment_info
        END,
        line_channel_token = CASE
            WHEN p_data ? 'line_channel_token' THEN p_data->>'line_channel_token'
            ELSE line_channel_token
        END,
        line_channel_secret = CASE
            WHEN p_data ? 'line_channel_secret' THEN p_data->>'line_channel_secret'
            ELSE line_channel_secret
        END,
        line_oa_id = CASE
            WHEN p_data ? 'line_oa_id' THEN p_data->>'line_oa_id'
            ELSE line_oa_id
        END,
        admin_line_ids = CASE
            WHEN p_data ? 'admin_line_ids' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'admin_line_ids'))
            ELSE admin_line_ids
        END,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '找不到指定的租戶'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- 設定函數權限
GRANT EXECUTE ON FUNCTION update_tenant_settings_v1(UUID, JSONB) TO authenticated;

-- 新增註解
COMMENT ON FUNCTION update_tenant_settings_v1 IS '更新租戶設定，包含 LINE OA ID、Channel Token 等。只有 owner 和 admin 可以執行。';
