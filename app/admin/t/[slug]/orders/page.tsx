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
    Link2,
    Users,
    Loader2,
} from 'lucide-react'

type OrderWithDetails = OrderItem & {
    member?: Member
    product?: Product
    auction_order?: { product_name: string | null }[]
    // 未綁定喊單（auction_orders 來源）才會有以下欄位
    isUnbound?: boolean
    auctionOrderId?: string
    winnerNickname?: string
    auctionDate?: string | null
}

interface MemberOption {
    id: string
    nickname: string
    display_name: string
    line_user_id: string
    created_at?: string
}

// 取得商品顯示名稱（優先順序：product.name → auction_order.product_name → item_name）+ 規格名
function getProductDisplayName(order: OrderWithDetails): string {
    let name = '-'
    if (order.product?.name) name = order.product.name
    else if (order.auction_order?.[0]?.product_name) name = order.auction_order[0].product_name
    else if (order.item_name) name = order.item_name
    if (order.variant_name) name += `（${order.variant_name}）`
    return name
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

    // 已結帳訂單檢視 Dialog
    const [viewingOrder, setViewingOrder] = useState<OrderWithDetails | null>(null)

    // 綁定會員 Modal（針對待綁定 auction_orders）
    const [claimOrder, setClaimOrder] = useState<OrderWithDetails | null>(null)
    const [claimSearchKeyword, setClaimSearchKeyword] = useState('')
    const [claimSearchResults, setClaimSearchResults] = useState<MemberOption[]>([])
    const [claimSelectedMember, setClaimSelectedMember] = useState<MemberOption | null>(null)
    const [isClaimSearching, setIsClaimSearching] = useState(false)
    const [isClaiming, setIsClaiming] = useState(false)
    const [claimUpdateNickname, setClaimUpdateNickname] = useState(true)

    // 批量結帳 Dialog 狀態
    const [batchCheckoutConfirm, setBatchCheckoutConfirm] = useState(false)
    const [checkoutShippingMethod, setCheckoutShippingMethod] = useState<'myship' | 'myship_free' | 'delivery' | 'pickup'>('myship')
    const [autoMergeCheckout, setAutoMergeCheckout] = useState(true)
    const [checkoutResultOpen, setCheckoutResultOpen] = useState(false)
    const [checkoutResult, setCheckoutResult] = useState<{ created: number; merged: { name: string; checkoutNo: string; oldTotal: number; newTotal: number }[]; failed: { name: string; reason: string }[] }>({ created: 0, merged: [], failed: [] })

    const supabase = createClient()

    const fetchOrders = async () => {
        if (!tenant) return
        setIsLoading(true)

        // 平行載入：order_items + 未綁定 auction_orders
        const [orderItemsResult, unboundAuctionResult] = await Promise.all([
            supabase
                .from('order_items')
                .select(`
                    *,
                    member:members(*),
                    product:products(*),
                    auction_order:auction_orders!auction_orders_order_item_id_fkey(product_name)
                `)
                .eq('tenant_id', tenant.id)
                .order('created_at', { ascending: false }),
            supabase
                .from('auction_orders')
                .select('id, winner_nickname, amount, product_name, raw_input, note, auction_date, created_at')
                .eq('tenant_id', tenant.id)
                .eq('status', 'pending')
                .is('member_id', null)
                .is('order_item_id', null)
                .order('created_at', { ascending: false }),
        ])

        const orderItems = (orderItemsResult.data || []) as OrderWithDetails[]

        // 將未綁定 auction_orders 映射為 OrderWithDetails 佔位項
        const unboundItems: OrderWithDetails[] = (unboundAuctionResult.data || []).map((a) => ({
            id: a.id,
            tenant_id: tenant.id,
            product_id: null,
            member_id: null,
            checkout_id: null,
            customer_name: a.winner_nickname,
            item_name: a.product_name || a.raw_input || a.winner_nickname,
            variant_name: null,
            variant_id: null,
            sku: '-',
            quantity: 1,
            unit_price: a.amount,
            arrived_qty: 0,
            is_arrived: false,
            status: 'pending',
            note: a.note,
            created_at: a.created_at,
            updated_at: a.created_at,
            isUnbound: true,
            auctionOrderId: a.id,
            winnerNickname: a.winner_nickname,
            auctionDate: a.auction_date,
        } as unknown as OrderWithDetails))

        // 合併後依時間排序
        const merged = [...orderItems, ...unboundItems].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        setOrders(merged)
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

            const productName = getProductDisplayName(order)
            const memberNickname = order.member?.nickname || ''
            const searchMatch =
                searchQuery === '' ||
                productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                memberNickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.sku?.toLowerCase().includes(searchQuery.toLowerCase())

            // 隱藏已取消訂單（除非篩選 cancelled）
            if (statusFilter !== 'cancelled' && statusFilter !== 'all' && order.status === 'cancelled') {
                return false
            }

            let statusMatch = true
            const arrivedQty = order.arrived_qty ?? 0
            if (statusFilter === 'unbound') {
                statusMatch = !!order.isUnbound
            } else if (statusFilter === 'pending') {
                statusMatch = !order.isUnbound && order.status !== 'cancelled' && !order.is_arrived && arrivedQty === 0 && !order.checkout_id
            } else if (statusFilter === 'partial') {
                statusMatch = !order.isUnbound && order.status !== 'cancelled' && !order.is_arrived && arrivedQty > 0 && arrivedQty < order.quantity && !order.checkout_id
            } else if (statusFilter === 'ready') {
                statusMatch = !order.isUnbound && order.status !== 'cancelled' && order.is_arrived && !order.checkout_id
            } else if (statusFilter === 'completed') {
                statusMatch = !order.isUnbound && !!order.checkout_id
            } else if (statusFilter === 'cancelled') {
                statusMatch = !order.isUnbound && order.status === 'cancelled'
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
        if (order.isUnbound) {
            return <Badge className="bg-muted/60 text-muted-foreground border-muted">待綁定</Badge>
        }
        if (order.status === 'cancelled') {
            return <Badge className="bg-destructive/20 text-destructive border-destructive/30">配貨失敗</Badge>
        }
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

    // 刪除訂單（待綁定走 auction_order RPC，一般訂單走 order_item RPC）
    const handleDeleteOrder = async () => {
        if (!deleteOrder || !tenant) return
        setIsSubmitting(true)

        if (deleteOrder.isUnbound && deleteOrder.auctionOrderId) {
            const { data, error } = await supabase.rpc('delete_auction_order_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: deleteOrder.auctionOrderId,
            })
            if (error || !data?.success) {
                toast.error(data?.error || data?.message || '刪除失敗')
                setIsSubmitting(false)
                return
            }
        } else {
            const { data, error } = await supabase.rpc('delete_order_item_v1', {
                p_tenant_id: tenant.id,
                p_order_item_id: deleteOrder.id,
            })
            if (error || !data?.success) {
                toast.error(data?.error || data?.message || '刪除失敗')
                setIsSubmitting(false)
                return
            }
        }

        setOrders((prev) => prev.filter((o) => o.id !== deleteOrder.id))
        toast.success('訂單已刪除')
        setDeleteOrder(null)
        setIsSubmitting(false)
    }

    // 全選 / 取消全選（所有篩選後的訂單，跨頁；排除已結帳、待綁定）
    const allSelectableIds = useMemo(() =>
        filteredOrders.filter((o) => !o.checkout_id && !o.isUnbound).map((o) => o.id),
        [filteredOrders]
    )

    // 搜尋會員（供綁定 Modal）
    const searchMembers = async (keyword: string) => {
        if (!tenant?.id) return
        setIsClaimSearching(true)
        try {
            const { data } = await supabase.rpc('search_members_v1', {
                p_tenant_id: tenant.id,
                p_keyword: keyword || null,
                p_limit: 20,
            }) as { data: { success: boolean; members: MemberOption[] } | null }
            if (data?.success) {
                setClaimSearchResults(data.members || [])
            }
        } finally {
            setIsClaimSearching(false)
        }
    }

    // 打開綁定 Modal
    const openClaimDialog = (order: OrderWithDetails) => {
        setClaimOrder(order)
        setClaimSelectedMember(null)
        setClaimSearchKeyword('')
        setClaimSearchResults([])
        setClaimUpdateNickname(true)
    }

    // 綁定會員（呼叫 admin_claim_auction_order_v1）
    const handleClaim = async () => {
        if (!tenant?.id || !claimOrder || !claimSelectedMember || !claimOrder.auctionOrderId) return
        setIsClaiming(true)
        try {
            const { data, error } = await supabase.rpc('admin_claim_auction_order_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: claimOrder.auctionOrderId,
                p_member_id: claimSelectedMember.id,
                p_update_nickname: claimUpdateNickname,
            }) as { data: { success: boolean; message?: string; nickname_updated?: boolean; new_nickname?: string } | null; error: Error | null }

            if (error || !data?.success) {
                toast.error(data?.message || error?.message || '綁定失敗')
                return
            }

            if (data.nickname_updated) {
                toast.success(`已綁定會員，暱稱已更新為「${data.new_nickname}」`)
            } else {
                toast.success(data.message || '已綁定會員')
            }
            setClaimOrder(null)
            fetchOrders()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '未知錯誤'
            toast.error('綁定失敗：' + msg)
        } finally {
            setIsClaiming(false)
        }
    }

    // 搜尋 effect
    useEffect(() => {
        if (claimOrder && tenant?.id) {
            searchMembers(claimSearchKeyword)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claimOrder, claimSearchKeyword])

    const handleSelectAll = () => {
        const isAllSelected = allSelectableIds.length > 0 &&
            allSelectableIds.every((id) => selectedOrders.has(id))

        if (isAllSelected) {
            // 取消全部選取
            setSelectedOrders(new Set())
        } else {
            // 選取所有篩選後的可選訂單（跨頁）
            setSelectedOrders(new Set(allSelectableIds))
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
            getProductDisplayName(order),
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

    // 批量標記可結帳
    const handleBatchMarkArrived = async () => {
        if (selectedOrders.size === 0) return
        setIsSubmitting(true)
        try {
            const ids = Array.from(selectedOrders)
            const { error } = await supabase
                .from('order_items')
                .update({ is_arrived: true, arrived_qty: 1, status: 'allocated' })
                .in('id', ids)
                .eq('tenant_id', tenant?.id)
            if (error) throw error
            toast.success(`已將 ${ids.length} 筆訂單標記為可結帳`)
            setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, is_arrived: true, arrived_qty: 1, status: 'allocated' } : o))
            setSelectedOrders(new Set())
        } catch (err: any) {
            toast.error('操作失敗：' + (err.message || '未知錯誤'))
        } finally {
            setIsSubmitting(false)
        }
    }

    // 批量改回待到貨（只處理已到貨且未結帳的）
    const handleBatchMarkPending = async () => {
        if (selectedOrders.size === 0) return
        const ids = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        })
        if (ids.length === 0) {
            toast.error('選中的訂單中沒有可改回待到貨的（需為可結帳且未結帳）')
            return
        }
        setIsSubmitting(true)
        try {
            const { error } = await supabase
                .from('order_items')
                .update({ is_arrived: false, arrived_qty: 0, status: 'pending' })
                .in('id', ids)
                .eq('tenant_id', tenant?.id)
            if (error) throw error
            toast.success(`已將 ${ids.length} 筆訂單改回待到貨`)
            setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, is_arrived: false, arrived_qty: 0, status: 'pending' } : o))
            setSelectedOrders(new Set())
        } catch (err) {
            const msg = err instanceof Error ? err.message : '未知錯誤'
            toast.error('操作失敗：' + msg)
        } finally {
            setIsSubmitting(false)
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

        const result: typeof checkoutResult = { created: 0, merged: [], failed: [] }

        // 單一客戶結帳處理
        const processMember = async (memberOrders: OrderWithDetails[]): Promise<void> => {
            try {
                const firstOrder = memberOrders[0]
                const lineUserId = firstOrder.member?.line_user_id
                const memberName = firstOrder.customer_name || firstOrder.member?.display_name || '未知'
                const memberId = firstOrder.member_id

                if (!lineUserId) {
                    result.failed.push({ name: memberName, reason: '會員未綁定 LINE' })
                    return
                }

                // 自動合併：查詢現有 pending/url_sent 結帳單
                if (autoMergeCheckout && memberId) {
                    const { data: existingCheckouts } = await supabase
                        .from('checkouts')
                        .select('id, checkout_no, total_amount, shipping_status')
                        .eq('tenant_id', tenant!.id)
                        .eq('member_id', memberId)
                        .in('shipping_status', ['pending', 'url_sent'])
                        .order('created_at', { ascending: false })
                        .limit(1)

                    if (existingCheckouts && existingCheckouts.length > 0) {
                        const existing = existingCheckouts[0]
                        // 合併：把新訂單塞進現有結帳單
                        const { data: linkData, error: linkErr } = await supabase.rpc('link_order_items_to_checkout_v1', {
                            p_tenant_id: tenant!.id,
                            p_checkout_id: existing.id,
                            p_order_item_ids: memberOrders.map((o) => o.id),
                        })
                        if (linkErr || !linkData?.success) {
                            const reason = linkErr?.message || linkData?.message || linkData?.error || '合併失敗'
                            result.failed.push({ name: memberName, reason: `合併：${reason}` })
                        } else {
                            result.merged.push({
                                name: memberName,
                                checkoutNo: existing.checkout_no,
                                oldTotal: existing.total_amount,
                                newTotal: linkData.new_total,
                            })
                        }
                        return
                    }
                }

                // 建新結帳單
                const { data: checkoutData, error: checkoutError } = await supabase.rpc('create_checkout_v2', {
                    p_tenant_id: tenant!.id,
                    p_line_user_id: lineUserId,
                    p_receiver_name: firstOrder.customer_name || firstOrder.member?.display_name || null,
                    p_receiver_phone: null,
                    p_receiver_store_id: null,
                    p_shipping_method: checkoutShippingMethod,
                })

                if (checkoutError || !checkoutData?.success) {
                    const reason = checkoutError?.message || checkoutData?.message || checkoutData?.error || '建立結帳單失敗'
                    result.failed.push({ name: memberName, reason: `建單：${reason}` })
                    return
                }

                // 關聯訂單項目
                const linkResult = await linkOrderItemsToCheckout(
                    supabase,
                    tenant!.id,
                    checkoutData.checkout_id,
                    memberOrders.map((o) => o.id)
                )

                if (!linkResult.success) {
                    const reason = (linkResult as { error?: string; message?: string }).message || (linkResult as { error?: string }).error || '關聯訂單失敗'
                    result.failed.push({ name: memberName, reason: `關聯：${reason}` })
                } else {
                    result.created++
                }
            } catch (err) {
                const name = memberOrders[0]?.customer_name || memberOrders[0]?.member?.display_name || '未知'
                const reason = err instanceof Error ? err.message : '未知錯誤'
                result.failed.push({ name, reason: `例外：${reason}` })
            }
        }

        const memberGroups = Array.from(ordersByMember.values())
        for (const memberOrders of memberGroups) {
            await processMember(memberOrders)
        }

        // 刷新資料
        fetchOrders()
        setSelectedOrders(new Set())
        setBatchCheckoutConfirm(false)
        setIsSubmitting(false)

        // 顯示結果 Dialog
        setCheckoutResult(result)
        setCheckoutResultOpen(true)

        if (result.created === 0 && result.merged.length === 0) {
            toast.error(`結帳處理失敗`, {
                description: result.failed.length > 0
                    ? `失敗客戶：${result.failed.slice(0, 5).map(f => f.name).join('、')}`
                    : '請稍後重試',
            })
        }
    }

    // 計算選中訂單的統計資訊
    const selectedStats = useMemo(() => {
        const arrivedOrders = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        })
        const arrivedCount = arrivedOrders.length
        const uniqueMembers = new Set(
            arrivedOrders.map((id) => orders.find((o) => o.id === id)?.member_id).filter(Boolean)
        )
        const pendingCount = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && !order.is_arrived && !order.checkout_id
        }).length
        return { arrivedCount, uniqueMemberCount: uniqueMembers.size, pendingCount }
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

    // 全選狀態判定（基於所有篩選結果，非僅當前頁）
    const isAllSelected = allSelectableIds.length > 0 &&
        allSelectableIds.every((id) => selectedOrders.has(id))

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
            <div className="grid gap-4 md:grid-cols-5">
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <Link2 className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => o.isUnbound).length}
                                </p>
                                <p className="text-sm text-muted-foreground">待綁定</p>
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
                                <p className="text-2xl font-bold">
                                    {orders.filter((o) => !o.isUnbound && !o.is_arrived && (o.arrived_qty ?? 0) === 0 && !o.checkout_id).length}
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
                                    {orders.filter((o) => !o.isUnbound && !o.is_arrived && (o.arrived_qty ?? 0) > 0 && (o.arrived_qty ?? 0) < o.quantity && !o.checkout_id).length}
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
                                    {orders.filter((o) => !o.isUnbound && o.is_arrived && !o.checkout_id).length}
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
                                <SelectItem value="unbound">待綁定</SelectItem>
                                <SelectItem value="pending">待到貨</SelectItem>
                                <SelectItem value="partial">部分到貨</SelectItem>
                                <SelectItem value="ready">可結帳</SelectItem>
                                <SelectItem value="completed">已結帳</SelectItem>
                                <SelectItem value="cancelled">配貨失敗</SelectItem>
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
                                                checked={isAllSelected}
                                                onCheckedChange={handleSelectAll}
                                                aria-label="全選"
                                            />
                                        </TableHead>
                                        <TableHead>客戶</TableHead>
                                        <TableHead>商品</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead className="text-right">數量</TableHead>
                                        <TableHead className="text-right">單價</TableHead>
                                        <TableHead className="text-right">小計</TableHead>
                                        <TableHead className="text-right">利潤</TableHead>
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
                                            className="group hover:bg-muted/50 transition-colors cursor-pointer"
                                            onClick={() => {
                                                if (order.isUnbound) {
                                                    // 待綁定 → 開綁定 Modal
                                                    openClaimDialog(order)
                                                } else if (order.checkout_id) {
                                                    // 已結帳 → 唯讀檢視
                                                    setViewingOrder(order)
                                                } else {
                                                    // 未結帳 → 編輯
                                                    openEditDialog(order)
                                                }
                                            }}
                                        >
                                            <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                                                {!order.checkout_id && !order.isUnbound && (
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
                                                    {order.member?.nickname && (
                                                        <span className="ml-1 text-xs text-muted-foreground">({order.member.nickname})</span>
                                                    )}
                                                    {order.note && (
                                                        <MessageSquare className="inline-block ml-1 h-3 w-3 text-muted-foreground" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{getProductDisplayName(order)}</TableCell>
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
                                            <TableCell className="text-right">
                                                {order.product?.cost != null && order.product.cost > 0 ? (
                                                    <span className={`text-sm font-medium ${(order.unit_price - order.product.cost) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        ${(order.quantity * (order.unit_price - order.product.cost)).toLocaleString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
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
                            {editingOrder ? getProductDisplayName(editingOrder) : ''} - {editingOrder?.customer_name}
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

            {/* View Order Detail Dialog (已結帳訂單唯讀檢視) */}
            <Dialog open={!!viewingOrder} onOpenChange={() => setViewingOrder(null)}>
                <DialogContent className="glass-strong sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>訂單明細</DialogTitle>
                        <DialogDescription>
                            {viewingOrder?.customer_name || viewingOrder?.member?.display_name || '匿名'} 的訂單
                        </DialogDescription>
                    </DialogHeader>
                    {viewingOrder && (
                        <div className="space-y-4 py-2">
                            {/* 商品資訊 */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">商品</span>
                                    <span className="font-medium">{getProductDisplayName(viewingOrder)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">SKU</span>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{viewingOrder.sku}</code>
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">數量</span>
                                    <span>{viewingOrder.quantity}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">單價</span>
                                    <span>${viewingOrder.unit_price.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* 小計 */}
                            <div className="flex items-center justify-between py-2.5 px-3 bg-muted/50 rounded-xl">
                                <span className="text-sm text-muted-foreground">小計</span>
                                <span className="font-bold text-lg">
                                    ${(viewingOrder.quantity * viewingOrder.unit_price).toLocaleString()}
                                </span>
                            </div>

                            {/* 備註 */}
                            {viewingOrder.note && (
                                <div className="space-y-1.5">
                                    <span className="text-sm text-muted-foreground">備註</span>
                                    <p className="text-sm bg-muted/50 rounded-xl px-3 py-2">{viewingOrder.note}</p>
                                </div>
                            )}

                            {/* 狀態與時間 */}
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">狀態</span>
                                    {getStatusBadge(viewingOrder)}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">下單時間</span>
                                    <span className="text-sm">{new Date(viewingOrder.created_at).toLocaleString('zh-TW')}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewingOrder(null)} className="rounded-xl">
                            關閉
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 綁定會員 Modal（待綁定訂單） */}
            <Dialog open={!!claimOrder} onOpenChange={(open) => !open && setClaimOrder(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            綁定會員
                        </DialogTitle>
                        <DialogDescription>
                            訂單：{claimOrder?.winnerNickname}
                            {claimOrder?.item_name && ` - ${claimOrder.item_name}`}
                            {' '}${(claimOrder?.unit_price ?? 0).toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜尋會員暱稱或名稱..."
                                value={claimSearchKeyword}
                                onChange={(e) => setClaimSearchKeyword(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>

                        <div className="border rounded-xl max-h-64 overflow-y-auto">
                            {isClaimSearching ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : claimSearchResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        {claimSearchKeyword ? '找不到符合的會員' : '尚無會員資料'}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {claimSearchResults.map((member) => (
                                        <button
                                            key={member.id}
                                            onClick={() => setClaimSelectedMember(member)}
                                            className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between ${
                                                claimSelectedMember?.id === member.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                                            }`}
                                        >
                                            <div>
                                                <p className="font-medium">{member.display_name || member.nickname}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    暱稱：{member.nickname}
                                                </p>
                                            </div>
                                            {claimSelectedMember?.id === member.id && (
                                                <CheckCircle2 className="h-5 w-5 text-primary" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {claimSelectedMember && claimOrder && (
                            <div className="flex items-center space-x-2 pt-2 border-t">
                                <Checkbox
                                    id="claim-update-nickname"
                                    checked={claimUpdateNickname}
                                    onCheckedChange={(checked) => setClaimUpdateNickname(checked === true)}
                                />
                                <label
                                    htmlFor="claim-update-nickname"
                                    className="text-sm font-medium leading-none cursor-pointer"
                                >
                                    同時更新會員暱稱為「{claimOrder.winnerNickname}」
                                </label>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setClaimOrder(null)}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleClaim}
                            disabled={!claimSelectedMember || isClaiming}
                            className="gradient-primary rounded-xl"
                        >
                            {isClaiming ? (
                                <>
                                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                    綁定中...
                                </>
                            ) : (
                                '確認綁定'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteOrder} onOpenChange={() => setDeleteOrder(null)}>
                <AlertDialogContent className="glass-strong">
                    <AlertDialogHeader>
                        <AlertDialogTitle>確定要取消此訂單？</AlertDialogTitle>
                        <AlertDialogDescription>
                            將刪除 {deleteOrder?.customer_name} 的 {deleteOrder ? getProductDisplayName(deleteOrder) : ''} 訂單 (數量: {deleteOrder?.quantity})。
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

            {/* 批次結帳結果 Dialog */}
            <Dialog open={checkoutResultOpen} onOpenChange={setCheckoutResultOpen}>
                <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>✅ 批次結帳完成</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                        <div className="flex gap-4 text-sm flex-wrap">
                            {checkoutResult.created > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">📋 新建：</span>
                                    <span className="font-semibold">{checkoutResult.created} 筆</span>
                                </div>
                            )}
                            {checkoutResult.merged.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">🔄 合併：</span>
                                    <span className="font-semibold">{checkoutResult.merged.length} 筆</span>
                                </div>
                            )}
                            {checkoutResult.failed.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">❌ 失敗：</span>
                                    <span className="font-semibold text-destructive">{checkoutResult.failed.length} 筆</span>
                                </div>
                            )}
                        </div>
                        {checkoutResult.merged.length > 0 && (
                            <div className="rounded-lg border p-3 space-y-2 max-h-[40vh] overflow-y-auto">
                                <p className="text-xs font-medium text-muted-foreground sticky top-0 bg-background pb-1">合併明細（{checkoutResult.merged.length}）</p>
                                {checkoutResult.merged.map((m, i) => (
                                    <div key={i} className="text-sm flex items-center justify-between gap-2">
                                        <span className="truncate">{m.name} → #{m.checkoutNo}</span>
                                        <span className="text-muted-foreground whitespace-nowrap">${m.oldTotal.toLocaleString()} → <span className="font-semibold text-foreground">${m.newTotal.toLocaleString()}</span></span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {checkoutResult.failed.length > 0 && (
                            <div className="rounded-lg border border-destructive/30 p-3 max-h-[40vh] overflow-y-auto space-y-1.5">
                                <p className="text-xs font-medium text-destructive sticky top-0 bg-background pb-1">失敗客戶（{checkoutResult.failed.length}）</p>
                                {checkoutResult.failed.map((f, i) => (
                                    <div key={i} className="text-sm flex items-start gap-2">
                                        <span className="font-medium shrink-0">{f.name}</span>
                                        <span className="text-destructive/80 text-xs">{f.reason}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setCheckoutResultOpen(false)} className="rounded-xl">確認</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 批量結帳確認對話框 */}
            <Dialog open={batchCheckoutConfirm} onOpenChange={setBatchCheckoutConfirm}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>確認批量結帳</DialogTitle>
                        <DialogDescription>
                            將為 <span className="font-semibold text-foreground">{selectedStats.uniqueMemberCount}</span> 位客戶建立結帳單
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>選擇結帳模式</Label>
                            <Select
                                value={checkoutShippingMethod}
                                onValueChange={(value) => setCheckoutShippingMethod(value as 'myship' | 'myship_free' | 'delivery' | 'pickup')}
                            >
                                <SelectTrigger className="w-full rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="myship">🏪 賣貨便</SelectItem>
                                    <SelectItem value="myship_free">🏪 賣貨便(免運)</SelectItem>
                                    <SelectItem value="delivery">🚚 宅配</SelectItem>
                                    <SelectItem value="pickup">🏠 自取</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center space-x-2 py-2">
                            <Checkbox
                                id="auto-merge"
                                checked={autoMergeCheckout}
                                onCheckedChange={(checked) => setAutoMergeCheckout(checked === true)}
                            />
                            <label htmlFor="auto-merge" className="text-sm font-medium leading-none cursor-pointer">
                                自動合併現有待處理結帳單
                            </label>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                            <p>⚠️ 所有客戶將使用相同結帳模式</p>
                            {autoMergeCheckout && <p className="mt-1">🔄 若客戶已有待處理/已設連結的結帳單，新訂單會自動合併</p>}
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
                                {selectedStats.arrivedCount > 0 && (
                                    <Button
                                        onClick={handleBatchMarkPending}
                                        disabled={isSubmitting}
                                        size="xs"
                                        variant="outline"
                                        className="rounded-full h-7 px-3 text-xs"
                                    >
                                        <Clock className="mr-1 h-3 w-3" />
                                        改回待到貨 ({selectedStats.arrivedCount})
                                    </Button>
                                )}
                                {selectedStats.pendingCount > 0 && (
                                    <Button
                                        onClick={handleBatchMarkArrived}
                                        disabled={isSubmitting}
                                        size="xs"
                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full h-7 px-3 text-xs"
                                    >
                                        <Package className="mr-1 h-3 w-3" />
                                        標記可結帳 ({selectedStats.pendingCount})
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
