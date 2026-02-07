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
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID
        if (!liffId) {
          setError('LIFF ID 未設定')
          setIsReady(true)
          return
        }

        await liff.init({ liffId })

        setIsInClient(liff.isInClient())
        setIsReady(true)

        // 檢查登入狀態
        if (liff.isLoggedIn()) {
          setIsLoggedIn(true)

          // 取得用戶資料
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
      liff.login()
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
