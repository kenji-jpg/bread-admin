import PostalMime from 'postal-mime'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// 賣貨便 email 類型
type MyshipEmailType = 'order_confirmed' | 'pickup_completed' | 'unknown'

interface ParsedEmail {
  type: MyshipEmailType
  orderNo: string | null       // CM 開頭的訂單編號
  storeName: string | null     // 賣場名稱（如 260206-5981_Abby Bambi）
  recipientEmail: string       // 收件 email（用來反查 tenant）
}

/**
 * 解析賣貨便 email 內容
 */
function parseMyshipEmail(textContent: string, htmlContent: string, recipientEmail: string): ParsedEmail {
  const content = htmlContent || textContent || ''

  // 提取 CM 訂單編號（格式：CM + 數字）
  const orderNoMatch = content.match(/CM\d{10,}/)?.[0] || null

  // 判斷 email 類型
  let type: MyshipEmailType = 'unknown'
  if (content.includes('有新的訂單成立') || content.includes('訂單成立')) {
    type = 'order_confirmed'
  } else if (content.includes('買家已完成取件') || content.includes('完成取件')) {
    type = 'pickup_completed'
  }

  // 提取賣場名稱（在「賣場名稱：」後面）
  let storeName: string | null = null
  // HTML 格式：<td>賣場名稱：</td><td>260206-5981_Abby Bambi</td>
  const storeNameHtmlMatch = content.match(/賣場名稱[：:]\s*(?:<\/t[dh]>\s*<t[dh][^>]*>)?\s*(?:<a[^>]*>)?\s*([^<\n]+)/i)
  if (storeNameHtmlMatch) {
    storeName = storeNameHtmlMatch[1].trim()
  }
  // 純文字格式 fallback
  if (!storeName) {
    const storeNameTextMatch = content.match(/賣場名稱[：:]\s*(.+)/)?.[1]?.trim() || null
    storeName = storeNameTextMatch
  }

  return {
    type,
    orderNo: orderNoMatch,
    storeName,
    recipientEmail,
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
    return { success: false, error: `RPC error: ${response.status}` }
  }

  return await response.json() as { success: boolean; error?: string }
}

/**
 * 處理訂單成立 email
 */
async function handleOrderConfirmed(parsed: ParsedEmail, env: Env): Promise<void> {
  if (!parsed.storeName || !parsed.orderNo) {
    console.error('Missing store name or order no:', parsed)
    return
  }

  console.log(`Processing order confirmed: store=${parsed.storeName}, orderNo=${parsed.orderNo}`)

  const result = await callSupabaseRpc(env, 'process_myship_order_email', {
    p_store_name: parsed.storeName,
    p_myship_order_no: parsed.orderNo,
    p_recipient_email: parsed.recipientEmail,
  })

  if (result.success) {
    console.log(`Order confirmed: checkout=${result.checkout_no}, orderNo=${parsed.orderNo}`)
  } else {
    console.error(`Failed to process order: ${result.error}`, parsed)
  }
}

/**
 * 處理取貨完成 email
 */
async function handlePickupCompleted(parsed: ParsedEmail, env: Env): Promise<void> {
  if (!parsed.orderNo) {
    console.error('Missing order no for pickup completed:', parsed)
    return
  }

  console.log(`Processing pickup completed: orderNo=${parsed.orderNo}`)

  const result = await callSupabaseRpc(env, 'process_myship_completed_email', {
    p_myship_order_no: parsed.orderNo,
    p_recipient_email: parsed.recipientEmail,
  })

  if (result.success) {
    console.log(`Pickup completed: checkout=${result.checkout_no}, oldStatus=${result.old_status}`)
  } else {
    console.error(`Failed to process pickup: ${result.error}`, parsed)
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // 只處理來自賣貨便的 email
    if (message.from !== 'no-reply@sp88.com') {
      console.log(`Ignoring email from: ${message.from}`)
      // 可選：轉發到 fallback 信箱
      // await message.forward('your-fallback@gmail.com')
      return
    }

    console.log(`Received myship email to: ${message.to}, subject: ${message.headers.get('subject')}`)

    try {
      // 讀取 email 原始內容
      const rawEmail = await new Response(message.raw).arrayBuffer()
      const parser = new PostalMime()
      const parsed = await parser.parse(rawEmail)

      // 解析 email
      const emailData = parseMyshipEmail(
        parsed.text || '',
        parsed.html || '',
        message.to
      )

      console.log('Parsed email:', JSON.stringify(emailData))

      // 根據類型處理
      switch (emailData.type) {
        case 'order_confirmed':
          await handleOrderConfirmed(emailData, env)
          break
        case 'pickup_completed':
          await handlePickupCompleted(emailData, env)
          break
        default:
          console.log('Unknown email type, ignoring:', message.headers.get('subject'))
          break
      }
    } catch (error) {
      console.error('Error processing email:', error)
    }
  },

  // HTTP handler for testing
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST') {
      const body = await request.json() as { type: string; store_name?: string; order_no?: string; email?: string }

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

      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }

    return new Response('Myship Email Worker is running', { status: 200 })
  },
}
