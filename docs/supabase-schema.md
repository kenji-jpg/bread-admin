# Supabase 資料庫結構文檔

## 資料表 (Tables)

### auction_orders
競標訂單表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | ✓ | | FK → tenants.id |
| member_id | uuid | | | FK → members.id |
| order_item_id | uuid | | | FK → order_items.id |
| raw_input | text | ✓ | | 原始輸入文字，例如：0129小美 780 |
| winner_nickname | text | ✓ | | 得標者暱稱 |
| amount | integer | ✓ | | 得標金額 |
| auction_date | text | | | 競標日期，例如：0129 |
| product_name | text | | | 商品名稱，手動輸入訂單時填入 |
| status | text | ✓ | pending | pending=待認領, claimed=已認領, cancelled=已取消 |
| note | text | | | |
| created_at | timestamptz | ✓ | now() | |
| updated_at | timestamptz | ✓ | now() | |

---

### checkouts
結帳單表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| member_id | uuid | | | FK → members.id |
| checkout_no | text | ✓ | | 結帳單編號 |
| customer_name | text | | | |
| total_amount | integer | ✓ | | |
| item_count | integer | | | |
| checkout_items | text | | | |
| payment_status | text | | pending | |
| payment_method | text | | | |
| payment_info | text | | | |
| paid_at | timestamptz | | | |
| shipping_method | text | | myship | |
| shipping_status | text | | pending | 出貨狀態：pending/ready/exported/shipped |
| shipping_fee | integer | | | 運費金額，賣貨便預設 60 元 |
| shipping_address | text | | | |
| shipping_details | jsonb | | | 物流詳細資訊 JSONB |
| receiver_name | text | | | |
| receiver_phone | text | | | |
| receiver_store_id | text | | | |
| store_url | text | | | |
| tracking_no | text | | | |
| myship_order_no | text | | | 賣貨便訂單編號 |
| myship_store_name | text | | | 賣貨便賣場名稱 |
| is_shipped | boolean | | | ⚠️ DEPRECATED: 請改用 shipping_status |
| shipped_at | timestamptz | | | |
| notify_status | text | | | |
| is_notified | boolean | | | |
| notified_at | timestamptz | | | |
| note | text | | | |
| completed_at | timestamptz | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### line_group_mappings
LINE 群組對應表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | ✓ | | FK → tenants.id |
| line_group_id | text | ✓ | | |
| group_name | text | | | |
| is_active | boolean | | true | |
| created_at | timestamptz | | now() | |

---

### members
會員表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| line_user_id | text | ✓ | | |
| display_name | text | | | |
| nickname | text | | | |
| picture_url | text | | | |
| phone | text | | | 手機號碼（10碼）|
| receiver_name | text | | | 取件人姓名（賣貨便用）|
| store_id | text | | | 7-11門市店號（6碼）|
| is_vip | boolean | | | |
| order_count | integer | | | |
| total_spent | integer | | | |
| note | text | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### notifications
通知表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| member_id | uuid | | | FK → members.id |
| title | text | ✓ | | |
| message | text | | | |
| type | text | | | |
| is_read | boolean | | | |
| created_at | timestamptz | | now() | |

---

### order_items
訂單項目表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| member_id | uuid | | | FK → members.id |
| product_id | uuid | | | FK → products.id |
| checkout_id | uuid | | | FK → checkouts.id |
| customer_name | text | | | |
| item_name | text | | | 自由品項名稱，用於管理員幫下單時沒有對應 product 的情況 |
| sku | text | | | |
| quantity | integer | ✓ | 1 | |
| unit_price | integer | ✓ | | |
| original_price | integer | | | 原始價格（首次建立時的價格）|
| price_source | text | | product | 價格來源: product=商品原價, manual=手動調整, promotion=促銷價 |
| price_note | text | | | 價格調整備註 |
| is_arrived | boolean | | | |
| arrived_qty | integer | | | 已分配到貨數量 |
| is_completed | boolean | | | |
| note | text | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### pending_uploads
待處理上傳表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | ✓ | | |
| line_user_id | text | ✓ | | |
| image_url | text | ✓ | | |
| created_at | timestamptz | ✓ | now() | |

