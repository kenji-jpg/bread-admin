'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { directRpc } from '@/lib/supabase/direct-rpc'
import { LiffProvider } from '@/hooks/use-liff'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [tenantLiffId, setTenantLiffId] = useState<string | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 從 pathname 提取 tenantSlug：/s/shop/mrsanpanman → mrsanpanman
    const match = pathname.match(/\/s\/shop\/([\w-]+)/)
    const slug = match?.[1]

    if (!slug) {
      // /s 頁面（redirect relay）— 尚不知道租戶
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
