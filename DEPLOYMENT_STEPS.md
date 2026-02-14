# 🚀 付款系統部署步驟

## ⚠️ 重要：必須按順序執行

---

## 1️⃣ 資料庫 Migration（Supabase Dashboard）

### Step 1: 登入 Supabase Dashboard
前往：https://supabase.com/dashboard/project/kashgsxlrdyuirijocld

### Step 2: 執行 Migration 1 - Payment System
1. 前往 **SQL Editor**
2. 開啟檔案：`supabase/migrations/20260214_payment_system.sql`
3. 複製完整內容
4. 貼上到 SQL Editor
5. 點擊 **Run** 執行

**預期結果**：
- ✅ `payment_transactions` 表建立成功
- ✅ 索引建立成功
- ✅ RLS policies 建立成功
- ✅ `tenants` 表新增 3 個欄位

### Step 3: 執行 Migration 2 - LINE Bank Function
1. 開啟檔案：`supabase/migrations/20260214_process_linebank_notification.sql`
2. 複製完整內容
3. 貼上到 SQL Editor
4. 點擊 **Run** 執行

**預期結果**：
- ✅ `process_linebank_notification` 函數建立成功

### Step 4: 驗證 Migration（在 SQL Editor 執行）

```sql
-- 1. 檢查 payment_transactions 表
SELECT * FROM information_schema.tables
WHERE table_name = 'payment_transactions';

-- 2. 檢查 tenants 新欄位
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenants'
  AND column_name IN ('subscription_starts_at', 'subscription_auto_renew', 'next_billing_date');

-- 3. 檢查 RPC 函數
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'process_linebank_notification';

-- 4. 測試 RPC 函數（用假資料）
SELECT process_linebank_notification('
您已成功轉出 NT$599 到 張高源

備註：test-tenant
時間：2024/02/14 15:30

--
LINE Bank 連線商業銀行
');
```

**預期結果**：
- 前 3 個查詢應該返回記錄
- 第 4 個測試會失敗（因為 test-tenant 不存在），但會返回清晰的錯誤訊息

---

## 2️⃣ 前端部署（Vercel）

### 自動部署
Vercel 會自動偵測並部署以下新增檔案：
- ✅ `app/admin/payments/page.tsx`
- ✅ `app/admin/payments/verify/page.tsx`
- ✅ `app/admin/t/[slug]/settings/billing/page.tsx`（已更新）
- ✅ `components/layout/sidebar.tsx`（已更新）

### 檢查部署狀態
1. 前往 Vercel Dashboard
2. 找到專案：`bread-admin-6k1p`
3. 檢查最新 deployment 狀態
4. 確認沒有 build errors

**部署後測試 URL**：
- 付款管理：`https://plushub.cc/admin/payments`
- 付款驗證：`https://plushub.cc/admin/payments/verify`
- 租戶帳單：`https://plushub.cc/admin/t/{slug}/settings/billing`

---

## 3️⃣ 功能測試

### Test 1: 超管付款管理頁面
1. 以超管身份登入
2. 前往 `/admin/payments`
3. 確認頁面載入正常
4. 檢查統計數據（可能為空，正常）
5. 檢查「驗證付款通知」按鈕可點擊

### Test 2: 付款驗證功能
1. 前往 `/admin/payments/verify`
2. 貼上測試通知（用真實租戶 slug）：
```
您已成功轉出 NT$599 到 張高源

備註：[你的真實租戶 slug]
時間：2024/02/14 15:30

--
LINE Bank 連線商業銀行
```
3. 點擊「驗證付款」
4. 確認結果顯示成功
5. 檢查租戶是否升級為 Pro

### Test 3: 租戶帳單頁面
1. 前往 `/admin/t/{slug}/settings/billing`
2. 確認顯示：
   - ✅ 當前方案（Basic/Pro）
   - ✅ 轉帳資訊（824, 111003274710, 張高源）
   - ✅ 備註顯示正確的 slug
   - ✅ 一鍵複製功能正常
3. 點擊「一鍵複製完整轉帳資訊」
4. 貼到記事本，確認格式正確

### Test 4: 手動升級功能
1. 前往 `/admin/payments`
2. 找一個 Basic 租戶（或建立測試租戶）
3. 點擊「手動升級」按鈕（如果有到期提醒卡片）
4. 填寫：
   - 訂閱類型：月繳
   - 金額：599
   - 備註：測試手動升級
5. 點擊「確認升級」
6. 確認成功訊息
7. 檢查付款記錄列表有新記錄
8. 檢查租戶已升級為 Pro

### Test 5: 權限控制
1. 登出超管
2. 以一般租戶身份登入
3. 手動前往 `/admin/payments`
4. 確認顯示「您沒有權限存取此頁面」
5. 前往側邊欄，確認看不到「付款管理」選項

---

## 4️⃣ 資料驗證（SQL 查詢）

執行以下 SQL 檢查資料完整性：

