-- =============================================
-- 修復 super_admins 表的 RLS 無限遞迴問題
-- 日期：2026-02-05
-- 問題：super_admins 表的 RLS 政策在檢查權限時查詢自己，造成無限遞迴
-- 解決：改用直接比較 auth.uid() = user_id，避免子查詢造成遞迴
-- =============================================

-- 先刪除所有可能造成遞迴的現有政策
DROP POLICY IF EXISTS "super_admins_select" ON super_admins;
DROP POLICY IF EXISTS "super_admins_insert" ON super_admins;
DROP POLICY IF EXISTS "super_admins_update" ON super_admins;
DROP POLICY IF EXISTS "super_admins_delete" ON super_admins;
DROP POLICY IF EXISTS "Users can view their own super_admin status" ON super_admins;
DROP POLICY IF EXISTS "Only super admins can view" ON super_admins;
DROP POLICY IF EXISTS "super_admins can read" ON super_admins;
DROP POLICY IF EXISTS "Enable read access for all users" ON super_admins;

-- 方案一：禁用 RLS（適合權限表，因為這個表的資料本身不敏感）
-- ALTER TABLE super_admins DISABLE ROW LEVEL SECURITY;

-- 方案二（推薦）：使用直接比較的 RLS 政策，避免遞迴
-- 確保 RLS 已啟用
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- 允許用戶只能查看自己的 super_admin 狀態
-- 使用直接比較 auth.uid() = user_id，不會造成遞迴
CREATE POLICY "super_admins_select_own" ON super_admins
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 如果需要讓 SECURITY DEFINER 函數能夠查詢所有 super_admins
-- 可以允許 postgres 用戶（函數擁有者）讀取所有資料
-- 注意：這個政策對 service_role 也有效
CREATE POLICY "super_admins_service_role" ON super_admins
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================
-- 同時修復 get_pending_join_requests 函數
-- 確保它使用 SECURITY DEFINER 並正確處理權限
-- =============================================
CREATE OR REPLACE FUNCTION get_pending_join_requests(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_is_super_admin BOOLEAN := false;
    v_requests JSONB;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '未登入');
    END IF;

    -- 檢查是否為超級管理員（使用直接比較，避免遞迴）
    SELECT EXISTS (
        SELECT 1 FROM super_admins WHERE user_id = v_user_id
    ) INTO v_is_super_admin;

    -- 檢查呼叫者角色
    SELECT role INTO v_caller_role
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    -- 如果不是成員也不是超管，拒絕存取
    IF v_caller_role IS NULL AND NOT v_is_super_admin THEN
        RETURN jsonb_build_object('success', false, 'error', '無權限存取此店家');
    END IF;

    -- 只有 owner 或 admin 可以查看申請（超管也可以）
    IF v_caller_role NOT IN ('owner', 'admin') AND NOT v_is_super_admin THEN
        RETURN jsonb_build_object('success', false, 'error', '無權限查看申請');
    END IF;

    -- 取得待審核申請
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', jr.id,
            'tenant_id', jr.tenant_id,
            'requester_user_id', jr.requester_user_id,
            'requester_email', u.email,
            'status', jr.status,
            'message', jr.message,
            'created_at', jr.created_at,
            'updated_at', jr.updated_at
        ) ORDER BY jr.created_at DESC
    ), '[]'::jsonb)
    INTO v_requests
    FROM join_requests jr
    LEFT JOIN auth.users u ON u.id = jr.requester_user_id
    WHERE jr.tenant_id = p_tenant_id
      AND jr.status = 'pending';

    RETURN jsonb_build_object(
        'success', true,
        'requests', v_requests
    );
END;
$$;

COMMENT ON FUNCTION get_pending_join_requests IS '取得指定租戶的待審核加入申請';

-- 授權
GRANT EXECUTE ON FUNCTION get_pending_join_requests(UUID) TO authenticated;
