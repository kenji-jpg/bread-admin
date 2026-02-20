# CLAUDE.md - PlusHub 團購管理後台

> 最後更新：2026-02-20

## 專案概述

多租戶（Multi-tenant）LINE 團購管理 SaaS 系統（品牌名：**PlusHub**）。店家透過 LINE 官方帳號經營團購，後台管理商品、訂單、結帳、出貨、會員。支援 7-11 賣貨便物流整合。顧客透過 LIFF 商城頁面瀏覽商品並下單。

## 技術棧

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript
- **樣式**: Tailwind CSS 4 + Radix UI + Framer Motion
- **後端**: Supabase (PostgreSQL + RLS + RPC + Edge Functions)
- **表單**: React Hook Form + Zod v4 驗證
- **部署**: Vercel (專案: bread-admin-6k1p)
- **域名**: `plushub.cc`（www.plushub.cc）
- **Email**: Cloudflare Email Routing（`*@plushub.cc` → Worker / Gmail 轉發）
- **自動化**: Cloudflare Workers（賣貨便 email 自動化）+ Supabase Edge Functions（定時任務）
- **語言**: 繁體中文 (zh-TW)

> ⚠️ **已移除**：n8n、Baserow — 不再使用，程式碼中無任何整合。

## 常用指令

```bash
npm run dev      # 開發伺服器
npm run build    # 建置檢查
npm run lint     # ESLint 檢查
```

## 環境變數

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase 專案 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase 匿名金鑰
SUPABASE_SERVICE_ROLE_KEY       # Supabase 服務金鑰（僅伺服端）
NEXT_PUBLIC_LIFF_ID             # LINE LIFF App ID（平台預設，租戶可覆蓋）
```

## 專案結構

```
app/
├── login/, register/, forgot-password/   # 認證頁面
├── auth/
│   ├── callback/route.ts                 # OAuth 回呼（唯一 API route）
│   ├── redirect/page.tsx                 # 登入後路由判斷
│   └── reset-password/page.tsx           # 密碼重設
├── terms/, privacy/                      # 服務條款、隱私政策（公開，支援動態載入）
├── create-tenant/                        # 建立/加入店家（含同意條款 checkbox）
│   ├── page.tsx                          # 選擇頁
│   ├── new/page.tsx                      # 建立新租戶（含同意 TOS）
│   └── join/page.tsx                     # 加入現有租戶
├── admin/
│   ├── layout.tsx                        # 後台佈局（sidebar + header）
│   ├── page.tsx                          # 超管首頁
│   ├── legal/page.tsx                    # 法律條款動態管理（超管）
│   ├── payments/                         # 超管付款管理
│   │   ├── page.tsx                      # 付款列表
│   │   └── verify/page.tsx               # 付款驗證
│   ├── tenants/
│   │   ├── page.tsx                      # 租戶列表 + 管理
│   │   ├── new/page.tsx                  # 建立新租戶（超管）
│   │   └── requests/page.tsx             # 租戶申請審核
│   └── t/[slug]/                         # 店家管理（動態路由）
│       ├── page.tsx                      # 儀表板
│       ├── products/                     # 商品管理（列表/新增/編輯）
│       ├── orders/                       # 訂單管理（列表/手動下單）
│       ├── checkouts/                    # 結帳管理
│       ├── members/                      # 會員管理
│       ├── shop/                         # 商城管理（LIFF 外觀設定）
│       └── settings/                     # 店家設定（基本/付款/LINE/團隊）
│           └── billing/                  # 帳務（方案升級/轉帳資訊）
├── not-found.tsx                            # 自訂 404 頁面
├── error.tsx                                # 自訂錯誤邊界
├── s/                                    # LIFF 顧客端
│   ├── page.tsx                          # LIFF 回調中繼（重定向）
│   ├── layout.tsx                        # LiffProvider 包裝（動態取租戶 liff_id）
│   └── shop/[tenantSlug]/page.tsx        # 商城頁面（顧客瀏覽/下單/結帳）
components/
├── ui/                  # Radix UI 基礎元件（button, dialog, table 等）
├── layout/              # sidebar, header, tenant-switcher, theme-toggle
├── dashboard/           # stat-card
├── providers.tsx        # 全局 Providers（AuthProvider、TenantProvider、主題）
└── legal-content-renderer.tsx  # 法律文本渲染器（動態內容）
hooks/
├── use-auth.tsx                 # 認證 context（user, isSuperAdmin, tenants）
│                                # 優化：從 cookie 直接解碼 JWT，避免 AbortError
├── use-tenant.tsx               # 租戶 context（tenant, stats, userRole）
├── use-checkout.tsx             # 結帳 RPC 操作封裝
├── use-permission.tsx           # 權限判斷（canManageProducts 等）
├── use-secure-mutations.ts      # RPC 寫入操作工具函數
├── use-sidebar.tsx              # 側邊欄狀態
└── use-liff.tsx                 # LIFF SDK 初始化 + 分享連結工具
                                 # 接收 liffId prop（由 layout 從租戶動態取得）
                                 # getLiffShareUrl(path, customLiffId?)
                                 # getShopShareUrl(tenantSlug, customLiffId?)