---

### product_variants
商品規格表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| product_id | uuid | ✓ | | FK → products.id |
| tenant_id | uuid | ✓ | | |
| name | text | ✓ | | |
| price | integer | ✓ | | 規格獨立定價 |
| stock | integer | ✓ | | 規格獨立庫存 |
| sold_qty | integer | ✓ | | 已售數量 |
| status | text | ✓ | active | |
| sort_order | integer | ✓ | | |
| created_at | timestamptz | ✓ | now() | |
| updated_at | timestamptz | ✓ | now() | |

---

### products
商品表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| name | text | ✓ | | |
| sku | text | ✓ | | |
| price | integer | ✓ | | |
| cost | integer | | | |
| stock | integer | ✓ | | 當前可出貨庫存（可為負數，負數代表預購欠貨）|
| sold_qty | integer | | | |
| is_limited | boolean | | | 是否限量銷售 |
| limit_qty | integer | | | 限量總數 |
| status | text | | active | |
| category | text | | | |
| description | text | | | |
| image_url | text | | | |
| end_time | timestamptz | | | |
| arrived_at | timestamptz | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### subscription_plans
訂閱方案表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| code | text | ✓ | | |
| name | text | ✓ | | |
| price | integer | ✓ | | |
| features | jsonb | ✓ | | |
| limits | jsonb | ✓ | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### super_admin_audit_log
超級管理員審計日誌
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| admin_user_id | uuid | ✓ | | |
| action | text | ✓ | | |
| target_tenant_id | uuid | | | |
| target_tenant_slug | text | | | |
| ip_address | text | | | |
| metadata | jsonb | | | |
| created_at | timestamptz | ✓ | now() | |

---

### super_admins
超級管理員表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| user_id | uuid | ✓ | | |
| email | text | | | |
| is_active | boolean | ✓ | true | 是否為活躍超管 |
| note | text | | | |
| revoked_at | timestamptz | | | 撤銷時間戳 |
| revoked_by | uuid | | | 執行撤銷的管理員 user_id |
| created_at | timestamptz | | now() | |

---

### support_tickets
客服工單表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | | | FK → tenants.id |
| member_id | uuid | | | FK → members.id |
| customer_name | text | | | |
| message | text | ✓ | | |
| status | text | | open | |
| reply | text | | | |
| replied_at | timestamptz | | | |
| created_at | timestamptz | | now() | |

---

### tenant_join_requests
租戶加入申請表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | ✓ | | FK → tenants.id |
| requester_user_id | uuid | ✓ | | |
| requester_email | text | ✓ | | |
| message | text | | | |
| status | text | ✓ | pending | |
| assigned_role | text | | staff | |
| reviewed_by | uuid | | | |
| reviewed_at | timestamptz | | | |
| created_at | timestamptz | ✓ | now() | |
| updated_at | timestamptz | ✓ | now() | |

---

### tenant_users
租戶使用者表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| tenant_id | uuid | ✓ | | FK → tenants.id |
| user_id | uuid | ✓ | | |
| role | text | ✓ | admin | 角色：owner=擁有者, admin=管理員, staff=員工, viewer=僅查看 |
| display_name | text | | | |
| line_user_id | text | | | |
| bind_code | text | | | |
| bind_code_expires_at | timestamptz | | | |
| is_suspended | boolean | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

### tenants
租戶（店家）表
| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| id | uuid | ✓ | gen_random_uuid() | 主鍵 |
| name | text | ✓ | | |
| slug | text | ✓ | | |
| owner_email | text | | | |
| shop_description | text | | | |
| is_active | boolean | ✓ | true | |
| plan_id | uuid | | | FK → subscription_plans.id |
| plan_expires_at | timestamptz | | | |
| subscription_status | text | | active | |
| subscription_expires_at | timestamptz | | | |
| line_oa_id | text | | | |
| line_channel_token | text | | | |
| line_channel_secret | text | | | |
| line_channel_access_token | text | | | |
| admin_line_ids | text[] | | | |
| default_shipping_method | text | | myship | 預設結帳模式: myship \| delivery \| pickup |
| payment_info | jsonb | | | |
| settings | jsonb | | | |
| business_hours | jsonb | | | |
| monthly_orders | integer | | | |
| monthly_messages | integer | | | |
| created_at | timestamptz | | now() | |
| updated_at | timestamptz | | now() | |

