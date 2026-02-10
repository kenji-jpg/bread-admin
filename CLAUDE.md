# CLAUDE.md - PlusHub 團購管理後台

## 專案概述

多租戶（Multi-tenant）LINE 團購管理 SaaS 系統（品牌名：**PlusHub**）。店家透過 LINE 官方帳號經營團購，後台管理商品、訂單、結帳、出貨、會員。支援 7-11 賣貨便物流整合。顧客透過 LIFF 商城頁面瀏覽商品並下單。

## 技術棧

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript
- **樣式**: Tailwind CSS 4 + Radix UI + Framer Motion
- **後端**: Supabase (PostgreSQL + RLS + RPC + Edge Functions)
- **表單**: React Hook Form + Zod 驗證
- **部署**: Vercel (專案: bread-admin-6k1p)
- **域名**: `plushub.cc`（www.plushub.cc）
- **自動化**: n8n (mrsanpanman.zeabur.app)
- **語言**: 繁體中文 (zh-TW)

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
NEXT_PUBLIC_LIFF_ID             # LINE LIFF App ID（目前所有租戶共用）
```

## 專案結構

```
app/
├── login/, register/, forgot-password/   # 認證頁面
├── auth/callback/route.ts                # OAuth 回呼（唯一 API route）
├── auth/redirect/page.tsx                # 登入後路由判斷
├── create-tenant/                        # 建立/加入店家
├── admin/
│   ├── page.tsx                          # 超管首頁
│   ├── tenants/                          # 超管：租戶管理、審核申請
│   └── t/[slug]/                         # 店家管理（動態路由）
│       ├── page.tsx                      # 儀表板
│       ├── products/                     # 商品管理（列表/新增/編輯）
│       ├── orders/                       # 訂單管理（列表/手動下單）
│       ├── checkouts/                    # 結帳管理
│       ├── members/                      # 會員管理
│       ├── shop/                         # 商城管理（LIFF 外觀設定）
│       └── settings/                     # 店家設定（基本/付款/LINE/團隊）
├── s/                                    # LIFF 顧客端
│   ├── page.tsx                          # LIFF 回調中繼（重定向）
│   ├── layout.tsx                        # LiffProvider 包裝
│   └── shop/[tenantSlug]/page.tsx        # 商城頁面（顧客瀏覽/下單）
components/
├── ui/           # Radix UI 基礎元件（button, dialog, table 等）
├── layout/       # sidebar, header, tenant-switcher, theme-toggle
├── dashboard/    # stat-card
├── orders/       # 訂單相關元件
hooks/
├── use-auth.tsx          # 認證 context（user, isSuperAdmin, tenants）
├── use-tenant.tsx        # 租戶 context（tenant, stats, userRole）
├── use-checkout.tsx      # 結帳 RPC 操作封裝
├── use-permission.tsx    # 權限判斷（canManageProducts 等）
├── use-secure-mutations.ts  # RPC 寫入操作工具函數
├── use-sidebar.tsx       # 側邊欄狀態
├── use-liff.tsx          # LIFF SDK 初始化 + 分享連結工具
lib/supabase/
├── client.ts    # 瀏覽器端 Supabase client
├── server.ts    # 伺服器端 Supabase client
types/
└── database.ts  # 完整資料庫型別定義
```

## 資料庫架構（Supabase）

Supabase 專案 ID: `kashgsxlrdyuirijocld`

### 核心資料表

| 資料表 | 用途 | 備註 |
|--------|------|------|
| tenants | 店家（多租戶） | `settings` JSONB 含 shop 設定 |
| tenant_users | 店家管理員（角色綁定） | |
| members | LINE 會員（顧客） | |
| products | 商品 | `show_in_shop` 控制商城顯示 |
| product_variants | 商品規格 | 尚未使用 |
| order_items | 訂單品項 | |
| checkouts | 結帳單 | |
| shop_categories | 商城分類 | tenant_id + name 唯一 |
| auction_orders | 競標訂單 | |
| support_tickets | 客服工單 | |
| subscription_plans | 訂閱方案 | |
| super_admins | 超級管理員 | |
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
- `get_dashboard_init_v1` — 聚合式初始化（租戶+統計+角色，單次呼叫）
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

### RLS 重要規則

- `products_select` 允許匿名讀取：`session_id IS NOT NULL AND status = 'active'` 或 `show_in_shop = true AND status = 'active'`
- 這確保 Supabase Realtime 能推送商城商品的即時更新給 LIFF 顧客

### Edge Functions
- `line-webhook` — 接收 LINE Bot 訊息，處理下單、查詢等
- `notify-myship-url` — 發送賣貨便取貨通知給客戶

## LIFF 商城架構

### 路由
- `/s/shop/[tenantSlug]` — 商城主頁（唯一的顧客端頁面）
- `/s` — LIFF 回調中繼頁，處理 OAuth 重定向後導回商城

### 功能
- 商品瀏覽（依分類篩選、搜尋）
- 即時動態：Supabase Realtime 監聽 products 表，商品被購買時顯示 +N 動畫
- 熱門標記：sold_qty >= 5 顯示🔥標籤
- 顧客下單（喊單）+ 查看自己訂單
- Staff 模式：上架商品、補貨、關閉收單
- 商城外觀由後台 `/admin/t/[slug]/shop` 控制（banner、公告、主題色、分類排序）

### LIFF 分享連結
- `getShopShareUrl(tenantSlug)` → `https://liff.line.me/{LIFF_ID}/s/shop/{tenantSlug}`
- 定義在 `hooks/use-liff.tsx`