lib/supabase/
├── client.ts            # 瀏覽器端 Supabase client
├── server.ts            # 伺服器端 Supabase client
└── direct-rpc.ts        # 直接 fetch RPC（繞過 auth 初始化阻塞）
types/
└── database.ts          # 完整資料庫型別定義
supabase/functions/
├── line-webhook/        # LINE Bot 訊息處理
├── notify-myship-url/   # 賣貨便取貨通知
└── check-subscription-expiry/  # 定時任務：訂閱到期自動停用（is_active=false）+ 降級 basic（每日凌晨 2 點）
workers/
└── myship-email/        # Cloudflare Worker（賣貨便 email 自動化）
    ├── src/index.ts     # Worker 主程式
    ├── wrangler.toml    # Cloudflare 部署設定
    └── package.json
```

## 資料庫架構（Supabase）

Supabase 專案 ID: `kashgsxlrdyuirijocld`

### 核心資料表

| 資料表 | 用途 | 備註 |
|--------|------|------|
| tenants | 店家（多租戶） | `settings` JSONB 含 shop 設定，`plan` 欄位控制方案（basic/pro/max），`liff_id` 租戶專屬 LIFF ID（可選），`myship_notify_email` 賣貨便通知信箱，`forward_email` 轉寄目標信箱 |
| tenant_users | 店家管理員（角色綁定） | |
| members | LINE 會員（顧客） | |
| products | 商品 | `show_in_shop` 控制商城顯示，`is_limited` 判斷預購/現貨模式 |
| product_variants | 商品規格 | 尚未使用 |
| order_items | 訂單品項 | |
| checkouts | 結帳單 | `shipping_details` JSONB 含三種出貨方式詳情 |
| shop_categories | 商城分類 | tenant_id + name 唯一 |
| auction_orders | 競標訂單 | |
| support_tickets | 客服工單 | |
| subscription_plans | 訂閱方案 | |
| super_admins | 超級管理員 | 寫入權限已全面封鎖 |
| super_admin_audit_log | 超管操作日誌 | |
| notifications | 通知 | 尚未使用 |
| line_group_mappings | LINE 群組對應 | |
| tenant_join_requests | 加入店家申請 | |
| tenant_create_requests | 建立店家申請 | |
| pending_uploads | 圖片暫存 | |
| purchase_sessions | 代購場次 | ⚠️ 已棄用，前端已移除，資料表暫保留 |

### 關鍵關聯

- 所有業務表都有 `tenant_id` 外鍵 → `tenants.id`
- `members.line_user_id` 連結 LINE 用戶
- `order_items` → `products`, `members`, `checkouts`
- `checkouts` → `members`
- `auction_orders` → `members`, `order_items`
- `tenant_users` → `auth.users`, `tenants`
- `products.session_id` → `purchase_sessions`（已棄用，商城商品 session_id = NULL）

### 商城相關設定

**tenants.settings JSONB 結構：**
```json
{
  "shop": {
    "banner_url": "https://...",
    "announcement": "公告文字",
    "accent_color": "#ff6b35",
    "product_sort": "created_at"
  }
}
```

**products.show_in_shop**：布林值，控制商品是否在 LIFF 商城中顯示。

**shop_categories 表**：管理商城分類標籤（name, sort_order, is_visible）。

### RPC 函數（前端使用中）

**認證 & 租戶**
- `get_dashboard_init_v1` — 聚合式初始化（租戶+統計+角色+訂閱到期資訊，單次呼叫）
- `get_user_tenants_v1` / `get_all_tenants_v1`
- `register_tenant_with_plan` / `update_tenant_settings_v1`
- `toggle_tenant_status_v1` / `delete_tenant`
- `link_tenant_owner` / `is_super_admin`

**商品**
- `create_product_v2` / `update_product_v1`
- `batch_delete_products_v1` / `batch_update_product_status_v1`
- `restock_product_v2`

**訂單**
- `update_order_item_v1` / `delete_order_item_v1` / `batch_delete_order_items_v1`
- `link_order_items_to_checkout_v1`

**結帳**（封裝在 `use-checkout.tsx`）
- `create_checkout_v2` / `list_checkouts_v1` / `get_checkout_detail_v1`
- `update_checkout_status_v1` / `delete_checkout_v1` / `batch_delete_checkouts_v1`

**競標**
- `get_auction_orders_v1` / `create_auction_order_v1`
- `admin_claim_auction_order_v1` / `admin_unclaim_auction_order_v1`
- `delete_auction_order_v1` / `delete_auction_orders_by_date_v1`

**會員**
- `search_members_v1` / `get_tenant_members`

**團隊管理**
- `update_member_role` / `toggle_member_suspension` / `remove_tenant_member`
- `generate_admin_bind_code`

**加入/建立申請**
- `request_join_tenant` / `review_join_request` / `get_pending_join_requests`
- `request_create_tenant` / `review_create_request` / `get_pending_create_requests` / `get_my_create_request`

**商城**
- `get_shop_settings_v1` — 取得商城設定（含 shop_categories）
- `update_shop_settings_v1` — 更新商城外觀設定（auth.uid() 驗證）
- `upsert_shop_categories_v1` — 新增/更新/刪除商城分類（auth.uid() 驗證）
- `get_session_products_v1` — LIFF 商城取得商品（anon 角色可用）
- `create_preorder_v1` — LIFF 顧客下單
- `get_member_preorders_v1` — LIFF 顧客查看自己的訂單
- `check_staff_by_line_id_v1` — LIFF 判斷是否為 staff
- `restock_session_product_v1` — LIFF staff 補貨
- `add_shop_product_v1` — LIFF staff 上架商品（含 `p_is_limited`, `p_category`, `p_end_time`，自動設 `show_in_shop=true`）
- `toggle_shop_product_v1` — LIFF staff 下架/重新上架商品
- `update_product_end_time_v1` — LIFF staff 設定/延長截止時間（支援獨立商品 + 場次商品）
- `get_shop_all_orders_v1` — LIFF staff 查看所有訂單

**賣貨便 Email 自動化**（Cloudflare Worker 呼叫，service_role 權限）
- `process_myship_order_email` — 訂單成立通知：用賣場名稱比對結帳單，記錄 CM 訂單編號，狀態 `url_sent` → `ordered`
- `process_myship_completed_email` — 買家取貨通知：用 CM 訂單編號比對結帳單，狀態 `ordered`/`shipped` → `completed`

**方案管理**
- `update_tenant_plan_v1` — 超管升降級租戶方案（basic/pro/max）

**付款管理（超管）**
- 超管付款管理系統（`/admin/payments`）：列表、驗證付款、升級方案

### RLS 重要規則

- `products_select` 允許匿名讀取：`session_id IS NOT NULL AND status = 'active'` 或 `show_in_shop = true AND status = 'active'`
- 這確保 Supabase Realtime 能推送商城商品的即時更新給 LIFF 顧客

### Edge Functions
- `line-webhook` — 接收 LINE Bot 訊息，處理下單、查詢等
- `notify-myship-url` — 發送賣貨便取貨通知給客戶
- `check-subscription-expiry` — 定時任務：檢查所有方案到期（不限 Pro），到期後設 `is_active=false` + 降級 basic（每日凌晨 2 點）

### Cloudflare Workers
- `myship-email-worker` — 接收所有 `*@plushub.cc` email，自動轉寄 + 處理賣貨便通知
  - 部署 URL: `https://myship-email-worker.l0953578860.workers.dev`
  - 觸發方式: Cloudflare Email Routing（`*@plushub.cc` catch-all → Worker）
  - 環境變數: `SUPABASE_URL`（vars）、`SUPABASE_SERVICE_ROLE_KEY`（secret）
  - 代碼位置: `workers/myship-email/src/index.ts`
  - **處理流程**：
    1. 收到信 → 用 `message.to` 查 `tenants.myship_notify_email` 找到租戶
    2. 取出 `tenants.forward_email` → 轉寄到租戶指定的 Gmail
    3. 如果寄件人是 `no-reply@sp88.com`（賣貨便）→ 解析 email 內容 → 呼叫 RPC 更新結帳單狀態
  - **賣場名稱比對**：Worker 解析時會去除括號暱稱（如 `Han. hui（huiiiiii）` → `Han. hui`），RPC 用前綴比對

