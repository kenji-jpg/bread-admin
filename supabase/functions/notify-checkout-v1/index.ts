// ============================================
// 🔔 Edge Function: notify-checkout-v1 (v13)
// v13: 補款通知在「達免運(運費=0)」時顯示「運費 $X 免收（已折抵本次補款）」說明
//      門檻金額讀租戶 free_shipping_threshold（預設 3500）
// v12: 訊息格式調整（千分位、退款品項說明、不加括號）
// v11: 加 partial 補款通知分支
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutItem { name?: string; variant_name?: string | null; qty?: number; unit_price?: number; subtotal?: number }
interface PaymentInfo { bank?: string; name?: string; account?: string }

async function pushToLine(userId: string, message: string, lineToken: string) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lineToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: message }] }),
    })
    if (res.ok) return { ok: true as const }
    const errBody = await res.text()
    return { ok: false as const, error: `LINE ${res.status}: ${errBody}` }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

// 把 checkout_items JSON 轉成 LINE 訊息用的明細區塊
// - 一般品：• 商品名（規格） x1 $1,150
// - 退款品項（負金額）：• 宅配運費退款 -$80（達免運門檻自動回扣）
function parseItems(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(items)) return ''
    return items.map((it: CheckoutItem) => {
      const name = it.name || '商品'
      const variant = it.variant_name ? `（${it.variant_name}）` : ''
      const qty = it.qty ?? 1
      const sub = it.subtotal ?? ((it.unit_price ?? 0) * qty)
      if (sub < 0) {
        const note = name.includes('退款') ? '（達免運門檻自動回扣）' : ''
        return `• ${name} -$${Math.abs(sub).toLocaleString()}${note}`
      }
      return `• ${name}${variant} x${qty} $${sub.toLocaleString()}`
    }).join('\n') + '\n'
  } catch { return '' }
}

function bankBlock(p: PaymentInfo | null): string {
  const x = p || {}
  return `💳 匯款資訊：\n銀行：${x.bank || '-'}\n戶名：${x.name || '-'}\n帳號：${x.account || '-'}\n\n`
}

// ─── 補款通知（partial 用）──────────────────────────────
function buildTopupMessage(
  checkoutNo: string,
  totalAmount: number,
  paidAmount: number,
  shippingMethod: string,
  shippingFee: number,
  itemsText: string,
  paymentInfo: PaymentInfo | null,
  sevenStorePayment: PaymentInfo | null,
  freeShippingThreshold: number,
): { ok: true; message: string } | { ok: false; error: string } {
  const owed = Math.max(0, totalAmount - paidAmount)
  const shippingLabel = shippingMethod === 'seven_store' ? '7-11店到店'
                      : shippingMethod === 'delivery' ? '宅配'
                      : shippingMethod === 'pickup' ? '自取' : '出貨'
  // 達免運（運費=0）時，說明原本的運費已免收並折抵本次補款，讓客人知道少補的錢是運費
  const origFee = shippingMethod === 'delivery' ? 80 : shippingMethod === 'seven_store' ? 60 : 0
  const feeLine = shippingFee > 0
    ? `🚚 運費（${shippingLabel}）：$${shippingFee.toLocaleString()}\n`
    : (origFee > 0
        ? `🎉 已達免運門檻 $${freeShippingThreshold.toLocaleString()}，運費 $${origFee} 免收（已折抵本次補款）\n`
        : '')
  const bank = (shippingMethod === 'seven_store' ? (sevenStorePayment || paymentInfo) : paymentInfo)

  return { ok: true, message:
    `🛒 訂單追加通知\n\n` +
    `📋 單號：${checkoutNo}\n` +
    `您原本的訂單已加入新商品，請補匯差額。\n\n` +
    `📦 商品明細：\n${itemsText}${feeLine}` +
    `─────────────\n` +
    `💰 訂單總額：$${totalAmount.toLocaleString()}\n` +
    `✅ 已付：$${paidAmount.toLocaleString()}\n` +
    `🟡 補匯金額：$${owed.toLocaleString()}\n\n` +
    bankBlock(bank) +
    `匯款後請回覆帳號後 5 碼確認。`,
  }
}

