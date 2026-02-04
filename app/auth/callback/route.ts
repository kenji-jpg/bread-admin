import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = request.nextUrl
    const code = searchParams.get('code')

    if (code) {
        const response = NextResponse.redirect(`${origin}/auth/redirect`)

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            response.cookies.set(name, value, options)
                        )
                    },
                },
            }
        )

        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            // 驗證成功，導向 redirect 頁面（由該頁面處理跳轉邏輯）
            return response
        }
    }

    // 驗證失敗，返回登入頁面
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
