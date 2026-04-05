/**
 * 檢查 LINE 用戶是否為 OA 好友
 *
 * 用途：商城頁面進入時檢查，未加好友則阻擋
 *
 * 輸入：{ tenant_id, line_user_id }
 * 輸出：{ isFriend: boolean }
 *
 * 原理：呼叫 LINE Messaging API 的 getProfile
 * - 200 → 是好友
 * - 404 → 不是好友（或未互動過）
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tenant_id, line_user_id } = await req.json()

    if (!tenant_id || !line_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing tenant_id or line_user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 用 service role 查詢租戶的 LINE channel access token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('line_channel_access_token')
      .eq('id', tenant_id)
      .single()

    if (tenantError || !tenant?.line_channel_access_token) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found or no LINE token configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 呼叫 LINE Messaging API 檢查好友狀態
    const lineRes = await fetch(
      `https://api.line.me/v2/bot/profile/${line_user_id}`,
      {
        headers: {
          'Authorization': `Bearer ${tenant.line_channel_access_token}`,
        },
      }
    )

    const isFriend = lineRes.status === 200

    return new Response(
      JSON.stringify({ isFriend }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