```sql
-- 1. 檢查付款記錄
SELECT
    pt.id,
    pt.tenant_slug,
    pt.amount,
    pt.subscription_type,
    pt.payment_status,
    t.plan,
    t.plan_expires_at
FROM payment_transactions pt
JOIN tenants t ON t.id = pt.tenant_id
ORDER BY pt.created_at DESC
LIMIT 10;

-- 2. 檢查即將到期的租戶（7 天內）
SELECT
    name,
    slug,
    plan,
    plan_expires_at,
    EXTRACT(DAY FROM (plan_expires_at - NOW())) as days_left
FROM tenants
WHERE plan = 'pro'
  AND plan_expires_at IS NOT NULL
  AND plan_expires_at <= NOW() + INTERVAL '7 days'
ORDER BY plan_expires_at ASC;

-- 3. 檢查 Pro 租戶訂閱狀態
SELECT
    name,
    slug,
    plan,
    subscription_starts_at,
    plan_expires_at,
    next_billing_date
FROM tenants
WHERE plan = 'pro'
ORDER BY plan_expires_at ASC;
```

---

## 5️⃣ Edge Function 部署（選填）

如果要自動到期檢查，需部署 Edge Function：

```bash
# 前往專案目錄
cd /Users/liuyixin/Desktop/nascent-oort

# 部署 Edge Function
npx supabase functions deploy check-subscription-expiry \
  --project-ref kashgsxlrdyuirijocld
```

**設定 Cron Job**（Supabase Dashboard）：
1. 前往 Database → Extensions
2. 啟用 `pg_cron` extension
3. 執行 SQL：
```sql
SELECT cron.schedule(
    'check-subscription-expiry',
    '0 2 * * *',  -- 每天 02:00
    $$
    SELECT net.http_post(
        url:='https://kashgsxlrdyuirijocld.supabase.co/functions/v1/check-subscription-expiry',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
    $$
);
```

---

## 6️⃣ 監控與維護

### 每日檢查
1. 前往 `/admin/payments`
2. 檢查待處理付款（pending status）
3. 檢查即將到期租戶（7 天內）
4. 處理 LINE Bank 通知

### 每週檢查
1. 檢視付款記錄表：
```sql
SELECT
    DATE_TRUNC('week', created_at) as week,
    COUNT(*) as total_payments,
    SUM(amount) as total_revenue,
    COUNT(*) FILTER (WHERE subscription_type = 'yearly') as yearly_count
FROM payment_transactions
WHERE payment_status = 'completed'
GROUP BY week
ORDER BY week DESC
LIMIT 4;
```

### 每月檢查
1. 檢視續約率
2. 檢視流失率
3. 匯出付款記錄用於會計

---

## ✅ 部署檢查清單

在正式上線前，確認以下項目：

### 資料庫
- [ ] `payment_transactions` 表建立成功
- [ ] `tenants` 新欄位建立成功
- [ ] `process_linebank_notification` RPC 可正常呼叫
- [ ] RLS policies 正確設定
- [ ] 測試 SQL 查詢正常

### 前端
- [ ] Vercel 部署成功（無 build errors）
- [ ] `/admin/payments` 頁面載入正常
- [ ] `/admin/payments/verify` 頁面載入正常
- [ ] 側邊欄顯示「付款管理」選項
- [ ] 權限控制正常（一般租戶看不到）

### 功能
- [ ] LINE Bank 通知解析正確
- [ ] 付款驗證流程正確（建立記錄 + 升級租戶）
- [ ] 手動升級功能正常
- [ ] 租戶帳單頁面顯示正確
- [ ] 一鍵複製功能正常
- [ ] 到期提醒正常顯示

### 安全
- [ ] 超管權限正確（只有超管能訪問）
- [ ] RLS policies 防止未授權訪問
- [ ] 敏感資料（payment_transactions）受保護
- [ ] 轉帳資訊正確顯示（824, 111003274710, 張高源）

---

## 🚨 常見問題

### Q1: Migration 執行失敗
**解決方案**：
1. 檢查是否已存在同名表/函數
2. 使用 `DROP TABLE IF EXISTS` 清理
3. 重新執行 Migration

### Q2: RPC 函數返回錯誤
**可能原因**：
- 用戶不是超管
- 通知格式不正確
- slug 不存在
- 金額錯誤

**檢查方式**：
```sql
-- 檢查用戶是否為超管
SELECT * FROM super_admins WHERE user_id = auth.uid();

-- 檢查租戶是否存在
SELECT * FROM tenants WHERE slug = 'your-slug';
```

### Q3: 前端頁面 404
**解決方案**：
1. 確認 Vercel 部署成功
2. 檢查檔案路徑正確
3. 清除瀏覽器快取
4. 重新部署 Vercel

### Q4: 權限問題（非超管看得到付款管理）
**解決方案**：
1. 檢查 `use-auth.tsx` 的 `isSuperAdmin` 邏輯
2. 檢查 `sidebar.tsx` 的 `superAdminItems` 條件
3. 確認 RLS policies 正確

---

## 📞 需要協助？

如有問題，請提供：
1. 錯誤訊息截圖
2. SQL 執行結果
3. Vercel 部署日誌
4. 瀏覽器 Console 錯誤

---

**部署日期**：2026-02-14
**預計時間**：15-30 分鐘
**風險等級**：低（可回滾）
