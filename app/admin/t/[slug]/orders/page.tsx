'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { linkOrderItemsToCheckout } from '@/hooks/use-secure-mutations'
import { useSidebar } from '@/hooks/use-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import type { OrderItem, Member, Product } from '@/types/database'
import {
    ShoppingCart,
    Search,
    Download,
    Filter,
    Package,
    Clock,
    CheckCircle2,
    PackageCheck,
    Trash2,
    MessageSquare,
    Receipt,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    PenLine,
} from 'lucide-react'

type OrderWithDetails = OrderItem & {
    member?: Member
    product?: Product
}

export default function OrdersPage() {
    const searchParams = useSearchParams()
    const { tenant, isLoading: tenantLoading } = useTenant()
    const { collapsed: sidebarCollapsed } = useSidebar()
    const [orders, setOrders] = useState<OrderWithDetails[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>(
        searchParams.get('status') || 'all'
    )
    const [showCompleted, setShowCompleted] = useState(false) // 預設隱藏已結帳
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())

    // 分頁狀態
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    // Dialog states
    const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null)
    const [editQuantity, setEditQuantity] = useState<number>(1)
    const [editUnitPrice, setEditUnitPrice] = useState<number>(0)
    const [editPriceNote, setEditPriceNote] = useState<string>('')
    const [editNote, setEditNote] = useState<string>('')
    const [deleteOrder, setDeleteOrder] = useState<OrderWithDetails | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // 批量結帳 Dialog 狀態
    const [batchCheckoutConfirm, setBatchCheckoutConfirm] = useState(false)
    const [checkoutShippingMethod, setCheckoutShippingMethod] = useState<'myship' | 'delivery' | 'pickup'>('myship')

    const supabase = createClient()

    const fetchOrders = async () => {
        if (!tenant) return
        setIsLoading(true)

        // 載入所有訂單資料（前端分頁）
        const { data } = await supabase
            .from('order_items')
            .select(`
                *,
                member:members(*),
                product:products(*)
            `)
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: false })

        if (data) {
            setOrders(data)
        }
        setIsLoading(false)
    }

    useEffect(() => {
        // 確保 tenant 載入完成後才 fetch
        if (!tenant || tenantLoading) return

        fetchOrders()

        // 即時訂閱 - 當 order_items 表變動時自動刷新
        const channel = supabase
            .channel(`orders-${tenant.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'order_items',
                    filter: `tenant_id=eq.${tenant.id}`,
                },
                () => {
                    // 訂單資料包含 JOIN，所以直接重新載入
                    fetchOrders()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [tenant, tenantLoading])

    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            // 隱藏已結帳訂單（除非勾選顯示）
            if (!showCompleted && order.checkout_id) {
                return false
            }

            const searchMatch =
                searchQuery === '' ||
                order.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.sku?.toLowerCase().includes(searchQuery.toLowerCase())

            let statusMatch = true
            const arrivedQty = order.arrived_qty ?? 0
            if (statusFilter === 'pending') {
                statusMatch = !order.is_arrived && arrivedQty === 0 && !order.checkout_id
            } else if (statusFilter === 'partial') {
                statusMatch = !order.is_arrived && arrivedQty > 0 && arrivedQty < order.quantity && !order.checkout_id
            } else if (statusFilter === 'ready') {
                statusMatch = order.is_arrived && !order.checkout_id
            } else if (statusFilter === 'completed') {
                statusMatch = !!order.checkout_id
            }

            return searchMatch && statusMatch
        })
    }, [orders, searchQuery, statusFilter, showCompleted])

    // 分頁計算
    const totalCount = filteredOrders.length
    const totalPages = Math.ceil(totalCount / pageSize)
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, totalCount)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    // 當篩選條件改變時，重置到第一頁
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery, statusFilter, showCompleted, pageSize])

    const getStatusBadge = (order: OrderWithDetails) => {
        if (order.checkout_id) {
            return <Badge className="bg-success/20 text-success border-success/30">已結帳</Badge>
        }
        if (order.is_arrived) {
            return <Badge className="bg-primary/20 text-primary border-primary/30">可結帳</Badge>
        }
        // 顯示到貨進度
        const arrivedQty = order.arrived_qty ?? 0
        if (arrivedQty > 0 && arrivedQty < order.quantity) {
            return (
                <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                    部分到貨 ({arrivedQty}/{order.quantity})
                </Badge>
            )
        }
        return <Badge className="bg-warning/20 text-warning border-warning/30">待到貨</Badge>
    }

    // === 操作功能 ===
    // 注意：標記到貨功能已移除，所有庫存變動需透過「補貨」功能進行

    // 編輯訂單
    const openEditDialog = (order: OrderWithDetails) => {
        setEditingOrder(order)
        setEditQuantity(order.quantity)
        setEditUnitPrice(order.unit_price)
        setEditPriceNote((order as OrderWithDetails & { price_note?: string }).price_note || '')
        setEditNote(order.note || '')
    }

    // 檢查價格是否被修改
    const isPriceChanged = editingOrder && editUnitPrice !== editingOrder.unit_price

    const handleSaveEdit = async () => {
        if (!editingOrder || !tenant) return
        setIsSubmitting(true)

        const { data, error } = await supabase.rpc('update_order_item_v1', {
            p_tenant_id: tenant.id,
            p_order_item_id: editingOrder.id,
            p_new_quantity: editQuantity,
            p_new_note: editNote || null,
            p_new_unit_price: isPriceChanged ? editUnitPrice : null,
            p_price_note: isPriceChanged ? (editPriceNote || null) : null,
        })

        if (error || !data?.success) {
            toast.error(data?.message || '更新失敗')
            setIsSubmitting(false)
            return
        }

        setOrders((prev) =>
            prev.map((o) =>
                o.id === editingOrder.id
                    ? {
                        ...o,
                        quantity: editQuantity,
                        unit_price: editUnitPrice,
                        note: editNote || null
                    }
                    : o
            )
        )
        toast.success(data.message || '訂單已更新')
        setEditingOrder(null)
        setIsSubmitting(false)
    }

    // 刪除訂單
    const handleDeleteOrder = async () => {
        if (!deleteOrder || !tenant) return
        setIsSubmitting(true)

        const { data, error } = await supabase.rpc('delete_order_item_v1', {
            p_tenant_id: tenant.id,
            p_order_item_id: deleteOrder.id,
        })

        if (error || !data?.success) {
            toast.error(data?.error || data?.message || '刪除失敗')
            setIsSubmitting(false)
            return
        }

        setOrders((prev) => prev.filter((o) => o.id !== deleteOrder.id))
        toast.success('訂單已刪除')
        setDeleteOrder(null)
        setIsSubmitting(false)
    }

    // 全選 / 取消全選（僅當前頁面）
    const handleSelectAll = () => {
        const pageSelectableIds = paginatedOrders
            .filter((o) => !o.checkout_id)
            .map((o) => o.id)

        const allPageSelected = pageSelectableIds.every((id) => selectedOrders.has(id))

        if (allPageSelected) {
            // 取消選取當前頁面的所有訂單
            const newSelected = new Set(selectedOrders)
            pageSelectableIds.forEach((id) => newSelected.delete(id))
            setSelectedOrders(newSelected)
        } else {
            // 選取當前頁面的所有可選訂單
            const newSelected = new Set(selectedOrders)
            pageSelectableIds.forEach((id) => newSelected.add(id))
            setSelectedOrders(newSelected)
        }
    }

    const toggleOrderSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrders)
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId)
        } else {
            newSelected.add(orderId)
        }
        setSelectedOrders(newSelected)
    }

    const exportCSV = () => {
        const headers = ['訂單ID', '客戶', '商品', 'SKU', '數量', '單價', '小計', '狀態', '備註', '建立時間']
        const rows = filteredOrders.map((order) => [
            order.id,
            order.customer_name || '',
            order.item_name || '',
            order.sku,
            order.quantity,
            order.unit_price,
            order.quantity * order.unit_price,
            order.checkout_id ? '已結帳' : order.is_arrived ? '可結帳' : '待到貨',
            order.note || '',
            new Date(order.created_at).toLocaleString('zh-TW'),
        ])

        const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
    }

    // 批量取消訂單（需二次確認）
    const [batchCancelConfirm, setBatchCancelConfirm] = useState(false)

    const handleBatchCancel = async () => {
        if (selectedOrders.size === 0) {
            toast.error('請先選擇訂單')
            return
        }
        // 開啟確認對話框
        setBatchCancelConfirm(true)
    }

    const confirmBatchCancel = async () => {
        setIsSubmitting(true)
        try {
            const { data, error } = await supabase.rpc('batch_delete_order_items_v1', {
                p_tenant_id: tenant?.id,
                p_order_item_ids: Array.from(selectedOrders),
            })

            if (error) {
                toast.error('批量取消失敗：' + error.message)
                return
            }

            if (!data?.success) {
                toast.error(data?.error || '批量取消失敗')
                return
            }

            // 顯示結果
            toast.success(`成功刪除 ${data.deleted_count} 筆訂單`)

            if (data.skipped_count > 0) {
                toast.warning(`${data.skipped_count} 筆因已結帳被跳過`)
            }

            setOrders((prev) => prev.filter((o) => !data.deleted_ids?.includes(o.id)))
            setSelectedOrders(new Set())
        } catch (err: any) {
            toast.error('批量取消失敗：' + (err.message || '未知錯誤'))
        } finally {
            setIsSubmitting(false)
            setBatchCancelConfirm(false)
        }
    }

    // 批量結帳 - 開啟確認 Dialog
    const handleBatchCheckout = () => {
        // 篩選出選中且已到貨的訂單
        const arrivedOrderIds = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        })

        if (arrivedOrderIds.length === 0) {
            toast.error('選中的訂單中沒有可結帳的訂單（需已到貨且未結帳）')
            return
        }

        // 開啟確認 Dialog
        setBatchCheckoutConfirm(true)
    }

    // 確認批量結帳
    const confirmBatchCheckout = async () => {
        // 篩選出選中且已到貨的訂單
        const arrivedOrderIds = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        })

        // 按客戶分組
        const ordersByMember = new Map<string, OrderWithDetails[]>()
        arrivedOrderIds.forEach((id) => {
            const order = orders.find((o) => o.id === id)
            if (order && order.member_id) {
                const existing = ordersByMember.get(order.member_id) || []
                existing.push(order)
                ordersByMember.set(order.member_id, existing)
            }
        })

        if (ordersByMember.size === 0) {
            toast.error('找不到可結帳的訂單')
            return
        }

        setIsSubmitting(true)
        let successCount = 0

        // 為每個客戶建立結帳單
        for (const [, memberOrders] of ordersByMember) {
            // 取得客戶的 LINE user ID
            const firstOrder = memberOrders[0]
            const lineUserId = firstOrder.member?.line_user_id

            if (!lineUserId) {
                console.error('找不到客戶的 LINE user ID')
                continue
            }

            // 使用 RPC 建立結帳單（包含結帳模式）
            const { data: checkoutData, error: checkoutError } = await supabase.rpc('create_checkout_v2', {
                p_tenant_id: tenant!.id,
                p_line_user_id: lineUserId,
                p_receiver_name: firstOrder.customer_name || firstOrder.member?.display_name || null,
                p_receiver_phone: null,
                p_receiver_store_id: null,
                p_shipping_method: checkoutShippingMethod,
            })

            if (checkoutError || !checkoutData?.success) {
                console.error('建立結帳單失敗：', checkoutError || checkoutData?.error)
                continue
            }

            const checkoutId = checkoutData.checkout_id

            // 使用 RPC 關聯訂單項目到結帳單
            try {
                const linkResult = await linkOrderItemsToCheckout(
                    supabase,
                    tenant!.id,
                    checkoutId,
                    memberOrders.map((o) => o.id)
                )

                if (linkResult.success) {
                    successCount++
                } else {
                    console.error('關聯訂單失敗：', linkResult.error)
                }
            } catch (linkError) {
                console.error('關聯訂單失敗：', linkError)
            }
        }

        // 刷新資料
        fetchOrders()
        setSelectedOrders(new Set())
        setBatchCheckoutConfirm(false)
        setIsSubmitting(false)

        // 顯示結果 Toast（包含結帳模式提醒）
        const methodLabels: Record<string, string> = {
            myship: '🏪 賣貨便',
            delivery: '🚚 宅配',
            pickup: '🏠 自取',
        }
        toast.success(`已為 ${successCount} 位客戶建立結帳單`, {
            description: `結帳模式：${methodLabels[checkoutShippingMethod]}`,
        })
    }

    // 計算選中訂單的統計資訊
    const selectedStats = useMemo(() => {
        const arrivedCount = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        }).length
        return { arrivedCount }
    }, [selectedOrders, orders])

    if (tenantLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-[600px] rounded-2xl" />
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

    // 當前頁面可選取的訂單
    const pageSelectableOrders = paginatedOrders.filter((o) => !o.checkout_id)
    const isAllPageSelected = pageSelectableOrders.length > 0 &&
        pageSelectableOrders.every((o) => selectedOrders.has(o.id))

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
                        <span className="gradient-text">訂單管理</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">管理與追蹤所有訂單</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/admin/t/${tenant.slug}/orders/manual`}>
                        <Button variant="outline" className="rounded-xl">
                            <PenLine className="mr-2 h-4 w-4" />
                            手動登記
                        </Button>
                    </Link>
                    <Button onClick={exportCSV} variant="outline" className="rounded-xl">
                        <Download className="mr-2 h-4 w-4" />
                        匯出 CSV
                    </Button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                                <Clock className="h-5 w-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => !o.is_arrived && (o.arrived_qty ?? 0) === 0 && !o.checkout_id).length}
                                </p>
                                <p className="text-sm text-muted-foreground">待到貨</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                                <PackageCheck className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => !o.is_arrived && (o.arrived_qty ?? 0) > 0 && (o.arrived_qty ?? 0) < o.quantity && !o.checkout_id).length}
                                </p>
                                <p className="text-sm text-muted-foreground">部分到貨</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                                <Package className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => o.is_arrived && !o.checkout_id).length}
                                </p>
                                <p className="text-sm text-muted-foreground">可結帳</p>
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
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => o.checkout_id).length}
                                </p>
                                <p className="text-sm text-muted-foreground">已結帳</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="border-border/50">
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜尋客戶、商品、SKU..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px] rounded-xl">
                                <Filter className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="篩選狀態" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部狀態</SelectItem>
                                <SelectItem value="pending">待到貨</SelectItem>
                                <SelectItem value="partial">部分到貨</SelectItem>
                                <SelectItem value="ready">可結帳</SelectItem>
                                <SelectItem value="completed">已結帳</SelectItem>
                            </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox
                                checked={showCompleted}
                                onCheckedChange={(checked) => setShowCompleted(checked === true)}
                            />
                            <span className="text-sm text-muted-foreground">顯示已結帳</span>
                        </label>
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                        </div>
                    ) : totalCount === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                {searchQuery || statusFilter !== 'all' ? '找不到符合條件的訂單' : '尚無訂單'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-12 pl-5">
                                            <Checkbox
                                                checked={isAllPageSelected}
                                                onCheckedChange={handleSelectAll}
                                                aria-label="全選本頁"
                                            />
                                        </TableHead>
                                        <TableHead>客戶</TableHead>
                                        <TableHead>商品</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead className="text-right">數量</TableHead>
                                        <TableHead className="text-right">單價</TableHead>
                                        <TableHead className="text-right">小計</TableHead>
                                        <TableHead>狀態</TableHead>
                                        <TableHead className="pr-5">時間</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedOrders.map((order, index) => (
                                        <motion.tr
                                            key={order.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className={`group hover:bg-muted/50 transition-colors ${!order.checkout_id ? 'cursor-pointer' : ''}`}
                                            onClick={() => {
                                                // 只有未結帳的訂單可以編輯
                                                if (!order.checkout_id) {
                                                    openEditDialog(order)
                                                }
                                            }}
                                        >
                                            <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                                                {!order.checkout_id && (
                                                    <Checkbox
                                                        checked={selectedOrders.has(order.id)}
                                                        onCheckedChange={() => toggleOrderSelection(order.id)}
                                                        aria-label="選擇"
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div>
                                                    {order.customer_name || order.member?.display_name || '匿名'}
                                                    {order.note && (
                                                        <MessageSquare className="inline-block ml-1 h-3 w-3 text-muted-foreground" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{order.item_name || order.product?.name || '-'}</TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {order.sku}
                                                </code>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    <span>{order.quantity}</span>
                                                    {!order.is_arrived && !order.checkout_id && (order.arrived_qty ?? 0) > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-amber-500 rounded-full transition-all"
                                                                    style={{ width: `${((order.arrived_qty ?? 0) / order.quantity) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs text-muted-foreground">
                                                                {order.arrived_qty}/{order.quantity}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">${order.unit_price}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                ${(order.quantity * order.unit_price).toLocaleString()}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(order)}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm pr-5">
                                                {new Date(order.created_at).toLocaleDateString('zh-TW')}
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 分頁控制區 */}
            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                    {/* 左側：顯示筆數資訊 */}
                    <div className="flex items-center gap-4">
                        <p className="text-sm text-muted-foreground">
                            顯示第 <span className="font-medium text-foreground">{startIndex + 1}</span> - <span className="font-medium text-foreground">{endIndex}</span> 筆，
                            共 <span className="font-medium text-foreground">{totalCount}</span> 筆
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">每頁</span>
                            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                                <SelectTrigger className="w-[70px] h-8 rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">筆</span>
                        </div>
                    </div>

                    {/* 右側：分頁按鈕 */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        {/* 頁碼按鈕 */}
                        <div className="flex items-center gap-1 mx-2">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((page) => {
                                    // 顯示第一頁、最後一頁、當前頁附近的頁碼
                                    if (page === 1 || page === totalPages) return true
                                    if (Math.abs(page - currentPage) <= 1) return true
                                    return false
                                })
                                .map((page, index, arr) => {
                                    // 在間隔處顯示省略號
                                    const showEllipsisBefore = index > 0 && page - arr[index - 1] > 1
                                    return (
                                        <div key={page} className="flex items-center gap-1">
                                            {showEllipsisBefore && (
                                                <span className="px-1 text-muted-foreground">...</span>
                                            )}
                                            <Button
                                                variant={currentPage === page ? 'default' : 'outline'}
                                                size="sm"
                                                className={`h-8 w-8 rounded-lg ${currentPage === page ? 'gradient-primary' : ''}`}
                                                onClick={() => setCurrentPage(page)}
                                            >
                                                {page}
                                            </Button>
                                        </div>
                                    )
                                })}
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Edit Order Dialog */}
            <Dialog open={!!editingOrder} onOpenChange={() => setEditingOrder(null)}>
                <DialogContent className="glass-strong sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>編輯訂單</DialogTitle>
                        <DialogDescription>
                            {editingOrder?.item_name} - {editingOrder?.customer_name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {/* 數量與單價 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="quantity">數量</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min={1}
                                    value={editQuantity}
                                    onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="unit-price">單價</Label>
                                <Input
                                    id="unit-price"
                                    type="number"
                                    min={0}
                                    value={editUnitPrice}
                                    onChange={(e) => setEditUnitPrice(parseInt(e.target.value) || 0)}
                                    className="rounded-xl"
                                />
                                {editingOrder?.product && editUnitPrice !== editingOrder.unit_price && (
                                    <p className="text-xs text-muted-foreground">
                                        商品原價: ${editingOrder.unit_price}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 小計顯示 */}
                        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-xl">
                            <span className="text-sm text-muted-foreground">小計</span>
                            <span className="font-bold text-lg">
                                ${(editQuantity * editUnitPrice).toLocaleString()}
                            </span>
                        </div>

                        {/* 價格調整原因（當價格被修改時顯示） */}
                        {isPriceChanged && (
                            <div className="space-y-2">
                                <Label htmlFor="price-note">調價原因（選填）</Label>
                                <Input
                                    id="price-note"
                                    value={editPriceNote}
                                    onChange={(e) => setEditPriceNote(e.target.value)}
                                    placeholder="例：老客戶優惠、瑕疵品折扣..."
                                    className="rounded-xl"
                                />
                            </div>
                        )}

                        {/* 訂單備註 */}
                        <div className="space-y-2">
                            <Label htmlFor="note">訂單備註</Label>
                            <Input
                                id="note"
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                placeholder="訂單備註..."
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setDeleteOrder(editingOrder)
                                setEditingOrder(null)
                            }}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            取消訂單
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setEditingOrder(null)} className="rounded-xl">
                                關閉
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={isSubmitting} className="gradient-primary rounded-xl">
                                {isSubmitting ? '儲存中...' : '儲存變更'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteOrder} onOpenChange={() => setDeleteOrder(null)}>
                <AlertDialogContent className="glass-strong">
                    <AlertDialogHeader>
                        <AlertDialogTitle>確定要取消此訂單？</AlertDialogTitle>
                        <AlertDialogDescription>
                            將刪除 {deleteOrder?.customer_name} 的 {deleteOrder?.item_name} 訂單 (數量: {deleteOrder?.quantity})。
                            此操作無法復原。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">返回</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteOrder}
                            disabled={isSubmitting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                        >
                            {isSubmitting ? '刪除中...' : '確定刪除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 批量取消確認對話框 */}
            <Dialog open={batchCancelConfirm} onOpenChange={setBatchCancelConfirm}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-destructive">確認批量取消訂單</DialogTitle>
                        <DialogDescription>
                            您即將取消 <span className="font-semibold text-foreground">{selectedOrders.size}</span> 筆訂單。此操作無法撤銷。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setBatchCancelConfirm(false)} className="rounded-xl">
                            返回
                        </Button>
                        <Button
                            onClick={confirmBatchCancel}
                            variant="destructive"
                            className="rounded-xl"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            確認取消
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 批量結帳確認對話框 */}
            <Dialog open={batchCheckoutConfirm} onOpenChange={setBatchCheckoutConfirm}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>確認批量結帳</DialogTitle>
                        <DialogDescription>
                            將為 <span className="font-semibold text-foreground">{selectedStats.arrivedCount}</span> 位客戶建立結帳單
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>選擇結帳模式</Label>
                            <Select
                                value={checkoutShippingMethod}
                                onValueChange={(value) => setCheckoutShippingMethod(value as 'myship' | 'delivery' | 'pickup')}
                            >
                                <SelectTrigger className="w-full rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="myship">🏪 賣貨便</SelectItem>
                                    <SelectItem value="delivery">🚚 宅配</SelectItem>
                                    <SelectItem value="pickup">🏠 自取</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                            <p>⚠️ 所有客戶將使用相同結帳模式</p>
                            <p className="mt-1">如有客戶需要不同模式，請分批處理或稍後至結帳單管理調整</p>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setBatchCheckoutConfirm(false)} className="rounded-xl">
                            取消
                        </Button>
                        <Button
                            onClick={confirmBatchCheckout}
                            disabled={isSubmitting}
                            className="bg-success hover:bg-success/90 text-success-foreground rounded-xl"
                        >
                            <Receipt className="mr-2 h-4 w-4" />
                            {isSubmitting ? '處理中...' : '確認結帳'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 浮動操作列 - 選取訂單時出現 */}
            <AnimatePresence>
                {selectedOrders.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-6 right-0 z-50 pr-8"
                        style={{ width: `calc(100vw - ${sidebarCollapsed ? 72 : 260}px)` }}
                    >
                        <div className="flex justify-center">
                            <div className="flex items-center gap-3 px-4 py-2.5 rounded-full border-2 border-muted-foreground/30 shadow-xl backdrop-blur-xl bg-card">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    已選 <span className="font-semibold text-foreground">{selectedOrders.size}</span> 筆
                                </span>
                                <div className="h-4 w-px bg-border" />
                                {selectedStats.arrivedCount > 0 && (
                                    <Button
                                        onClick={handleBatchCheckout}
                                        disabled={isSubmitting}
                                        size="xs"
                                        className="bg-success hover:bg-success/90 text-success-foreground rounded-full h-7 px-3 text-xs"
                                    >
                                        <Receipt className="mr-1 h-3 w-3" />
                                        結帳 ({selectedStats.arrivedCount})
                                    </Button>
                                )}
                                <Button
                                    onClick={handleBatchCancel}
                                    variant="destructive"
                                    size="xs"
                                    className="rounded-full h-7 px-3 text-xs"
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    取消訂單
                                </Button>
                                <Button
                                    onClick={() => setSelectedOrders(new Set())}
                                    variant="ghost"
                                    size="xs"
                                    className="rounded-full h-7 px-2 text-xs"
                                >
                                    清除
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
