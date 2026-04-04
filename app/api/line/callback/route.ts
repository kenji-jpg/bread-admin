import { NextRequest, NextResponse } from 'next/server'

const LINE_LOGIN_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID!
const LINE_LOGIN_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET!

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state') // tenantSlug
  const error = searchParams.get('error')

  // LINE Login 被用戶取消或失敗
  if (error || !code || !state) {
    return NextResponse.redirect(new URL(`/shop/${state || ''}`, request.url))
  }

  try {
    // 1. 用 authorization code 換 access_token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${request.nextUrl.origin}/api/line/callback`,
        client_id: LINE_LOGIN_CHANNEL_ID,
        client_secret: LINE_LOGIN_CHANNEL_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      console.error('[LINE OAuth] Token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(new URL(`/shop/${state}`, request.url))
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // 2. 用 access_token 取得用戶 profile
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!profileRes.ok) {
      console.error('[LINE OAuth] Profile fetch failed:', await profileRes.text())
      return NextResponse.redirect(new URL(`/shop/${state}`, request.url))
    }

    const profile = await profileRes.json()

    // 3. 設定 httpOnly cookie
    const lineProfile = JSON.stringify({
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || null,
    })

    const response = NextResponse.redirect(new URL(`/shop/${state}`, request.url))
    const cookieOptions = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7, // 7 天
      path: '/',
    }

    // httpOnly cookie（伺服端驗證用）
    response.cookies.set('line_profile', lineProfile, {
      ...cookieOptions,
      httpOnly: true,
    })

    // 可讀 cookie（前端 useLineAuth 讀取用）
    response.cookies.set('line_profile_public', lineProfile, {
      ...cookieOptions,
      httpOnly: false,
    })

    return response
  } catch (err) {
    console.error('[LINE OAuth] Unexpected error:', err)
    return NextResponse.redirect(new URL(`/shop/${state}`, request.url))
  }
}
