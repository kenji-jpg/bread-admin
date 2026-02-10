import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ShippingDetails, ShippingMethod } from '@/types/database'

// 結帳單狀態
type ShippingStatus = 'pending' | 'url_sent' | 'ordered' | 'shipped' | 'completed'
type PaymentStatus = 'pending' | 'paid'

// 商品明細項目（checkout_items JSON 格式）
export interface CheckoutItemDetail {
    name: string
    qty: number
    sku: string | null
    unit_price: number
    subtotal: number
    price_source?: 'product' | 'manual' | 'promotion'
    order_item_id?: string
    original_price?: number | null
}

// 結帳單列表項目
export interface CheckoutListItem {
    id: string
    checkout_no: string
    customer_name: string | null
    total_amount: number
    shipping_fee: number
    item_count: number
    checkout_items: string | null  // ✅ 新增：商品明細 JSON 字串
    shipping_status: ShippingStatus
    payment_status: PaymentStatus
    shipping_method: ShippingMethod | null
    shipping_details: ShippingDetails | null
    is_notified: boolean  // 通知狀態
    created_at: string
    shipped_at: string | null
    completed_at: string | null
    member_display_name: string | null
    member_nickname: string | null
    member_line_user_id: string | null

    // ⚠️ 以下欄位即將廢棄，暫時保留向後相容
    /** @deprecated 請使用 shipping_details.store_url */
    store_url: string | null
    /** @deprecated 請使用 shipping_details.receiver_name */
    receiver_name: string | null
    /** @deprecated 請使用 shipping_details.receiver_phone */
    receiver_phone: string | null
    /** @deprecated 請使用 shipping_details.receiver_store_id */
    receiver_store_id: string | null
}

// 列表回傳格式
export interface ListCheckoutsResult {
    success: boolean
    total: number
    limit: number
    offset: number
    checkouts: CheckoutListItem[]
    error?: string
    message?: string
}

// 詳情回傳格式
export interface CheckoutDetailResult {
    success: boolean
    checkout?: {
        id: string
        checkout_no: string
        total_amount: number
        shipping_fee: number
        shipping_status: ShippingStatus
        payment_status: PaymentStatus
        shipping_method: ShippingMethod | null
        shipping_details: ShippingDetails | null  // ✅ 新增
        note: string | null
        created_at: string
        shipped_at: string | null
        completed_at: string | null

        // ⚠️ 以下欄位即將廢棄，暫時保留向後相容
        /** @deprecated 請使用 shipping_details.store_url */
        store_url: string | null
        /** @deprecated 請使用 shipping_details.myship_order_no */
        myship_order_no: string | null
        /** @deprecated 請使用 shipping_details.receiver_name */
        receiver_name: string | null
        /** @deprecated 請使用 shipping_details.receiver_phone */
        receiver_phone: string | null
        /** @deprecated 請使用 shipping_details.receiver_store_id */
        receiver_store_id: string | null
    }
    member?: {
        id: string
        display_name: string | null
        nickname: string | null
        line_user_id: string | null
    }
    items?: Array<{
        id: string
        item_name: string | null
        sku: string
        quantity: number
        unit_price: number
        subtotal: number
    }>
    error?: string
    message?: string
}

// 更新狀態回傳
export interface UpdateStatusResult {
    success: boolean
    checkout_id?: string
    checkout_no?: string
    old_status?: string
    new_status?: string
    action?: string
    message?: string
    error?: string
}

// 賣貨便連結通知回傳（呼叫 Edge Function）
export interface NotifyMyshipResult {
    success: boolean
    checkout_id?: string
    checkout_no?: string
    customer_name?: string
    store_url?: string
    myship_store_name?: string
    notify_status?: 'sent' | 'failed'
    notify_error?: string | null
    error?: string  // 錯誤碼：missing_params, invalid_url, checkout_not_found, url_already_set, invalid_status, member_no_line, missing_token, rpc_error
    message?: string
}

// 刪除結帳單回傳
export interface DeleteCheckoutResult {
    success: boolean
    error?: string
    deleted_id?: string
    checkout_no?: string
    customer_name?: string
    released_items?: number  // 解除關聯的訂單項目數
}

// 批量刪除回傳
export interface BatchDeleteCheckoutsResult {
    success: boolean
    error?: string
    deleted_count: number
    deleted_ids: string[]
    skipped_count: number
    skipped: Array<{
        id: string
        checkout_no: string
        reason: string
    }>
    released_items: number
}

interface UseCheckoutReturn {
    loading: boolean
    error: string | null
    listCheckouts: (shippingStatus?: string, paymentStatus?: string, limit?: number, offset?: number, search?: string, shippingMethod?: string) => Promise<ListCheckoutsResult>
    getDetail: (checkoutId: string) => Promise<CheckoutDetailResult>
    setUrl: (checkoutId: string, url: string, checkoutNo: string, customerName: string) => Promise<NotifyMyshipResult>
    markOrdered: (checkoutId: string, orderNo?: string, note?: string) => Promise<UpdateStatusResult>
    markShipped: (checkoutId: string, note?: string) => Promise<UpdateStatusResult>
    markCompleted: (checkoutId: string, note?: string) => Promise<UpdateStatusResult>
    deleteCheckout: (checkoutId: string) => Promise<DeleteCheckoutResult>
    batchDeleteCheckouts: (checkoutIds: string[]) => Promise<BatchDeleteCheckoutsResult>
}

