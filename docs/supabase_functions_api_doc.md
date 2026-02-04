# 🗄️ Supabase RPC 函數 API 文檔

> **最後更新：** 2026-02-02
> **版本：** v3.0（完整版）

---

## ⚠️ 重要注意事項

### 前端禁止直接查詢 `tenants` 表

`tenants` 表的 `line_channel_token` 和 `line_channel_secret` 欄位已 **REVOKE SELECT**，直接使用 `select('*')` 會報錯。

**正確做法：**
```typescript
// ❌ 錯誤：會報權限錯誤
const { data } = await supabase.from('tenants').select('*')

// ✅ 正確：使用 RPC 函數
const { data } = await supabase.rpc('get_user_tenants_v1')           // 租戶列表
const { data } = await supabase.rpc('get_tenant_by_slug_v1', { p_slug: 'my-shop' })  // 單一租戶
```

**其他表可正常使用：** `products`、`order_items`、`checkouts`、`members` 等可直接 `select('*')`，RLS 已包含超級管理員放行。

---

### 已刪除的函數（請勿使用）

| 函數名稱 | 刪除原因 | 替代方案 |
|----------|----------|----------|
| `admin_order_by_nickname(text, text, integer)` | 呼叫不存在的 `create_order`，會報錯 | 使用 `admin_create_order` |
| `update_updated_at()` | 與 `update_updated_at_column` 重複 | 系統自動使用 `update_updated_at_column` |
| `admin_create_order(text, text, integer, integer)` | 舊版無 tenant_id | 使用 `admin_create_order(uuid, text, text, integer, integer)` |
| `admin_create_order_by_nickname(text, text, integer, integer)` | 舊版無 tenant_id | 使用 `admin_create_order_by_nickname(uuid, text, text, integer, integer)` |
| `debug_auth_info()` | 僅供除錯，生產環境移除 | 無 |
| `get_user_tenant_ids()` | 被 `get_accessible_tenant_ids` 取代 | 使用 `get_accessible_tenant_ids()` |

---

## 📋 快速對照表

### 🔑 認證 & 租戶

| 用途 | 函數 | 參數 |
|------|------|------|
| 取得用戶可用租戶列表 | `get_user_tenants_v1()` | 無（自動偵測身份） |
| Super Admin 取全部租戶 | `get_all_tenants_v1()` | 無 |
| 用 slug 取租戶詳情 | `get_tenant_by_slug_v1(p_slug)` | slug |
| 建立新租戶 | `register_tenant_with_plan(p_name, p_slug, p_plan_code)` | name, slug, plan_code |
| 更新租戶設定 | `update_tenant_settings_v1(p_tenant_id, p_data)` | tenant_id, JSONB |
| 更新預設配送方式 | `update_tenant_default_shipping_method(p_tenant_id, p_shipping_method)` | tenant_id, shipping_method |
| 切換租戶啟用/停用 | `toggle_tenant_status_v1(p_tenant_id, p_new_status)` | tenant_id, status |
| 綁定租戶擁有者 | `link_tenant_owner(p_tenant_slug, p_user_email)` | slug, email |

### 📦 商品管理

| 用途 | 函數 | 參數 |
|------|------|------|
| 建立商品（含變體） | `create_product_with_variants(p_tenant_id, ...)` | 多參數 |
| 更新商品 | `update_product_v1(p_tenant_id, p_product_id, p_data)` | tenant_id, product_id, JSONB |
| 刪除商品 | `delete_product_v1(p_tenant_id, p_product_id, p_force_soft_delete)` | tenant_id, product_id, boolean |
| 批次刪除商品 | `batch_delete_products_v1(p_tenant_id, p_product_ids[], p_force_soft_delete)` | tenant_id, product_ids[], boolean |
| 切換商品狀態 | `toggle_product_status_v2(p_tenant_id, p_sku, p_status)` | tenant_id, sku, status |
| 批次更新商品狀態 | `batch_update_product_status_v1(p_tenant_id, p_product_ids[], p_status)` | tenant_id, product_ids[], status |
| 補貨 | `restock_product_v2(p_tenant_id, p_sku, p_quantity)` | tenant_id, sku, quantity |
| 標記到貨 | `mark_product_arrived(p_tenant_id, p_sku)` | tenant_id, sku |
| 重算已售數量 | `recalculate_product_sold_qty(p_tenant_id)` | tenant_id |

