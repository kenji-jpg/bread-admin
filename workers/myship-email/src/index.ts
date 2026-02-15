import PostalMime from 'postal-mime'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  FORWARD_EMAIL?: string  // 可選：同時轉寄 email 到此信箱（如 Gmail）
}

// 賣貨便 email 類型
type MyshipEmailType = 'order_confirmed' | 'pickup_completed' | 'unknown'

interface ParsedEmail {
  type: MyshipEmailType
  orderNo: string | null       // CM 開頭的訂單編號
  storeName: string | null     // 賣場名稱（如 260206-3869_亮菁菁）
  recipientEmail: string       // 收件 email（用來反查 tenant）
  subject: string              // email 主旨（用來判斷類型）
}

/**
 * 從 subject 判斷 email 類型（最可靠）
 * - 「賣貨便：訂單成立通知」 → order_confirmed
 * - 「賣貨便：買家完成取貨訂單通知」 → pickup_completed
 */
function detectTypeFromSubject(subject: string): MyshipEmailType {
  if (subject.includes('訂單成立通知')) {
    return 'order_confirmed'
  }
  if (subject.includes('完成取貨') || subject.includes('完成取件')) {
    return 'pickup_completed'
  }
  return 'unknown'
}

/**
 * 從 body 內容 fallback 判斷 email 類型
 */
function detectTypeFromBody(content: string): MyshipEmailType {
  if (content.includes('有新的訂單成立') || content.includes('訂單成立')) {
    return 'order_confirmed'
  }
  if (content.includes('買家已完成取件') || content.includes('完成取件') ||
      content.includes('買家完成取貨') || content.includes('完成取貨')) {
    return 'pickup_completed'
  }
  return 'unknown'
}

/**
 * 解析賣貨便 email 內容
 */
function parseMyshipEmail(
  subject: string,
  textContent: string,
  htmlContent: string,
  recipientEmail: string
): ParsedEmail {
  const content = htmlContent || textContent || ''

  // 1. 判斷 email 類型 — 優先用 subject，fallback 到 body
  let type = detectTypeFromSubject(subject)
  if (type === 'unknown') {
    type = detectTypeFromBody(content)
  }

  // 2. 提取 CM 訂單編號（格式：CM + 13 位數字，如 CM2602101607192）
  const orderNoMatch = content.match(/CM\d{10,}/)?.[0] || null

  // 3. 提取賣場名稱（只在訂單成立通知中需要）
  let storeName: string | null = null
  if (type === 'order_confirmed') {
    // HTML 格式：<td>賣場名稱</td> 後面的 <td> 內容
    // 常見格式：
    //   <td ...>賣場名稱</td><td ...>260206-3869_亮菁菁</td>
    //   <td ...>賣場名稱：</td><td ...><a ...>260206-3869_亮菁菁</a></td>
    const storeNameHtmlMatch = content.match(
      /賣場名稱[：:]?\s*(?:<\/t[dh]>\s*<t[dh][^>]*>\s*)?(?:<[^>]*>)*\s*([^<\n]+)/i
    )
    if (storeNameHtmlMatch) {
      storeName = storeNameHtmlMatch[1].trim()
    }
    // 純文字格式 fallback
    if (!storeName) {
      const storeNameTextMatch = textContent.match(/賣場名稱[：:]\s*(.+)/)?.[1]?.trim() || null
      storeName = storeNameTextMatch
    }
    // 去除賣場名稱中的括號暱稱，例如 "260209-8117_Han. hui（huiiiiii）" → "260209-8117_Han. hui"
    if (storeName) {
      storeName = storeName.replace(/[（(][^）)]*[）)]$/, '').trim()
    }
  }

  return {
    type,
    orderNo: orderNoMatch,
    storeName,
    recipientEmail,
    subject,
  }
}

/**
 * 呼叫 Supabase RPC
 */
async function callSupabaseRpc(
  env: Env,
  functionName: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; error?: string; [key: string]: unknown }> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`RPC ${functionName} failed:`, response.status, errorText)
    return { success: false, error: `RPC error: ${response.status} - ${errorText}` }
  }

  return await response.json() as { success: boolean; error?: string }
}

/**
 * 處理訂單成立 email
 * 用賣場名稱比對 checkout，記錄 CM 訂單編號，狀態 url_sent → ordered
 */
