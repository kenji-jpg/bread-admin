-- ============================================
-- 團隊管理功能 - RPC 函數
-- ============================================

-- 1. 取得店家所有成員 (包含 email)
-- ============================================
CREATE OR REPLACE FUNCTION get_tenant_members(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_result JSON;
BEGIN
    -- 取得當前使用者
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '未登入');
    END IF;

    -- 檢查呼叫者是否為該店家成員
    SELECT role INTO v_caller_role
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    IF v_caller_role IS NULL THEN
        RETURN json_build_object('success', false, 'error', '無權限查看');
    END IF;

    -- 取得所有成員資訊
    SELECT json_build_object(
        'success', true,
        'members', COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id', tu.id,
                    'user_id', tu.user_id,
                    'email', u.email,
                    'role', tu.role,
                    'display_name', tu.display_name,
                    'is_suspended', COALESCE(tu.is_suspended, false),
                    'created_at', tu.created_at,
                    'updated_at', tu.updated_at
                ) ORDER BY
                    CASE tu.role
                        WHEN 'owner' THEN 1
                        WHEN 'admin' THEN 2
                        WHEN 'staff' THEN 3
                        WHEN 'viewer' THEN 4
                    END,
                    tu.created_at
            )
            FROM tenant_users tu
            JOIN auth.users u ON u.id = tu.user_id
            WHERE tu.tenant_id = p_tenant_id
            ), '[]'::json
        ),
        'caller_role', v_caller_role
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 2. 更新成員角色
-- ============================================
CREATE OR REPLACE FUNCTION update_member_role(
    p_tenant_user_id UUID,
    p_new_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_target_tenant_id UUID;
    v_target_role TEXT;
    v_target_user_id UUID;
BEGIN
    -- 取得當前使用者
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '未登入');
    END IF;

    -- 驗證角色值
    IF p_new_role NOT IN ('admin', 'staff', 'viewer') THEN
        RETURN json_build_object('success', false, 'error', '無效的角色');
    END IF;

    -- 取得目標成員資訊
    SELECT tenant_id, role, user_id INTO v_target_tenant_id, v_target_role, v_target_user_id
    FROM tenant_users
    WHERE id = p_tenant_user_id;

    IF v_target_tenant_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '找不到成員');
    END IF;

    -- 不能修改 owner
    IF v_target_role = 'owner' THEN
        RETURN json_build_object('success', false, 'error', '無法修改店家擁有者的角色');
    END IF;

    -- 檢查呼叫者權限
    SELECT role INTO v_caller_role
    FROM tenant_users
    WHERE tenant_id = v_target_tenant_id AND user_id = v_user_id;

    -- 只有 owner 或 admin 可以修改角色
    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', '無權限修改角色');
    END IF;

    -- admin 不能修改其他 admin (只有 owner 可以)
    IF v_caller_role = 'admin' AND v_target_role = 'admin' THEN
        RETURN json_build_object('success', false, 'error', '管理員無法修改其他管理員的角色');
    END IF;

    -- 更新角色
    UPDATE tenant_users
    SET role = p_new_role, updated_at = NOW()
    WHERE id = p_tenant_user_id;

    RETURN json_build_object(
        'success', true,
        'message', '角色已更新'
    );
END;
$$;

-- 3. 停權/解除停權成員
-- ============================================
CREATE OR REPLACE FUNCTION toggle_member_suspension(
    p_tenant_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_target_tenant_id UUID;
    v_target_role TEXT;
    v_target_user_id UUID;
    v_current_suspended BOOLEAN;
    v_new_suspended BOOLEAN;
BEGIN
    -- 取得當前使用者
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '未登入');
    END IF;

    -- 取得目標成員資訊
    SELECT tenant_id, role, user_id, COALESCE(is_suspended, false)
    INTO v_target_tenant_id, v_target_role, v_target_user_id, v_current_suspended
    FROM tenant_users
    WHERE id = p_tenant_user_id;

    IF v_target_tenant_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '找不到成員');
    END IF;

    -- 不能停權 owner
    IF v_target_role = 'owner' THEN
        RETURN json_build_object('success', false, 'error', '無法停權店家擁有者');
    END IF;

    -- 不能停權自己
    IF v_target_user_id = v_user_id THEN
        RETURN json_build_object('success', false, 'error', '無法停權自己');
    END IF;

    -- 檢查呼叫者權限
    SELECT role INTO v_caller_role
    FROM tenant_users
    WHERE tenant_id = v_target_tenant_id AND user_id = v_user_id;

    -- 只有 owner 或 admin 可以停權成員
    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', '無權限停權成員');
    END IF;

    -- admin 不能停權其他 admin
    IF v_caller_role = 'admin' AND v_target_role = 'admin' THEN
        RETURN json_build_object('success', false, 'error', '管理員無法停權其他管理員');
    END IF;

    -- 切換停權狀態
    v_new_suspended := NOT v_current_suspended;

    UPDATE tenant_users
    SET is_suspended = v_new_suspended, updated_at = NOW()
    WHERE id = p_tenant_user_id;

    RETURN json_build_object(
        'success', true,
        'is_suspended', v_new_suspended,
        'message', CASE WHEN v_new_suspended THEN '已停權' ELSE '已解除停權' END
    );
END;
$$;

-- 4. 移除成員
-- ============================================
CREATE OR REPLACE FUNCTION remove_tenant_member(
    p_tenant_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_target_tenant_id UUID;
    v_target_role TEXT;
    v_target_user_id UUID;
    v_target_email TEXT;
BEGIN
    -- 取得當前使用者
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '未登入');
    END IF;

    -- 取得目標成員資訊
    SELECT tu.tenant_id, tu.role, tu.user_id, u.email
    INTO v_target_tenant_id, v_target_role, v_target_user_id, v_target_email
    FROM tenant_users tu
    JOIN auth.users u ON u.id = tu.user_id
    WHERE tu.id = p_tenant_user_id;

    IF v_target_tenant_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '找不到成員');
    END IF;

    -- 不能移除 owner
    IF v_target_role = 'owner' THEN
        RETURN json_build_object('success', false, 'error', '無法移除店家擁有者');
    END IF;

    -- 不能移除自己
    IF v_target_user_id = v_user_id THEN
        RETURN json_build_object('success', false, 'error', '無法移除自己');
    END IF;

    -- 檢查呼叫者權限
    SELECT role INTO v_caller_role
    FROM tenant_users
    WHERE tenant_id = v_target_tenant_id AND user_id = v_user_id;

    -- 只有 owner 或 admin 可以移除成員
    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', '無權限移除成員');
    END IF;

    -- admin 不能移除其他 admin
    IF v_caller_role = 'admin' AND v_target_role = 'admin' THEN
        RETURN json_build_object('success', false, 'error', '管理員無法移除其他管理員');
    END IF;

    -- 刪除成員
    DELETE FROM tenant_users WHERE id = p_tenant_user_id;

    RETURN json_build_object(
        'success', true,
        'message', v_target_email || ' 已從店家移除'
    );
END;
$$;

-- 5. 如果 tenant_users 沒有 is_suspended 欄位，新增它
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_users' AND column_name = 'is_suspended'
    ) THEN
        ALTER TABLE tenant_users ADD COLUMN is_suspended BOOLEAN DEFAULT false;
    END IF;
END $$;