### 🛒 訂單管理

| 用途 | 函數 | 參數 |
|------|------|------|
| 建立訂單 | `create_order_v2(p_tenant_id, p_line_user_id, p_sku, p_quantity, p_display_name)` | tenant_id, line_user_id, sku, quantity, display_name |
| 管理員幫下單 | `admin_create_order(p_tenant_id, p_community_nickname, p_item_name, p_unit_price, p_quantity)` | tenant_id, nickname, item, price, qty |
| 管理員幫下單（暱稱） | `admin_create_order_by_nickname(p_tenant_id, ...)` | 同上 |
| 編輯訂單項目 | `update_order_item_v1(p_tenant_id, p_order_item_id, ...)` | tenant_id, order_item_id, 數量/備註/價格 |
| 編輯訂單數量 | `update_order_quantity_v1(p_order_item_id, p_new_quantity, p_new_note)` | order_item_id, quantity, note |
| 刪除訂單項目 | `delete_order_item_v1(p_tenant_id, p_order_item_id)` | tenant_id, order_item_id |
| 批次刪除訂單 | `batch_delete_order_items_v1(p_tenant_id, p_order_item_ids[])` | tenant_id, order_item_ids[] |
| 查會員訂單 | `get_member_orders_v2(p_tenant_id, p_line_user_id)` | tenant_id, line_user_id |

### 💳 結帳管理

| 用途 | 函數 | 參數 |
|------|------|------|
| 建立結帳單 | `create_checkout_v2(p_tenant_id, p_line_user_id, ...)` | tenant_id, line_user_id, 收件資訊 |
| LINE 用戶結帳 | `complete_checkout(p_line_user_id, ...)` | line_user_id, 收件資訊 |
| 管理員幫結帳 | `admin_checkout_for_member(p_display_name)` | display_name |
| 結帳單列表 | `list_checkouts_v1(p_tenant_id, p_shipping_status, p_payment_status, p_shipping_method, p_limit, p_offset)` | 篩選條件、分頁 |
| 結帳單詳情 | `get_checkout_detail_v1(p_tenant_id, p_checkout_id)` | tenant_id, checkout_id |
| 更新結帳狀態 | `update_checkout_status_v1(p_tenant_id, p_checkout_id, p_action, ...)` | action: set_url/mark_ordered/mark_paid/mark_shipped/mark_completed |
| 關聯訂單到結帳單 | `link_order_items_to_checkout_v1(p_tenant_id, p_checkout_id, p_order_item_ids[])` | tenant_id, checkout_id, order_item_ids[] |
| 刪除結帳單 | `delete_checkout_v1(p_tenant_id, p_checkout_id)` | tenant_id, checkout_id |
| 批次刪除結帳單 | `batch_delete_checkouts_v1(p_tenant_id, p_checkout_ids[])` | tenant_id, checkout_ids[] |
| 查結帳狀態 | `check_checkout_status(p_line_user_id)` | line_user_id |
| 記錄付款 | `record_payment_v2(p_tenant_id, p_line_user_id, p_payment_info)` | tenant_id, line_user_id, payment_info |

### 📮 MyShip 賣貨便

