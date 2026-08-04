// ============================================
// 🔔 Edge Function: notify-myship-url (v13)
// v13: 訊息套用 tenants.settings.message_config（逾期天數 deadline_days、結尾署名 footer）。預設值＝不改行為。
// v12: 賣場開立通知支援免運、尚欠額
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MsgCfg { days: number; footer: string }
function readMsgCfg(mc: Record<string, unknown> | null | undefined): MsgCfg {
  const m = mc || {}
  return { days: parseInt(String(m.deadline_days ?? '')) || 3, footer: String(m.footer ?? '').trim() }
}
function applyMsgCfg(msg: string, cfg: MsgCfg): string {
  let m = msg
  if (cfg.days !== 3) m = m.replaceAll('3 天', `${cfg.days} 天`)
  if (cfg.footer) m = m + '\n\n' + cfg.footer
  return m
}

async function pushToLine(userId: string, message: string, lineToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lineToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: message }] }),
    })
    if (res.ok) return { ok: true }
    const errBody = await res.text()
    console.error('[Notify] LINE Push failed:', res.status, errBody)
    return { ok: false, error: `LINE ${res.status}: ${errBody}` }
  } catch (e) {
    console.error('[Notify] LINE Push error:', e)
    return { ok: false, error: (e as Error).message }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return json({ success: false, error: 'unauthorized', message: '缺少 Authorization header' }, 401)

    const anonClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '')
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      console.error('[Notify] JWT verification failed:', authError?.message)
      return json({ success: false, error: 'invalid_token', message: 'JWT 驗證失敗' }, 401)
    }

    const body = await req.json()
    const { tenant_id, checkout_id, store_url, myship_store_name, myship_account_name } = body
    if (!tenant_id || !checkout_id || !store_url) {
      return json({ success: false, error: 'missing_params', message: '缺少必要參數：tenant_id, checkout_id, store_url' }, 400)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const { data: rpcResult, error: rpcError } = await supabase.rpc('set_myship_url_v1', {
      p_tenant_id: tenant_id, p_checkout_id: checkout_id, p_store_url: store_url,
      p_myship_store_name: myship_store_name || null, p_myship_account_name: myship_account_name || null,
    })

    if (rpcError) {
      console.error('[Notify] RPC error:', rpcError)
      return json({ success: false, error: 'rpc_error', message: '系統錯誤，請稍後再試' }, 500)
    }
    if (!rpcResult?.success) {
      const statusMap: Record<string, number> = { unauthorized: 403, checkout_not_found: 404, member_no_line: 422, missing_token: 422, url_already_set: 409, invalid_status: 409, missing_url: 400, invalid_url: 400 }
      return json(rpcResult, statusMap[rpcResult?.error] || 400)
    }

    let itemsText = ''
    try {
      const { data: checkoutItems } = await supabase
        .from('order_items')
        .select(`quantity, unit_price, item_name, products(name), product_variants(name), auction_order:auction_orders!auction_orders_order_item_id_fkey(product_name)`)
        .eq('checkout_id', checkout_id).eq('tenant_id', tenant_id)
      if (checkoutItems && checkoutItems.length > 0) {
        itemsText = '\n📦 商品明細：\n'
        for (const item of checkoutItems as any[]) {
          const productName = item.products?.name || item.auction_order?.[0]?.product_name || item.item_name || '商品'
          const variantName = item.product_variants?.name
          const displayName = variantName ? `${productName}(${variantName})` : productName
          const subtotal = item.quantity * item.unit_price
          itemsText += `• ${displayName} x${item.quantity} ($${subtotal})\n`
        }
      }
    } catch (e) {
      console.error('[Notify] Failed to query checkout items:', e)
    }

    const { checkout_no, total_amount, customer_name, line_user_id, line_channel_token } = rpcResult

    const { data: ck } = await supabase
      .from('checkouts').select('shipping_method, total_amount, paid_amount')
      .eq('id', checkout_id).eq('tenant_id', tenant_id).maybeSingle()
    const method = ck?.shipping_method || 'myship'
    const totalAmt = Number(ck?.total_amount ?? total_amount) || 0
    const paidAmt = Number(ck?.paid_amount) || 0
    const outstanding = Math.max(0, totalAmt - paidAmt)
    const isFree = method === 'myship_free'
    const paySuffix = isFree ? '（免運取貨付款）' : '（取貨付款）'
    const freeLine = isFree ? `✨ 賣貨便免運 -$38（已折抵）\n` : ''
    const prepaidLine = paidAmt > 0 ? `（已收 $${paidAmt.toLocaleString()}，本次取貨付尾款）\n` : ''

    const { data: tRow } = await supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle()
    const msgCfg = readMsgCfg((tRow?.settings as any)?.message_config)

    const baseMessage =
      `🛒 您的商品已開立賣場囉！\n\n` +
      `📋 單號：${checkout_no}\n` +
      itemsText +
      `\n${freeLine}💰 金額：$${outstanding.toLocaleString()}${paySuffix}\n${prepaidLine}\n` +
      `👉 請點擊下方連結前往 7-11 下單：\n${store_url}\n\n` +
      `⚠️ 請於 3 天內完成下單，逾期將會自動視為棄單處理。`
    const message = applyMsgCfg(baseMessage, msgCfg)

    const pushResult = await pushToLine(line_user_id, message, line_channel_token)
    const notifyStatus = pushResult.ok ? 'sent' : 'failed'

    const { error: notifyRpcErr } = await supabase.rpc('update_checkout_notify_status_v1', {
      p_tenant_id: tenant_id, p_checkout_id: checkout_id, p_notify_status: notifyStatus, p_notify_error: pushResult.error || null,
    })
    if (notifyRpcErr) console.error('[Notify] notify status write-back failed:', notifyRpcErr)

    console.log(`[Notify] ✅ checkout=${checkout_no}, notify=${notifyStatus}, customer=${customer_name}, account=${myship_account_name || '-'}, user=${user.id}`)

    return json({
      success: true, checkout_id, checkout_no, customer_name, store_url,
      myship_store_name: myship_store_name || null, myship_account_name: myship_account_name || null,
      notify_status: notifyStatus, notify_error: pushResult.ok ? null : pushResult.error,
    })
  } catch (error) {
    console.error('[Notify] Unhandled error:', error)
    return json({ success: false, error: 'internal_error', message: (error as Error).message }, 500)
  }
})
