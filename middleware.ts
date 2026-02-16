import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const pathname = request.nextUrl.pathname

    // 不需要 auth 檢查的路由（避免循環或干擾 LIFF）
    const skipAuthPaths = ['/auth/redirect', '/auth/callback', '/s']
    const shouldSkipAuth = skipAuthPaths.some(path =>
        pathname === path || pathname.startsWith(`${path}/`)
    )

    // 如果是 auth 相關的內部路由或公開購物頁面，直接放行
    if (shouldSkipAuth) {
        return supabaseResponse
    }

    // 只做 session refresh，不做複雜的權限檢查
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 公開路由（不需要登入）
    const publicPaths = ['/login', '/register', '/forgot-password', '/auth/reset-password', '/terms', '/privacy']
    const isPublicPage = publicPaths.some(path => pathname.startsWith(path))

    // 需要登入的路由
    const protectedPaths = ['/admin', '/create-tenant']
    const isProtectedPage = protectedPaths.some(path => pathname.startsWith(path))

    // 未登入用戶嘗試存取受保護頁面 → 跳轉到登入頁
    if (!user && isProtectedPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('redirectTo', pathname)
        return NextResponse.redirect(url)
    }

    // 已登入用戶存取登入/註冊頁 → 跳轉到 redirect router（由 Server Component 處理跳轉邏輯）
    if (user && isPublicPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/redirect'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