### Cloudflare Email Routing（plushub.cc）
- `admin@plushub.cc` → 轉發到管理員 Gmail（自訂規則）
- `*@plushub.cc`（catch-all） → `myship-email-worker`
- 各租戶的 `myship_notify_email`（如 `mrsanapanman@plushub.cc`）用於接收賣貨便通知
- 各租戶的 `forward_email` 控制轉寄目標（Worker 自動查詢並轉寄）

## LIFF 商城架構

### 路由
- `/s/shop/[tenantSlug]` — 商城主頁（唯一的顧客端頁面）
- `/s` — LIFF 回調中繼頁，處理 OAuth 重定向後導回商城

### 功能
- 商品瀏覽（依分類篩選、搜尋）
- 即時動態：Supabase Realtime 監聽 products 表，商品被購買時顯示 +N 動畫（Max 方案或 Staff 才啟用）
- 熱門標記：sold_qty >= 5 顯示🔥標籤
- 顧客下單（喊單）+ 查看自己訂單
- **LIFF 結帳**：3 步驟 Modal（選擇出貨方式 → 確認 → 成功+匯款資訊+帳號複製）
- Staff 模式：上架商品（含拍照+相簿）、補貨、關閉收單、截止/延長時限
- 商城外觀由後台 `/admin/t/[slug]/shop` 控制（banner、公告、主題色、分類排序）