| 用途 | 函數 | 參數 |
|------|------|------|
| 設定賣貨便連結 | `update_myship_store_url(p_tenant_id, p_checkout_id, p_store_url)` | tenant_id, checkout_id, store_url |
| 確認客人下單 | `update_myship_order_confirmed(p_tenant_id, p_checkout_id, p_myship_order_no)` | tenant_id, checkout_id, order_no |
| 標記已寄出 | `update_myship_shipped(p_tenant_id, p_checkout_id)` | tenant_id, checkout_id |
| 標記已完成 | `update_myship_completed(p_tenant_id, p_checkout_id)` | tenant_id, checkout_id |
| 匯出資料 | `get_myship_export_data()` | 無 |
| 標記已匯出 | `mark_checkouts_exported(p_checkout_ids[])` | checkout_ids[] |

### 🏷️ 競標訂單

| 用途 | 函數 | 參數 |
|------|------|------|
| 匯入競標訂單 | `import_auction_orders_v1(p_tenant_id, p_raw_text)` | tenant_id, raw_text |
| 查詢競標訂單 | `get_auction_orders_v1(p_tenant_id, p_status)` | tenant_id, status |
| 認領競標訂單 | `claim_auction_order_v1(p_tenant_id, p_line_user_id, p_nickname, p_update_nickname)` | tenant_id, line_user_id, nickname, update_nickname |
| 管理員認領 | `admin_claim_auction_order_v1(p_tenant_id, p_auction_order_id, p_member_id, p_update_nickname)` | tenant_id, auction_order_id, member_id, update_nickname |
| 管理員取消認領 | `admin_unclaim_auction_order_v1(p_tenant_id, p_auction_order_id)` | tenant_id, auction_order_id |
| 刪除競標訂單 | `delete_auction_order_v1(p_tenant_id, p_auction_order_id)` | tenant_id, auction_order_id |
| 按日期刪除 | `delete_auction_orders_by_date_v1(p_tenant_id, p_auction_date)` | tenant_id, auction_date |

### 👥 會員

| 用途 | 函數 | 參數 |
|------|------|------|
| 搜尋會員 | `search_members_v1(p_tenant_id, p_keyword, p_limit)` | tenant_id, keyword, limit |
| 設定社群暱稱 | `set_community_nickname_v2(p_tenant_id, p_line_user_id, p_display_name, p_nickname)` | tenant_id, line_user_id, display_name, nickname |

---

## 📖 函數詳細說明

---

### 🔑 認證 & 租戶

#### get_user_tenants_v1
取得當前用戶可存取的租戶列表（自動偵測身份）

```typescript
const { data, error } = await supabase.rpc('get_user_tenants_v1')
```

---

#### get_all_tenants_v1
取得所有租戶列表（僅限超級管理員）

```typescript
const { data, error } = await supabase.rpc('get_all_tenants_v1')
```

---

#### get_tenant_by_slug_v1
用 slug 取得租戶詳情

```typescript
const { data, error } = await supabase.rpc('get_tenant_by_slug_v1', {
  p_slug: 'my-shop'
})
```

---

#### register_tenant_with_plan
建立新租戶並設定方案

```typescript
const { data, error } = await supabase.rpc('register_tenant_with_plan', {
  p_name: '我的商店',
  p_slug: 'my-shop',
  p_plan_code: 'basic'
})
```

---

#### update_tenant_settings_v1
更新租戶設定

```typescript
const { data, error } = await supabase.rpc('update_tenant_settings_v1', {
  p_tenant_id: 'uuid',
  p_data: {
    shop_description: '新描述',
    payment_info: '轉帳資訊...'
  }
})
```

---

#### update_tenant_default_shipping_method
更新預設配送方式

```typescript
const { data, error } = await supabase.rpc('update_tenant_default_shipping_method', {
  p_tenant_id: 'uuid',
  p_shipping_method: 'myship'  // myship | pickup | delivery
})
```

---

#### toggle_tenant_status_v1
切換租戶狀態（僅限超級管理員）

```typescript
const { data, error } = await supabase.rpc('toggle_tenant_status_v1', {
  p_tenant_id: 'uuid',
  p_new_status: 'active'  // active | expired | cancelled
})
```

