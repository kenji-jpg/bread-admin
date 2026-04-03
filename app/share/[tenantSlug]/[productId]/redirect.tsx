'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ShareRedirect({ url }: { url: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(url)
  }, [router, url])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#999' }}>
      <p>正在前往商城⋯</p>
    </div>
  )
}