// ─── 初次通知（pending / paid 用，沿用原 v10 邏輯 + 千分位）────────
function buildMessage(
  checkoutNo: string, totalAmount: number, shippingMethod: string, shippingFee: number,
  storeUrl: string | null, itemsText: string,
  paymentInfo: PaymentInfo | null, sevenStorePayment: PaymentInfo | null,
): { ok: true; message: string } | { ok: false; error: string } {
  const itemsBlock = itemsText ? `\n📦 商品明細：\n${itemsText}` : ''

  if (shippingMethod === 'myship' || shippingMethod === 'myship_free') {
    if (!storeUrl) return { ok: false, error: '賣貨便結帳單尚未設定賣場連結' }
    const paySuffix = shippingFee === 0 ? '（免運取貨付款）' : '（取貨付款）'
    return { ok: true, message:
      `🛒 您的商品已開立賣場囉！\n\n📋 單號：${checkoutNo}\n` + itemsBlock +
      `\n💰 金額：$${totalAmount.toLocaleString()}${paySuffix}\n\n👉 請點擊下方連結前往 7-11 下單：\n${storeUrl}\n\n⚠️ 請於 3 天內完成下單，逾期將會自動視為棄單處理。`,
    }
  }

  if (shippingMethod === 'delivery') {
    const goodsAmount = Math.max(0, totalAmount - shippingFee)
    const isFree = shippingFee === 0
    const goodsSuffix = isFree ? `（免運）` : ''
    const grandLine = isFree ? '' : `💵 合計應付：＄${totalAmount.toLocaleString()}（商品 ＄${goodsAmount.toLocaleString()} + 運費 ＄${shippingFee.toLocaleString()}）\n\n`
    return { ok: true, message:
      `📦 您的宅配訂單已開立！\n\n📋 單號：${checkoutNo}\n` + itemsBlock +
      `\n💰 商品金額：＄${goodsAmount.toLocaleString()}${goodsSuffix}\n` + grandLine + bankBlock(paymentInfo) +
      `📮 收到匯款後請回覆以下資訊安排出貨：\n姓名：\n電話：\n地址：\n\n⚠️ 請於 3 天內完成匯款，匯款後請告知後五碼。\n逾期將視為棄單處理。`,
    }
  }

  if (shippingMethod === 'seven_store') {
    const goodsAmount = Math.max(0, totalAmount - shippingFee)
    const isFree = shippingFee === 0
    const goodsSuffix = isFree ? `（免運）` : ''
    const grandLine = isFree ? '' : `💵 合計應付：＄${totalAmount.toLocaleString()}（商品 ＄${goodsAmount.toLocaleString()} + 運費 ＄${shippingFee.toLocaleString()}）\n\n`
    return { ok: true, message:
      `📦 您的訂單已成立（🏪 7-11 店到店寄出）！\n\n📋 單號：${checkoutNo}\n` + itemsBlock +
      `\n💰 商品金額：＄${goodsAmount.toLocaleString()}${goodsSuffix}\n` + grandLine + bankBlock(sevenStorePayment || paymentInfo) +
      `📮 收到匯款後請回覆以下資訊安排寄件：\n姓名：\n電話：\n7-11 店名：\n\n⚠️ 請於 3 天內完成匯款，匯款後請告知後五碼。\n逾期將視為棄單處理。`,
    }
  }

  if (shippingMethod === 'pickup') {
    return { ok: true, message:
      `🏠 您的自取訂單已開立！\n\n📋 單號：${checkoutNo}\n` + itemsBlock +
      `\n💰 金額：＄${totalAmount.toLocaleString()}\n\n` + bankBlock(paymentInfo) +
      `📮 匯款後請告知後五碼，約定取貨時間。\n\n⚠️ 請於 3 天內完成匯款。`,
    }
  }

  return { ok: false, error: `不支援的出貨方式：${shippingMethod}` }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return json({ success: false, error: 'unauthorized' }, 401)

    const anonClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '')
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) return json({ success: false, error: 'invalid_token' }, 401)

    const body = await req.json()
    const { tenant_id, checkout_id } = body
    if (!tenant_id || !checkout_id) return json({ success: false, error: 'missing_params' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const { data: checkout, error: coErr } = await supabase
      .from('checkouts')
      .select('id, checkout_no, customer_name, total_amount, paid_amount, payment_status, shipping_fee, shipping_method, store_url, checkout_items, member_id')
      .eq('id', checkout_id).eq('tenant_id', tenant_id).maybeSingle()
    if (coErr || !checkout) return json({ success: false, error: 'checkout_not_found', message: '找不到結帳單' }, 404)
    if (!checkout.member_id) return json({ success: false, error: 'no_member', message: '結帳單無關聯會員' }, 422)

    const { data: member } = await supabase.from('members').select('line_user_id, display_name').eq('id', checkout.member_id).maybeSingle()
    if (!member?.line_user_id) return json({ success: false, error: 'member_no_line', message: '會員未綁定 LINE' }, 422)

    const { data: tenant } = await supabase
      .from('tenants').select('payment_info, settings, free_shipping_threshold, line_channel_access_token, line_channel_token').eq('id', tenant_id).maybeSingle()
    const lineToken = tenant?.line_channel_access_token || tenant?.line_channel_token
    if (!lineToken) return json({ success: false, error: 'missing_token', message: '店家未設定 LINE Channel Token' }, 422)

    const sevenStorePayment = (tenant?.settings?.payment_info_seven_store || null) as PaymentInfo | null
    const freeShippingThreshold = (tenant?.free_shipping_threshold ?? 3500) as number

    const itemsText = parseItems(checkout.checkout_items)

    const built = checkout.payment_status === 'partial'
      ? buildTopupMessage(
          checkout.checkout_no, checkout.total_amount, checkout.paid_amount ?? 0,
          checkout.shipping_method || 'delivery', checkout.shipping_fee ?? 0, itemsText,
          (tenant?.payment_info || null) as PaymentInfo | null, sevenStorePayment,
          freeShippingThreshold,
        )
      : buildMessage(
          checkout.checkout_no, checkout.total_amount, checkout.shipping_method || 'myship',
          checkout.shipping_fee ?? 0, checkout.store_url, itemsText,
          (tenant?.payment_info || null) as PaymentInfo | null, sevenStorePayment,
        )
    if (!built.ok) return json({ success: false, error: 'message_build_failed', message: built.error }, 400)

    const pushResult = await pushToLine(member.line_user_id, built.message, lineToken)
    const notifyStatus = pushResult.ok ? 'sent' : 'failed'

    await supabase.rpc('update_checkout_notify_status_v1', {
      p_tenant_id: tenant_id, p_checkout_id: checkout_id, p_notify_status: notifyStatus,
      p_notify_error: pushResult.ok ? null : pushResult.error,
    })

    return json({
      success: pushResult.ok, checkout_id, checkout_no: checkout.checkout_no,
      shipping_method: checkout.shipping_method, shipping_fee: checkout.shipping_fee,
      payment_status: checkout.payment_status,
      notify_status: notifyStatus, notify_error: pushResult.ok ? null : pushResult.error,
      message_kind: checkout.payment_status === 'partial' ? 'topup' : 'initial',
    }, pushResult.ok ? 200 : 502)
  } catch (error) {
    return json({ success: false, error: 'internal_error', message: (error as Error).message }, 500)
  }
})
