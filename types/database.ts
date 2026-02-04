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

export const getShippingMethodLabel = (method: ShippingMethod | null): string => {
  if (!method) return '-'
  return SHIPPING_METHOD_OPTIONS[method]?.label || method
}

export const getShippingMethodDisplay = (method: ShippingMethod | null): string => {
  if (!method) return '-'
  const opt = SHIPPING_METHOD_OPTIONS[method]
  return opt ? `${opt.icon} ${opt.label}` : method
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

/** 判斷 payment_info 是否為正常（非遮罩）格式 */
export function isValidPaymentInfo(val: unknown): val is { bank: string; account: string; name: string } {
  return (
    typeof val === 'object' &&
    val !== null &&
    !('_masked' in val) &&
    'bank' in val &&
    'account' in val &&
    'name' in val
  )
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
  plan: 'basic' | 'pro'
  plan_id?: string | null  // 新增：關聯 plan_id
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
  end_time: string | null
  sold_qty: number
  arrived_at: string | null
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
  quantity: number
  arrived_qty: number  // 已到貨數量（0 ~ quantity）
  unit_price: number
  customer_name: string | null
  is_arrived: boolean
  is_completed: boolean
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

// 結帳單狀態更新 RPC 回應
export interface UpdateCheckoutStatusResponse {
  success: boolean
  message: string
  checkout_id: string
  new_status: string
}

// 結帳單列表 RPC 回應
export interface ListCheckoutsResponse {
  id: string
  checkout_no: string
  customer_name: string | null
  total_amount: number
  item_count: number | null
  payment_status: string
  shipping_status: string
  shipping_method: 'myship' | 'delivery' | null
  shipping_fee: number
  shipping_details: ShippingDetails | null  // ✅ 新增
  created_at: string
  updated_at: string
  member_id: string
  member_display_name: string | null
  member_line_user_id: string | null

  // ⚠️ 以下欄位即將廢棄
  /** @deprecated 請使用 shipping_details.store_url */
  store_url: string | null
  /** @deprecated 請使用 shipping_details.myship_order_no */
  myship_order_no: string | null
}

// 結帳單詳情 RPC 回應
export interface CheckoutDetailResponse {
  id: string
  checkout_no: string
  customer_name: string | null
  total_amount: number
  item_count: number | null
  payment_status: string
  shipping_status: string
  shipping_method: 'myship' | 'delivery' | null
  shipping_fee: number
  shipping_details: ShippingDetails | null  // ✅ 新增
  note: string | null
  created_at: string
  updated_at: string
  shipped_at: string | null
  completed_at: string | null
  member: {
    id: string
    display_name: string | null
    line_user_id: string
    phone: string | null
  }
  items: Array<{
    id: string
    sku: string
    item_name: string | null
    quantity: number
    unit_price: number
    product_name: string | null
  }>

  // ⚠️ 以下欄位即將廢棄
  /** @deprecated 請使用 shipping_details.store_url */
  store_url: string | null
  /** @deprecated 請使用 shipping_details.myship_order_no */
  myship_order_no: string | null
  /** @deprecated 請使用 shipping_details.shipping_address */
  shipping_address: string | null
  /** @deprecated 請使用 shipping_details.receiver_name */
  receiver_name: string | null
  /** @deprecated 請使用 shipping_details.receiver_phone */
  receiver_phone: string | null
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

export interface SuperAdmin {
  id: string
  user_id: string
  email: string | null
  note: string | null
  created_at: string
}

// Dashboard statistics
export interface DashboardStats {
  totalOrders: number
  todayOrders: number
  totalRevenue: number
  todayRevenue: number
  pendingOrders: number
  memberCount: number
  productCount: number
  activeProducts: number
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

// Create Order RPC response
export interface CreateOrderResponse {
  success: boolean
  action: 'created' | 'updated'
  is_arrived: boolean
  arrived_qty: number
  total_qty: number
  new_stock: number
  product: { name: string; sku: string; price: number }
}

// Delete Order RPC response
export interface DeleteOrderResponse {
  success: boolean
  message: string
  deleted: {
    id: string
    sku: string
    quantity: number
    arrived_qty: number
    reallocated_count: number
    reallocated_qty: number
  }
}

// Update Order Quantity RPC response
export interface UpdateOrderQuantityResponse {
  success: boolean
  message: string
  old_quantity: number
  new_quantity: number
  old_arrived_qty: number
  new_arrived_qty: number
  is_arrived: boolean
  reallocated_count: number
  reallocated_qty: number
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
