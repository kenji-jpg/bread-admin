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

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || ''

/**
 * 產生 LIFF 分享連結
 * 從 LINE 社群打開 LIFF URL → 自動授權，零跳轉
 * 從外部瀏覽器打開 → 會跳轉一次到 LINE Login
 */
export function getLiffShareUrl(path: string): string {
  if (!LIFF_ID) return path
  // path 例如 /s/abc123 → https://liff.line.me/{liffId}/s/abc123
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `https://liff.line.me/${LIFF_ID}${cleanPath}`
}

interface LiffProviderProps {
  children: ReactNode
}

export function LiffProvider({ children }: LiffProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isInClient, setIsInClient] = useState(false)
  const [profile, setProfile] = useState<LiffProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initLiff = async () => {
      try {
        if (!LIFF_ID) {
          setError('LIFF ID 未設定')
          setIsReady(true)
          return
        }

        // withLoginOnExternalBrowser: true
        // - LINE 內開啟：liff.init() 自動授權，零跳轉
        // - 外部瀏覽器：自動觸發 liff.login()，只跳轉一次
        await liff.init({
          liffId: LIFF_ID,
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
