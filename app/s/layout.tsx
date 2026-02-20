'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { directRpc } from '@/lib/supabase/direct-rpc'
import { LiffProvider } from '@/hooks/use-liff'

/**
 * 從多個來源提取 tenantSlug
 * 1. pathname：/s/shop/mrsanpanman → mrsanpanman
 * 2. liff.state 參數：LINE 內開 LIFF 時，redirect 到 /s?liff.state=/s/shop/mrsanpanman
 * 3. liffRedirectUri 參數：外部瀏覽器 OAuth 回來
 * 4. sessionStorage：外部瀏覽器 fallback
 */
function extractSlug(pathname: string): string | undefined {
  // 1. 直接從 pathname
  const pathMatch = pathname.match(/\/s\/shop\/([\w-]+)/)
  if (pathMatch?.[1]) return pathMatch[1]

  // 以下需要 window（客戶端）
  if (typeof window === 'undefined') return undefined

  const params = new URLSearchParams(window.location.search)

  // 2. liff.state 參數（LINE 內開啟時）
  const liffState = params.get('liff.state')
  if (liffState) {
    try {
      const decoded = decodeURIComponent(liffState)
      const stateMatch = decoded.match(/\/s\/shop\/([\w-]+)/)
      if (stateMatch?.[1]) return stateMatch[1]
    } catch { /* ignore */ }
  }

  // 3. liffRedirectUri 參數（外部瀏覽器 OAuth 回來）
  const redirectUri = params.get('liffRedirectUri')
  if (redirectUri) {
    try {
      const decoded = decodeURIComponent(redirectUri)
      const uriMatch = decoded.match(/\/s\/shop\/([\w-]+)/)
      if (uriMatch?.[1]) return uriMatch[1]
    } catch { /* ignore */ }
  }

  // 4. sessionStorage（外部瀏覽器 fallback）
  try {
    const saved = sessionStorage.getItem('liff_return_path')
    if (saved) {
      const savedMatch = saved.match(/\/s\/shop\/([\w-]+)/)
      if (savedMatch?.[1]) return savedMatch[1]
    }
  } catch { /* ignore */ }

  return undefined
}

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [tenantLiffId, setTenantLiffId] = useState<string | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const slug = extractSlug(pathname)

    if (!slug) {
      // 真的無法辨識租戶（可能是直接開 /s 且沒有任何參數）
      setReady(true)
      return
    }

    const fetchLiffId = async () => {
      try {
        // 用 SECURITY DEFINER RPC 繞過 RLS（LIFF 端是 anon 角色）
        const { data } = await directRpc<string | null>(
          'get_tenant_liff_id',
          { p_slug: slug }
        )
        if (data) {
          setTenantLiffId(data)
        }
      } catch {
        // 查詢失敗，LiffProvider 會顯示未設定錯誤
      }
      setReady(true)
    }
    fetchLiffId()
  }, [pathname])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  // key 確保 liffId 變更時 LiffProvider 重新 mount（LIFF SDK 只能 init 一次）
  const liffKey = tenantLiffId || 'default'

  return (
    <LiffProvider key={liffKey} liffId={tenantLiffId}>
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </LiffProvider>
  )
}
