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
import { cn } from '@/lib/utils'
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

// 結帳合併偵測：每個客人現有可合併的結帳單
interface MergeCandidate {
    id: string
    checkout_no: string
    total_amount: number
    shipping_status: string
    shipping_method: string
    payment_status: string | null
    mergeable: boolean
}
interface MemberCheckoutPlan {
    memberId: string
    memberName: string
    lineUserId: string | null
    orderIds: string[]
    newItemsTotal: number
    candidates: MergeCandidate[]
    choice: string // 'new' | 結帳單 id
}

const SHIPPING_METHOD_LABEL: Record<string, string> = {
    myship: '🏪 賣貨便',
    myship_free: '🏪 賣貨便免運',
    delivery: '🚚 宅配',
    seven_store: '🏬 店到店',
    pickup: '🏠 自取',
}
const SHIPPING_STATUS_LABEL: Record<string, string> = {
    pending: '待處理',
    url_sent: '賣場已開·待付款',
    ordered: '已下單·待出貨',
    shipped: '已出貨',
    completed: '已完成',
}
const PAYMENT_STATUS_LABEL: Record<string, string> = {
    pending: '未付款',
    partial: '部分付款',
    paid: '已匯款',
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
    const [claimFixNickname, setClaimFixNickname] = useState('')
    const [isFixingNickname, setIsFixingNickname] = useState(false)
    const [claimSearchResults, setClaimSearchResults] = useState<MemberOption[]>([])
    const [claimSelectedMember, setClaimSelectedMember] = useState<MemberOption | null>(null)
    const [isClaimSearching, setIsClaimSearching] = useState(false)
    const [isClaiming, setIsClaiming] = useState(false)
    const [claimUpdateNickname, setClaimUpdateNickname] = useState(true)

    // 批量結帳 Dialog 狀態
    const [batchCheckoutConfirm, setBatchCheckoutConfirm] = useState(false)
    const [checkoutShippingMethod, setCheckoutShippingMethod] = useState<'myship' | 'myship_free' | 'delivery' | 'pickup' | 'seven_store'>('myship')
    // 結帳合併偵測：逐人列出可合併的現有結帳單，並記錄每人選擇（併入哪張 / 開新單）
    const [isDetectingMerge, setIsDetectingMerge] = useState(false)
    const [checkoutPlans, setCheckoutPlans] = useState<MemberCheckoutPlan[]>([])
    const [checkoutResultOpen, setCheckoutResultOpen] = useState(false)
    const [checkoutResult, setCheckoutResult] = useState<{ created: number; merged: { name: string; checkoutNo: string; oldTotal: number; newTotal: number }[]; failed: { name: string; reason: string }[] }>({ created: 0, merged: [], failed: [] })

    const supabase = createClient()

    const fetchOrders = async (showSkeleton = false) => {
        if (!tenant) return
        if (showSkeleton) setIsLoading(true)

        // 客戶端分頁載入 order_items（避免 PostgREST 預設 db-max-rows=1000 限制）
        const PAGE_SIZE = 1000
        const fetchAllOrderItems = async (): Promise<OrderWithDetails[]> => {
            const all: OrderWithDetails[] = []
            let offset = 0
            // 安全上限 50 頁 = 50000 筆，避免異常情況無限迴圈
            for (let page = 0; page < 50; page++) {
                const { data, error } = await supabase
                    .from('order_items')
                    .select(`
                        *,
                        member:members(*),
                        product:products(*),
                        auction_order:auction_orders!auction_orders_order_item_id_fkey(product_name)
                    `)
                    .eq('tenant_id', tenant.id)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + PAGE_SIZE - 1)
                if (error || !data) break
                all.push(...(data as OrderWithDetails[]))
                if (data.length < PAGE_SIZE) break
                offset += PAGE_SIZE
            }
            return all
        }

        // 平行載入：order_items（分頁全撈）+ 未綁定 auction_orders
        const [orderItems, unboundAuctionResult] = await Promise.all([
            fetchAllOrderItems(),
            supabase
                .from('auction_orders')
                .select('id, winner_nickname, amount, product_name, raw_input, note, auction_date, created_at')
                .eq('tenant_id', tenant.id)
                .eq('status', 'pending')
                .is('member_id', null)
                .is('order_item_id', null)
                .order('created_at', { ascending: false }),
        ])

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

        // 首次載入顯示 skeleton；之後 realtime 觸發的 refetch 不顯示（避免閃白）
        fetchOrders(true)

        // Realtime event debounce：合併 800ms 內的多筆事件為一次 refetch
        let debounceTimer: ReturnType<typeof setTimeout> | null = null
        const scheduleRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => fetchOrders(false), 800)
        }

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
                scheduleRefetch
            )
            .subscribe()

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer)
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
            const memberDisplayName = order.member?.display_name || ''
            const searchMatch =
                searchQuery === '' ||
                productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                memberNickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                memberDisplayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

    // 全選 / 取消全選（所有篩選後的訂單，跨頁；排除已結帳。待綁定可勾以便批次取消）
    const allSelectableIds = useMemo(() =>
        filteredOrders.filter((o) => !o.checkout_id).map((o) => o.id),
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
        setClaimFixNickname(order.winnerNickname || '')
    }

    // 修正暱稱（打錯字時用）— 自動嘗試比對會員
    const handleFixNickname = async () => {
        if (!tenant?.id || !claimOrder?.auctionOrderId) return
        const newNick = claimFixNickname.trim()
        if (!newNick) {
            toast.error('暱稱不可為空')
            return
        }
        if (newNick === claimOrder.winnerNickname) {
            toast.info('暱稱沒有變動')
            return
        }
        setIsFixingNickname(true)
        try {
            const { data, error } = await supabase.rpc('admin_fix_auction_nickname_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: claimOrder.auctionOrderId,
                p_new_nickname: newNick,
            }) as { data: { success: boolean; matched?: boolean; message?: string; member_name?: string } | null; error: Error | null }

            if (error || !data?.success) {
                toast.error(data?.message || error?.message || '修正失敗')
                return
            }

            if (data.matched) {
                toast.success(`暱稱修正後自動綁定到「${data.member_name}」`)
                setClaimOrder(null)
                fetchOrders()
            } else {
                toast.warning(data.message || '暱稱已修正，但仍找不到會員，請手動選擇')
                setClaimSearchKeyword(newNick)
                // 讓使用者繼續手動搜尋
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : '未知錯誤'
            toast.error('修正失敗：' + msg)
        } finally {
            setIsFixingNickname(false)
        }
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
            const allIds = Array.from(selectedOrders)
            // 拆分：待綁定（auction_orders）vs 一般訂單（order_items）
            const unboundOrders = allIds
                .map((id) => orders.find((o) => o.id === id))
                .filter((o): o is OrderWithDetails => !!o && !!o.isUnbound && !!o.auctionOrderId)
            const orderItemIds = allIds.filter((id) => {
                const o = orders.find((x) => x.id === id)
                return o && !o.isUnbound
            })

            const deletedIds: string[] = []
            let deletedCount = 0
            let skippedCount = 0
            const failedNames: string[] = []

            // 1) 批次刪除一般訂單
            if (orderItemIds.length > 0) {
                const { data, error } = await supabase.rpc('batch_delete_order_items_v1', {
                    p_tenant_id: tenant?.id,
                    p_order_item_ids: orderItemIds,
                })
                if (error) {
                    toast.error('批量取消失敗：' + error.message)
                    return
                }
                if (!data?.success) {
                    toast.error(data?.error || '批量取消失敗')
                    return
                }
                deletedCount += data.deleted_count ?? 0
                skippedCount += data.skipped_count ?? 0
                if (Array.isArray(data.deleted_ids)) deletedIds.push(...data.deleted_ids)
            }

            // 2) 逐筆刪除待綁定訂單（auction_orders）
            for (const order of unboundOrders) {
                const { data, error } = await supabase.rpc('delete_auction_order_v1', {
                    p_tenant_id: tenant?.id,
                    p_auction_order_id: order.auctionOrderId,
                })
                if (error || !data?.success) {
                    failedNames.push(order.customer_name || order.winnerNickname || '未知')
                } else {
                    deletedCount++
                    deletedIds.push(order.id)
                }
            }

            if (deletedCount > 0) toast.success(`成功刪除 ${deletedCount} 筆訂單`)
            if (skippedCount > 0) toast.warning(`${skippedCount} 筆因已結帳被跳過`)
            if (failedNames.length > 0) {
                toast.error(`${failedNames.length} 筆刪除失敗：${failedNames.slice(0, 3).join('、')}`)
            }

            setOrders((prev) => prev.filter((o) => !deletedIds.includes(o.id)))
            setSelectedOrders(new Set())
        } catch (err: any) {
            toast.error('批量取消失敗：' + (err.message || '未知錯誤'))
        } finally {
            setIsSubmitting(false)
            setBatchCancelConfirm(false)
        }
    }

    // 批量結單（待綁定 auction_orders → status='completed'，不再出現在待綁定列表）
    const handleBatchCompleteUnbound = async () => {
        if (!tenant?.id) return
        const unboundOrders = Array.from(selectedOrders)
            .map((id) => orders.find((o) => o.id === id))
            .filter((o): o is OrderWithDetails => !!o && !!o.isUnbound && !!o.auctionOrderId)
        if (unboundOrders.length === 0) {
            toast.error('選中的訂單中沒有「待綁定」訂單')
            return
        }
        setIsSubmitting(true)
        try {
            const auctionIds = unboundOrders.map((o) => o.auctionOrderId as string)
            const { data, error } = await supabase.rpc('batch_complete_auction_orders_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_ids: auctionIds,
            }) as { data: { success: boolean; completed_count?: number; completed_ids?: string[]; skipped_count?: number; error?: string } | null; error: Error | null }

            if (error || !data?.success) {
                toast.error(data?.error || error?.message || '結單失敗')
                return
            }

            const completedSet = new Set(data.completed_ids || [])
            // OrderWithDetails 上 unbound 的 id 等於 auctionOrderId
            setOrders((prev) => prev.filter((o) => !completedSet.has(o.id)))
            setSelectedOrders(new Set())
            toast.success(`已結單 ${data.completed_count ?? 0} 筆`)
            if ((data.skipped_count ?? 0) > 0) {
                toast.warning(`${data.skipped_count} 筆狀態非 pending，已跳過`)
            }
        } catch (err: any) {
            toast.error('結單失敗：' + (err.message || '未知錯誤'))
        } finally {
            setIsSubmitting(false)
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
    const handleBatchCheckout = async () => {
        // 篩選出選中且已到貨的訂單
        const arrivedOrderIds = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.is_arrived && !order.checkout_id
        })

        if (arrivedOrderIds.length === 0) {
            toast.error('選中的訂單中沒有可結帳的訂單（需已到貨且未結帳）')
            return
        }

        // 開啟確認 Dialog，並開始偵測每位客人可合併的現有結帳單
        setBatchCheckoutConfirm(true)
        await detectMergeCandidates(arrivedOrderIds)
    }

    // 智慧偵測：一次查出所有選中客人的「未出貨」現有結帳單，逐人列出可併入選項
    const detectMergeCandidates = async (arrivedOrderIds: string[]) => {
        if (!tenant) return
        setIsDetectingMerge(true)
        setCheckoutPlans([])
        try {
            // 依客人分組本次選中的訂單
            const byMember = new Map<string, OrderWithDetails[]>()
            arrivedOrderIds.forEach((id) => {
                const order = orders.find((o) => o.id === id)
                if (order && order.member_id) {
                    const arr = byMember.get(order.member_id) || []
                    arr.push(order)
                    byMember.set(order.member_id, arr)
                }
            })

            const memberIds = Array.from(byMember.keys())
            const candidatesByMember = new Map<string, MergeCandidate[]>()

            if (memberIds.length > 0) {
                // 單次查詢：所有客人「未出貨」(pending/url_sent/ordered) 的結帳單
                const { data } = await supabase
                    .from('checkouts')
                    .select('id, checkout_no, member_id, total_amount, shipping_status, shipping_method, payment_status')
                    .eq('tenant_id', tenant.id)
                    .in('member_id', memberIds)
                    .in('shipping_status', ['pending', 'url_sent', 'ordered'])
                    .order('created_at', { ascending: false })

                ;(data || []).forEach((c) => {
                    // 可合併規則（對齊 link_order_items_to_checkout_v1）：
                    //   pending / url_sent 任何方式皆可；ordered 限宅配/店到店/自取（賣貨便已下單鎖定）
                    const mergeable = c.shipping_status === 'pending'
                        || c.shipping_status === 'url_sent'
                        || (c.shipping_status === 'ordered' && ['delivery', 'seven_store', 'pickup'].includes(c.shipping_method))
                    const arr = candidatesByMember.get(c.member_id) || []
                    arr.push({
                        id: c.id,
                        checkout_no: c.checkout_no,
                        total_amount: c.total_amount,
                        shipping_status: c.shipping_status,
                        shipping_method: c.shipping_method,
                        payment_status: c.payment_status,
                        mergeable,
                    })
                    candidatesByMember.set(c.member_id, arr)
                })
            }

            const plans: MemberCheckoutPlan[] = Array.from(byMember.entries()).map(([memberId, memberOrders]) => {
                const first = memberOrders[0]
                const candidates = candidatesByMember.get(memberId) || []
                const firstMergeable = candidates.find((c) => c.mergeable)
                return {
                    memberId,
                    memberName: first.customer_name || first.member?.display_name || '未知',
                    lineUserId: first.member?.line_user_id || null,
                    orderIds: memberOrders.map((o) => o.id),
                    newItemsTotal: memberOrders.reduce((s, o) => s + (o.unit_price || 0) * (o.quantity || 0), 0),
                    candidates,
                    // 預設：有可併的就預選最新一張，否則開新單
                    choice: firstMergeable ? firstMergeable.id : 'new',
                }
            })
            setCheckoutPlans(plans)
        } catch (err) {
            console.error('detect merge candidates error:', err)
        } finally {
            setIsDetectingMerge(false)
        }
    }

    // 切換某客人的結帳選擇（併入某張單 / 開新單）
    const setPlanChoice = (memberId: string, choice: string) => {
        setCheckoutPlans((prev) => prev.map((p) => (p.memberId === memberId ? { ...p, choice } : p)))
    }

    // 確認批量結帳（依逐人偵測的選擇執行：併入指定結帳單 / 開新單）
    const confirmBatchCheckout = async () => {
        if (checkoutPlans.length === 0) {
            toast.error('找不到可結帳的訂單')
            return
        }

        setIsSubmitting(true)

        const result: typeof checkoutResult = { created: 0, merged: [], failed: [] }

        // 單一客戶結帳處理
        const processPlan = async (plan: MemberCheckoutPlan): Promise<void> => {
            try {
                // A. 併入指定的現有結帳單
                if (plan.choice !== 'new') {
                    const target = plan.candidates.find((c) => c.id === plan.choice)
                    const { data: linkData, error: linkErr } = await supabase.rpc('link_order_items_to_checkout_v1', {
                        p_tenant_id: tenant!.id,
                        p_checkout_id: plan.choice,
                        p_order_item_ids: plan.orderIds,
                    })
                    if (linkErr || !linkData?.success) {
                        const reason = linkErr?.message || linkData?.message || linkData?.error || '合併失敗'
                        result.failed.push({ name: plan.memberName, reason: `合併：${reason}` })
                    } else {
                        result.merged.push({
                            name: plan.memberName,
                            checkoutNo: target?.checkout_no || linkData.checkout_no,
                            oldTotal: target?.total_amount ?? 0,
                            newTotal: linkData.new_total,
                        })
                    }
                    return
                }

                // B. 開新結帳單
                if (!plan.lineUserId) {
                    result.failed.push({ name: plan.memberName, reason: '會員未綁定 LINE' })
                    return
                }

                const { data: checkoutData, error: checkoutError } = await supabase.rpc('create_checkout_v2', {
                    p_tenant_id: tenant!.id,
                    p_line_user_id: plan.lineUserId,
                    p_receiver_name: plan.memberName,
                    p_receiver_phone: null,
                    p_receiver_store_id: null,
                    p_shipping_method: checkoutShippingMethod,
                })

                if (checkoutError || !checkoutData?.success) {
                    const reason = checkoutError?.message || checkoutData?.message || checkoutData?.error || '建立結帳單失敗'
                    result.failed.push({ name: plan.memberName, reason: `建單：${reason}` })
                    return
                }

                // 關聯訂單項目
                const linkResult = await linkOrderItemsToCheckout(
                    supabase,
                    tenant!.id,
                    checkoutData.checkout_id,
                    plan.orderIds
                )

                if (!linkResult.success) {
                    const reason = (linkResult as { error?: string; message?: string }).message || (linkResult as { error?: string }).error || '關聯訂單失敗'
                    result.failed.push({ name: plan.memberName, reason: `關聯：${reason}` })
                } else {
                    result.created++
                }
            } catch (err) {
                const reason = err instanceof Error ? err.message : '未知錯誤'
                result.failed.push({ name: plan.memberName, reason: `例外：${reason}` })
            }
        }

        for (const plan of checkoutPlans) {
            await processPlan(plan)
        }

        // 刷新資料
        fetchOrders()
        setSelectedOrders(new Set())
        setBatchCheckoutConfirm(false)
        setCheckoutPlans([])
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
            return order && !order.isUnbound && !order.is_arrived && !order.checkout_id
        }).length
        const unboundCount = Array.from(selectedOrders).filter((id) => {
            const order = orders.find((o) => o.id === id)
            return order && order.isUnbound
        }).length
        return { arrivedCount, uniqueMemberCount: uniqueMembers.size, pendingCount, unboundCount }
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
                                    value={editUnitPrice}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        // 允許負數（預匯款對沖用）；空字串視為 0
                                        if (v === '' || v === '-') {
                                            setEditUnitPrice(0)
                                        } else {
                                            const n = parseInt(v, 10)
                                            setEditUnitPrice(isNaN(n) ? 0 : n)
                                        }
                                    }}
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
                        {/* 修正暱稱（登記時打錯字用） */}
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-amber-600">✏️ 暱稱打錯字？直接修正後自動比對會員</p>
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder="輸入正確暱稱"
                                    value={claimFixNickname}
                                    onChange={(e) => setClaimFixNickname(e.target.value)}
                                    className="rounded-xl flex-1"
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleFixNickname}
                                    disabled={isFixingNickname || !claimFixNickname.trim()}
                                    className="rounded-xl border-amber-500 text-amber-600 hover:bg-amber-100 whitespace-nowrap"
                                >
                                    {isFixingNickname ? '修正中...' : '修正並綁定'}
                                </Button>
                            </div>
                        </div>

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
                <DialogContent className="sm:max-w-[540px]">
                    <DialogHeader>
                        <DialogTitle>確認批量結帳</DialogTitle>
                        <DialogDescription>
                            {isDetectingMerge ? (
                                <>偵測各客人現有結帳單中…</>
                            ) : (
                                <>
                                    共 <span className="font-semibold text-foreground">{checkoutPlans.length}</span> 位客戶 ·
                                    併入舊單 <span className="font-semibold text-amber-600">{checkoutPlans.filter((p) => p.choice !== 'new').length}</span> ·
                                    開新單 <span className="font-semibold text-foreground">{checkoutPlans.filter((p) => p.choice === 'new').length}</span>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {/* 新單使用的出貨方式（僅對「開新單」的客戶生效） */}
                        <div className="space-y-2">
                            <Label>新單出貨方式<span className="ml-1 text-xs font-normal text-muted-foreground">（僅套用到開新單的客戶；併入舊單者沿用該單方式）</span></Label>
                            <Select
                                value={checkoutShippingMethod}
                                onValueChange={(value) => setCheckoutShippingMethod(value as 'myship' | 'myship_free' | 'delivery' | 'pickup' | 'seven_store')}
                            >
                                <SelectTrigger className="w-full rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="myship">🏪 賣貨便</SelectItem>
                                    <SelectItem value="myship_free">🏪 賣貨便(免運)</SelectItem>
                                    <SelectItem value="delivery">🚚 宅配</SelectItem>
                                    <SelectItem value="seven_store">🏬 7-11店到店</SelectItem>
                                    <SelectItem value="pickup">🏠 自取</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 逐人偵測：現有可合併的結帳單 */}
                        <div className="space-y-2">
                            <Label>逐人合併偵測</Label>
                            {isDetectingMerge ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-16 w-full rounded-lg" />
                                    <Skeleton className="h-16 w-full rounded-lg" />
                                </div>
                            ) : (
                                <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                                    {checkoutPlans.map((plan) => (
                                        <div key={plan.memberId} className="rounded-lg border border-border p-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-foreground truncate">{plan.memberName}</span>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                    本次 {plan.orderIds.length} 筆 · ${plan.newItemsTotal.toLocaleString()}
                                                </span>
                                            </div>

                                            {plan.candidates.length === 0 ? (
                                                <p className="text-xs text-emerald-600">✅ 無未出貨舊單，將開新單</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {plan.candidates.map((c) => {
                                                        const selected = plan.choice === c.id
                                                        return (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                disabled={!c.mergeable}
                                                                onClick={() => c.mergeable && setPlanChoice(plan.memberId, c.id)}
                                                                className={cn(
                                                                    'w-full rounded-lg border px-2.5 py-2 text-left text-xs transition',
                                                                    !c.mergeable
                                                                        ? 'cursor-not-allowed border-dashed border-border opacity-60'
                                                                        : selected
                                                                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                                            : 'border-border hover:border-primary/50'
                                                                )}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="font-medium text-foreground">
                                                                        {SHIPPING_METHOD_LABEL[c.shipping_method] || c.shipping_method} · #{c.checkout_no}
                                                                    </span>
                                                                    <span className="text-foreground">${c.total_amount.toLocaleString()}</span>
                                                                </div>
                                                                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                                                                    <span>{SHIPPING_STATUS_LABEL[c.shipping_status] || c.shipping_status}</span>
                                                                    <span>·</span>
                                                                    <span>{PAYMENT_STATUS_LABEL[c.payment_status || 'pending'] || c.payment_status}</span>
                                                                    {!c.mergeable && <span className="text-destructive">· 🔒 無法合併（賣貨便已下單）</span>}
                                                                    {selected && c.mergeable && <span className="ml-auto font-medium text-primary">✓ 併入此單</span>}
                                                                </div>
                                                            </button>
                                                        )
                                                    })}
                                                    <button
                                                        type="button"
                                                        onClick={() => setPlanChoice(plan.memberId, 'new')}
                                                        className={cn(
                                                            'w-full rounded-lg border px-2.5 py-2 text-left text-xs transition',
                                                            plan.choice === 'new'
                                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                                : 'border-border hover:border-primary/50'
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium text-foreground">➕ 開新單（不合併）</span>
                                                            {plan.choice === 'new' && <span className="font-medium text-primary">✓</span>}
                                                        </div>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(checkoutShippingMethod === 'myship' || checkoutShippingMethod === 'myship_free')
                          && tenant?.free_shipping_threshold && tenant.free_shipping_threshold > 0 && (
                            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                                🎁 商品滿 ${tenant.free_shipping_threshold.toLocaleString()} 自動免運（升級為賣貨便免運）
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setBatchCheckoutConfirm(false)} className="rounded-xl">
                            取消
                        </Button>
                        <Button
                            onClick={confirmBatchCheckout}
                            disabled={isSubmitting || isDetectingMerge || checkoutPlans.length === 0}
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
                                {selectedStats.unboundCount > 0 && (
                                    <Button
                                        onClick={handleBatchCompleteUnbound}
                                        disabled={isSubmitting}
                                        size="xs"
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-7 px-3 text-xs"
                                    >
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        結單 ({selectedStats.unboundCount})
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
