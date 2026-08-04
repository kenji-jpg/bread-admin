// ============================================
// Supabase Edge Function: LINE Webhook Handler
// 版本: 27 - 客服回覆讀 tenants.settings.message_config.service_hours（預設值同舊）
// 26 - 記錄 has_messaged_oa
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LineEvent {
  type: string
  replyToken: string
  source: { type: string; userId: string; groupId?: string }
  message?: { type: string; text: string; id: string }
}

interface Tenant {
  id: string
  name: string
  line_channel_token: string
  admin_line_ids: string[]
  payment_info: any
  plan_id: string | null
  line_oa_id: string | null
  settings: any
}

function toTaipeiDate(dateStr: string): Date {
  const d = new Date(dateStr)
  return new Date(d.getTime() + 8 * 60 * 60 * 1000)
}

function formatTaipeiTime(dateStr: string): string {
  const taipei = toTaipeiDate(dateStr)
  const m = taipei.getUTCMonth() + 1
  const d = taipei.getUTCDate()
  const hh = String(taipei.getUTCHours()).padStart(2, '0')
  const mm = String(taipei.getUTCMinutes()).padStart(2, '0')
  return `${m}/${d} ${hh}:${mm}`
}

function cleanNickname(raw: string): string {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/[（(]請刪除並填寫個人暱稱[）)]/g, '')
  cleaned = cleaned.replace(/[（(]請刪除填寫括號[）)]/g, '')
  cleaned = cleaned.trim()
  if (/^[（(].+[）)]$/.test(cleaned)) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  return cleaned
}

function parseIntent(text: string, isAdmin: boolean) {
  const trimmed = text.trim()

  const bindRegex = /^管理員綁定\s+([A-Za-z0-9]{6})$/
  const bindMatch = trimmed.match(bindRegex)
  if (bindMatch) return { intent: 'admin_bind', code: bindMatch[1].toUpperCase() }

  const nicknameRegex = /^社群(?:個人)?暱稱[：:]\s*(.+)$/
  const nicknameMatch = trimmed.match(nicknameRegex)
  if (nicknameMatch) {
    const cleaned = cleanNickname(nicknameMatch[1])
    if (cleaned) return { intent: 'set_nickname', nickname: cleaned }
    return { intent: 'set_nickname_empty' }
  }

  const orderRegex = /^([a-zA-Z0-9\-_]+)\s*\+\s*(\d+)$/
  const orderMatch = trimmed.match(orderRegex)
  if (orderMatch) return { intent: 'create_order', sku: orderMatch[1].toUpperCase(), qty: parseInt(orderMatch[2]) }

  if (trimmed === '查詢訂單') return { intent: 'query_orders' }
  if (['客服', '轉接客服'].includes(trimmed)) return { intent: 'customer_service' }

  if (isAdmin) {
    const restockRegex = /^(補貨|restock|r)\s+([a-zA-Z0-9\-_]+)\s+(\d+)$/i
    const restockMatch = trimmed.match(restockRegex)
    if (restockMatch) return { intent: 'restock', sku: restockMatch[2].toUpperCase(), qty: parseInt(restockMatch[3]) }

    const addProductRegex = /^(?:新增|[Nn])\s+(\S+)\s+(\d+)\s+(\d+)(?:\s+(Y))?(?:\s+(\d+))?$/
    const addProductMatch = trimmed.match(addProductRegex)
    if (addProductMatch) {
      return {
        intent: 'create_product', productName: addProductMatch[1], price: parseInt(addProductMatch[2]),
        stock: parseInt(addProductMatch[3]), isLimited: addProductMatch[4] === 'Y',
        endMinutes: addProductMatch[5] ? parseInt(addProductMatch[5]) : null
      }
    }

    const delistRegex = /^下架\s+([a-zA-Z0-9\-_]+)$/
    const delistMatch = trimmed.match(delistRegex)
    if (delistMatch) return { intent: 'delist_product', sku: delistMatch[1].toUpperCase() }

    const relistRegex = /^上架\s+([a-zA-Z0-9\-_]+)$/
    const relistMatch = trimmed.match(relistRegex)
    if (relistMatch) return { intent: 'relist_product', sku: relistMatch[1].toUpperCase() }

    if (trimmed === '指令') return { intent: 'show_commands' }
  }

  return { intent: 'unknown' }
}

async function replyToLine(replyToken: string, message: string | string[], lineToken: string) {
  try {
    const messages = Array.isArray(message) ? message.map(text => ({ type: 'text', text })) : [{ type: 'text', text: message }]
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST', headers: { 'Authorization': `Bearer ${lineToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages })
    })
  } catch (e) { console.error('Reply error:', e) }
}