---

## RPC 函數

### 競標相關

#### create_auction_order_v1
建立競標訂單
```
p_tenant_id*: string
p_winner_nickname*: string
p_amount*: integer
p_auction_date*: string
p_product_name: string
p_note: string
```

#### import_auction_orders_v1
批次匯入競標訂單
```
p_tenant_id*: string
p_raw_text*: string
```

#### get_auction_orders_v1
取得競標訂單列表
```
p_tenant_id*: string
p_status: string
```

#### claim_auction_order_v1
會員認領競標訂單
```
p_tenant_id*: string
p_line_user_id*: string
p_nickname*: string
p_update_nickname: boolean
```

#### admin_claim_auction_order_v1
管理員幫會員認領競標訂單
```
p_tenant_id*: string
p_auction_order_id*: string
p_member_id*: string
p_update_nickname: boolean
```

#### admin_unclaim_auction_order_v1
管理員取消認領
```
p_tenant_id*: string
p_auction_order_id*: string
```

#### delete_auction_order_v1
刪除競標訂單
```
p_tenant_id*: string
p_auction_order_id*: string
```

#### delete_auction_orders_by_date_v1
依日期批次刪除競標訂單
```
p_tenant_id*: string
p_auction_date*: string
```

---

### 結帳相關

#### create_checkout_v2
建立結帳單
```
p_tenant_id*: string
p_line_user_id*: string
p_shipping_method: string
p_receiver_name: string
p_receiver_phone: string
p_receiver_store_id: string
```

#### complete_checkout
完成結帳
```
p_line_user_id*: string
p_use_previous: boolean
p_receiver_name: string
p_store_id: string
p_phone: string
```

#### check_checkout_status
檢查結帳狀態
```
p_line_user_id*: string
```

#### list_checkouts_v1
列出結帳單
```
p_tenant_id*: string
p_payment_status: string
p_shipping_status: string
p_shipping_method: string
p_limit: integer
p_offset: integer
```

#### get_checkout_detail_v1
取得結帳單詳情
```
p_tenant_id*: string
p_checkout_id*: string
```

#### update_checkout_status_v1
更新結帳單狀態
```
p_tenant_id*: string
p_checkout_id*: string
p_action*: string
p_payment_method: string
p_note: string
p_store_url: string
p_myship_order_no: string
```

#### update_checkout_notify_status_v1
更新結帳單通知狀態
```
p_tenant_id*: string
p_checkout_id*: string
p_notify_status*: string
p_notify_error: string
```

#### delete_checkout_v1
刪除結帳單
```
p_tenant_id*: string
p_checkout_id*: string
```

#### batch_delete_checkouts_v1
批次刪除結帳單
```
p_tenant_id*: string
p_checkout_ids*: array
```

---

### 賣貨便相關

#### set_myship_url_v1
設定賣貨便連結
```
p_tenant_id*: string
p_checkout_id*: string
p_store_url*: string
p_myship_store_name: string
```

#### update_myship_store_url
更新賣貨便連結
```
p_checkout_id*: string
p_store_url*: string
```

#### update_myship_order_confirmed
更新賣貨便訂單已確認
```
p_tenant_id*: string
p_checkout_id*: string
p_myship_order_no*: string
```

#### update_myship_shipped
更新賣貨便已出貨
```
p_tenant_id*: string
p_checkout_id*: string
```

#### update_myship_completed
更新賣貨便已完成
```
p_tenant_id*: string
p_checkout_id*: string
```

#### find_checkout_by_myship_order_no
依賣貨便訂單編號查詢
```
p_tenant_id*: string
p_order_no*: string
```

