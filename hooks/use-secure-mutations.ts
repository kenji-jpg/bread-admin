'use client'

import { createClient } from '@/lib/supabase/client'

// ============================
// Types
// ============================

export interface BatchUpdateProductStatusResult {
  success: boolean
  error?: string
  updated_count?: number
  status?: string
}

export interface UpdateProductResult {
  success: boolean
  error?: string
  product_id?: string
  updated_fields?: Record<string, unknown>
}

export interface ProductUpdateData {
  name?: string
  price?: number
  cost?: number | null
  stock?: number
  category?: string | null
  description?: string | null
  image_url?: string | null
  is_limited?: boolean
  limit_qty?: number | null
  end_time?: string | null
  status?: string
  show_in_shop?: boolean
}

export interface LinkOrderItemsResult {
  success: boolean
  error?: string
  checkout_id?: string
  linked_count?: number
  skipped_count?: number
  message?: string
}

export interface UpdateTenantSettingsResult {
  success: boolean
  error?: string
  tenant_id?: string
}

export interface TenantSettingsData {
  name?: string
  shop_description?: string | null
  business_hours?: {
    start: string
    end: string
  } | null
  payment_info?: Record<string, unknown> | null
  line_channel_token?: string | null
  line_channel_secret?: string | null
  line_oa_id?: string | null
  admin_line_ids?: string[] | null
  myship_notify_email?: string | null
}

// ============================
// Helper Functions
// ============================

/**
 * 批量更新商品狀態
 * 使用 RPC: batch_update_product_status_v1
 */
export const batchUpdateProductStatus = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  productIds: string[],
  status: 'active' | 'inactive'
): Promise<BatchUpdateProductStatusResult> => {
  const { data, error } = await supabase.rpc('batch_update_product_status_v1', {
    p_tenant_id: tenantId,
    p_product_ids: productIds,
    p_status: status,
  })

  if (error) throw error
  return data as BatchUpdateProductStatusResult
}

/**
 * 更新商品
 * 使用 RPC: update_product_v1
 */
export const updateProduct = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  productId: string,
  data: ProductUpdateData
): Promise<UpdateProductResult> => {
  const { data: result, error } = await supabase.rpc('update_product_v1', {
    p_tenant_id: tenantId,
    p_product_id: productId,
    p_data: data,
  })

  if (error) throw error
  return result as UpdateProductResult
}

/**
 * 關聯訂單項目到結帳單
 * 使用 RPC: link_order_items_to_checkout_v1
 */
export const linkOrderItemsToCheckout = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  checkoutId: string,
  orderItemIds: string[]
): Promise<LinkOrderItemsResult> => {
  const { data, error } = await supabase.rpc('link_order_items_to_checkout_v1', {
    p_tenant_id: tenantId,
    p_checkout_id: checkoutId,
    p_order_item_ids: orderItemIds,
  })

  if (error) throw error
  return data as LinkOrderItemsResult
}

/**
 * 更新租戶設定
 * 使用 RPC: update_tenant_settings_v1
 */
export const updateTenantSettings = async (
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  data: TenantSettingsData
): Promise<UpdateTenantSettingsResult> => {
  const { data: result, error } = await supabase.rpc('update_tenant_settings_v1', {
    p_tenant_id: tenantId,
    p_data: data,
  })

  if (error) throw error
  return result as UpdateTenantSettingsResult
}
