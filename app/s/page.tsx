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
 * 從 URL 字串中提取 /s/ 開頭的路徑
 * 支援完整 URL 和純路徑
 */
function extractPathFromUrl(urlStr: string): string | null {
  // 嘗試 decode（處理 double encode 的情況）
  let decoded = urlStr
  try {
    // 如果是 encode 過的，decode 一次
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded)
    }
    // 如果還是 encode 的（double encode），再 decode
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded)
    }
  } catch {
    // decode 失敗就用原值
  }

  // 嘗試作為完整 URL 解析
  try {
    const url = new URL(decoded)
    if (url.pathname.startsWith('/s/')) {
      return url.pathname
    }
  } catch {
    // 不是完整 URL
  }

  // 嘗試直接作為路徑
  if (decoded.startsWith('/s/')) {
    return decoded
  }

  return null
}

/**
 * LIFF 回調中繼頁面
 *
 * Fallback 順序：
 * 1. liff.state 參數（LINE 內瀏覽器）
 * 2. sessionStorage 存的路徑（外部瀏覽器 OAuth 回來）
 * 3. liffRedirectUri 參數中解析路徑（外部瀏覽器 fallback）
 * 4. 從完整 URL 字串中暴力搜尋 /s/ 路徑
 * 5. 3 秒後顯示錯誤訊息
 */
function LiffRedirectHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    // 直接用 window.location 讀原始 URL（不依賴 React state）
    // 因為 liff.init() 可能在任何時候用 replaceState 清掉參數
    const fullUrl = window.location.href
    const rawSearch = window.location.search
    const rawParams = new URLSearchParams(rawSearch)

    console.log('[LiffRedirect] fullUrl:', fullUrl)
    console.log('[LiffRedirect] rawSearch:', rawSearch)

    // === 1. liff.state 參數 ===
    const liffState = rawParams.get('liff.state') || searchParams.get('liff.state')
    if (liffState) {
      const targetPath = decodeURIComponent(liffState)
      console.log('[LiffRedirect] Found liff.state:', targetPath)
      sessionStorage.removeItem('liff_return_path')
      router.replace(targetPath)
      return
    }

    // === 2. sessionStorage ===
    const savedPath = sessionStorage.getItem('liff_return_path')
    if (savedPath) {
      console.log('[LiffRedirect] Found sessionStorage:', savedPath)
      sessionStorage.removeItem('liff_return_path')
      router.replace(savedPath)
      return
    }

    // === 3. liffRedirectUri 參數 ===
    const liffRedirectUri = rawParams.get('liffRedirectUri') || searchParams.get('liffRedirectUri')
    if (liffRedirectUri) {
      console.log('[LiffRedirect] Found liffRedirectUri:', liffRedirectUri)
      const path = extractPathFromUrl(liffRedirectUri)
      if (path) {
        console.log('[LiffRedirect] Extracted path:', path)
        router.replace(path)
        return
      }
    }

    // === 4. 暴力搜尋：從完整 URL 中找 /s/shop/ 或 /s/ 路徑 ===
    // 因為 URL 可能被 encode，先 decode 整個 URL
    let decodedUrl = fullUrl
    try { decodedUrl = decodeURIComponent(decodedUrl) } catch {}
    try { decodedUrl = decodeURIComponent(decodedUrl) } catch {}

    const shopMatch = decodedUrl.match(/\/s\/shop\/[\w-]+/)
    const sessionMatch = decodedUrl.match(/\/s\/[\w-]{8,}/)
    const bruteForceMatch = shopMatch?.[0] || sessionMatch?.[0]

    if (bruteForceMatch) {
      console.log('[LiffRedirect] Brute force match:', bruteForceMatch)
      router.replace(bruteForceMatch)
      return
    }

    console.log('[LiffRedirect] No match found, showing error')

    // === 5. 超時 fallback ===
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
