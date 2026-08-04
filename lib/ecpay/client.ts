// 綠界金流 PoC — 共用 helper（僅後端使用）
// ⚠️ 目前用綠界「公開測試特店」(ECPAY_SANDBOX, MerchantID 3002607) 的沙盒金鑰——非機密。
//    正式上線要換成 PlusHub 自己的正式綠界帳號，且金鑰只能放 server 端 env（勿進前端）。
import { createClient } from '@supabase/supabase-js'
import { createEcpayPayCodeProvider, ECPAY_SANDBOX } from '@paid-tw/payment-ecpay'

/** service-role Supabase client（繞過 RLS，只在後端路由用） */
export function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

/** 綠界 ATM 幕後取號 provider（沙盒） */
export function ecpayPayCode() {
    return createEcpayPayCodeProvider({ ...ECPAY_SANDBOX })
}

/** 驗章用憑證（沙盒公開特店；正式改讀 env）。帶 merchantId 做 pinning，擋偽造/串單。 */
export const ECPAY_CREDS = {
    hashKey: ECPAY_SANDBOX.hashKey,
    hashIv: ECPAY_SANDBOX.hashIv,
    merchantId: ECPAY_SANDBOX.merchantId,
} as const
