'use client'

/**
 * 直接呼叫 Supabase PostgREST RPC，繞過 Supabase client 的 auth 初始化
 *
 * 問題：Supabase client 的 rpc() 內部會 await auth.getSession()，
 * 而 getSession() 會 await initializePromise（auth 初始化）。
 * 如果 auth 初始化被 abort 或 hang，所有 RPC 呼叫都會被永久阻塞。
 *
 * 解法：直接用 fetch 呼叫 PostgREST /rest/v1/rpc/，
 * 手動從 cookie 取得 access_token 做 Authorization header。
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 從 cookie 取得 access_token（和 getUserFromCookie 類似但只取 token）
 */
function getAccessTokenFromCookie(): string | null {
    try {
        const cookies = document.cookie.split(';')
        const authCookie = cookies.find(c => c.trim().startsWith('sb-') && c.includes('-auth-token'))
        if (!authCookie) return null

        const value = authCookie.split('=').slice(1).join('=').trim()
        const jsonStr = value.startsWith('base64-')
            ? atob(value.slice(7))
            : decodeURIComponent(value)

        const parsed = JSON.parse(jsonStr)
        return parsed.access_token || null
    } catch {
        return null
    }
}

/**
 * 直接呼叫 RPC，不經過 Supabase client
 * 回傳格式和 supabase.rpc() 一致：{ data, error }
 */
export async function directRpc<T = unknown>(
    fnName: string,
    args: Record<string, unknown> = {},
    options?: { signal?: AbortSignal }
): Promise<{ data: T | null; error: { message: string } | null }> {
    const accessToken = getAccessTokenFromCookie()
    const bearerToken = accessToken || SUPABASE_ANON_KEY

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${bearerToken}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify(args),
            signal: options?.signal,
        })

        if (!response.ok) {
            const errorBody = await response.text()
            return {
                data: null,
                error: { message: `HTTP ${response.status}: ${errorBody}` }
            }
        }

        const data = await response.json()
        return { data: data as T, error: null }
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw err // 讓呼叫者處理 abort
        }
        return {
            data: null,
            error: { message: err instanceof Error ? err.message : 'Unknown error' }
        }
    }
}
