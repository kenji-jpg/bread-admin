'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import liff from '@line/liff'

interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

interface LiffContextType {
  isReady: boolean
  isLoggedIn: boolean
  isInClient: boolean // 是否在 LINE App 內
  profile: LiffProfile | null
  error: string | null
  login: () => void
  logout: () => void
}

const LiffContext = createContext<LiffContextType | undefined>(undefined)

// Dev 模式：localhost 時跳過 LIFF 驗證，用假 profile 直接進商城
const IS_DEV = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
)
const DEV_PROFILE: LiffProfile = {
  userId: 'dev-user-001',
  displayName: '開發測試',
  pictureUrl: undefined,
}

/**
 * 產生 LIFF 分享連結
 * 從 LINE 社群打開 LIFF URL → 自動授權，零跳轉
 * 從外部瀏覽器打開 → 會跳轉一次到 LINE Login
 */
export function getLiffShareUrl(path: string, customLiffId?: string): string {
  const liffId = customLiffId
  if (!liffId) return path
  // path 例如 /s/abc123 → https://liff.line.me/{liffId}/s/abc123
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `https://liff.line.me/${liffId}${cleanPath}`
}

/**
 * 產生商城 LIFF 分享連結
 * 例如 → https://liff.line.me/{liffId}/s/shop/{tenantSlug}
 * 必須傳入 customLiffId（租戶專屬 LIFF ID）
 */
export function getShopShareUrl(tenantSlug: string, customLiffId?: string): string {
  return getLiffShareUrl(`/s/shop/${tenantSlug}`, customLiffId)
}

interface LiffProviderProps {
  children: ReactNode
  liffId?: string  // 租戶專屬 LIFF ID
}

export function LiffProvider({ children, liffId: tenantLiffId }: LiffProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isInClient, setIsInClient] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initLiff = async () => {
      // Dev 模式：跳過 LIFF，直接用假 profile
      if (IS_DEV) {
        console.log('🛠 LIFF Dev Mode: 跳過 LINE 驗證')
        setProfile(DEV_PROFILE)
        setIsLoggedIn(true)
        setIsInClient(false)
        setIsReady(true)
        return
      }

      try {
        if (!tenantLiffId) {
          setError('此店家尚未設定 LIFF ID')
          setIsReady(true)
          return
        }

        // 外部瀏覽器：在 LIFF SDK redirect 到 LINE Login 前，
        // 先存住當前路徑，登入後回到 /s 時可以 redirect 回來
        const currentPath = window.location.pathname + window.location.search
        const pathOnly = window.location.pathname
        if (pathOnly.startsWith('/s/') && !window.location.search.includes('code=')) {
          sessionStorage.setItem('liff_return_path', pathOnly)
        }

        // withLoginOnExternalBrowser: true
        // - LINE 內開啟：liff.init() 自動授權，零跳轉
        // - 外部瀏覽器：自動觸發 liff.login()，只跳轉一次
        await liff.init({
          liffId: tenantLiffId,
          withLoginOnExternalBrowser: true,
        })

        setIsInClient(liff.isInClient())

        // init 完成後，無論 LINE 內或外部瀏覽器（redirect 回來後）都已登入
        if (liff.isLoggedIn()) {
          setIsLoggedIn(true)

          try {
            const userProfile = await liff.getProfile()
            setProfile({
              userId: userProfile.userId,
              displayName: userProfile.displayName,
              pictureUrl: userProfile.pictureUrl,
            })
          } catch (profileError) {
            console.error('Failed to get profile:', profileError)
          }
        }

        setIsReady(true)
      } catch (err) {
        console.error('LIFF init error:', err)
        setError(err instanceof Error ? err.message : 'LIFF 初始化失敗')
        setIsReady(true)
      }
    }

    initLiff()
  }, [])

  const login = () => {
    if (!liff.isLoggedIn()) {
      if (liff.isInClient()) {
        // LINE 內不應該到這裡，嘗試重新載入
        window.location.reload()
      } else {
        // 外部瀏覽器：跳轉到 LINE Login
        liff.login({ redirectUri: window.location.href })
      }
    }
  }

  const logout = () => {
    if (liff.isLoggedIn()) {
      liff.logout()
      setIsLoggedIn(false)
      setProfile(null)
      window.location.reload()
    }
  }

  return (
    <LiffContext.Provider
      value={{
        isReady,
        isLoggedIn,
        isInClient,
        profile,
        error,
        login,
        logout,
      }}
    >
      {children}
    </LiffContext.Provider>
  )
}

export function useLiff() {
  const context = useContext(LiffContext)
  if (context === undefined) {
    throw new Error('useLiff must be used within a LiffProvider')
  }
  return context
}
