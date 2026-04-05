'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { LineAuthProvider } from '@/hooks/use-line-auth'
import { Toaster } from 'sonner'

export default function ShopProviders({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const tenantSlug = params.tenantSlug as string

  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#ffffff'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  return (
    <LineAuthProvider tenantSlug={tenantSlug}>
      <div className="min-h-screen" style={{ backgroundColor: '#ffffff' }}>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#ffffff',
              border: '1px solid #E5E7EB',
              color: '#374151',
              fontSize: '14px',
            },
          }}
        />
      </div>
    </LineAuthProvider>
  )
}
