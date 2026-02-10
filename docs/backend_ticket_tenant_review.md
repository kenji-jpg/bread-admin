# 🎫 後端工單：租戶建立審核機制

> **建立日期：** 2026-02-05
> **完成日期：** 2026-02-11
> **狀態：** ✅ 已完成（前後端均已實作）

---

## 📋 工單摘要

本工單包含兩個部分：
1. **方案欄位修改**：將 `free` 方案統一改為 `basic`
2. **租戶建立審核機制**：新增申請審核流程，需超級管理員核准才能建立租戶

---

## 🔄 Part 1：方案欄位修改（free → basic）

### 需要執行的 SQL

```sql
-- 1. 修改 tenants 表的 plan 欄位預設值
ALTER TABLE tenants
ALTER COLUMN plan SET DEFAULT 'basic';

-- 2. 將現有的 free 方案更新為 basic
UPDATE tenants
SET plan = 'basic'
WHERE plan = 'free';

-- 3. 如果有 CHECK constraint，需要更新
-- （請先確認是否有 constraint，若有則執行）
-- ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
-- ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
--   CHECK (plan IN ('basic', 'pro'));

-- 4. 更新 register_tenant_with_plan 函數的預設值
-- （如果函數中有 p_plan_code 預設值為 'free'，請改為 'basic'）
```

### 驗證方式
```sql
-- 確認沒有 free 方案的租戶
SELECT COUNT(*) FROM tenants WHERE plan = 'free';
-- 預期結果：0
```

---

## 🆕 Part 2：租戶建立審核機制

### 2.1 新增資料表：`tenant_create_requests`

```sql
-- 建立租戶申請表
CREATE TABLE tenant_create_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_name TEXT NOT NULL,
    tenant_slug TEXT NOT NULL,
    plan_code TEXT NOT NULL DEFAULT 'basic' CHECK (plan_code IN ('basic', 'pro')),
    message TEXT,  -- 申請留言（選填）
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    reject_reason TEXT,
    created_tenant_id UUID REFERENCES tenants(id),  -- 核准後建立的租戶 ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_tcr_requester ON tenant_create_requests(requester_user_id);
CREATE INDEX idx_tcr_status ON tenant_create_requests(status);
CREATE INDEX idx_tcr_created_at ON tenant_create_requests(created_at DESC);

-- 唯一約束：同一用戶只能有一筆 pending 申請
CREATE UNIQUE INDEX idx_tcr_pending_user
ON tenant_create_requests(requester_user_id)
WHERE status = 'pending';

-- 唯一約束：pending 狀態的 slug 不能重複
CREATE UNIQUE INDEX idx_tcr_pending_slug
ON tenant_create_requests(tenant_slug)
WHERE status = 'pending';

-- 自動更新 updated_at
CREATE TRIGGER update_tenant_create_requests_updated_at
    BEFORE UPDATE ON tenant_create_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 註解
COMMENT ON TABLE tenant_create_requests IS '租戶建立申請表';
```

### 2.2 RLS 政策

```sql
-- 啟用 RLS
ALTER TABLE tenant_create_requests ENABLE ROW LEVEL SECURITY;

-- 用戶可以新增自己的申請
CREATE POLICY "tcr_insert_own" ON tenant_create_requests
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = requester_user_id);

-- 用戶可以查看自己的申請
CREATE POLICY "tcr_select_own" ON tenant_create_requests
FOR SELECT TO authenticated
USING (auth.uid() = requester_user_id);

-- 超級管理員可以查看所有申請
CREATE POLICY "tcr_select_super_admin" ON tenant_create_requests
FOR SELECT TO authenticated
USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

-- 超級管理員可以更新申請（審核）
CREATE POLICY "tcr_update_super_admin" ON tenant_create_requests
FOR UPDATE TO authenticated
USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
)
WITH CHECK (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

-- Service role 完全存取
CREATE POLICY "tcr_service_role" ON tenant_create_requests
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
```

### 2.3 RPC 函數

#### 函數 1：`request_create_tenant` - 提交建立租戶申請