---

#### link_tenant_owner
將現有用戶關聯為租戶負責人

```typescript
const { data, error } = await supabase.rpc('link_tenant_owner', {
  p_tenant_slug: 'my-shop',
  p_user_email: 'owner@example.com'
})
```

---

### 📦 商品管理

#### create_product_with_variants
建立商品（支援多規格）

```typescript
const { data, error } = await supabase.rpc('create_product_with_variants', {
  p_tenant_id: 'uuid',
  p_name: '手工餅乾',
  p_price: 150,
  p_cost: 80,                    // 選填
  p_category: '甜點',            // 選填
  p_description: '純手工製作',   // 選填
  p_image_url: 'https://...',   // 選填
  p_is_limited: false,          // 選填
  p_limit_qty: null,            // 選填
  p_end_time: null,             // 選填
  p_variants: [                 // 選填，不傳則建立單一商品
    { "name": "原味", "stock": 10 },
    { "name": "巧克力", "stock": 5 }
  ]
})
```

**回傳範例：**
```json
{
  "success": true,
  "base_sku": "260131-1",
  "created_skus": ["260131-1_原味", "260131-1_巧克力"],
  "variant_count": 2
}
```

---

#### update_product_v1
更新商品

```typescript
const { data, error } = await supabase.rpc('update_product_v1', {
  p_tenant_id: 'uuid',
  p_product_id: 'uuid',
  p_data: {
    name: '新名稱',
    price: 200,
    description: '新描述'
  }
})
```

---

#### delete_product_v1
刪除商品

```typescript
const { data, error } = await supabase.rpc('delete_product_v1', {
  p_tenant_id: 'uuid',
  p_product_id: 'uuid',
  p_force_soft_delete: false  // true = 軟刪除，false = 硬刪除
})
```

---

#### batch_delete_products_v1
批次刪除商品

```typescript
const { data, error } = await supabase.rpc('batch_delete_products_v1', {
  p_tenant_id: 'uuid',
  p_product_ids: ['uuid1', 'uuid2', 'uuid3'],
  p_force_soft_delete: false
})
```

---

#### toggle_product_status_v2
切換商品狀態

```typescript
const { data, error } = await supabase.rpc('toggle_product_status_v2', {
  p_tenant_id: 'uuid',
  p_sku: 'SKU001',
  p_status: 'active'  // active | inactive | arrived
})
```

---

#### batch_update_product_status_v1
批次更新商品狀態

```typescript
const { data, error } = await supabase.rpc('batch_update_product_status_v1', {
  p_tenant_id: 'uuid',
  p_product_ids: ['uuid1', 'uuid2'],
  p_status: 'active'
})
```

---

#### restock_product_v2
補貨（自動分配給等待中的訂單）

```typescript
const { data, error } = await supabase.rpc('restock_product_v2', {
  p_tenant_id: 'uuid',
  p_sku: 'SKU001',
  p_quantity: 50
})
```

**回傳範例：**
```json
{
  "success": true,
  "product_name": "手工餅乾",
  "old_stock": 0,
  "added_qty": 50,
  "new_stock": 50,
  "fulfilled_orders": 3,
  "partial_orders": 1,
  "fulfilled_qty": 35,
  "remaining_available": 15,
  "message": "補貨完成，完全滿足 3 筆訂單，部分滿足 1 筆"
}
```

---

#### mark_product_arrived
標記商品到貨

```typescript
const { data, error } = await supabase.rpc('mark_product_arrived', {
  p_tenant_id: 'uuid',  // 必填：租戶 ID
  p_sku: 'SKU001'
})
```

---

#### recalculate_product_sold_qty
重新計算商品的銷售數量

```typescript
const { data, error } = await supabase.rpc('recalculate_product_sold_qty', {
  p_tenant_id: 'uuid'  // 選填，不傳則計算所有
})
```

---

### 🛒 訂單管理