## 權限系統（RBAC）

```
super_admin  → 全平台存取，審核租戶申請
owner        → 店家設定、團隊管理、刪除租戶
admin        → 會員管理、資料匯出
staff        → 商品、訂單、結帳、匯入操作
viewer       → 唯讀存取
```

- 判斷邏輯在 `hooks/use-permission.tsx`
- super_admin 跨租戶存取時，敏感欄位會被 mask（付款資訊、LINE 金鑰）
- 後台 RPC 使用 `auth.uid()` 驗證，LIFF 端使用 `p_line_user_id` 驗證

## 出貨方式

| 代碼 | 說明 |
|------|------|
| myship | 7-11 賣貨便（預設，運費 60 元） |
| delivery | 宅配 |
| pickup | 自取 |

## 開發慣例

### 命名規範
- **RPC 參數**: `p_` 前綴（PostgreSQL 慣例），如 `p_tenant_id`
- **布林值**: `is_` / `can_` 前綴，如 `isSuperAdmin`, `canManageProducts`
- **型別**: 單數名詞，如 `Tenant`, `Product`, `Member`
- **回應型別**: `*Response` 後綴，如 `CreateOrderResponse`
- **已棄用欄位**: 使用 `@deprecated` JSDoc 標記

### 前端模式
- **狀態管理**: React Context (AuthProvider → TenantProvider)
- **資料取得**: Supabase RPC 為主，少量直接 `.from()` 查詢
- **錯誤處理**: try-catch + toast 通知，AbortError 靜默處理
- **載入狀態**: Skeleton loader
- **動畫**: Framer Motion staggered animations
- **表單**: React Hook Form + Zod schema 驗證

### Middleware 路由保護
- 公開路徑: `/login`, `/register`, `/forgot-password`
- 保護路徑: `/admin`, `/create-tenant`（需登入）
- 跳過路徑: `/auth/redirect`, `/auth/callback`
- LIFF 路徑: `/s/*`（不需要 Supabase Auth，用 LINE Login）

### 安全注意事項
- 前端無法直接查詢 `tenants` 的 `line_channel_token` / `line_channel_secret`（已 revoke SELECT）
- 敏感操作必須透過 RPC（SECURITY DEFINER）
- Edge Function 呼叫需帶 Bearer token + apikey header
- `super_admins` 表寫入權限已全面封鎖

## 已知問題 / 待辦

- **【已棄用】代購場次**：前端已全面移除（sessions 頁面、sidebar、LIFF session 頁），Supabase 的 `purchase_sessions` 表和場次 RPC 暫保留（舊資料相容）。商城商品用 `session_id IS NULL` 過濾排除場次商品。
- **【Bug】PC 外部瀏覽器進不了 LIFF 商城**：`liff.init()` 的 `replaceState` 會在 redirect handler 的 `useEffect` 之前清掉 URL 參數，導致重定向失敗。目前跳過，主要用戶在 LINE 內瀏覽器。
- **【架構】多租戶 LIFF 隔離（付費功能）**：目前所有租戶共用一個 LIFF（環境變數 `NEXT_PUBLIC_LIFF_ID`），導致 LIFF userId 來自平台 Provider，和各租戶 OA 的 userId 不同。需改為每個租戶設定自己的 LIFF ID（`tenants.liff_id`），場次連結改用租戶的 LIFF。改動範圍：DB 加欄位、後台設定頁加輸入框、LIFF 初始化改動態、`getLiffShareUrl()` 改從租戶取 liff_id。
- **【清理】LINE Webhook 場次邏輯**：Edge Function `line-webhook` 可能還有代購場次下單的處理邏輯，需確認並清理。
- `product_variants` 尚未在前端使用
- `notifications` 表尚未使用
- `is_shipped`（checkouts）已棄用，改用 `shipping_status`

## 參考文件

- `docs/supabase-schema.md` — 資料庫 schema 文件
- `docs/supabase_functions_api_doc.md` — RPC 函數完整文件（v3.0）
- `docs/backend_ticket_tenant_review.md` — 租戶審核工作流文件