### 效能優化
- 商品在 LIFF init 完成前即可顯示（不等 `isReady`，只等 `isLoading`）
- 圖片壓縮：上傳時 client-side WebP 壓縮（400px max width, 0.7 quality）
- 圖片懶載入：前 4 張 `priority + eager`，其餘 `lazy`
- 已移除 30 秒輪詢（Realtime 已取代）
- `directRpc`：直接 fetch PostgREST，繞過 Supabase client auth 初始化阻塞

### Dev 模式 Staff Override
- URL 加 `?staff=1` 可在 localhost 強制開啟管理員模式（owner 角色）
- 僅 `NODE_ENV === 'development'` 生效，production 不受影響
- 範例：`http://localhost:3000/s/shop/mrsanpanman?staff=1`

### 商品雙模式（預購/現貨）

以 `products.is_limited` 欄位判斷模式，前端 `getProductMode()` 及相關邏輯皆以此為準：

| | 預購模式 (`is_limited=false`) | 現貨模式 (`is_limited=true`) |
|--|-------------------------------|------------------------------|
| 庫存可為負數 | ✅ | ❌（不得低於 0） |
| 完銷判斷 | 永不完銷 | `stock <= 0` 顯示完銷 |
| 購買數量限制 | 無限制 | 受 `stock` + `limit_qty` 限制 |
| 商品卡 badge | 藍色「預購」 | 綠色「現貨」+「剩N」 |
| Realtime 完銷同步 | 不觸發 | `is_limited && stock <= 0` |