#### create_order_v2
建立訂單（LINE Bot 用）

```typescript
const { data, error } = await supabase.rpc('create_order_v2', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx',
  p_sku: 'SKU001',
  p_quantity: 2,
  p_display_name: 'LINE 顯示名稱'  // 選填
})
```

---

#### admin_create_order
管理員幫下單（自由品項，不需對應商品）

```typescript
const { data, error } = await supabase.rpc('admin_create_order', {
  p_tenant_id: 'uuid',           // ⚠️ 必填！
  p_community_nickname: '小明',
  p_item_name: '手工餅乾',
  p_unit_price: 150,
  p_quantity: 2                  // 選填，預設 1
})
```

**回傳範例：**
```json
{
  "success": true,
  "order_id": "uuid",
  "member": {
    "display_name": "小明的LINE名稱",
    "community_nickname": "小明"
  },
  "item": {
    "name": "手工餅乾",
    "unit_price": 150,
    "quantity": 2,
    "subtotal": 300
  }
}
```

---

#### admin_create_order_by_nickname
管理員依社群暱稱幫客人下單（與 `admin_create_order` 功能相同）

```typescript
const { data, error } = await supabase.rpc('admin_create_order_by_nickname', {
  p_tenant_id: 'uuid',
  p_community_nickname: '小明',
  p_item_name: '手工餅乾',
  p_unit_price: 150,
  p_quantity: 2
})
```

---

#### update_order_item_v1
更新訂單項目

```typescript
const { data, error } = await supabase.rpc('update_order_item_v1', {
  p_tenant_id: 'uuid',
  p_order_item_id: 'uuid',
  p_new_quantity: 3,           // 選填
  p_new_note: '備註',          // 選填
  p_new_unit_price: 200,       // 選填
  p_price_note: '特價'         // 選填，改價原因
})
```

---

#### update_order_quantity_v1
修改訂單數量

```typescript
const { data, error } = await supabase.rpc('update_order_quantity_v1', {
  p_order_item_id: 'uuid',
  p_new_quantity: 5,
  p_new_note: '修改備註'  // 選填
})
```

---

#### delete_order_item_v1
刪除訂單項目

```typescript
const { data, error } = await supabase.rpc('delete_order_item_v1', {
  p_tenant_id: 'uuid',
  p_order_item_id: 'uuid'
})
```

---

#### batch_delete_order_items_v1
批次刪除訂單項目

```typescript
const { data, error } = await supabase.rpc('batch_delete_order_items_v1', {
  p_tenant_id: 'uuid',
  p_order_item_ids: ['uuid1', 'uuid2', 'uuid3']
})
```

---

#### get_member_orders_v2
取得會員訂單列表

```typescript
const { data, error } = await supabase.rpc('get_member_orders_v2', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx'
})
```

**回傳範例：**
```json
{
  "orders": [...],
  "ready_total": 500,    // 已到貨總金額
  "pending_total": 200   // 未到貨總金額
}
```

---

### 💳 結帳管理

#### create_checkout_v2
建立結帳單（Admin 用）

```typescript
const { data, error } = await supabase.rpc('create_checkout_v2', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx',
  p_receiver_name: '小明',        // 選填
  p_receiver_phone: '0912345678', // 選填
  p_receiver_store_id: '123456'   // 選填
})
```

---

#### complete_checkout
完成結帳（LINE Bot 用）

```typescript
const { data, error } = await supabase.rpc('complete_checkout', {
  p_line_user_id: 'Uxxxx',
  p_receiver_name: '小明',      // 選填
  p_phone: '0912345678',        // 選填
  p_store_id: '123456',         // 選填
  p_use_previous: false         // 選填，使用上次的收件資訊
})
```

---

#### admin_checkout_for_member
管理員幫會員結帳

```typescript
const { data, error } = await supabase.rpc('admin_checkout_for_member', {
  p_display_name: '小明'
})
```

---

