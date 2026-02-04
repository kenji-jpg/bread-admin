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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Tenant } from '@/types/database'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Building2,
    Plus,
    Search,
    MoreVertical,
    Settings,
    ExternalLink,
    Trash2,
    Power,
    PowerOff,
    AlertTriangle,
    Loader2,
    FileText,
} from 'lucide-react'

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
    const { isSuperAdmin } = useAuth()
    const supabase = createClient()

    // 刪除租戶相關狀態
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null)
    const [confirmName, setConfirmName] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

    useEffect(() => {
        const fetchTenants = async () => {
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
            }
            setIsLoading(false)
        }

        fetchTenants()
    }, [supabase])

    const filteredTenants = tenants.filter((tenant) => {
        // 狀態篩選
        if (statusFilter === 'active' && tenant.subscription_status !== 'active') return false
        if (statusFilter === 'inactive' && tenant.subscription_status === 'active') return false

        // 搜尋篩選
        if (searchQuery !== '' &&
            !tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false
        }

        return true
    })

    const getPlanBadge = (plan: string) => {
        switch (plan) {
            case 'pro':
                return <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0">Pro</Badge>
            default:
                return <Badge className="bg-primary/20 text-primary border-primary/30">Basic</Badge>
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-success/20 text-success border-success/30">啟用中</Badge>
            case 'expired':
                return <Badge className="bg-warning/20 text-warning border-warning/30">已過期</Badge>
            default:
                return <Badge className="bg-destructive/20 text-destructive border-destructive/30">已停用</Badge>
        }
    }

    // 切換租戶狀態
    const handleToggleStatus = async (tenant: Tenant) => {
        const newStatus = tenant.subscription_status === 'active' ? 'cancelled' : 'active'

        const { data, error } = await supabase.rpc('toggle_tenant_status_v1', {
            p_tenant_id: tenant.id,
            p_new_status: newStatus,
        })

        if (error || !data?.success) {
            toast.error(data?.message || '狀態更新失敗')
            return
        }

        // 更新本地狀態
        setTenants((prev) =>
            prev.map((t) =>
                t.id === tenant.id ? { ...t, subscription_status: newStatus as Tenant['subscription_status'] } : t
            )
        )
        toast.success(data.message || '狀態已更新')
    }

    // 開啟刪除確認 Modal
    const openDeleteDialog = (tenant: Tenant) => {
        setTenantToDelete(tenant)
        setConfirmName('')
        setDeleteDialogOpen(true)
    }

    // 關閉刪除確認 Modal
    const closeDeleteDialog = () => {
        setDeleteDialogOpen(false)
        setTenantToDelete(null)
        setConfirmName('')
    }

    // 刪除租戶
    const handleDeleteTenant = async () => {
        if (!tenantToDelete) return

        setIsDeleting(true)

        const { data, error } = await supabase.rpc('delete_tenant', {
            p_tenant_id: tenantToDelete.id,
            p_confirm_name: confirmName,
        }) as {
            data: {
                success: boolean
                message?: string
                error?: string
                deleted_counts?: Record<string, number>
            } | null
            error: Error | null
        }

        setIsDeleting(false)

        if (error) {
            toast.error('刪除失敗：' + error.message)
            return
        }

        if (!data?.success) {
            // 處理特定錯誤
            switch (data?.error) {
                case 'confirmation_mismatch':
                    toast.error(data.message || '確認名稱不符')
                    break
                case 'not_authorized':
                    toast.error('您沒有權限執行此操作')
                    break
                case 'tenant_not_found':
                    toast.error('找不到該租戶')
                    break
                default:
                    toast.error(data?.message || '刪除失敗')
            }
            return
        }

        // 刪除成功
        toast.success(data.message || '租戶已刪除')
        setTenants((prev) => prev.filter((t) => t.id !== tenantToDelete.id))
        closeDeleteDialog()
    }

    if (!isSuperAdmin) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">您沒有權限存取此頁面</p>
            </div>
        )
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
                        <span className="gradient-text">租戶管理</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">管理平台上的所有店家</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/admin/tenants/requests">
                        <Button variant="outline" className="rounded-xl">
                            <FileText className="mr-2 h-4 w-4" />
                            審核申請
                        </Button>
                    </Link>
                    <Link href="/admin/tenants/new">
                        <Button className="gradient-primary rounded-xl">
                            <Plus className="mr-2 h-4 w-4" />
                            新增租戶
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                                <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{tenants.length}</p>
                                <p className="text-sm text-muted-foreground">總租戶數</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                                <Building2 className="h-5 w-5 text-success" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {tenants.filter((t) => t.subscription_status === 'active').length}
                                </p>
                                <p className="text-sm text-muted-foreground">啟用中</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
                                <Building2 className="h-5 w-5 text-accent" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {tenants.filter((t) => t.plan === 'pro').length}
                                </p>
                                <p className="text-sm text-muted-foreground">Pro 方案</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                                <Building2 className="h-5 w-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {tenants.reduce((sum, t) => sum + (t.monthly_orders || 0), 0)}
                                </p>
                                <p className="text-sm text-muted-foreground">本月訂單</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

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
                                variant={statusFilter === 'active' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatusFilter('active')}
                                className="rounded-xl"
                            >
                                <span className="w-2 h-2 rounded-full bg-success mr-2" />
                                啟用中
                            </Button>
                            <Button
                                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setStatusFilter('inactive')}
                                className="rounded-xl"
                            >
                                <span className="w-2 h-2 rounded-full bg-destructive mr-2" />
                                已停用
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tenants Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                        </div>
                    ) : filteredTenants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                {searchQuery ? '找不到符合條件的租戶' : '尚無租戶'}
                            </p>
                            <Link href="/admin/tenants/new" className="mt-4">
                                <Button variant="outline" className="rounded-xl">
                                    <Plus className="mr-2 h-4 w-4" />
                                    新增第一個租戶
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>店家</TableHead>
                                        <TableHead>Slug</TableHead>
                                        <TableHead>方案</TableHead>
                                        <TableHead>狀態</TableHead>
                                        <TableHead className="text-right">本月訂單</TableHead>
                                        <TableHead>建立時間</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTenants.map((tenant, index) => (
                                        <motion.tr
                                            key={tenant.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className="group hover:bg-muted/50 transition-colors"
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                                                        <span className="text-sm font-bold text-primary-foreground">
                                                            {tenant.name.charAt(0)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{tenant.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {tenant.owner_email || '-'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {tenant.slug}
                                                </code>
                                            </TableCell>
                                            <TableCell>{getPlanBadge(tenant.plan)}</TableCell>
                                            <TableCell>{getStatusBadge(tenant.subscription_status)}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {tenant.monthly_orders || 0}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {new Date(tenant.created_at).toLocaleDateString('zh-TW')}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="glass-strong">
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/t/${tenant.slug}`}>
                                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                                進入管理
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/t/${tenant.slug}/settings`}>
                                                                <Settings className="mr-2 h-4 w-4" />
                                                                設定
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(tenant)}>
                                                            {tenant.subscription_status === 'active' ? (
                                                                <>
                                                                    <PowerOff className="mr-2 h-4 w-4" />
                                                                    停用租戶
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Power className="mr-2 h-4 w-4" />
                                                                    啟用租戶
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => openDeleteDialog(tenant)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            刪除
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 刪除確認 Modal */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            刪除租戶
                        </DialogTitle>
                        <DialogDescription>
                            此操作將永久刪除租戶及其所有資料，包含會員、商品、訂單等，且無法復原。
                        </DialogDescription>
                    </DialogHeader>

                    {tenantToDelete && (
                        <div className="space-y-4 py-4">
                            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                                <p className="text-sm text-destructive font-medium">
                                    即將刪除：{tenantToDelete.name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Slug: {tenantToDelete.slug}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirm-name">
                                    請輸入「<span className="font-bold text-foreground">{tenantToDelete.name}</span>」以確認刪除
                                </Label>
                                <Input
                                    id="confirm-name"
                                    value={confirmName}
                                    onChange={(e) => setConfirmName(e.target.value)}
                                    placeholder={tenantToDelete.name}
                                    className="rounded-xl"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={closeDeleteDialog}
                            disabled={isDeleting}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteTenant}
                            disabled={isDeleting || confirmName !== tenantToDelete?.name}
                            className="rounded-xl"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    刪除中...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    確認刪除
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}