### 商品卡 Badge 佈局
- **左上**：已售數量（+N），熱門商品顯示🔥
- **右上第一排**：預購/現貨（永遠顯示）
- **右上第二排**：倒數時間（有限時才顯示）

### LIFF Staff 上架 Modal
從 LIFF 管理員模式上架商品時可設定：
- 商品名稱、價格、圖片（拍照 or 相簿選取）
- 預購/現貨切換（`is_limited`），現貨模式可設庫存
- 分類標籤（從 `shopCategories` 取得選項）
- 收單時限：不限時 / 30分 / 1hr / 2hr
- 上架後自動 `show_in_shop = true`，直接進入商城

### LIFF 分享連結
- `getShopShareUrl(tenantSlug, customLiffId?)` → `https://liff.line.me/{liffId}/s/shop/{tenantSlug}`
- `getLiffShareUrl(path, customLiffId?)` — 通用版
- 定義在 `hooks/use-liff.tsx`，支援租戶專屬 LIFF ID 覆蓋

### 多租戶 LIFF 隔離（已完成）

- `tenants.liff_id` 欄位：可選，若設定則該租戶使用專屬 LIFF
- `app/s/layout.tsx`：從 URL 解析 `tenantSlug`，查詢 `tenants.liff_id`，動態傳給 `LiffProvider`
- `use-liff.tsx`：接收 `liffId` prop，初始化時使用租戶專屬或平台預設 LIFF ID
- 分享連結函數支援 `customLiffId` 參數
- **待完成**：後台設定頁加 LIFF ID 輸入框

## 權限系統（RBAC）

```
super_admin  → 全平台存取，審核租戶申請，方案升降級，付款管理
owner        → 店家設定、團隊管理、刪除租戶
admin        → 會員管理、資料匯出
staff        → 商品、訂單、結帳、匯入操作
viewer       → 唯讀存取
```

- 判斷邏輯在 `hooks/use-permission.tsx`
- super_admin 跨租戶存取時，敏感欄位會被 mask（付款資訊、LINE 金鑰）
- 後台 RPC 使用 `auth.uid()` 驗證，LIFF 端使用 `p_line_user_id` 驗證
- `isCrossTenantAccess`：超管以訪客身份查看租戶時為 true

## 方案系統（Plan Gating）

### 定價

| 方案 | 代碼 | 月繳 | 年繳 | 功能 |
|------|------|------|------|------|
| 基本版 | `basic` | NT$199 | NT$1,990（省$398） | 商品、訂單、結帳、會員管理（核心功能） |
| 專業版 | `pro` | NT$699 | NT$6,990（省$1,398） | 基本版 + LIFF 商城、賣貨便 Email 自動化、Chrome 插件 |
| 旗艦版 | `max` | — | — | 專業版 + LIFF Realtime 即時同步（給顧客端） |

### 訂閱生命週期

- **新租戶**：建立時自動設定 `plan_expires_at = NOW() + 30 天`（免費試用）
- **現有租戶**：`plan_expires_at = NULL` 表示永久免費（祖父條款）
- **付款續訂**：超管透過付款管理頁面確認後延長到期日
- **到期處理**：`check-subscription-expiry` Edge Function 每日凌晨 2 點執行
  - 到期前 7 天：儀表板顯示琥珀色「即將到期」Banner
  - 已過期：儀表板顯示紅色「已過期」Banner
  - 到期後：設定 `is_active = false`（停用租戶）+ 降級為 basic
- **Billing 頁面**：`/admin/t/[slug]/settings/billing`，支援 Basic/Pro 雙方案選擇 + 月繳/年繳切換 + 動態金額顯示

