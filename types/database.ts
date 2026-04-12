// Database types based on Supabase schema

// ========================================
// 結帳模式
// ========================================
export type ShippingMethod = 'myship' | 'delivery' | 'pickup'

export const SHIPPING_METHOD_OPTIONS: Record<ShippingMethod, { label: string; icon: string }> = {
  myship: { label: '賣貨便', icon: '🏪' },
  delivery: { label: '宅配', icon: '🚚' },
  pickup: { label: '自取', icon: '🏠' },
}

// ========================================
// Tenant
// ========================================

/** 遮罩欄位格式（超管跨租戶存取時回傳） */
export interface MaskedField {
  _masked: true
  [key: string]: unknown
}

/** 遮罩的 payment_info */
export interface MaskedPaymentInfo extends MaskedField {
  has_payment_info: boolean
}

/** 遮罩的 admin_line_ids */
export interface MaskedAdminLineIds extends MaskedField {
  count: number
}

/** 判斷欄位是否為遮罩格式 */
export function isMasked(val: unknown): val is MaskedField {
  return typeof val === 'object' && val !== null && '_masked' in val && (val as MaskedField)._masked === true
}

export interface Tenant {
  id: string
  name: string
  slug: string
  owner_email: string | null
  line_oa_id: string | null
  shop_description: string | null
  business_hours: { start: string; end: string } | null
  payment_info: { bank: string; account: string; name: string } | MaskedPaymentInfo | null
  admin_line_ids: string[] | MaskedAdminLineIds
  plan: 'basic' | 'pro' | 'max'
  plan_id?: string | null  // 新增：關聯 plan_id
  plan_expires_at?: string | null  // Pro 方案到期日
  subscription_starts_at?: string | null  // 訂閱開始時間
  subscription_auto_renew?: boolean  // 是否自動續約
  next_billing_date?: string | null  // 下次扣款日期
  subscription_status: 'active' | 'expired' | 'cancelled'
  status?: 'active' | 'expired' | 'cancelled'  // 新增：租戶狀態（與 subscription_status 同義）
  monthly_orders: number
  monthly_messages: number
  default_shipping_method: ShippingMethod  // 預設結帳模式
  created_at: string
  updated_at: string
  // 啟用狀態（超管存取已停用租戶時特殊處理）
  is_active?: boolean              // 前端守門用（超管時永遠 true）
  actual_is_active?: boolean       // 租戶真實啟用狀態
  // 敏感欄位改為布林值（由 RPC 回傳）
  has_line_channel_token?: boolean
  has_line_channel_secret?: boolean
  // 保留原欄位供設定頁更新使用（不會從 RPC 回傳完整值）
  line_channel_token?: string | null
  line_channel_secret?: string | null
  // 跨租戶存取資訊（由 get_tenant_by_slug_v1 回傳）
  is_super_admin?: boolean          // 是否為超管身份
  is_super_admin_access?: boolean   // 是否為超管存取
  is_cross_tenant_access?: boolean  // 是否為跨租戶存取（超管看別人的租戶）
  user_role?: 'owner' | 'admin' | 'staff' | 'viewer' | 'super_admin'
  // 賣貨便通知 email（Cloudflare Email Routing 用）
  myship_notify_email?: string | null
  // 租戶專屬 LIFF ID（用於產生獨立的商城連結）
  liff_id?: string | null
}

export interface Product {
  id: string
  tenant_id: string
  sku: string
  name: string
  price: number
  cost: number | null
  stock: number
  is_limited: boolean
  limit_qty: number | null
  status: 'active' | 'inactive'
  category: string | null
  description: string | null
  image_url: string | null
  image_urls: string[] | null
  end_time: string | null
  sold_qty: number
  arrived_at: string | null
  show_in_shop: boolean
  has_variants: boolean
  created_at: string
  updated_at: string
}

export interface Member {
  id: string
  tenant_id: string
  line_user_id: string
  display_name: string | null
  nickname: string | null
  picture_url: string | null
  phone: string | null
  receiver_name: string | null
  store_id: string | null
  is_vip: boolean
  total_spent: number
  order_count: number
  note: string | null
  visit_count: number
  last_visited_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  tenant_id: string
  member_id: string
  product_id: string
  checkout_id: string | null
  sku: string
  item_name: string | null
  variant_name: string | null
  quantity: number
  arrived_qty: number  // 已到貨數量（0 ~ quantity）
  unit_price: number
  customer_name: string | null
  is_arrived: boolean
  is_completed: boolean
  status: string // 'pending' | 'allocated' | 'partial' | 'cancelled'
  cancelled_at: string | null
  note: string | null
  created_at: string
  updated_at: string
  // Joined fields
  member?: Member
  product?: Product
}

// ========================================
// shipping_details JSONB 型別定義
// ========================================
interface ShippingDetailsBase {
  receiver_name?: string
  receiver_phone?: string
}

interface MyshipShippingDetails extends ShippingDetailsBase {
  receiver_store_id?: string    // 超商店號
  store_url?: string            // 賣貨便連結
  myship_store_name?: string    // 賣場名稱（如 小幫手2_86sh）
  myship_order_no?: string      // 賣貨便訂單編號
}

