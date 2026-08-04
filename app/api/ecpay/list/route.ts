// 綠界 PoC — 查看最近的訂單狀態（付款前 unpaid、模擬付款後 simulated_paid、真付款 paid）
import { NextResponse } from 'next/server'
import { svc } from '@/lib/ecpay/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
    const { data, error } = await svc()
        .from('ecpay_poc_orders')
        .select('trade_no, ecpay_trade_no, amount, status, bank_code, v_account, expire_date, payer_account, paid_at, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: data?.length ?? 0, orders: data ?? [] })
}
