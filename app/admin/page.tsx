'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { Tenant } from '@/types/database'
import {
    Building2,
    ShoppingCart,
    DollarSign,
    TrendingUp,
    ArrowRight,
    Plus,
    Loader2,
} from 'lucide-react'

interface PlatformStats {
    totalTenants: number
    monthlyOrders: number
    monthlyRevenue: number
}

export default function AdminHomePage() {
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [stats, setStats] = useState<PlatformStats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const { isSuperAdmin, tenants: userTenants, isLoading: authLoading } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        if (authLoading) return

        // If not super admin, redirect based on tenant status
        if (!isSuperAdmin) {
            if (userTenants.length > 0) {
                // Has tenant(s), redirect to first tenant dashboard
                router.push(`/admin/t/${userTenants[0].slug}`)
            } else {
                // No tenant, redirect to create tenant page
                router.push('/create-tenant')
            }
            return
        }

        // Fetch data for super admin
        const fetchData = async () => {
            setIsLoading(true)

            const { data, error } = await supabase.rpc('get_all_tenants_v1') as {
                data: { success: boolean; total?: number; tenants?: Tenant[]; error?: string } | null
                error: Error | null
            }

            if (error) {
                console.error('Error fetching tenants:', error)
                setIsLoading(false)
                return
            }

            if (data?.success && data.tenants) {
                setTenants(data.tenants)

                // Calculate stats
                const totalOrders = data.tenants.reduce((sum, t) => sum + (t.monthly_orders || 0), 0)
                const totalRevenue = data.tenants.reduce((sum, t) => sum + (t.monthly_messages || 0) * 100, 0) // Placeholder calculation

                setStats({
                    totalTenants: data.total || data.tenants.length,
                    monthlyOrders: totalOrders,
                    monthlyRevenue: totalRevenue,
                })
            }

            setIsLoading(false)
        }

        if (isSuperAdmin) {
            fetchData()
        }
    }, [isSuperAdmin, userTenants, authLoading, router, supabase])

    // Show loading while auth is loading or while redirecting non-super-admin users
    if (authLoading || !isSuperAdmin) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    }

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">平台管理中心</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage all tenants and platform data
                    </p>
                </div>
                <Link href="/admin/tenants/new">
                    <Button className="gradient-primary rounded-xl">
                        <Plus className="mr-2 h-4 w-4" />
                        新增租戶
                    </Button>
                </Link>
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {isLoading ? (
                    <>
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-[140px] rounded-2xl" />
                        ))}
                    </>
                ) : (
                    <>
                        <StatCard
                            title="總租戶數"
                            value={stats?.totalTenants || 0}
                            icon={Building2}
                            variant="primary"
                            trend={{ value: 12, isPositive: true }}
                        />
                        <StatCard
                            title="本月訂單"
                            value={stats?.monthlyOrders || 0}
                            icon={ShoppingCart}
                            variant="success"
                            trend={{ value: 8, isPositive: true }}
                        />
                        <StatCard
                            title="本月營收"
                            value={`$${(stats?.monthlyRevenue || 0).toLocaleString()}`}
                            icon={DollarSign}
                            variant="warning"
                            trend={{ value: 15, isPositive: true }}
                        />
                        <StatCard
                            title="成長率"
                            value="23%"
                            icon={TrendingUp}
                            variant="default"
                            description="相較上季"
                        />
                    </>
                )}
            </motion.div>

            {/* Tenants List */}
            <motion.div variants={itemVariants}>
                <Card className="border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>租戶列表</CardTitle>
                            <CardDescription>管理平台上的所有店家</CardDescription>
                        </div>
                        <Link href="/admin/tenants">
                            <Button variant="ghost" size="sm" className="rounded-xl">
                                查看全部
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-20 rounded-xl" />
                                ))}
                            </div>
                        ) : tenants.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground">尚未建立任何租戶</p>
                                <Link href="/admin/tenants/new" className="mt-4">
                                    <Button variant="outline" className="rounded-xl">
                                        <Plus className="mr-2 h-4 w-4" />
                                        新增第一個租戶
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tenants.slice(0, 5).map((tenant, index) => (
                                    <motion.div
                                        key={tenant.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <Link href={`/admin/t/${tenant.slug}`}>
                                            <div className="group flex items-center justify-between rounded-xl border border-border/50 p-4 transition-all hover:border-primary/50 hover:bg-muted/50">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                                                        <span className="text-lg font-bold text-primary-foreground">
                                                            {tenant.name.charAt(0)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold">{tenant.name}</h3>
                                                            <Badge
                                                                variant={
                                                                    tenant.subscription_status === 'active'
                                                                        ? 'default'
                                                                        : 'secondary'
                                                                }
                                                                className="text-xs"
                                                            >
                                                                {tenant.subscription_status}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            {tenant.slug} · {tenant.plan}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium">
                                                            {tenant.monthly_orders || 0} 訂單
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">本月</p>
                                                    </div>
                                                    <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    )
}