#### list_checkouts_v1
列出結帳單，支援狀態篩選和分頁

```typescript
const { data, error } = await supabase.rpc('list_checkouts_v1', {
  p_tenant_id: 'uuid',
  p_shipping_status: 'ready',     // 選填：ready | exported | shipped | completed
  p_payment_status: 'pending',    // 選填：pending | paid
  p_shipping_method: 'myship',    // 選填：myship | pickup | delivery
  p_limit: 50,                    // 選填，預設 50
  p_offset: 0                     // 選填，預設 0
})
```

---

#### get_checkout_detail_v1
取得結帳單完整詳情

```typescript
const { data, error } = await supabase.rpc('get_checkout_detail_v1', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid'
})
```

---

#### update_checkout_status_v1
更新結帳單狀態

```typescript
const { data, error } = await supabase.rpc('update_checkout_status_v1', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid',
  p_action: 'set_url',           // set_url | mark_ordered | mark_paid | mark_shipped | mark_completed
  p_store_url: 'https://...',    // 選填
  p_myship_order_no: 'ORD123',   // 選填
  p_note: '備註'                 // 選填
})
```

**流程：** `set_url` → `mark_ordered` → `mark_paid` → `mark_shipped` → `mark_completed`

---

#### link_order_items_to_checkout_v1
關聯訂單項目到結帳單

```typescript
const { data, error } = await supabase.rpc('link_order_items_to_checkout_v1', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid',
  p_order_item_ids: ['uuid1', 'uuid2', 'uuid3']
})
```

---

#### delete_checkout_v1
刪除結帳單

```typescript
const { data, error } = await supabase.rpc('delete_checkout_v1', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid'
})
```

---

#### batch_delete_checkouts_v1
批次刪除結帳單

```typescript
const { data, error } = await supabase.rpc('batch_delete_checkouts_v1', {
  p_tenant_id: 'uuid',
  p_checkout_ids: ['uuid1', 'uuid2', 'uuid3']
})
```

---

#### check_checkout_status
檢查結帳狀態（LINE Bot 用）

```typescript
const { data, error } = await supabase.rpc('check_checkout_status', {
  p_line_user_id: 'Uxxxx'
})
```

**回傳範例：**
```json
{
  "success": true,
  "status": "need_confirm",  // need_confirm | need_shipping_info
  "order_count": 3,
  "total_amount": 500,
  "items": [...],
  "shipping_info": {
    "receiver_name": "小明",
    "phone": "0912345678",
    "store_id": "123456"
  }
}
```

---

#### record_payment_v2
記錄付款資訊

```typescript
const { data, error } = await supabase.rpc('record_payment_v2', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx',
  p_payment_info: '轉帳後5碼：12345'
})
```

---

### 📮 MyShip 賣貨便

#### update_myship_store_url
設定賣貨便連結

```typescript
const { data, error } = await supabase.rpc('update_myship_store_url', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid',
  p_store_url: 'https://myship.7-11.com.tw/...'
})
```

---

#### update_myship_order_confirmed
確認客人下單

```typescript
const { data, error } = await supabase.rpc('update_myship_order_confirmed', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid',
  p_myship_order_no: 'ORD123456'
})
```

---

#### update_myship_shipped
標記已寄出

```typescript
const { data, error } = await supabase.rpc('update_myship_shipped', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid'
})
```

---

#### update_myship_completed
標記已完成

```typescript
const { data, error } = await supabase.rpc('update_myship_completed', {
  p_tenant_id: 'uuid',
  p_checkout_id: 'uuid'
})
```

---

#### get_myship_export_data
取得賣貨便匯出資料

```typescript
const { data, error } = await supabase.rpc('get_myship_export_data')
```

---

#### mark_checkouts_exported
標記結帳單已匯出

```typescript
const { data, error } = await supabase.rpc('mark_checkouts_exported', {
  p_checkout_ids: ['uuid1', 'uuid2', 'uuid3']
})
```