```sql
CREATE OR REPLACE FUNCTION request_create_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan_code TEXT DEFAULT 'basic',
    p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_request_id UUID;
    v_existing_tenant UUID;
    v_existing_request UUID;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '未登入');
    END IF;

    -- 驗證 slug 格式
    IF p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RETURN jsonb_build_object('success', false, 'error', '網址代號格式不正確，只能使用小寫英文、數字和連字號');
    END IF;

    IF LENGTH(p_slug) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', '網址代號至少需要 3 個字元');
    END IF;

    -- 檢查 slug 是否已被使用（已存在的租戶）
    SELECT id INTO v_existing_tenant FROM tenants WHERE slug = p_slug;
    IF v_existing_tenant IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '此網址代號已被使用');
    END IF;

    -- 檢查是否有 pending 狀態的相同 slug
    SELECT id INTO v_existing_request
    FROM tenant_create_requests
    WHERE tenant_slug = p_slug AND status = 'pending';
    IF v_existing_request IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '此網址代號已有人申請中');
    END IF;

    -- 檢查用戶是否已有 pending 申請
    SELECT id INTO v_existing_request
    FROM tenant_create_requests
    WHERE requester_user_id = v_user_id AND status = 'pending';
    IF v_existing_request IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '您已有待審核的申請，請等待審核結果');
    END IF;

    -- 建立申請
    INSERT INTO tenant_create_requests (
        requester_user_id,
        tenant_name,
        tenant_slug,
        plan_code,
        message
    ) VALUES (
        v_user_id,
        p_name,
        p_slug,
        COALESCE(p_plan_code, 'basic'),
        p_message
    )
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'message', '申請已送出，請等待管理員審核'
    );
END;
$$;

COMMENT ON FUNCTION request_create_tenant IS '提交建立租戶申請';
GRANT EXECUTE ON FUNCTION request_create_tenant(TEXT, TEXT, TEXT, TEXT) TO authenticated;
```

#### 函數 2：`get_pending_create_requests` - 取得待審核申請（超管專用）

```sql
CREATE OR REPLACE FUNCTION get_pending_create_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_requests JSONB;
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

    IF NOT v_is_super_admin THEN
        RETURN jsonb_build_object('success', false, 'error', '無權限');
    END IF;

    -- 取得所有待審核申請
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', tcr.id,
            'requester_user_id', tcr.requester_user_id,
            'requester_email', u.email,
            'tenant_name', tcr.tenant_name,
            'tenant_slug', tcr.tenant_slug,
            'plan_code', tcr.plan_code,
            'message', tcr.message,
            'status', tcr.status,
            'created_at', tcr.created_at
        ) ORDER BY tcr.created_at ASC
    ), '[]'::jsonb)
    INTO v_requests
    FROM tenant_create_requests tcr
    LEFT JOIN auth.users u ON u.id = tcr.requester_user_id
    WHERE tcr.status = 'pending';

    RETURN jsonb_build_object(
        'success', true,
        'requests', v_requests,
        'count', jsonb_array_length(v_requests)
    );
END;
$$;

COMMENT ON FUNCTION get_pending_create_requests IS '取得所有待審核的租戶建立申請（超管專用）';
GRANT EXECUTE ON FUNCTION get_pending_create_requests() TO authenticated;
```

#### 函數 3：`review_create_request` - 審核申請（超管專用）

```sql
CREATE OR REPLACE FUNCTION review_create_request(
    p_request_id UUID,
    p_action TEXT,  -- 'approve' 或 'reject'
    p_reject_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_super_admin BOOLEAN;
    v_request RECORD;
    v_new_tenant RECORD;
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

    IF NOT v_is_super_admin THEN
        RETURN jsonb_build_object('success', false, 'error', '無權限');
    END IF;

    -- 驗證 action
    IF p_action NOT IN ('approve', 'reject') THEN
        RETURN jsonb_build_object('success', false, 'error', '無效的操作');
    END IF;

    -- 取得申請資料
    SELECT * INTO v_request
    FROM tenant_create_requests
    WHERE id = p_request_id;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '找不到申請');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', '此申請已被處理');
    END IF;

    -- 處理審核
    IF p_action = 'approve' THEN
        -- 再次檢查 slug 是否已被使用
        IF EXISTS (SELECT 1 FROM tenants WHERE slug = v_request.tenant_slug) THEN
            RETURN jsonb_build_object('success', false, 'error', '網址代號已被使用，無法核准');
        END IF;

        -- 建立租戶（使用現有的 register_tenant_with_plan 邏輯）
        INSERT INTO tenants (name, slug, plan, subscription_status, is_active)
        VALUES (v_request.tenant_name, v_request.tenant_slug, v_request.plan_code, 'active', true)
        RETURNING * INTO v_new_tenant;

        -- 將申請者設為 owner
        INSERT INTO tenant_users (tenant_id, user_id, role)
        VALUES (v_new_tenant.id, v_request.requester_user_id, 'owner');

        -- 更新申請狀態
        UPDATE tenant_create_requests
        SET
            status = 'approved',
            reviewed_by = v_user_id,
            reviewed_at = NOW(),
            created_tenant_id = v_new_tenant.id,
            updated_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'approved',
            'tenant_id', v_new_tenant.id,
            'tenant_slug', v_new_tenant.slug,
            'message', '已核准，租戶建立成功'
        );
    ELSE
        -- 拒絕申請
        UPDATE tenant_create_requests
        SET
            status = 'rejected',
            reviewed_by = v_user_id,
            reviewed_at = NOW(),
            reject_reason = p_reject_reason,
            updated_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'rejected',
            'message', '已拒絕申請'
        );
    END IF;
END;
$$;

COMMENT ON FUNCTION review_create_request IS '審核租戶建立申請（超管專用）';
GRANT EXECUTE ON FUNCTION review_create_request(UUID, TEXT, TEXT) TO authenticated;
```

