import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  const clearOptions = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  }
  response.cookies.set('line_profile', '', { ...clearOptions, httpOnly: true })
  response.cookies.set('line_profile_public', '', { ...clearOptions, httpOnly: false })
  return response
}