async function handleOrderConfirmed(parsed: ParsedEmail, env: Env): Promise<void> {
  if (!parsed.storeName) {
    console.error('[order_confirmed] Missing store name:', JSON.stringify(parsed))
    return
  }
  if (!parsed.orderNo) {
    console.error('[order_confirmed] Missing CM order no:', JSON.stringify(parsed))
    return
  }

  console.log(`[order_confirmed] store=${parsed.storeName}, orderNo=${parsed.orderNo}, email=${parsed.recipientEmail}`)

  const result = await callSupabaseRpc(env, 'process_myship_order_email', {
    p_store_name: parsed.storeName,
    p_myship_order_no: parsed.orderNo,
    p_recipient_email: parsed.recipientEmail,
  })

  if (result.success) {
    console.log(`[order_confirmed] OK: checkout=${result.checkout_no}, orderNo=${parsed.orderNo}`)
  } else {
    console.error(`[order_confirmed] FAIL: ${result.error}`, JSON.stringify(parsed))
  }
}

/**
 * 處理取貨完成 email
 * 用 CM 訂單編號比對 checkout，狀態 ordered/shipped → completed
 */
async function handlePickupCompleted(parsed: ParsedEmail, env: Env): Promise<void> {
  if (!parsed.orderNo) {
    console.error('[pickup_completed] Missing CM order no:', JSON.stringify(parsed))
    return
  }

  console.log(`[pickup_completed] orderNo=${parsed.orderNo}, email=${parsed.recipientEmail}`)

  const result = await callSupabaseRpc(env, 'process_myship_completed_email', {
    p_myship_order_no: parsed.orderNo,
    p_recipient_email: parsed.recipientEmail,
  })

  if (result.success) {
    console.log(`[pickup_completed] OK: checkout=${result.checkout_no}, oldStatus=${result.old_status}`)
  } else {
    console.error(`[pickup_completed] FAIL: ${result.error}`, JSON.stringify(parsed))
  }
}

export default {
  /**
   * Cloudflare Email Worker handler
   * 接收 Cloudflare Email Routing 轉發的 email
   */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const subject = message.headers.get('subject') || ''
    const from = message.from

    // 只處理來自賣貨便的 email
    if (from !== 'no-reply@sp88.com') {
      console.log(`[skip] Non-myship email from: ${from}, subject: ${subject}`)
      // 非賣貨便的 email 也轉寄到 Gmail
      if (env.FORWARD_EMAIL) {
        await message.forward(env.FORWARD_EMAIL).catch(() => {})
      }
      return
    }

    console.log(`[received] to=${message.to}, from=${from}, subject=${subject}`)

    try {
      // 讀取 email 原始內容並解析（注意：讀取後 stream 消耗，forward 需在之前或用其他方式）
      const rawEmail = await new Response(message.raw).arrayBuffer()
      const parser = new PostalMime()
      const parsed = await parser.parse(rawEmail)

      // 解析 email 內容
      const emailData = parseMyshipEmail(
        subject,
        parsed.text || '',
        parsed.html || '',
        message.to
      )

      console.log(`[parsed] type=${emailData.type}, orderNo=${emailData.orderNo}, storeName=${emailData.storeName}`)

      // 根據類型處理
      switch (emailData.type) {
        case 'order_confirmed':
          await handleOrderConfirmed(emailData, env)
          break
        case 'pickup_completed':
          await handlePickupCompleted(emailData, env)
          break
        default:
          console.log(`[skip] Unknown myship email type, subject: ${subject}`)
          break
      }
    } catch (error) {
      console.error('[error] Failed to process email:', error)
    }
  },

  /**
   * HTTP handler — 用於手動測試
   * POST /  { type, store_name, order_no, email }
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST') {
      try {
        const body = await request.json() as {
          type: string
          store_name?: string
          order_no?: string
          email?: string
        }

        if (body.type === 'order_confirmed' && body.store_name && body.order_no) {
          const result = await callSupabaseRpc(env, 'process_myship_order_email', {
            p_store_name: body.store_name,
            p_myship_order_no: body.order_no,
            p_recipient_email: body.email || null,
          })
          return Response.json(result)
        }

        if (body.type === 'pickup_completed' && body.order_no) {
          const result = await callSupabaseRpc(env, 'process_myship_completed_email', {
            p_myship_order_no: body.order_no,
            p_recipient_email: body.email || null,
          })
          return Response.json(result)
        }

        return Response.json({ error: 'Invalid request. Required: type=order_confirmed (+ store_name, order_no) or type=pickup_completed (+ order_no)' }, { status: 400 })
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
    }

    // Health check
    return Response.json({
      status: 'ok',
      service: 'myship-email-worker',
      description: 'Processes 7-11 myship notification emails to auto-update checkout shipping status',
      endpoints: {
        'POST /': 'Test endpoint: { type, store_name?, order_no, email? }',
      },
    })
  },
}