---

### 🏷️ 競標訂單

#### import_auction_orders_v1
匯入競標訂單

```typescript
const { data, error } = await supabase.rpc('import_auction_orders_v1', {
  p_tenant_id: 'uuid',
  p_raw_text: `0115小明 500 備註
0115小華 300`
})
```

**輸入格式：** `MMDD暱稱 金額 [備註]`（每行一筆）

---

#### get_auction_orders_v1
查詢競標訂單列表

```typescript
const { data, error } = await supabase.rpc('get_auction_orders_v1', {
  p_tenant_id: 'uuid',
  p_status: 'pending'  // 選填：pending | claimed
})
```

---

#### claim_auction_order_v1
會員認領競標訂單（暱稱比對不區分大小寫）

```typescript
const { data, error } = await supabase.rpc('claim_auction_order_v1', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx',
  p_nickname: '小明',
  p_update_nickname: true  // 選填，是否將會員暱稱更新為此暱稱
})
```

---

#### admin_claim_auction_order_v1
管理員手動關聯會員到競標訂單

```typescript
const { data, error } = await supabase.rpc('admin_claim_auction_order_v1', {
  p_tenant_id: 'uuid',
  p_auction_order_id: 'uuid',
  p_member_id: 'uuid',
  p_update_nickname: true  // 選填
})
```

---

#### admin_unclaim_auction_order_v1
管理員取消競標訂單的認領

```typescript
const { data, error } = await supabase.rpc('admin_unclaim_auction_order_v1', {
  p_tenant_id: 'uuid',
  p_auction_order_id: 'uuid'
})
```

---

#### delete_auction_order_v1
刪除競標訂單（含關聯的 order_item）

```typescript
const { data, error } = await supabase.rpc('delete_auction_order_v1', {
  p_tenant_id: 'uuid',
  p_auction_order_id: 'uuid'
})
```

---

#### delete_auction_orders_by_date_v1
按日期刪除競標記錄

```typescript
const { data, error } = await supabase.rpc('delete_auction_orders_by_date_v1', {
  p_tenant_id: 'uuid',
  p_auction_date: '0115'  // MMDD 格式
})
```

---

### 👥 會員

#### search_members_v1
搜尋會員

```typescript
const { data, error } = await supabase.rpc('search_members_v1', {
  p_tenant_id: 'uuid',
  p_keyword: '小明',  // 選填，搜尋 display_name、nickname、community_nickname
  p_limit: 20         // 選填，預設 20
})
```

**回傳範例：**
```json
{
  "success": true,
  "members": [
    {
      "id": "uuid",
      "display_name": "小明",
      "nickname": "ming",
      "community_nickname": "社群小明",
      "line_user_id": "Uxxxx"
    }
  ]
}
```

---

#### set_community_nickname_v2
設定會員社群暱稱

```typescript
const { data, error } = await supabase.rpc('set_community_nickname_v2', {
  p_tenant_id: 'uuid',
  p_line_user_id: 'Uxxxx',
  p_display_name: 'LINE 顯示名稱',
  p_nickname: '社群暱稱'
})
```

---

## 🔧 Trigger Functions（系統自動使用）

以下函數由 Database Trigger 自動呼叫，**前端不需要手動呼叫**：

| 函數名稱 | 用途 |
|----------|------|
| `update_updated_at_column` | 自動更新 `updated_at` 欄位 |
| `update_member_checkout_stats` | 自動更新會員結帳統計 |
| `update_product_sold_qty` | 自動更新商品銷售數量 |

---

## 📝 備註

- 所有 `p_tenant_id` 參數都是 **必填** 的（多租戶架構）
- 回傳 `jsonb` 的函數通常包含 `success: boolean` 欄位
- `SECURITY DEFINER` 函數以資料庫擁有者權限執行，已設定 `search_path` 防止攻擊
- 有問題請聯繫後端團隊 🙋