#### 函數 4：`get_my_create_request` - 取得自己的申請狀態

```sql
CREATE OR REPLACE FUNCTION get_my_create_request()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_request RECORD;
BEGIN
    -- 取得當前用戶
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '未登入');
    END IF;

    -- 取得最新的申請（優先 pending）
    SELECT * INTO v_request
    FROM tenant_create_requests
    WHERE requester_user_id = v_user_id
    ORDER BY
        CASE status WHEN 'pending' THEN 0 ELSE 1 END,
        created_at DESC
    LIMIT 1;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'has_request', false
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'has_request', true,
        'request', jsonb_build_object(
            'id', v_request.id,
            'tenant_name', v_request.tenant_name,
            'tenant_slug', v_request.tenant_slug,
            'status', v_request.status,
            'reject_reason', v_request.reject_reason,
            'created_at', v_request.created_at,
            'reviewed_at', v_request.reviewed_at
        )
    );
END;
$$;

COMMENT ON FUNCTION get_my_create_request IS '取得當前用戶的租戶建立申請狀態';
GRANT EXECUTE ON FUNCTION get_my_create_request() TO authenticated;
```

---

## 📊 API 文檔更新

完成後請更新 `docs/supabase_functions_api_doc.md`，新增以下函數：

| 函數名稱 | 呼叫者 | 用途 |
|----------|--------|------|
| `request_create_tenant(p_name, p_slug, p_plan_code, p_message)` | 一般用戶 | 提交建立租戶申請 |
| `get_pending_create_requests()` | 超級管理員 | 取得所有待審核申請 |
| `review_create_request(p_request_id, p_action, p_reject_reason)` | 超級管理員 | 審核申請 |
| `get_my_create_request()` | 一般用戶 | 取得自己的申請狀態 |

---

## ✅ 驗收清單

- [x] Part 1：方案修改
  - [x] tenants.plan 預設值改為 'basic'
  - [x] 現有 free 資料更新為 basic
  - [x] register_tenant_with_plan 預設值確認
  - [x] tenants.plan 欄位新增 CHECK constraint (basic/pro)

- [x] Part 2：審核機制
  - [x] tenant_create_requests 表建立
  - [x] RLS 政策設定
  - [x] request_create_tenant 函數
  - [x] get_pending_create_requests 函數
  - [x] review_create_request 函數
  - [x] get_my_create_request 函數

- [x] 測試
  - [x] 用戶提交申請
  - [x] 重複申請被阻擋
  - [x] 超管查看申請列表
  - [x] 核准申請 → 租戶建立成功
  - [x] 拒絕申請 → 記錄拒絕原因

---

## 💬 備註

### 已完成的前端修改：
- `/app/create-tenant/new/page.tsx`：移除方案選擇 UI，改呼叫 `request_create_tenant`
- `/app/admin/tenants/new/page.tsx`：free → basic
- `/app/admin/tenants/page.tsx`：getPlanBadge default 改 Basic，新增審核頁面入口
- `/app/admin/t/[slug]/settings/page.tsx`：getPlanBadge default 改 Basic
- `/types/database.ts`：移除 'free' 類型
- 超管審核頁面 `/admin/tenants`：已整合申請審核功能

### 額外完成的相關功能：
- Plan Gating 系統（Basic/Pro 方案功能限制）
- `update_tenant_plan_v1` RPC（超管升降級方案）
- `hooks/use-permission.tsx`：`canAccessShop`、`canUseMyshipEmail`、`canUseChromeExtension`
- Sidebar Pro 功能鎖定 + Badge 顯示
- `get_dashboard_init_v1` RPC 回傳 `plan` 欄位