### 技術細節

- `tenants.plan` 欄位：`'basic'`（預設）、`'pro'`、`'max'`
- `tenants.plan_expires_at`：到期時間（NULL = 永久免費）
- `tenants.subscription_starts_at`：訂閱開始時間
- DB constraint：`tenants_plan_check` 限制為 `('basic', 'pro', 'max')`
- `get_dashboard_init_v1` RPC 回傳 `plan_expires_at`、`subscription_starts_at`、`next_billing_date`
- 前端判斷：`hooks/use-permission.tsx`
  - `isPro = plan === 'pro' || plan === 'max'`（Pro+ 權限）
  - `isMax = plan === 'max'`（Max 專屬權限）
  - `canAccessShop`、`canUseMyshipEmail`、`canUseChromeExtension`（Pro+）
  - `canUseRealtime`（Max 專屬）
- super_admin 始終擁有所有角色權限；方案權限仍依租戶實際 plan 判斷
- 後台 sidebar 對 Basic 租戶鎖定 Pro 功能頁面，顯示🔒 + Pro Badge
- 升降級：超管透過 `update_tenant_plan_v1` RPC 操作（支援 basic/pro/max）
- 超管付款管理：支援目標方案選擇（Basic/Pro）+ 4 個快選金額按鈕（$199/$1,990/$699/$6,990）
- LIFF Realtime：`tenant.plan === 'max'` 或 `isStaff` 才啟用即時同步

## 出貨方式

| 代碼 | 說明 |
|------|------|
| myship | 7-11 賣貨便（預設，運費 60 元） |
| delivery | 宅配 |
| pickup | 自取 |

### ShippingDetails JSONB 結構（checkouts.shipping_details）

```typescript
// 賣貨便
{ receiver_store_id?, store_url?, myship_store_name?, myship_order_no? }

// 宅配
{ shipping_address?, tracking_no? }

// 自取
{ receiver_name?, receiver_phone? }
```

### 賣貨便出貨流程（shipping_status）

```
pending → url_sent → ordered → shipped → completed
```

| 狀態 | 觸發方式 | 說明 |
|------|----------|------|
| `pending` | 結帳單建立時 | 待處理 |
| `url_sent` | Chrome 插件開賣場 | 已設定 `store_url` + `myship_store_name`，自動通知客人 |
| `ordered` | 賣貨便 Email（訂單成立通知） | Worker 自動處理，記錄 `myship_order_no`（CM 開頭） |
| `shipped` | 手動標記 | 賣場已寄出 |
| `completed` | 賣貨便 Email（買家取貨通知） | Worker 自動處理，同時確認付款 |

## 開發慣例

### 命名規範
- **RPC 參數**: `p_` 前綴（PostgreSQL 慣例），如 `p_tenant_id`
- **布林值**: `is_` / `can_` 前綴，如 `isSuperAdmin`, `canManageProducts`
- **型別**: 單數名詞，如 `Tenant`, `Product`, `Member`
- **回應型別**: `*Response` 後綴，如 `CreateOrderResponse`
- **已棄用欄位**: 使用 `@deprecated` JSDoc 標記

### 前端模式
- **狀態管理**: React Context (AuthProvider → TenantProvider)
- **資料取得**: `directRpc`（`lib/supabase/direct-rpc.ts`）為主，避免 Supabase client auth 初始化阻塞
- **錯誤處理**: try-catch + toast 通知，AbortError 靜默處理
- **載入狀態**: Skeleton loader
- **動畫**: Framer Motion staggered animations
- **表單**: React Hook Form + Zod v4 schema 驗證

### Middleware 路由保護
- 公開路徑: `/login`, `/register`, `/forgot-password`, `/terms`, `/privacy`
- 保護路徑: `/admin`, `/create-tenant`（需登入）
- 跳過路徑: `/auth/redirect`, `/auth/callback`
- LIFF 路徑: `/s/*`（不需要 Supabase Auth，用 LINE Login）

