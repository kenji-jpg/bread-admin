'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Wallet,
    Search,
    ArrowUpCircle,
    AlertCircle,
    CheckCircle2,
    Clock,
    XCircle,
    Eye,
    Calendar,
    DollarSign,
    FileText,
    Users,
    TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Tenant } from '@/types/database'

interface PaymentTransaction {
    id: string
    tenant_id: string
    tenant_slug: string
    amount: number
    payment_method: string
    payment_status: 'pending' | 'completed' | 'failed'
    transfer_date: string | null
    transfer_account_last4: string | null
    bank_reference: string | null
    email_raw_data: Record<string, unknown> | null
    email_received_at: string | null
    verified_by: string | null
    verified_at: string | null
    verification_note: string | null
    subscription_type: 'monthly' | 'yearly' | null
    subscription_starts_at: string | null
    subscription_ends_at: string | null
    created_at: string
    updated_at: string
    tenant?: {
        name: string
        plan: string
        plan_expires_at: string | null
    }
}

interface ExpiringTenant extends Tenant {
    days_until_expiry?: number
}

interface BasicTenant extends Tenant {
    // Basic 租戶（潛在客戶）
}

export default function PaymentsPage() {
    const [payments, setPayments] = useState<PaymentTransaction[]>([])
    const [expiringTenants, setExpiringTenants] = useState<ExpiringTenant[]>([])
    const [basicTenants, setBasicTenants] = useState<BasicTenant[]>([])
    const [allTenants, setAllTenants] = useState<Tenant[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all')
    const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction | null>(null)
    const [detailDialogOpen, setDetailDialogOpen] = useState(false)
    const { isSuperAdmin } = useAuth()
    const supabase = createClient()

    // 手動升級相關狀態
    const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false)
    const [selectedTenant, setSelectedTenant] = useState<ExpiringTenant | null>(null)
    const [upgradeAmount, setUpgradeAmount] = useState('')
    const [upgradeType, setUpgradeType] = useState<'monthly' | 'yearly'>('monthly')
    const [upgradeNote, setUpgradeNote] = useState('')
    const [isUpgrading, setIsUpgrading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true)

            // 1. 取得所有付款記錄
            const { data: paymentsData, error: paymentsError } = await supabase
                .from('payment_transactions')
                .select(`
                    *,
                    tenant:tenants(name, plan, plan_expires_at)
                `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (paymentsError) {
                console.error('Error fetching payments:', paymentsError)
            } else if (paymentsData) {
                setPayments(paymentsData as PaymentTransaction[])
            }

            // 2. 取得即將到期的租戶（7 天內）
            const sevenDaysLater = new Date()
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)

            const { data: tenantsData, error: tenantsError } = await supabase
                .from('tenants')
                .select('id, name, slug, plan, plan_expires_at, is_active, created_at, updated_at, subscription_starts_at, next_billing_date, subscription_auto_renew')
                .eq('plan', 'pro')
                .not('plan_expires_at', 'is', null)
                .lte('plan_expires_at', sevenDaysLater.toISOString())
                .order('plan_expires_at', { ascending: true })

            if (tenantsError) {
                console.error('Error fetching expiring tenants:', tenantsError)
            } else if (tenantsData) {
                // 計算剩餘天數
                const tenantsWithDays = tenantsData.map((tenant) => {
                    const daysLeft = tenant.plan_expires_at
                        ? Math.ceil(
                              (new Date(tenant.plan_expires_at).getTime() - Date.now()) /
                                  (1000 * 60 * 60 * 24)
                          )
                        : 0
                    return { ...tenant, days_until_expiry: daysLeft }
                })
                setExpiringTenants(tenantsWithDays as ExpiringTenant[])
            }

            // 3. 取得所有 Basic 租戶（潛在升級客戶）
            const { data: basicTenantsData, error: basicError } = await supabase
                .from('tenants')
                .select('id, name, slug, plan, plan_expires_at, is_active, created_at, updated_at, subscription_starts_at, next_billing_date, subscription_auto_renew')
                .eq('plan', 'basic')
                .order('created_at', { ascending: false })

            if (basicError) {
                console.error('Error fetching basic tenants:', basicError)
            } else if (basicTenantsData) {
                setBasicTenants(basicTenantsData as BasicTenant[])
            }

            // 4. 取得所有租戶（建立訂閱用）
            const { data: allTenantsData } = await supabase
                .from('tenants')
                .select('id, name, slug, plan, plan_expires_at, is_active, created_at, updated_at, subscription_starts_at, next_billing_date, subscription_auto_renew')
                .order('name', { ascending: true })

            if (allTenantsData) {
                setAllTenants(allTenantsData as Tenant[])
            }

            setIsLoading(false)
        }

        if (isSuperAdmin) {
            fetchData()
        }
    }, [supabase, isSuperAdmin])

    const filteredPayments = payments.filter((payment) => {
        // 狀態篩選
        if (statusFilter !== 'all' && payment.payment_status !== statusFilter) return false

        // 搜尋篩選
        if (
            searchQuery !== '' &&
            !payment.tenant_slug.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !payment.tenant?.name.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
            return false
        }

        return true
    })

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <Badge className="bg-success/20 text-success border-success/30">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        已完成
                    </Badge>
                )
            case 'pending':
                return (
                    <Badge className="bg-warning/20 text-warning border-warning/30">
                        <Clock className="mr-1 h-3 w-3" />
                        待處理
                    </Badge>
                )
            case 'failed':
                return (
                    <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                        <XCircle className="mr-1 h-3 w-3" />
                        失敗
                    </Badge>
                )
            default:
                return null
        }
    }

    const getSubscriptionTypeBadge = (type: string | null) => {
        switch (type) {
            case 'monthly':
                return <Badge variant="outline">月繳</Badge>
            case 'yearly':
                return (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30">
                        年繳
                    </Badge>
                )
            default:
                return <span className="text-muted-foreground text-sm">-</span>
        }
    }

    const openDetailDialog = (payment: PaymentTransaction) => {
        setSelectedPayment(payment)
        setDetailDialogOpen(true)
    }

    const openUpgradeDialog = (tenant: ExpiringTenant) => {
        setSelectedTenant(tenant)
        setUpgradeAmount('')
        setUpgradeType('monthly')
        setUpgradeNote('')
        setUpgradeDialogOpen(true)
    }

    const handleManualUpgrade = async () => {
        if (!selectedTenant) return

        const amount = parseInt(upgradeAmount)
        if (isNaN(amount) || amount <= 0) {
            toast.error('請輸入有效金額')
            return
        }

        if (
            (upgradeType === 'monthly' && amount !== 599) ||
            (upgradeType === 'yearly' && amount !== 5990)
        ) {
            toast.error(`${upgradeType === 'monthly' ? '月繳' : '年繳'}金額應為 ${upgradeType === 'monthly' ? 'NT$ 599' : 'NT$ 5,990'}`)
            return
        }

        setIsUpgrading(true)

        try {
            // 1. 建立付款記錄
            const subscriptionMonths = upgradeType === 'monthly' ? 1 : 12
            const startsAt = new Date()
            const endsAt = new Date()
            endsAt.setMonth(endsAt.getMonth() + subscriptionMonths)

            const { data: paymentData, error: paymentError } = await supabase
                .from('payment_transactions')
                .insert({
                    tenant_id: selectedTenant.id,
                    tenant_slug: selectedTenant.slug,
                    amount,
                    payment_method: 'bank_transfer',
                    payment_status: 'completed',
                    subscription_type: upgradeType,
                    subscription_starts_at: startsAt.toISOString(),
                    subscription_ends_at: endsAt.toISOString(),
                    verified_by: (await supabase.auth.getUser()).data.user?.id,
                    verified_at: new Date().toISOString(),
                    verification_note: upgradeNote || '超管手動升級',
                })
                .select()
                .single()

            if (paymentError) throw paymentError

            // 2. 升級租戶
            const { data: upgradeData, error: upgradeError } = (await supabase.rpc(
                'update_tenant_plan_v1',
                {
                    p_tenant_id: selectedTenant.id,
                    p_new_plan: 'pro',
                }
            )) as {
                data: { success: boolean; error?: string } | null
                error: Error | null
            }

            if (upgradeError || !upgradeData?.success) {
                throw new Error(upgradeData?.error || '升級失敗')
            }

            // 3. 更新訂閱到期時間
            const { error: updateError } = await supabase
                .from('tenants')
                .update({
                    plan_expires_at: endsAt.toISOString(),
                    subscription_starts_at: startsAt.toISOString(),
                    next_billing_date: endsAt.toISOString(),
                })
                .eq('id', selectedTenant.id)

            if (updateError) throw updateError

            toast.success(`已成功升級 ${selectedTenant.name} 為 Pro`)
            setUpgradeDialogOpen(false)

            // 重新載入資料
            setIsLoading(true)
            window.location.reload()
        } catch (error) {
            console.error('Manual upgrade error:', error)
            toast.error(error instanceof Error ? error.message : '升級失敗')
        } finally {
            setIsUpgrading(false)
        }
    }

    if (!isSuperAdmin) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">您沒有權限存取此頁面</p>
            </div>
        )
    }

    // 計算統計數據
    const stats = {
        total: payments.length,
        pending: payments.filter((p) => p.payment_status === 'pending').length,
        completed: payments.filter((p) => p.payment_status === 'completed').length,
        monthlyRevenue: payments
            .filter((p) => p.payment_status === 'completed')
            .reduce((sum, p) => sum + p.amount, 0),
        basicTenants: basicTenants.length,
        thisMonthNewSubscriptions: payments.filter((p) => {
            const createdAt = new Date(p.created_at)
            const now = new Date()
            return (
                p.payment_status === 'completed' &&
                createdAt.getMonth() === now.getMonth() &&
                createdAt.getFullYear() === now.getFullYear()
            )
        }).length,
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">付款管理</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">管理所有付款記錄與訂閱</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => {
                            setSelectedTenant(null)
                            setUpgradeAmount('')
                            setUpgradeType('monthly')
                            setUpgradeNote('')
                            setUpgradeDialogOpen(true)
                        }}
                        variant="outline"
                        className="rounded-xl"
                    >
                        <ArrowUpCircle className="mr-2 h-4 w-4" />
                        建立訂閱
                    </Button>
                    <Link href="/admin/payments/verify">
                        <Button className="gradient-primary rounded-xl">
                            <FileText className="mr-2 h-4 w-4" />
                            驗證付款通知
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                                <Wallet className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-sm text-muted-foreground">總交易數</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                                <Clock className="h-5 w-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.pending}</p>
                                <p className="text-sm text-muted-foreground">待處理</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                                <CheckCircle2 className="h-5 w-5 text-success" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.completed}</p>
                                <p className="text-sm text-muted-foreground">已完成</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
                                <DollarSign className="h-5 w-5 text-accent" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    NT$ {stats.monthlyRevenue.toLocaleString()}
                                </p>
                                <p className="text-sm text-muted-foreground">總營收</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                                <Users className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.basicTenants}</p>
                                <p className="text-sm text-muted-foreground">Basic 租戶</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                                <TrendingUp className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.thisMonthNewSubscriptions}</p>
                                <p className="text-sm text-muted-foreground">本月新訂閱</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Basic 租戶（潛在升級客戶） */}
            {basicTenants.length > 0 && (
                <Card className="border-blue-500/50 bg-blue-500/5">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-blue-500">
                                    <Users className="h-5 w-5" />
                                    Basic 租戶 ({basicTenants.length})
                                </CardTitle>
                                <CardDescription>以下租戶使用免費版，可升級為 Pro</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-2">
                            {basicTenants.map((tenant) => (
                                <div
                                    key={tenant.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                                            <span className="text-sm font-bold text-white">
                                                {tenant.name.charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium">{tenant.name}</p>
                                            <code className="text-xs text-muted-foreground">
                                                {tenant.slug}
                                            </code>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => openUpgradeDialog(tenant)}
                                        className="rounded-xl gradient-primary"
                                    >
                                        <ArrowUpCircle className="mr-1 h-4 w-4" />
                                        升級 Pro
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 即將到期租戶 */}
            {expiringTenants.length > 0 && (
                <Card className="border-warning/50 bg-warning/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-warning">
                            <AlertCircle className="h-5 w-5" />
                            即將到期的租戶 ({expiringTenants.length})
                        </CardTitle>
                        <CardDescription>以下租戶的 Pro 訂閱將在 7 天內到期</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {expiringTenants.map((tenant) => (
                                <div
                                    key={tenant.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                                            <span className="text-sm font-bold text-primary-foreground">
                                                {tenant.name.charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium">{tenant.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {tenant.plan_expires_at
                                                    ? `到期日：${new Date(tenant.plan_expires_at).toLocaleDateString('zh-TW')}`
                                                    : '無到期日'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            variant={
                                                tenant.days_until_expiry! < 0
                                                    ? 'destructive'
                                                    : tenant.days_until_expiry! <= 3
                                                      ? 'default'
                                                      : 'secondary'
                                            }
                                        >
                                            {tenant.days_until_expiry! < 0
                                                ? `已過期 ${Math.abs(tenant.days_until_expiry!)} 天`
                                                : `剩 ${tenant.days_until_expiry} 天`}
                                        </Badge>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openUpgradeDialog(tenant)}
                                            className="rounded-xl"
                                        >
                                            <ArrowUpCircle className="mr-1 h-4 w-4" />
                                            手動續訂
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Search & Filter */}
            <Card className="border-border/50">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜尋租戶名稱、Slug..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={statusFilter === 'all' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatusFilter('all')}
                                className="rounded-xl"
                            >
                                全部
                            </Button>
                            <Button
                                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatusFilter('pending')}
                                className="rounded-xl"
                            >
                                待處理
                            </Button>
                            <Button
                                variant={statusFilter === 'completed' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatusFilter('completed')}
                                className="rounded-xl"
                            >
                                已完成
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Payments Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                        </div>
                    ) : filteredPayments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                {searchQuery ? '找不到符合條件的付款記錄' : '尚無付款記錄'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>租戶</TableHead>
                                        <TableHead>金額</TableHead>
                                        <TableHead>類型</TableHead>
                                        <TableHead>狀態</TableHead>
                                        <TableHead>付款時間</TableHead>
                                        <TableHead>訂閱期限</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPayments.map((payment, index) => (
                                        <motion.tr
                                            key={payment.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className="group hover:bg-muted/50 transition-colors"
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">
                                                        {payment.tenant?.name || '-'}
                                                    </p>
                                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                        {payment.tenant_slug}
                                                    </code>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono font-bold">
                                                    NT$ {payment.amount.toLocaleString()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {getSubscriptionTypeBadge(payment.subscription_type)}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(payment.payment_status)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {payment.transfer_date
                                                    ? new Date(payment.transfer_date).toLocaleDateString(
                                                          'zh-TW'
                                                      )
                                                    : new Date(payment.created_at).toLocaleDateString(
                                                          'zh-TW'
                                                      )}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {payment.subscription_ends_at ? (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                                        {new Date(
                                                            payment.subscription_ends_at
                                                        ).toLocaleDateString('zh-TW')}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openDetailDialog(payment)}
                                                    className="rounded-lg"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 付款詳情 Modal */}
            <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>付款詳情</DialogTitle>
                    </DialogHeader>
                    {selectedPayment && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">租戶</Label>
                                    <p className="font-medium mt-1">
                                        {selectedPayment.tenant?.name}
                                    </p>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                        {selectedPayment.tenant_slug}
                                    </code>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">金額</Label>
                                    <p className="font-mono font-bold text-lg mt-1">
                                        NT$ {selectedPayment.amount.toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">訂閱類型</Label>
                                    <p className="mt-1">
                                        {getSubscriptionTypeBadge(selectedPayment.subscription_type)}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">狀態</Label>
                                    <p className="mt-1">
                                        {getStatusBadge(selectedPayment.payment_status)}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">付款時間</Label>
                                    <p className="text-sm mt-1">
                                        {selectedPayment.transfer_date
                                            ? new Date(
                                                  selectedPayment.transfer_date
                                              ).toLocaleString('zh-TW')
                                            : '-'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">建立時間</Label>
                                    <p className="text-sm mt-1">
                                        {new Date(selectedPayment.created_at).toLocaleString(
                                            'zh-TW'
                                        )}
                                    </p>
                                </div>
                            </div>

                            {selectedPayment.subscription_starts_at && (
                                <div className="p-3 rounded-lg bg-muted/50 border">
                                    <Label className="text-muted-foreground">訂閱期限</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm">
                                            {new Date(
                                                selectedPayment.subscription_starts_at
                                            ).toLocaleDateString('zh-TW')}
                                        </span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-sm font-medium">
                                            {selectedPayment.subscription_ends_at
                                                ? new Date(
                                                      selectedPayment.subscription_ends_at
                                                  ).toLocaleDateString('zh-TW')
                                                : '-'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {selectedPayment.verification_note && (
                                <div>
                                    <Label className="text-muted-foreground">審核備註</Label>
                                    <p className="text-sm mt-1 p-3 rounded-lg bg-muted/50">
                                        {selectedPayment.verification_note}
                                    </p>
                                </div>
                            )}

                            {selectedPayment.bank_reference && (
                                <div>
                                    <Label className="text-muted-foreground">銀行交易編號</Label>
                                    <code className="text-xs bg-muted px-2 py-1 rounded mt-1 block">
                                        {selectedPayment.bank_reference}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* 手動升級 Modal */}
            <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>手動升級 / 續訂</DialogTitle>
                        <DialogDescription>
                            為租戶建立付款記錄並升級為 Pro 方案
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>選擇租戶</Label>
                            <Select
                                value={selectedTenant?.id || ''}
                                onValueChange={(tenantId) => {
                                    const tenant = allTenants.find(t => t.id === tenantId)
                                    if (tenant) setSelectedTenant(tenant as ExpiringTenant)
                                }}
                            >
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="請選擇租戶..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allTenants.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                            <span className="text-muted-foreground ml-2 text-xs">
                                                ({t.slug}) · {t.plan === 'pro' ? 'Pro' : 'Basic'}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {selectedTenant && (
                            <>

                            <div className="space-y-2">
                                <Label htmlFor="upgrade-type">訂閱類型</Label>
                                <Select
                                    value={upgradeType}
                                    onValueChange={(value: 'monthly' | 'yearly') =>
                                        setUpgradeType(value)
                                    }
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly">月繳 (NT$ 599)</SelectItem>
                                        <SelectItem value="yearly">年繳 (NT$ 5,990)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="upgrade-amount">金額</Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant={upgradeAmount === '599' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => {
                                            setUpgradeAmount('599')
                                            setUpgradeType('monthly')
                                        }}
                                        className="flex-1 rounded-xl"
                                    >
                                        NT$ 599
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={upgradeAmount === '5990' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => {
                                            setUpgradeAmount('5990')
                                            setUpgradeType('yearly')
                                        }}
                                        className="flex-1 rounded-xl"
                                    >
                                        NT$ 5,990
                                    </Button>
                                </div>
                                <Input
                                    id="upgrade-amount"
                                    type="number"
                                    placeholder={upgradeType === 'monthly' ? '599' : '5990'}
                                    value={upgradeAmount}
                                    onChange={(e) => setUpgradeAmount(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="upgrade-note">備註（選填）</Label>
                                <Textarea
                                    id="upgrade-note"
                                    placeholder="例如：電話確認付款、臨櫃轉帳等"
                                    value={upgradeNote}
                                    onChange={(e) => setUpgradeNote(e.target.value)}
                                    className="rounded-xl resize-none"
                                    rows={3}
                                />
                            </div>

                            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                                <p className="text-sm text-warning-foreground">
                                    ⚠️ 此操作將立即生效，請確認收到款項後再執行
                                </p>
                            </div>
                        </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setUpgradeDialogOpen(false)}
                            disabled={isUpgrading}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleManualUpgrade}
                            disabled={isUpgrading || !upgradeAmount || !selectedTenant}
                            className="rounded-xl gradient-primary"
                        >
                            {isUpgrading ? '處理中...' : '確認升級'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}
