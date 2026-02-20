'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useTenant } from '@/hooks/use-tenant'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    ShoppingCart,
    DollarSign,
    Package,
    Users,
    Clock,
    TrendingUp,
    Sparkles,
    ArrowRight,
    AlertTriangle,
    Crown,
    CalendarDays,
    Shield,
    CreditCard,
} from 'lucide-react'

export default function TenantDashboardPage() {
    // 從 useTenant 取得所有資料（包括 stats）
    const { tenant, isLoading, stats } = useTenant()

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-64" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-[140px] rounded-2xl" />
                    ))}
                </div>
            </div>
        )
    }

    if (!tenant) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">找不到租戶資料</p>
            </div>
        )
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 },
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
            <motion.div variants={itemVariants}>
                <h1 className="text-3xl font-bold tracking-tight">
                    <span className="gradient-text">{tenant.name}</span>
                </h1>
                <p className="text-muted-foreground mt-1">歡迎回來，這是您的營運概況</p>
            </motion.div>

            {/* 訂閱狀態卡 */}
            {(() => {
                const daysLeft = tenant.plan_expires_at
                    ? Math.ceil((new Date(tenant.plan_expires_at).getTime() - Date.now()) / 86400000)
                    : null
                const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 7
                const isExpired = daysLeft !== null && daysLeft <= 0
                const isFreeGrandfathered = !tenant.plan_expires_at

                const planLabel = tenant.plan === 'pro' ? 'Pro 專業版' : tenant.plan === 'max' ? 'Max 旗艦版' : 'Basic 基本版'
                const PlanIcon = tenant.plan === 'basic' ? Shield : Crown

                // 狀態判定
                let statusLabel: string
                let statusColor: string // tailwind classes for badge
                if (isExpired) {
                    statusLabel = '已過期'
                    statusColor = 'bg-destructive/15 text-destructive border-destructive/30'
                } else if (isExpiringSoon) {
                    statusLabel = '即將到期'
                    statusColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                } else if (isFreeGrandfathered) {
                    statusLabel = '永久啟用'
                    statusColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                } else {
                    statusLabel = '使用中'
                    statusColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }

                // 外框色
                const borderColor = isExpired
                    ? 'border-destructive/40'
                    : isExpiringSoon
                        ? 'border-amber-500/40'
                        : 'border-border/50'

                const startDate = tenant.subscription_starts_at
                    ? new Date(tenant.subscription_starts_at).toLocaleDateString('zh-TW')
                    : new Date(tenant.created_at).toLocaleDateString('zh-TW')

                const expiryDate = isFreeGrandfathered
                    ? '無期限'
                    : tenant.plan_expires_at
                        ? new Date(tenant.plan_expires_at).toLocaleDateString('zh-TW')
                        : '—'

                const expiryExtra = daysLeft !== null && daysLeft > 0 && daysLeft <= 30
                    ? `（剩 ${daysLeft} 天）`
                    : ''

                return (
                    <motion.div variants={itemVariants}>
                        <Card className={`${borderColor}`}>
                            <CardContent className="px-5 py-3">
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                    {/* 方案等級 */}
                                    <div className="flex items-center gap-2">
                                        <PlanIcon className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-semibold">{planLabel}</span>
                                        {tenant.plan === 'basic' && !isExpired && (
                                            <Link href={`/admin/t/${tenant.slug}/settings/billing`} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline ml-1">
                                                <Sparkles className="h-3 w-3" />
                                                升級
                                            </Link>
                                        )}
                                    </div>

                                    <div className="hidden md:block h-4 w-px bg-border" />

                                    {/* 啟用狀態 */}
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
                                        {statusLabel}
                                    </span>

                                    <div className="hidden md:block h-4 w-px bg-border" />

                                    {/* 啟用日期 */}
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <CalendarDays className="h-3.5 w-3.5" />
                                        <span>{startDate}</span>
                                    </div>

                                    <div className="hidden md:block h-4 w-px bg-border" />

                                    {/* 到期日期 */}
                                    <div className={`flex items-center gap-1.5 text-sm ${isExpired ? 'text-destructive font-medium' : isExpiringSoon ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                                        <CreditCard className="h-3.5 w-3.5" />
                                        <span>{expiryDate}{expiryExtra}</span>
                                    </div>

                                    {/* 到期操作按鈕 — 推到最右 */}
                                    {(isExpired || isExpiringSoon) && (
                                        <div className="ml-auto">
                                            <Link href={`/admin/t/${tenant.slug}/settings/billing`}>
                                                <Button
                                                    size="sm"
                                                    variant={isExpired ? 'destructive' : 'outline'}
                                                    className={`rounded-lg h-7 text-xs ${isExpiringSoon && !isExpired ? 'border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400' : ''}`}
                                                >
                                                    {isExpired ? '立即續費' : '前往續費'}
                                                    <ArrowRight className="ml-1 h-3 w-3" />
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )
            })()}

            {/* Stats Grid */}
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="今日訂單"
                    value={stats?.today_orders || 0}
                    icon={ShoppingCart}
                    variant="primary"
                    href={`/admin/t/${tenant.slug}/orders`}
                />
                <StatCard
                    title="今日營收"
                    value={`$${(stats?.today_revenue || 0).toLocaleString()}`}
                    icon={DollarSign}
                    variant="success"
                    href={`/admin/t/${tenant.slug}/checkouts`}
                />
                <StatCard
                    title="待處理訂單"
                    value={stats?.pending_orders || 0}
                    icon={Clock}
                    variant="warning"
                    description="尚未到貨"
                    href={`/admin/t/${tenant.slug}/orders?status=pending`}
                />
                <StatCard
                    title="會員數"
                    value={stats?.member_count || 0}
                    icon={Users}
                    variant="default"
                    href={`/admin/t/${tenant.slug}/members`}
                />
            </motion.div>

            {/* Content Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Orders */}
                <motion.div variants={itemVariants}>
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5 text-primary" />
                                最近訂單
                            </CardTitle>
                            <CardDescription>最新的 5 筆訂單</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!stats?.recent_orders || stats.recent_orders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <ShoppingCart className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                    <p className="text-sm text-muted-foreground">尚無訂單</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stats.recent_orders.map((order, index) => (
                                        <motion.div
                                            key={order.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="flex items-center justify-between rounded-xl border border-border/50 p-3 hover:bg-muted/50 transition-colors"
                                        >
                                            <div>
                                                <p className="font-medium text-sm">
                                                    {order.item_name || '未命名商品'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {order.customer_name || '匿名'} · {order.quantity} 件
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-sm">
                                                    ${(order.quantity * order.unit_price).toLocaleString()}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(order.created_at).toLocaleDateString('zh-TW')}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Quick Stats */}
                <motion.div variants={itemVariants}>
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                商品統計
                            </CardTitle>
                            <CardDescription>商品庫存與狀態</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-xl border border-border/50 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                                        <Package className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">總商品數</p>
                                        <p className="text-xs text-muted-foreground">所有商品</p>
                                    </div>
                                </div>
                                <p className="text-2xl font-bold">{stats?.product_count || 0}</p>
                            </div>

                            <div className="flex items-center justify-between rounded-xl border border-border/50 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                                        <Package className="h-5 w-5 text-success" />
                                    </div>
                                    <div>
                                        <p className="font-medium">上架中</p>
                                        <p className="text-xs text-muted-foreground">可供訂購</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-2xl font-bold">{stats?.active_product_count || 0}</p>
                                    <Badge variant="secondary" className="text-xs">
                                        {stats?.product_count ?
                                            Math.round(((stats.active_product_count || 0) / stats.product_count) * 100) : 0}%
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    )
}
