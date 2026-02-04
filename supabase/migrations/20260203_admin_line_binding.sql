-- =============================================
-- LINE 管理員綁定功能
-- 日期：2026-02-03
-- 說明：
--   1. tenant_users 新增 line_user_id, bind_code, bind_code_expires_at 欄位
--   2. generate_admin_bind_code - 生成綁定碼（Web 後台呼叫）
--   3. bind_admin_line_id - 驗碼綁定（Edge Function 呼叫）
--   4. get_admin_by_line_id - 查詢管理員身份（Edge Function 呼叫）
-- =============================================

-- =============================================
-- 1. 新增欄位到 tenant_users 表
-- =============================================
ALTER TABLE tenant_users
ADD COLUMN IF NOT EXISTS line_user_id TEXT,
ADD COLUMN IF NOT EXISTS bind_code TEXT,
ADD COLUMN IF NOT EXISTS bind_code_expires_at TIMESTAMPTZ;

-- 為 line_user_id 建立索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_tenant_users_line_user_id
ON tenant_users(line_user_id)
WHERE line_user_id IS NOT NULL;

-- 為 bind_code 建立索引（加速驗碼）
CREATE INDEX IF NOT EXISTS idx_tenant_users_bind_code
ON tenant_users(bind_code)
WHERE bind_code IS NOT NULL;

-- 同一租戶內同一 LINE ID 只能綁定一個管理員
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_tenant_line_unique
ON tenant_users(tenant_id, line_user_id)
WHERE line_user_id IS NOT NULL;

-- =============================================
-- 2. generate_admin_bind_code - 生成綁定碼
-- =============================================
CREATE OR REPLACE FUNCTION generate_admin_bind_code(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_tenant_user RECORD;
    v_bind_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'not_authenticated',
            'message', '未登入'
        );
    END IF;

    -- 檢查用戶是否為該租戶成員
    SELECT id, role, line_user_id, is_suspended
    INTO v_tenant_user
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'not_authorized',
            'message', '您不是此店家的成員'
        );
    END IF;

    -- 檢查是否已停權
    IF v_tenant_user.is_suspended THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'suspended',
            'message', '您的帳號已被停權'
        );
    END IF;

    -- 檢查是否已綁定 LINE
    IF v_tenant_user.line_user_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_bound',
            'message', '此帳號已綁定 LINE，如需重新綁定請聯繫店家擁有者'
        );
    END IF;

    -- 生成 6 碼英數字綁定碼（大寫）
    v_bind_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    v_expires_at := NOW() + INTERVAL '10 minutes';

    -- 更新 tenant_user 記錄
    UPDATE tenant_users
    SET bind_code = v_bind_code,
        bind_code_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = v_tenant_user.id;

    RETURN jsonb_build_object(
        'success', true,
        'bind_code', v_bind_code,
        'expires_at', v_expires_at,
        'message', '請在 10 分鐘內於 LINE 輸入：管理員綁定 ' || v_bind_code
    );
END;
$$;

-- =============================================
-- 3. bind_admin_line_id - 驗碼綁定（service_role）
-- =============================================
CREATE OR REPLACE FUNCTION bind_admin_line_id(
    p_bind_code TEXT,
    p_tenant_id UUID,
    p_line_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_user RECORD;
    v_tenant RECORD;
    v_normalized_code TEXT;
BEGIN
    -- 參數驗證
    IF p_bind_code IS NULL OR p_bind_code = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_params',
            'message', '格式錯誤，請輸入：管理員綁定 您的綁定碼'
        );
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_params',
            'message', '缺少租戶資訊'
        );
    END IF;

    IF p_line_user_id IS NULL OR p_line_user_id = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_params',
            'message', '無法取得 LINE 用戶資訊'
        );
    END IF;

    -- 正規化綁定碼（轉大寫、去空白）
    v_normalized_code := UPPER(TRIM(p_bind_code));

    -- 檢查此 LINE 是否已在該租戶綁定過
    IF EXISTS (
        SELECT 1 FROM tenant_users
        WHERE tenant_id = p_tenant_id
          AND line_user_id = p_line_user_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'line_already_bound',
            'message', '此 LINE 帳號已綁定管理員身份'
        );
    END IF;

    -- 查找匹配的綁定碼
    SELECT tu.id, tu.user_id, tu.role, tu.bind_code_expires_at,
           COALESCE(tu.display_name, u.email) AS display_name
    INTO v_tenant_user
    FROM tenant_users tu
    LEFT JOIN auth.users u ON u.id = tu.user_id
    WHERE tu.tenant_id = p_tenant_id
      AND tu.bind_code = v_normalized_code
      AND tu.line_user_id IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_code',
            'message', '綁定碼無效，請確認後重試'
        );
    END IF;

    -- 檢查是否過期
    IF v_tenant_user.bind_code_expires_at < NOW() THEN
        -- 清除過期的綁定碼
        UPDATE tenant_users
        SET bind_code = NULL,
            bind_code_expires_at = NULL,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id
          AND bind_code = v_normalized_code;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'code_expired',
            'message', '綁定碼已過期，請至後台重新生成'
        );
    END IF;

    -- 取得租戶資訊
    SELECT name, slug INTO v_tenant
    FROM tenants
    WHERE id = p_tenant_id;

    -- 執行綁定：更新 line_user_id，清除綁定碼
    UPDATE tenant_users
    SET line_user_id = p_line_user_id,
        bind_code = NULL,
        bind_code_expires_at = NULL,
        updated_at = NOW()
    WHERE id = v_tenant_user.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', '綁定成功！歡迎 ' || v_tenant_user.display_name || '（' || v_tenant.name || '）',
        'tenant_name', v_tenant.name,
        'display_name', v_tenant_user.display_name
    );