interface DeliveryShippingDetails extends ShippingDetailsBase {
  shipping_address?: string     // 寄送地址
  tracking_no?: string          // 物流追蹤號
}

// 自取模式：只需基本聯絡資訊
type PickupShippingDetails = ShippingDetailsBase

export type ShippingDetails = MyshipShippingDetails | DeliveryShippingDetails | PickupShippingDetails

// ========================================
// Checkout 型別
// ========================================
export interface Checkout {
  id: string
  tenant_id: string
  member_id: string
  checkout_no: string
  customer_name: string | null
  total_amount: number
  item_count: number | null
  checkout_items: string | null
  payment_status: 'pending' | 'paid' | 'confirmed'
  payment_method: string | null
  payment_info: string | null
  paid_at: string | null
  // 新的出貨狀態流程: pending → url_sent → ordered → shipped → completed
  shipping_status: 'pending' | 'url_sent' | 'ordered' | 'shipped' | 'completed'
  shipping_method: ShippingMethod | null  // 結帳模式
  shipping_fee: number                            // 運費金額
  shipped_at: string | null                       // 出貨時間
  shipping_details: ShippingDetails | null        // ✅ 新增：物流詳情 JSONB

  // ⚠️ 以下欄位即將廢棄，請改用 shipping_details
  /** @deprecated 請使用 shipping_details.shipping_address */
  shipping_address: string | null
  /** @deprecated 請使用 shipping_details.receiver_name */
  receiver_name: string | null
  /** @deprecated 請使用 shipping_details.receiver_phone */
  receiver_phone: string | null
  /** @deprecated 請使用 shipping_details.receiver_store_id */
  receiver_store_id: string | null
  /** @deprecated 請使用 shipping_details.store_url */
  store_url: string | null
  /** @deprecated 請使用 shipping_details.tracking_no */
  tracking_no: string | null
  /** @deprecated 請使用 shipping_details.myship_order_no */
  myship_order_no: string | null

  is_notified: boolean
  notify_status: string | null
  notified_at: string | null
  is_shipped: boolean
  completed_at: string | null
  note: string | null
  created_at: string
  updated_at: string
  // Joined fields
  member?: Member
}

export interface TenantUser {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'staff' | 'viewer'
  display_name: string | null
  is_suspended: boolean
  // LINE 綁定相關欄位
  line_user_id: string | null
  bind_code: string | null
  bind_code_expires_at: string | null
  has_line_binding?: boolean  // 由 RPC 回傳的便捷欄位
  created_at: string
  updated_at: string
  // Joined fields
  tenants?: Tenant
  email?: string
}

// LINE 綁定碼生成回應
export interface GenerateBindCodeResponse {
  success: boolean
  bind_code?: string
  expires_at?: string
  message: string
  error?: string
}

export interface JoinRequest {
  id: string
  tenant_id: string
  requester_user_id: string
  requester_email: string
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// Restock RPC response
export interface RestockResponse {
  success: boolean
  product_name: string
  old_stock: number
  new_stock: number
  added_qty: number
  fulfilled_orders: number
  partial_orders: number  // 部分滿足的訂單數
  fulfilled_qty: number
  remaining_available: number
  message: string
}

// ========================================
// 租戶建立申請
// ========================================

// 我的申請記錄
export interface MyCreateRequest {
  id: string
  tenant_name: string
  tenant_slug: string
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
}

// get_my_create_request RPC 回應
export interface GetMyCreateRequestHasRequest {
  success: true
  has_request: true
  request: MyCreateRequest
}

export interface GetMyCreateRequestNoRequest {
  success: true
  has_request: false
}

export interface GetMyCreateRequestError {
  success: false
  error: string
}

export type GetMyCreateRequestResponse =
  | GetMyCreateRequestHasRequest
  | GetMyCreateRequestNoRequest
  | GetMyCreateRequestError

// request_create_tenant RPC 回應
export interface RequestCreateTenantSuccess {
  success: true
  request_id: string
  message: string
}

export interface RequestCreateTenantError {
  success: false
  error: string
}

export type RequestCreateTenantResponse =
  | RequestCreateTenantSuccess
  | RequestCreateTenantError

// 待審核申請（超管用）
export interface PendingCreateRequest {
  id: string
  requester_user_id: string
  requester_email: string
  tenant_name: string
  tenant_slug: string
  plan_code: 'basic' | 'pro'
  message: string | null
  status: 'pending'
  created_at: string
}

// get_pending_create_requests RPC 回應
export interface GetPendingCreateRequestsSuccess {
  success: true
  requests: PendingCreateRequest[]
  count: number
}

export interface GetPendingCreateRequestsError {
  success: false
  error: string
}

export type GetPendingCreateRequestsResponse =
  | GetPendingCreateRequestsSuccess
  | GetPendingCreateRequestsError

// review_create_request RPC 回應
export interface ReviewApprovedResponse {
  success: true
  action: 'approved'
  tenant_id: string
  tenant_slug: string
  message: string
}

export interface ReviewRejectedResponse {
  success: true
  action: 'rejected'
  message: string
}

export interface ReviewCreateRequestError {
  success: false
  error: string
}

export type ReviewCreateRequestResponse =
  | ReviewApprovedResponse
  | ReviewRejectedResponse
  | ReviewCreateRequestError