#### find_checkout_by_myship_store_name
依賣貨便賣場名稱查詢
```
p_tenant_id*: string
p_store_name*: string
```

#### get_myship_export_data
取得賣貨便匯出資料
```
(無參數)
```

#### mark_checkouts_exported
標記結帳單已匯出
```
p_checkout_ids*: array
```

---

### 訂單項目相關

#### create_order_v2
建立訂單
```
p_tenant_id*: string
p_line_user_id*: string
p_sku*: string
p_quantity*: integer
p_display_name: string
```

#### admin_create_order
管理員建立訂單
```
p_tenant_id*: string
p_community_nickname*: string
p_item_name*: string
p_quantity*: integer
p_unit_price*: integer
```

#### admin_create_order_by_nickname
依暱稱建立訂單
```
p_tenant_id*: string
p_community_nickname*: string
p_item_name*: string
p_quantity*: integer
p_unit_price*: integer
```

#### update_order_item_v1
更新訂單項目
```
p_tenant_id*: string
p_order_item_id*: string
p_new_quantity: integer
p_new_unit_price: integer
p_new_note: string
p_price_note: string
```

#### update_order_quantity_v1
更新訂單數量
```
p_order_item_id*: string
p_new_quantity*: integer
p_new_note: string
```

#### delete_order_item_v1
刪除訂單項目
```
p_tenant_id*: string
p_order_item_id*: string
```

#### batch_delete_order_items_v1
批次刪除訂單項目
```
p_tenant_id*: string
p_order_item_ids*: array
```

#### link_order_items_to_checkout_v1
將訂單項目連結到結帳單
```
p_tenant_id*: string
p_checkout_id*: string
p_order_item_ids*: array
```

#### get_member_orders_v2
取得會員訂單
```
p_tenant_id*: string
p_line_user_id*: string
```

#### admin_checkout_for_member
管理員幫會員結帳
```
p_display_name*: string
```

---

### 商品相關

#### create_product_v1
建立商品 (v1)
```
p_tenant_id*: string
p_name*: string
p_price*: integer
p_stock*: integer
p_sku: string
p_image_url: string
p_is_limited: boolean
p_end_minutes: integer
```

#### create_product_v2
建立商品 (v2)
```
p_tenant_id*: string
p_name*: string
p_price*: integer
p_stock*: integer
p_sku: string
p_image_url: string
p_description: string
p_category: string
p_cost: integer
p_is_limited: boolean
p_limit_qty: integer
p_end_time: string
p_variants: jsonb
```

#### update_product_v1
更新商品
```
p_tenant_id*: string
p_product_id*: string
p_data*: jsonb
```

#### delete_product_v1
刪除商品
```
p_tenant_id*: string
p_product_id*: string
p_force_soft_delete: boolean
```

#### batch_delete_products_v1
批次刪除商品
```
p_tenant_id*: string
p_product_ids*: array
p_force_soft_delete: boolean
```

#### toggle_product_status_v2
切換商品狀態
```
p_tenant_id*: string
p_sku*: string
p_status*: string
```

#### batch_update_product_status_v1
批次更新商品狀態
```
p_tenant_id*: string
p_product_ids*: array
p_status*: string
```

#### mark_product_arrived
標記商品已到貨
```
p_tenant_id*: string
p_sku*: string
```

#### restock_product_v2
商品補貨
```
p_tenant_id*: string
p_sku*: string
p_quantity*: integer
```

#### get_available_stock
取得可用庫存
```
p_product_id*: string
```

#### recalculate_product_sold_qty
重新計算商品已售數量
```
p_tenant_id: string
```

#### recalculate_single_product_sold_qty
重新計算單一商品已售數量
```
p_product_id*: string
```

---

### 會員相關

#### set_community_nickname_v2
設定社群暱稱
```
p_tenant_id*: string
p_line_user_id*: string
p_display_name*: string
p_nickname*: string
```

#### search_members_v1
搜尋會員
```
p_tenant_id*: string
p_keyword: string
p_limit: integer
```

