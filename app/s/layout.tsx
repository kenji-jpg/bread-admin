'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
        const supabase = createClient()
        const { data } = await supabase
          .from('tenants')
          .select('liff_id')
          .eq('slug', slug)
          .single()
        if (data?.liff_id) {
          setTenantLiffId(data.liff_id)
        }
      } catch {
        // 查詢失敗，用預設（LiffProvider 會顯示未設定錯誤）
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
