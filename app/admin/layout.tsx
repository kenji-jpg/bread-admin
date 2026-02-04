'use client'

import { ReactNode } from 'react'
import { TenantProvider } from '@/hooks/use-tenant'
import { SidebarProvider, useSidebar } from '@/hooks/use-sidebar'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Toaster } from '@/components/ui/sonner'

function DashboardContent({ children }: { children: ReactNode }) {
    const { collapsed } = useSidebar()

    return (
        <div
            className="transition-all duration-300"
            style={{ marginLeft: collapsed ? 72 : 260 }}
        >
            <Header />
            <main className="p-6">
                {children}
            </main>
        </div>
    )
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <TenantProvider>
            <SidebarProvider>
                <div className="min-h-screen bg-background">
                    <Sidebar />
                    <DashboardContent>{children}</DashboardContent>
                    <Toaster />
                </div>
            </SidebarProvider>
        </TenantProvider>
    )
}