#### get_tenant_members
取得租戶會員列表
```
p_tenant_id*: string
```

#### record_payment_v2
記錄付款
```
p_tenant_id*: string
p_line_user_id*: string
p_payment_info*: string
```

---

### 租戶相關

#### create_new_tenant
建立新租戶
```
p_name*: string
p_slug*: string
p_owner_email*: string
p_line_oa_id: string
p_line_channel_token: string
p_line_channel_secret: string
p_shop_description: string
```

#### register_tenant_with_plan
註冊租戶（含方案）
```
p_name*: string
p_slug*: string
p_plan_code*: string
```

#### delete_tenant
刪除租戶
```
p_tenant_id*: string
p_confirm_name*: string
```

#### get_tenant_by_slug_v1
依 slug 取得租戶
```
p_slug*: string
```

#### get_tenant_by_group
依 LINE 群組取得租戶
```
p_line_group_id*: string
```

#### get_tenant_by_member
依會員取得租戶
```
p_line_user_id*: string
```

#### get_user_tenants_v1
取得使用者的租戶列表
```
(無參數)
```

#### get_all_tenants_v1
取得所有租戶（超管用）
```
(無參數)
```

#### check_tenant_active
檢查租戶是否啟用
```
p_tenant_id*: string
```

#### toggle_tenant_status_v1
切換租戶狀態
```
p_tenant_id*: string
p_new_status*: string
```

#### update_tenant_settings_v1
更新租戶設定
```
p_tenant_id*: string
p_data*: jsonb
```

#### update_tenant_default_shipping_method
更新預設出貨方式
```
p_tenant_id*: string
p_shipping_method*: string
```

#### get_setting
取得設定值
```
p_tenant_id*: string
p_key*: string
```

#### link_tenant_owner
連結租戶擁有者
```
p_tenant_slug*: string
p_user_email*: string
```

---

### 租戶使用者/權限相關

#### get_tenant_role
取得租戶角色
```
check_tenant_id*: string
```

#### has_tenant_access
檢查是否有租戶存取權
```
check_tenant_id*: string
```

#### guard_tenant_write
檢查租戶寫入權限
```
p_tenant_id*: string
```

#### verify_tenant_admin
驗證租戶管理員
```
p_tenant_id*: string
```

#### verify_tenant_user_active
驗證租戶使用者啟用
```
p_tenant_id*: string
```

#### get_accessible_tenant_ids
取得可存取的租戶 ID 列表
```
(無參數)
```

#### update_member_role
更新成員角色
```
p_tenant_user_id*: string
p_new_role*: string
```

#### toggle_member_suspension
切換成員停權狀態
```
p_tenant_user_id*: string
```

#### remove_tenant_member
移除租戶成員
```
p_tenant_user_id*: string
```

---

### 加入申請相關

#### request_join_tenant
申請加入租戶
```
p_tenant_slug*: string
p_message: string
```

#### get_pending_join_requests
取得待審核申請
```
p_tenant_id*: string
```

#### review_join_request
審核加入申請
```
p_request_id*: string
p_action*: string
p_assigned_role: string
```

---

### 管理員 LINE 綁定相關

#### generate_admin_bind_code
產生管理員綁定碼
```
p_tenant_id*: string
```

#### bind_admin_line_id
綁定管理員 LINE ID
```
p_tenant_id*: string
p_bind_code*: string
p_line_user_id*: string
```

#### get_admin_by_line_id
依 LINE ID 取得管理員
```
p_tenant_id*: string
p_line_user_id*: string
```

---

### 超級管理員相關

#### is_super_admin
檢查是否為超級管理員
```
(無參數)
```

#### revoke_super_admin
撤銷超級管理員
```
p_target_user_id*: string
```

---

### 儀表板相關

#### get_dashboard_init_v1
取得儀表板初始資料
```
p_tenant_slug: string
```

#### generate_checkout_no
產生結帳單編號
```
(無參數)
```

---

### 其他

#### cleanup_pending_uploads
清理待處理上傳
```
p_ttl_minutes: integer
```
