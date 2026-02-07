'use client'

import { LiffProvider } from '@/hooks/use-liff'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <LiffProvider>
      <div className="min-h-screen bg-background">
        {children}
      </div>
    </LiffProvider>
  )
}
