'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'

const LoadingSkeleton = () => (
  <div className="min-h-screen p-4">
    <Skeleton className="h-12 w-48 mb-4" />
    <div className="grid grid-cols-3 gap-2">
      {[...Array(9)].map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-xl" />
      ))}
    </div>
  </div>
)

/**
 * LIFF 回調中繼頁面
 *
 * 當 LIFF Endpoint URL 設為 .../s 時，LINE Login 完成後會 redirect 到：
 *   /s?liff.state=%2Fs%2F{sessionId}
 *
 * 這個頁面讀取 liff.state 參數，提取真正的路徑，然後 redirect 過去。
 *
 * Fallback 順序：
 * 1. liff.state 參數（LINE 內瀏覽器）
 * 2. sessionStorage 存的路徑（外部瀏覽器 OAuth 回來）
 * 3. liffRedirectUri 參數中解析路徑（外部瀏覽器 fallback）
 * 4. 3 秒後顯示錯誤訊息（全部失敗時）
 */
function LiffRedirectHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [showError, setShowError] = useState(false)

  // 在 render 時立即快照 URL 參數
  // 因為 liff.init() 可能會用 replaceState 清除 URL 中的 code/state 等參數
  const [initialParams] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search)
    }
    return new URLSearchParams()
  })

  useEffect(() => {
    const rawParams = initialParams

    // === 1. liff.state 參數（LINE 內瀏覽器 / LIFF to LIFF redirect）===
    const liffState = searchParams.get('liff.state') || rawParams.get('liff.state')
    if (liffState) {
      const targetPath = decodeURIComponent(liffState)
      sessionStorage.removeItem('liff_return_path')
      router.replace(targetPath)
      return
    }

    // === 2. sessionStorage 存的路徑（外部瀏覽器 OAuth 回來）===
    const savedPath = sessionStorage.getItem('liff_return_path')
    if (savedPath) {
      sessionStorage.removeItem('liff_return_path')
      router.replace(savedPath)
      return
    }

    // === 3. 從 liffRedirectUri 解析路徑 ===
    // 外部瀏覽器 OAuth 回來時 URL 通常是：
    // /s?code=xxx&liffRedirectUri=https://domain.com/s/shop/bread-shop
    const liffRedirectUri = searchParams.get('liffRedirectUri') || rawParams.get('liffRedirectUri')
    if (liffRedirectUri) {
      try {
        const url = new URL(liffRedirectUri)
        const targetPath = url.pathname
        if (targetPath && targetPath.startsWith('/s/')) {
          router.replace(targetPath)
          return
        }
      } catch {
        // URL 解析失敗，繼續到 fallback
      }
    }

    // === 4. 超時 fallback ===
    const timer = setTimeout(() => {
      setShowError(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [searchParams, router])

  if (showError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <p className="text-muted-foreground mb-4">
          頁面載入失敗，請重新開啟連結
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
        >
          重新載入
        </button>
      </div>
    )
  }

  return <LoadingSkeleton />
}

export default function LiffRedirectPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LiffRedirectHandler />
    </Suspense>
  )
}
