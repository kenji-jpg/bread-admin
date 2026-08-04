// 綠界 ATM 幕後取號 — 付款結果通知（ReturnURL）
// 綠界 server-to-server POST 進來；驗章成功才更新狀態，最後必須回純文字 "1|OK"。
import { NextResponse, type NextRequest } from 'next/server'
import { verifyEcpayPayCodeNotify, ECPAY_PAYCODE_NOTIFY_ACK } from '@paid-tw/payment-ecpay'
import { svc, ECPAY_CREDS } from '@/lib/ecpay/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ack(): NextResponse {
    return new NextResponse(ECPAY_PAYCODE_NOTIFY_ACK, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export async function POST(request: NextRequest) {
    // 綠界幕後取號通知是 AES-JSON 外層信封（application/json）；保險起見兩種都吃
    let body: Record<string, unknown> = {}
    try {
        const ct = request.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
            body = await request.json()
        } else {
            const fd = await request.formData()
            body = Object.fromEntries([...fd.entries()]) as Record<string, unknown>
        }
    } catch {
        body = {}
    }

    try {
        // 驗章（TransCode + AES 解密 + MerchantID pinning）；失敗會 throw
        const notify = verifyEcpayPayCodeNotify(body, ECPAY_CREDS)

        // simulated = 後台「模擬付款」測試（沒真的收到錢）；正式版只在 success && !simulated 才算數
        const status = notify.simulated ? 'simulated_paid' : (notify.success ? 'paid' : 'failed')

        await svc().from('ecpay_poc_orders').update({
            status,
            paid_at: notify.paidAt ?? new Date().toISOString(),
            payer_account: notify.atm?.accountNo ?? null,
            notify_raw: (notify.data ?? null) as Record<string, unknown> | null,
            updated_at: new Date().toISOString(),
        }).eq('trade_no', notify.merTradeNo)
    } catch (e) {
        // 驗章失敗 / 非成功通知：記 log，PoC 階段仍回 1|OK 停止沙盒重送
        console.error('[ecpay/notify] verify failed:', e instanceof Error ? e.message : e)
    }

    return ack()
}