async function getLineProfile(userId: string, lineToken: string) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, { headers: { 'Authorization': `Bearer ${lineToken}` } })
    if (res.ok) return await res.json()
  } catch (e) { console.error('Profile error:', e) }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const queryTenantId = url.searchParams.get('tenant_id')
    const shopSlug = url.searchParams.get('shop')
    const body = await req.json()
    const events: LineEvent[] = body.events || []

    if (!events.length || events[0].type !== 'message') {
      return new Response(JSON.stringify({ message: 'No message event' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const event = events[0]
    const messageType = event.message?.type
    const userId = event.source.userId
    const groupId = event.source.groupId
    const replyToken = event.replyToken

    if (messageType !== 'text' && messageType !== 'image') {
      return new Response(JSON.stringify({ message: 'Unsupported message type' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    let tenant: Tenant | null = null
    let tenantSource = ''
    const tenantSelectFields = 'id, name, line_channel_token, admin_line_ids, payment_info, plan_id, line_oa_id, settings'

    if (queryTenantId) {
      const { data, error } = await supabase.from('tenants').select(tenantSelectFields).eq('id', queryTenantId).eq('subscription_status', 'active').single()
      if (data && !error) { tenant = data; tenantSource = 'url_tenant_id' }
    }
    if (!tenant && shopSlug) {
      const { data, error } = await supabase.from('tenants').select(tenantSelectFields).eq('slug', shopSlug).eq('subscription_status', 'active').single()
      if (data && !error) { tenant = data; tenantSource = 'url_shop_slug' }
    }
    if (!tenant && groupId) {
      const { data: mapping } = await supabase.from('line_group_mappings').select('tenant_id').eq('line_group_id', groupId).eq('is_active', true).single()
      if (mapping?.tenant_id) {
        const { data, error } = await supabase.from('tenants').select(tenantSelectFields).eq('id', mapping.tenant_id).eq('subscription_status', 'active').single()
        if (data && !error) { tenant = data; tenantSource = 'line_group_mapping' }
      }
    }
    if (!tenant) {
      const { data, error } = await supabase.from('tenants').select(tenantSelectFields).eq('subscription_status', 'active').order('created_at', { ascending: true }).limit(1).single()
      if (data && !error) { tenant = data; tenantSource = 'default_first' }
    }
    if (!tenant) {
      return new Response(JSON.stringify({ error: 'No tenant found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const tenantId = tenant.id
    const lineToken = tenant.line_channel_token

    let isAdmin = false
    const { data: adminData } = await supabase.rpc('get_admin_by_line_id', { p_line_user_id: userId, p_tenant_id: tenantId })
    if (adminData?.success && !adminData?.is_suspended) { isAdmin = true }
    else { isAdmin = tenant.admin_line_ids?.includes(userId) || false }

    if (messageType === 'image') {
      return new Response(JSON.stringify({ ignored: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const text = event.message!.text.trim()
    const profile = await getLineProfile(userId, lineToken)
    const displayName = profile?.displayName || '用戶'

    try {
      await supabase.rpc('mark_member_messaged_v1', {
        p_tenant_id: tenantId,
        p_line_user_id: userId,
        p_display_name: displayName,
      })
    } catch (e) {
      console.error('mark_member_messaged_v1 error:', e)
    }

    const parsed = parseIntent(text, isAdmin)

    let responseMessage: string | string[] = ''

    switch (parsed.intent) {
      case 'admin_bind': {
        const { data, error } = await supabase.rpc('bind_admin_line_id', { p_bind_code: parsed.code, p_tenant_id: tenantId, p_line_user_id: userId })
        if (error) { responseMessage = '❌ 綁定失敗，請稍後再試'; break }
        if (!data?.success) {
          const em: Record<string, string> = { 'invalid_code': '❌ 綁定碼無效或已使用', 'code_expired': '❌ 綁定碼已過期', 'line_already_bound': '❌ 此 LINE 已綁定其他管理員', 'already_bound': '❌ 該管理員已綁定 LINE' }
          responseMessage = em[data?.error] || `❌ 綁定失敗：${data?.message || '未知錯誤'}`; break
        }
        responseMessage = `✅ 管理員綁定成功！\n\n🏠 店家: ${data.tenant_name}\n👤 身份: ${data.display_name}\n\n輸入「指令」查看可用功能`
        break
      }

      case 'set_nickname': {
        const { data: existing } = await supabase
          .from('members').select('id, display_name')
          .eq('tenant_id', tenantId).eq('nickname', parsed.nickname)
          .neq('line_user_id', userId).limit(1)

        if (existing && existing.length > 0) {
          responseMessage = `⚠️ 暱稱「${parsed.nickname}」已經有人使用了！\n\n⚠️ 提醒：設定的暱稱一定要跟社群名稱相同哦～\n\n請確認您在社群的暱稱是否正確，或更換一個不同的暱稱後重新輸入：\n\n社群個人暱稱:您的新暱稱`
          break
        }

        const { data, error } = await supabase.rpc('set_community_nickname_v2', {
          p_tenant_id: tenantId, p_line_user_id: userId, p_display_name: displayName, p_nickname: parsed.nickname
        })
        if (error) { responseMessage = `❌ 設定失敗: ${error.message}`; break }
        if (!data?.success) { responseMessage = '❌ 設定失敗'; break }

        const { data: claimData, error: claimError } = await supabase.rpc('claim_auction_order_v1', {
          p_tenant_id: tenantId, p_line_user_id: userId, p_nickname: parsed.nickname
        })

        responseMessage = `✅ 社群暱稱設定成功！\n\n👤 LINE 名稱: ${displayName}\n🏷️ 社群暱稱: ${parsed.nickname}\n\n⚠️ 提醒：設定的暱稱一定要跟社群名稱相同哦～`
        if (!claimError && claimData?.claimed_count > 0) {
          responseMessage += `\n\n🎉 已為您建立 ${claimData.claimed_count} 筆訂單：\n`
          claimData.claimed_orders.forEach((order: any) => { responseMessage += `• ${order.auction_date || ''}${order.nickname} $${order.amount}\n` })
          responseMessage += '\n輸入「查詢訂單」查看購物車'
        }
        break
      }

      case 'set_nickname_empty': {
        responseMessage = '⚠️ 暱稱不能為空喔！\n\n請重新輸入：\n社群個人暱稱:您的暱稱\n\n例如：社群個人暱稱:小明\n\n⚠️ 提醒：設定的暱稱一定要跟社群名稱相同哦～'
        break
      }

      case 'create_order': {
        const { data, error } = await supabase.rpc('create_order_v2', { p_tenant_id: tenantId, p_line_user_id: userId, p_sku: parsed.sku, p_quantity: parsed.qty, p_display_name: displayName })
        if (error) { responseMessage = `❌ RPC錯誤：\n${error.message}` }
        else if (!data?.success) { responseMessage = `❌ ${data?.message || 'unknown error'}` }
        else {
          const subtotal = (parsed.qty || 1) * data.product.price
          const stockStatus = data.is_arrived ? '✅ 現貨' : '⏳ 預購'
          const stockHint = data.is_arrived ? '可直接結帳' : '到貨後通知您結帳'
          responseMessage = `✅ 訂單${data.action === 'updated' ? '更新' : '建立'}成功！\n\n📦 ${data.product.name}\n🏷️ ${data.product.sku}\n💰 $${data.product.price} x ${parsed.qty} = $${subtotal}\n📊 ${stockStatus}\n\n${stockHint}\n輸入「查詢訂單」查看購物車`
        }
        break
      }

      case 'query_orders': {
        const { data, error } = await supabase.rpc('get_member_orders_v2', { p_tenant_id: tenantId, p_line_user_id: userId })
        if (error) { responseMessage = `❌ 查詢錯誤: ${error.message}` }
        else if (!data?.orders?.length) { responseMessage = '🛒 購物車是空的\n\n快去下單吧！' }
        else {
          let msg = '📦 您的訂單：\n\n'
          const readyOrders = data.orders.filter((o: any) => o.is_arrived)
          const pendingOrders = data.orders.filter((o: any) => !o.is_arrived)
          if (readyOrders.length > 0) { msg += '✅ 現貨：\n'; readyOrders.forEach((o: any) => { msg += `• ${o.name} x${o.quantity} ($${o.subtotal})\n` }); msg += '\n' }
          if (pendingOrders.length > 0) { msg += '⏳ 預購（等待到貨）：\n'; pendingOrders.forEach((o: any) => { msg += `• ${o.name} x${o.quantity} ($${o.subtotal})\n` }); msg += '\n' }
          if (data.ready_total > 0) { msg += `💰 可結帳金額: $${data.ready_total}` }
          else { msg += '💡 目前沒有可結帳的商品\n請等待預購商品到貨' }
          responseMessage = msg
        }
        break
      }

      case 'customer_service': {
        const hours = (tenant.settings?.message_config?.service_hours || '').trim() || 'AM 10:00 - PM 04:00'
        responseMessage = `已轉接客服！\n\n🕐 客服時間：${hours}\n\n請稍候，我們會盡快回覆您！`
        break
      }

      case 'restock': {
        const { data, error } = await supabase.rpc('restock_product_v2', { p_tenant_id: tenantId, p_sku: parsed.sku, p_quantity: parsed.qty })
        if (error) { responseMessage = `❌ 補貨失敗: ${error.message}` }
        else if (!data?.success) { responseMessage = `❌ ${data?.message || '補貨失敗'}` }
        else { responseMessage = `✅ 補貨完成！\n\n📦 ${data.product_name}\n📊 庫存: ${data.old_stock} → ${data.new_stock}\n➕ 補貨: +${data.added_qty}\n\n` + (data.fulfilled_orders > 0 ? `🎉 已滿足 ${data.fulfilled_orders} 筆預購訂單（共 ${data.fulfilled_qty} 個）` : '目前沒有待滿足的預購訂單') }
        break
      }

      case 'create_product': {
        const { data, error } = await supabase.rpc('create_product_v1', { p_tenant_id: tenantId, p_name: parsed.productName, p_price: parsed.price, p_stock: parsed.stock, p_is_limited: parsed.isLimited || false, p_end_minutes: parsed.endMinutes || null, p_image_url: null })
        if (error) { responseMessage = `❌ 新增失敗: ${error.message}`; break }
        if (!data?.success) { responseMessage = `❌ ${data?.message || '新增失敗'}`; break }
        let adminMsg = `✅ 商品新增成功！\n\n📦 ${data.name}\n🏷️ SKU: ${data.sku}\n💰 $${data.price}\n📊 庫存: ${data.stock}`
        if (data.is_limited) adminMsg += ' (限量)'
        if (data.end_time) adminMsg += `\n⏰ 截止: ${formatTaipeiTime(data.end_time)}`
        adminMsg += '\n\n⬇️ 下方為社群貼文，可直接複製'
        const lineOaId = tenant.line_oa_id || ''
        let card = `━━━━━━━━━━━━━━━\n🛍️ ${data.name}\n━━━━━━━━━━━━━━━\n💰 售價：$${data.price}\n`
        if (data.is_limited) { card += `📦 狀態：現貨（限量 ${data.stock} 件）\n` } else { card += '📦 狀態：預購\n' }
        if (data.end_time) { card += `⏰ 截止：${formatTaipeiTime(data.end_time)}\n` }
        if (lineOaId) { const oaId = lineOaId.startsWith('@') ? lineOaId : `@${lineOaId}`; card += `👉 點擊下單\nhttps://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${encodeURIComponent(data.sku)}+1\n` }
        else { card += `\n下單請輸入 👇\n${data.sku}+數量\n` }
        card += '━━━━━━━━━━━━━━━'
        responseMessage = [adminMsg, card]
        break
      }

      case 'delist_product': {
        const { data: product, error: findErr } = await supabase.from('products').select('id, name, status').eq('tenant_id', tenantId).eq('sku', parsed.sku).neq('status', 'deleted').single()
        if (findErr || !product) { responseMessage = `❌ 找不到商品: ${parsed.sku}`; break }
        if (product.status === 'inactive') { responseMessage = `⚠️ ${product.name} 已經是下架狀態`; break }
        const { error: updateErr } = await supabase.from('products').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', product.id)
        responseMessage = updateErr ? `❌ 下架失敗: ${updateErr.message}` : `✅ 已下架\n\n📦 ${product.name}\n🏷️ ${parsed.sku}\n\n輸入「上架 ${parsed.sku}」可重新上架`
        break
      }

      case 'relist_product': {
        const { data: product, error: findErr } = await supabase.from('products').select('id, name, status').eq('tenant_id', tenantId).eq('sku', parsed.sku).neq('status', 'deleted').single()
        if (findErr || !product) { responseMessage = `❌ 找不到商品: ${parsed.sku}`; break }
        if (product.status === 'active') { responseMessage = `⚠️ ${product.name} 已經是上架狀態`; break }
        const { error: updateErr } = await supabase.from('products').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', product.id)
        responseMessage = updateErr ? `❌ 上架失敗: ${updateErr.message}` : `✅ 已上架\n\n📦 ${product.name}\n🏷️ ${parsed.sku}\n\n商品已恢復上架`
        break
      }

      case 'show_commands': {
        responseMessage = '📚 管理員指令：\n\n【新增商品】\n新增 商品名 價格 庫存 [Y] [限時分鐘]\n快捷：N 商品名 價格 庫存 [Y] [限時分鐘]\n例：N 黑色大衣 680 30\n\n【補貨】\n補貨 SKU 數量\n例：補貨 250204-1 10\n\n【商品管理】\n下架 SKU\n上架 SKU'
        break
      }

      default:
        return new Response(JSON.stringify({ ignored: true, marked_messaged: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const hasResponse = Array.isArray(responseMessage) ? responseMessage.length > 0 : !!responseMessage
    if (hasResponse) await replyToLine(replyToken, responseMessage, lineToken)

    return new Response(JSON.stringify({ success: true, intent: parsed.intent, tenant: tenant.name, tenantSource }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