END;
$$;

-- =============================================
-- 4. get_admin_by_line_id - 查詢管理員身份（service_role）
-- =============================================
CREATE OR REPLACE FUNCTION get_admin_by_line_id(
    p_line_user_id TEXT,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_user RECORD;
    v_tenant RECORD;
BEGIN
    -- 參數驗證
    IF p_line_user_id IS NULL OR p_line_user_id = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_params',
            'message', '缺少 LINE 用戶資訊'
        );
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_params',
            'message', '缺少租戶資訊'
        );
    END IF;

    -- 查詢綁定記錄
    SELECT tu.id, tu.user_id, tu.tenant_id, tu.role, tu.is_suspended,
           COALESCE(tu.display_name, u.email) AS display_name
    INTO v_tenant_user
    FROM tenant_users tu
    LEFT JOIN auth.users u ON u.id = tu.user_id
    WHERE tu.tenant_id = p_tenant_id
      AND tu.line_user_id = p_line_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'not_bound',
            'message', '請先完成管理員綁定'
        );
    END IF;

    -- 檢查是否停權
    IF v_tenant_user.is_suspended THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'suspended',
            'message', '您的帳號已被停權，請聯繫店家負責人'
        );
    END IF;

    -- 取得租戶資訊
    SELECT name, slug INTO v_tenant
    FROM tenants
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_tenant_user.user_id,
        'tenant_id', v_tenant_user.tenant_id,
        'role', v_tenant_user.role,
        'display_name', v_tenant_user.display_name,
        'tenant_name', v_tenant.name,
        'tenant_slug', v_tenant.slug,
        'is_suspended', false
    );
END;
$$;

-- =============================================
-- 5. 更新 get_tenant_members 以包含 LINE 綁定狀態
-- =============================================
CREATE OR REPLACE FUNCTION get_tenant_members(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_is_super_admin BOOLEAN;
    v_members JSONB;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '未登入');
    END IF;

    -- 檢查是否為超級管理員
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

    -- 超管視為 owner 權限
    IF v_is_super_admin AND v_caller_role IS NULL THEN
        v_caller_role := 'super_admin';
    END IF;

    -- 取得成員列表（包含 email 和 LINE 綁定狀態）
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', tu.id,
            'tenant_id', tu.tenant_id,
            'user_id', tu.user_id,
            'role', tu.role,
            'display_name', tu.display_name,
            'is_suspended', tu.is_suspended,
            'line_user_id', tu.line_user_id,
            'has_line_binding', tu.line_user_id IS NOT NULL,
            'created_at', tu.created_at,
            'updated_at', tu.updated_at,
            'email', u.email
        ) ORDER BY
            CASE tu.role
                WHEN 'owner' THEN 1
                WHEN 'admin' THEN 2
                WHEN 'staff' THEN 3
                WHEN 'viewer' THEN 4
            END,
            tu.created_at
    ), '[]'::jsonb)
    INTO v_members
    FROM tenant_users tu
    LEFT JOIN auth.users u ON u.id = tu.user_id
    WHERE tu.tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'members', v_members,
        'caller_role', v_caller_role
    );
END;
$$;

-- =============================================
-- 權限設定
-- =============================================
-- generate_admin_bind_code: authenticated 用戶可呼叫
GRANT EXECUTE ON FUNCTION generate_admin_bind_code(UUID) TO authenticated;

-- bind_admin_line_id: 只有 service_role 可呼叫（Edge Function）
REVOKE ALL ON FUNCTION bind_admin_line_id(TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION bind_admin_line_id(TEXT, UUID, TEXT) FROM authenticated;

-- get_admin_by_line_id: 只有 service_role 可呼叫（Edge Function）
REVOKE ALL ON FUNCTION get_admin_by_line_id(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_by_line_id(TEXT, UUID) FROM authenticated;

-- get_tenant_members: authenticated 用戶可呼叫（已有內部權限檢查）
GRANT EXECUTE ON FUNCTION get_tenant_members(UUID) TO authenticated;