### 安全注意事項
- 前端無法直接查詢 `tenants` 的 `line_channel_token` / `line_channel_secret`（已 revoke SELECT）
- 敏感操作必須透過 RPC（SECURITY DEFINER）
- Edge Function 呼叫需帶 Bearer token + apikey header
- `super_admins` 表寫入權限已全面封鎖

## 上線路線圖

### 目前完成度：~90%

### Phase 1：上線前必做（🔴 Critical）

| # | 項目 | 說明 | 預估 |
|---|------|------|------|
| 1 | **Landing Page** | `plushub.cc` 首頁（功能介紹、定價、CTA）。目前直接跳登入 | 2-3 天 |
| 2 | ~~**Supabase Auth URL**~~ | ✅ 已完成 | — |
| 3 | ~~**自訂 404 / Error 頁面**~~ | ✅ 已完成 — `not-found.tsx` + `error.tsx` | — |
| 4 | **CSV 匯出** | 訂單/結帳單/商品列表下載按鈕目前無功能（UI 已有 icon） | 1 天 |
| 5 | **訂閱到期提醒 Email** | Edge Function 已自動停用但不會提前通知店家 | 1 天 |

### Phase 2：上線後優先（🟡 Important）

| # | 項目 | 說明 | 預估 |
|---|------|------|------|
| 6 | 付款收據 Email | 超管確認付款後自動寄信給店家 | 1 天 |
| 7 | 登入/註冊 Rate Limiting | 防暴力破解（Supabase 內建 + 前端） | 1 天 |
| 8 | 新手導覽 | 首次進後台的操作引導 | 2 天 |
| 9 | ~~多租戶 LIFF 隔離~~ | ✅ 已完成 — `LiffProvider` 動態取租戶 `liff_id`，layout 從 URL 解析 | — |

### Phase 3：優化（🟢 Nice-to-have）

| # | 項目 |
|---|------|
| 10 | 操作日誌（audit log）— 敏感操作記錄 |
| 11 | 通知中心 — `notifications` 表目前未使用 |
| 12 | 進階分析報表 — 營收趨勢、會員分析 |
| 13 | LINE Webhook 場次邏輯清理 — 棄用的代購場次程式碼 |
| 14 | `product_variants` 前端整合 — 商品規格表尚未使用 |

### 各模組完成度

| 模組 | 完成度 | 備註 |
|------|--------|------|
| 認證（註冊/登入/重設） | 100% | |
| 開店/加入流程 | 100% | |
| 超管後台 | 100% | |
| 商品/訂單/結帳管理 | 95% | 缺 CSV 匯出 |
| LIFF 商城 | 95% | PC 外部瀏覽器有已知 Bug，LIFF 隔離已完成 |
| 方案/付款系統 | 100% | Basic $199/Pro $699 收費、30 天試用、到期停用 |
| 法律條款（動態） | 100% | |
| 賣貨便自動化 | 100% | |
| RWD 手機適配 | 100% | |
| Landing Page | 0% | 🔴 上線必做 |
| Email 通知 | 50% | 僅賣貨便自動化 |
| 資料匯出 | 0% | UI icon 已有，功能未接 |
| 錯誤頁面 | 100% | `not-found.tsx` + `error.tsx` |

## 已知問題

- **【Bug】PC 外部瀏覽器進不了 LIFF 商城**：`liff.init()` 的 `replaceState` 會在 redirect handler 的 `useEffect` 之前清掉 URL 參數，導致重定向失敗。目前跳過，主要用戶在 LINE 內瀏覽器。
- **【已棄用】代購場次**：前端已全面移除，Supabase 的 `purchase_sessions` 表和場次 RPC 暫保留（舊資料相容）。商城商品用 `session_id IS NULL` 過濾排除場次商品。
- `is_shipped`（checkouts）已棄用，改用 `shipping_status`

## 已完成功能

