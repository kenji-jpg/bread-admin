// 綠界 ATM 幕後取號 — PoC 建立訂單並拿到虛擬帳號
// 用法（測試方便）：瀏覽器直接開 /api/ecpay/create?amount=199
// ⚠️ PoC 才用 GET 觸發（會實際向綠界取號）；正式版應改 POST + 帶租戶/方案。
import { NextResponse, type NextRequest } from 'next/server'
import { ecpayPayCode, svc } from '@/lib/ecpay/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

function html(body: string, status = 200): NextResponse {
    return new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>綠界 ATM PoC</title><body style="font-family:system-ui;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.7">${body}</body>`,
        { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(request: NextRequest) {
    const amount = Math.max(1, parseInt(request.nextUrl.searchParams.get('amount') || '199', 10) || 199)
    const orderId = 'POC' + Date.now().toString().slice(-13) // ≤20 英數
    const notifyUrl = `${request.nextUrl.origin}/api/ecpay/notify`

    try {
        const res = await ecpayPayCode().createPayment({
            amount,
            currency: 'TWD',
            method: 'atm',
            orderId,
            itemDesc: 'PlusHub 訂閱測試(PoC)',
            notifyUrl,
            atmBankCode: '822', // 007/822/118/013 → 綠界會回付款人帳號後五碼，方便對帳
            expireDate: 3,
        }) as { tradeNo?: string; atm?: { bankCode?: string; vAccount?: string; expireDate?: string } }

        const atm = res?.atm ?? {}
        const { error: dbErr } = await svc().from('ecpay_poc_orders').insert({
            trade_no: orderId,
            ecpay_trade_no: res?.tradeNo ?? null,
            amount,
            method: 'atm',
            bank_code: atm.bankCode ?? null,
            v_account: atm.vAccount ?? null,
            expire_date: atm.expireDate ?? null,
            status: 'unpaid',
            raw: res as unknown as Record<string, unknown>,
        })

        return html(`
      <h2>✅ 取號成功</h2>
      <p>綠界（沙盒）已核發一組專屬虛擬帳號給這筆訂單：</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="color:#666;padding:6px 0">單號</td><td style="text-align:right"><code>${esc(orderId)}</code></td></tr>
        <tr><td style="color:#666;padding:6px 0">金額</td><td style="text-align:right">$${amount.toLocaleString()}</td></tr>
        <tr><td style="color:#666;padding:6px 0">銀行代碼</td><td style="text-align:right"><b>${esc(atm.bankCode)}</b></td></tr>
        <tr><td style="color:#666;padding:6px 0">虛擬帳號</td><td style="text-align:right"><b style="font-size:20px">${esc(atm.vAccount)}</b></td></tr>
        <tr><td style="color:#666;padding:6px 0">繳費期限</td><td style="text-align:right">${esc(atm.expireDate)}</td></tr>
      </table>
      <p style="color:#666;font-size:14px;margin-top:20px">到綠界廠商後台（vendor-stage）對這筆做「模擬付款」後，付款通知會打進 <code>/api/ecpay/notify</code>，這筆會在 <code>/api/ecpay/list</code> 變成 paid。</p>
      <p>${dbErr ? `<span style="color:#c00">⚠️ DB 寫入失敗：${esc(dbErr.message)}</span>` : ''}</p>
      <p><a href="/api/ecpay/list">→ 查看所有 PoC 訂單狀態</a></p>
    `)
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return html(`<h2>❌ 取號失敗</h2><pre style="white-space:pre-wrap;color:#c00">${esc(msg)}</pre>`, 502)
    }
}
