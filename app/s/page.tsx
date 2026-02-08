'use client'

import { Suspense, useEffect } from 'react'
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
 */
function LiffRedirectHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const liffState = searchParams.get('liff.state')

    if (liffState) {
      // liff.state 是 encode 過的路徑，例如 /s/cd86c895-...
      const targetPath = decodeURIComponent(liffState)
      router.replace(targetPath)
    }
  }, [searchParams, router])

  return <LoadingSkeleton />
}

export default function LiffRedirectPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LiffRedirectHandler />
    </Suspense>
  )
}