export const useCheckout = (tenantId: string): UseCheckoutReturn => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()

    const callRpc = useCallback(async <T,>(name: string, params: Record<string, any>): Promise<T> => {
        setLoading(true)
        setError(null)
        try {
            const { data, error: rpcError } = await supabase.rpc(name, params)
            if (rpcError) throw rpcError
            if (data && !data.success) {
                setError(data.message || '操作失敗')
            }
            return data as T
        } catch (e: any) {
            setError(e.message)
            throw e
        } finally {
            setLoading(false)
        }
    }, [supabase])

    const listCheckouts = useCallback((
        shippingStatus?: string,
        paymentStatus?: string,
        limit = 50,
        offset = 0,
        search?: string,
        shippingMethod?: string
    ): Promise<ListCheckoutsResult> => {
        return callRpc<ListCheckoutsResult>('list_checkouts_v1', {
            p_tenant_id: tenantId,
            p_shipping_status: shippingStatus || null,
            p_payment_status: paymentStatus || null,
            p_limit: limit,
            p_offset: offset,
            p_search: search || null,
            p_shipping_method: shippingMethod || null
        })
    }, [tenantId, callRpc])

    const getDetail = useCallback((checkoutId: string): Promise<CheckoutDetailResult> => {
        return callRpc<CheckoutDetailResult>('get_checkout_detail_v1', {
            p_tenant_id: tenantId,
            p_checkout_id: checkoutId
        })
    }, [tenantId, callRpc])

    const updateStatus = useCallback((
        checkoutId: string,
        action: string,
        extra?: { storeUrl?: string; myshipOrderNo?: string; note?: string }
    ): Promise<UpdateStatusResult> => {
        return callRpc<UpdateStatusResult>('update_checkout_status_v1', {
            p_tenant_id: tenantId,
            p_checkout_id: checkoutId,
            p_action: action,
            p_store_url: extra?.storeUrl || null,
            p_myship_order_no: extra?.myshipOrderNo || null,
            p_note: extra?.note || null
        })
    }, [tenantId, callRpc])

    // 刪除結帳單（只有 pending/ready 狀態可刪除）
    const deleteCheckout = useCallback((
        checkoutId: string
    ): Promise<DeleteCheckoutResult> => {
        return callRpc<DeleteCheckoutResult>('delete_checkout_v1', {
            p_tenant_id: tenantId,
            p_checkout_id: checkoutId
        })
    }, [tenantId, callRpc])

    // 批量刪除結帳單（最多 100 筆）
    const batchDeleteCheckouts = useCallback((
        checkoutIds: string[]
    ): Promise<BatchDeleteCheckoutsResult> => {
        return callRpc<BatchDeleteCheckoutsResult>('batch_delete_checkouts_v1', {
            p_tenant_id: tenantId,
            p_checkout_ids: checkoutIds
        })
    }, [tenantId, callRpc])

    // 設定賣貨便連結並觸發 LINE 通知（呼叫 Edge Function）
    const setUrlWithNotify = useCallback(async (
        checkoutId: string,
        storeUrl: string,
        checkoutNo: string,
        customerName: string
    ): Promise<NotifyMyshipResult> => {
        setLoading(true)
        setError(null)

        try {
            // 優先嘗試刷新 session 取得有效 token
            let accessToken: string | undefined

            const { data: { session }, error: sessionError } = await supabase.auth.getSession()

            if (sessionError || !session?.access_token) {
                // 嘗試刷新 session
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
                if (refreshError || !refreshData.session?.access_token) {
                    throw new Error('未登入或 session 已過期，請重新登入')
                }
                accessToken = refreshData.session.access_token
            } else {
                accessToken = session.access_token
            }

            // Debug: 確認 token 和環境變數
            console.log('[notify-myship-url] Debug info:', {
                hasAccessToken: !!accessToken,
                tokenPreview: accessToken?.substring(0, 20) + '...',
                hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                anonKeyPreview: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...',
                supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            })

            // 呼叫 Edge Function，需同時帶 Authorization 和 apikey
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-myship-url`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    },
                    body: JSON.stringify({
                        tenant_id: tenantId,
                        checkout_id: checkoutId,
                        store_url: storeUrl,
                        myship_store_name: `${checkoutNo}_${customerName}`.slice(0, 50),
                    }),
                }
            )

            const result: NotifyMyshipResult = await res.json()

            if (!result.success) {
                setError(result.message || result.error || '設定失敗')
            }

            return result
        } catch (e: any) {
            const errorResult: NotifyMyshipResult = {
                success: false,
                error: 'network_error',
                message: e.message || '網路錯誤，請稍後重試'
            }
            setError(errorResult.message!)
            return errorResult
        } finally {
            setLoading(false)
        }
    }, [tenantId, supabase])

    return {
        loading,
        error,
        listCheckouts,
        getDetail,
        setUrl: setUrlWithNotify,
        markOrdered: (id, orderNo, note) => updateStatus(id, 'mark_ordered', { myshipOrderNo: orderNo, note }),
        markShipped: (id, note) => updateStatus(id, 'mark_shipped', { note }),
        markCompleted: (id, note) => updateStatus(id, 'mark_completed', { note }),
        deleteCheckout,
        batchDeleteCheckouts
    }
}
