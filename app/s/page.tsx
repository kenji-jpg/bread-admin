'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 舊 LIFF 回調中繼頁 — 已棄用
 * LIFF URL 開啟後會到 /s?liff.state=...
 * 現在直接 redirect 到新的 /shop/ 路徑
 */
export default function LegacyLiffRedirect() {
  const router = useRouter()

  useEffect(() => {
    // 嘗試從 URL 參數中提取 tenantSlug
    const params = new URLSearchParams(window.location.search)
    const liffState = params.get('liff.state')

    if (liffState) {
      try {
        const decoded = decodeURIComponent(liffState)
        const match = decoded.match(/\/(?:s\/)?shop\/([\w-]+)/)
        if (match?.[1]) {
          router.replace(`/shop/${match[1]}`)
          return
        }
      } catch { /* ignore */ }
    }

    // Fallback：導回首頁
    router.replace('/')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">正在跳轉⋯</p>
    </div>
  )
}