- **【完成】方案系統（Basic/Pro/Max）**：`tenants.plan` 欄位（三層）、前端 permission hook、sidebar 鎖定、超管升降級 RPC、Max 方案 Realtime 獨佔、到期自動停用 Edge Function（所有方案）
- **【完成】超管付款管理**：`/admin/payments` 列表 + 驗證頁面，目標方案選擇（Basic/Pro）+ 快選金額按鈕（$199/$1,990/$699/$6,990）
- **【完成】法律條款動態管理**：`/admin/legal` 超管可動態更新 TOS/隱私政策內容
- **【完成】賣貨便 Email 自動化**：Cloudflare Worker + Email Routing，自動處理訂單成立 / 買家取貨通知。Worker 支援 per-tenant 轉寄（`forward_email`）、賣場名稱去除括號暱稱、RPC 前綴比對
- **【完成】租戶建立審核機制**：`tenant_create_requests` 表 + 審核 RPC + 超管審核頁面
- **【完成】Cloudflare Email Routing**：`admin@plushub.cc` → Gmail 轉發，`*@plushub.cc` catch-all → Worker → per-tenant 轉寄 + 賣貨便處理
- **【完成】商品雙模式（預購/現貨）**：LIFF 商城以 `is_limited` 判斷模式，預購不限購、不完銷；現貨受庫存限制、可完銷
- **【完成】LIFF 管理員模式改善**：上架 Modal 支援預購/現貨、分類、時限、拍照+相簿上傳
- **【完成】LIFF 結帳功能**：3 步驟 Modal（出貨方式 → 確認 → 成功），支援賣貨便/宅配/自取，匯款資訊集中顯示 + 帳號快速複製
- **【完成】LIFF 效能優化**：LIFF init 不阻塞商品渲染、圖片壓縮（400px/0.7）、懶載入、移除輪詢、directRpc 繞過 auth 阻塞
- **【完成】服務條款 & 隱私政策**：`/terms`、`/privacy` 公開頁面（動態載入），建立租戶需勾選同意，所有認證頁 footer 含連結
- **【完成】帳務頁面**：`/admin/t/[slug]/settings/billing`，支援 Basic/Pro 雙方案選擇、月繳/年繳切換、動態金額、免費祖父條款標記、到期提醒
- **【完成】Chrome 插件賣場名稱修正**：回填 DB 的 `myship_store_name` 現在包含暱稱，與賣貨便實際賣場名稱一致
- **【完成】Basic 收費化 + Pro 調價**：Basic NT$199/月、Pro NT$699/月（年繳 $1,990/$6,990）。新租戶 30 天免費試用，到期自動停用（`is_active=false`）。現有租戶 `plan_expires_at=NULL` 維持免費。儀表板到期提醒 Banner（琥珀/紅色）。Billing 頁面雙方案選擇 + 動態金額。超管付款管理目標方案選擇器 + 快選金額按鈕
- **【完成】多租戶 LIFF 隔離**：`app/s/layout.tsx` 從 URL 解析 tenantSlug 查詢 `tenants.liff_id`，動態傳給 `LiffProvider`。各租戶可使用專屬 LIFF App
- **【完成】自訂 404 / Error 頁面**：`app/not-found.tsx`（品牌化 404）+ `app/error.tsx`（錯誤邊界，含重試按鈕）
- **【完成】RPC `get_dashboard_init_v1` 擴展**：`current_tenant` 回傳 `plan_expires_at`、`subscription_starts_at`、`next_billing_date`，確保前端能讀取訂閱到期資訊

## 參考文件

- `docs/supabase-schema.md` — 資料庫 schema 文件
- `docs/supabase_functions_api_doc.md` — RPC 函數完整文件（v3.1）
- `docs/backend_ticket_tenant_review.md` — 租戶審核工作流文件（已完成）
- `docs/bank-transfer-payment-guide.md` — 銀行轉帳支付指南
- `docs/email-verification-guide.md` — Email 驗證流程指南
- `docs/rate-limiting-guide.md` — 速率限制指南
- `workers/myship-email/` — Cloudflare Worker 原始碼（賣貨便 email 自動化）
