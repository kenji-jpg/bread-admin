'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

interface LineAuthContextType {
  isReady: boolean
  isLoggedIn: boolean
  profile: LineProfile | null
  login: () => void
  logout: () => void
}

const LineAuthContext = createContext<LineAuthContextType | undefined>(undefined)

const LINE_LOGIN_CHANNEL_ID = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID || '2009073706'

// Dev 模式：localhost 時用假 profile
const IS_DEV = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
const DEV_PROFILE: LineProfile = {
  userId: 'dev-user-001',
  displayName: '開發測試',
  pictureUrl: undefined,
}

function parseCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

interface LineAuthProviderProps {
  children: ReactNode
  tenantSlug: string
}

export function LineAuthProvider({ children, tenantSlug }: LineAuthProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<LineProfile | null>(null)

  useEffect(() => {
    // Dev 模式：根據 URL 參數決定是否自動登入
    if (IS_DEV) {
      const params = new URLSearchParams(window.location.search)
      const staffOverride = params.get('staff') === '1'
      // Dev 模式預設登入（跟原本 LIFF 行為一致）
      console.log('🛠 LINE Auth Dev Mode: 跳過 LINE 驗證')
      setProfile(DEV_PROFILE)
      setIsLoggedIn(true)
      setIsReady(true)
      return
    }

    // 讀取 httpOnly cookie — 因為 httpOnly cookie 前端讀不到，
    // 我們改用 non-httpOnly cookie 讓前端能讀 profile
    // 但 callback route 設的是 httpOnly，所以需要一個 API 來讀
    // 更簡單的做法：callback 同時設一個 non-httpOnly 的 line_profile_public cookie
    const raw = parseCookie('line_profile_public')
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LineProfile
        if (parsed.userId) {
          setProfile(parsed)
          setIsLoggedIn(true)
        }
      } catch {
        // cookie 格式錯誤，忽略
      }
    }
    setIsReady(true)
  }, [])

  const login = useCallback(() => {
    const redirectUri = `${window.location.origin}/api/line/callback`
    const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', LINE_LOGIN_CHANNEL_ID)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('scope', 'profile')
    authorizeUrl.searchParams.set('state', tenantSlug)
    window.location.href = authorizeUrl.toString()
  }, [tenantSlug])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/line/logout', { method: 'POST' })
    } catch {
      // 忽略
    }
    setIsLoggedIn(false)
    setProfile(null)
    window.location.reload()
  }, [])

  return (
    <LineAuthContext.Provider value={{ isReady, isLoggedIn, profile, login, logout }}>
      {children}
    </LineAuthContext.Provider>
  )
}

export function useLineAuth() {
  const context = useContext(LineAuthContext)
  if (context === undefined) {
    throw new Error('useLineAuth must be used within a LineAuthProvider')
  }
  return context
}
