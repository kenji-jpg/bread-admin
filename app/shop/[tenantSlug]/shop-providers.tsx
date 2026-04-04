'use client'

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

  return (
    <LineAuthProvider tenantSlug={tenantSlug}>
      <div className="min-h-screen bg-background">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#FFF8F0',
              border: '1px solid #E8D5BE',
              color: '#4A2C17',
              fontSize: '14px',
            },
          }}
        />
      </div>
    </LineAuthProvider>
  )
}
