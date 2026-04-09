'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
    Upload,
    CheckCircle2,
    Clock,
    Trash2,
    Copy,
    FileText,
    Calendar,
    Eye,
    Search,
    Link2,
    Unlink,
    RefreshCw,
    Users,
    Loader2,
    Plus,
    CalendarDays,
    PenLine,
    ArrowLeft,
    Package,
} from 'lucide-react'

// ============ 型別定義 ============

type AuctionOrderStatus = 'pending' | 'claimed' | 'cancelled'

interface AuctionOrder {
    id: string
    tenant_id?: string
    raw_input?: string
    auction_date: string | null
    winner_nickname: string
    nickname?: string
    amount: number
    product_name: string | null  // 商品名稱
    member_id: string | null
    member_name: string | null
    status: AuctionOrderStatus | 'matched' | 'error'
    order_item_id: string | null
    note: string | null
    error_message?: string
    created_at: string
    updated_at?: string
}

interface MemberOption {
    id: string
    nickname: string
    display_name: string
    line_user_id: string
    created_at?: string
}

interface GetOrdersResponse {
    success: boolean
    orders: AuctionOrder[]
    stats: { pending: number; claimed: number; total: number }
    error?: string
}

interface SearchMembersResponse {
    success: boolean
    members: MemberOption[]
    error?: string
}

interface ClaimResponse {
    success: boolean
    message: string
    error?: string
    claimed_count: number
    claimed_orders: Array<{
        id: string
        auction_date: string
        nickname: string
        amount: number
        note: string | null
        order_item_id: string
    }>
    nickname_updated: boolean
    old_nickname: string | null
    new_nickname: string
}

interface UnclaimResponse {
    success: boolean
    message: string
    error?: string
}

interface ImportResponse {
    success: boolean
    total: number
    matched: number
    pending: number
    errors: number
    results: AuctionOrder[]
    error?: string
}

interface DeleteResponse {
    success: boolean
    message: string
}

interface DeleteBatchResponse {
    success: boolean
    message: string
    deleted_count?: number
    error?: string
}

interface CreateAuctionOrderResponse {
    success: boolean
    error?: string
    message?: string
    data?: {
        id: string
        auction_date: string | null
        winner_nickname: string
        amount: number
        product_name: string | null
        note: string | null
        status: 'matched' | 'pending'
        member_id: string | null
        member_name: string | null
        order_item_id?: string
    }
}

interface ParsedEntry {
    nickname: string
    productName: string  // 商品名稱（選填）
    amounts: number[]
    totalAmount: number
    note: string
    hasMultiple: boolean
    isValid: boolean
    errorMessage?: string
}

// 格式化日期顯示
function formatAuctionDate(dateStr: string | null): string {
    if (!dateStr) return '-'
    const cleaned = dateStr.replace(/\//g, '')
    if (cleaned.length === 4) {
        const month = cleaned.substring(0, 2)
        const day = cleaned.substring(2, 4)
        return `${month}/${day}`
    }
    return dateStr
}

export default function ManualOrdersPage() {
    const router = useRouter()
    const { tenant, isLoading: tenantLoading } = useTenant()
    const supabase = createClient()

    // 頁面模式
    const [viewMode, setViewMode] = useState<'list' | 'import'>('list')

    // 所有訂單
    const [allOrders, setAllOrders] = useState<AuctionOrder[]>([])
    const [isLoadingOrders, setIsLoadingOrders] = useState(true)

    // 目前選中的日期
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    // 狀態篩選
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // 關聯會員 Modal 狀態
    const [claimModalOpen, setClaimModalOpen] = useState(false)
    const [selectedOrder, setSelectedOrder] = useState<AuctionOrder | null>(null)
    const [memberSearchKeyword, setMemberSearchKeyword] = useState('')
    const [memberSearchResults, setMemberSearchResults] = useState<MemberOption[]>([])
    const [isSearchingMembers, setIsSearchingMembers] = useState(false)
    const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
    const [isClaiming, setIsClaiming] = useState(false)
    const [updateNickname, setUpdateNickname] = useState(true)

    // 取消認領確認
    const [unclaimOrder, setUnclaimOrder] = useState<AuctionOrder | null>(null)
    const [isUnclaiming, setIsUnclaiming] = useState(false)

    // 刪除單筆確認
    const [deleteOrder, setDeleteOrder] = useState<AuctionOrder | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // 刪除整批確認
    const [deleteBatchDate, setDeleteBatchDate] = useState<string | null>(null)
    const [isDeletingBatch, setIsDeletingBatch] = useState(false)

    // 匯入狀態
    const [auctionDate, setAuctionDate] = useState(() => {
        const today = new Date()
        return `${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    })
    const [orderIsArrived, setOrderIsArrived] = useState(true) // 預設可結帳
    const [rawText, setRawText] = useState('')
    const [isImporting, setIsImporting] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    // ============ 計算屬性 ============

    const auctionDates = useMemo(() => {
        const dates = new Set<string>()
        allOrders.forEach(order => {
            if (order.auction_date && order.auction_date.trim() !== '') {
                dates.add(order.auction_date)
            }
        })
        return Array.from(dates).sort((a, b) => b.localeCompare(a))
    }, [allOrders])

    useEffect(() => {
        if (auctionDates.length > 0 && !selectedDate) {
            setSelectedDate(auctionDates[0])
        } else if (auctionDates.length === 0) {
            setSelectedDate(null)
        } else if (selectedDate && !auctionDates.includes(selectedDate)) {
            setSelectedDate(auctionDates[0] || null)
        }
    }, [auctionDates, selectedDate])

    const currentDateOrders = useMemo(() => {
        if (!selectedDate) return []
        return allOrders.filter(order => order.auction_date === selectedDate)
    }, [allOrders, selectedDate])

    const currentStats = useMemo(() => {
        const pending = currentDateOrders.filter(o => o.status === 'pending').length
        const claimed = currentDateOrders.filter(o => o.status === 'claimed' || o.status === 'matched').length
        const total = currentDateOrders.length
        const totalAmount = currentDateOrders.reduce((sum, o) => sum + (o.amount || 0), 0)
        return { pending, claimed, total, totalAmount }
    }, [currentDateOrders])

    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') return currentDateOrders
        if (statusFilter === 'pending') return currentDateOrders.filter(o => o.status === 'pending')
        if (statusFilter === 'claimed') return currentDateOrders.filter(o => o.status === 'claimed' || o.status === 'matched')
        return currentDateOrders
    }, [currentDateOrders, statusFilter])

    // ============ 資料載入 ============

    const fetchOrders = useCallback(async () => {
        if (!tenant?.id) return

        setIsLoadingOrders(true)
        try {
            const { data, error } = await supabase.rpc('get_auction_orders_v1', {
                p_tenant_id: tenant.id,
                p_status: null,
            }) as { data: GetOrdersResponse | null; error: Error | null }

            if (error) {
                toast.error(`載入失敗：${error.message}`)
                return
            }

            if (data?.success) {
                setAllOrders(data.orders || [])
            }
        } catch {
            toast.error('載入過程發生錯誤')
        } finally {
            setIsLoadingOrders(false)
        }
    }, [tenant?.id, supabase])

    useEffect(() => {
        // 確保 tenant 載入完成後才 fetch
        if (tenant?.id && !tenantLoading) {
            fetchOrders()
        }
    }, [tenant?.id, tenantLoading, fetchOrders])

    // ============ 會員搜尋 ============

    const searchMembers = useCallback(async (keyword: string) => {
        if (!tenant?.id) return

        setIsSearchingMembers(true)
        try {
            const { data, error } = await supabase.rpc('search_members_v1', {
                p_tenant_id: tenant.id,
                p_keyword: keyword || null,
                p_limit: 20,
            }) as { data: SearchMembersResponse | null; error: Error | null }

            if (error) return

            if (data?.success) {
                setMemberSearchResults(data.members || [])
            }
        } catch {
            // ignore
        } finally {
            setIsSearchingMembers(false)
        }
    }, [tenant?.id, supabase])

    useEffect(() => {
        if (claimModalOpen && tenant?.id) {
            searchMembers(memberSearchKeyword)
        }
    }, [claimModalOpen, tenant?.id, searchMembers, memberSearchKeyword])

    // ============ 關聯會員 ============

    const handleOpenClaimModal = (order: AuctionOrder) => {
        setSelectedOrder(order)
        setSelectedMember(null)
        setMemberSearchKeyword('')
        setMemberSearchResults([])
        setUpdateNickname(true)
        setClaimModalOpen(true)
    }

    const handleClaim = async () => {
        if (!tenant?.id || !selectedOrder || !selectedMember) return

        setIsClaiming(true)
        try {
            const { data, error } = await supabase.rpc('admin_claim_auction_order_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: selectedOrder.id,
                p_member_id: selectedMember.id,
                p_update_nickname: updateNickname,
            }) as { data: ClaimResponse | null; error: Error | null }

            if (error) {
                toast.error(`關聯失敗：${error.message}`)
                return
            }

            if (!data?.success) {
                toast.error(data?.message || '關聯失敗')
                return
            }

            if (data.nickname_updated) {
                toast.success(`已關聯 ${data.claimed_count} 筆訂單，會員暱稱已更新為「${data.new_nickname}」`)
            } else {
                toast.success(`已關聯 ${data.claimed_count} 筆訂單`)
            }

            setClaimModalOpen(false)
            fetchOrders()
        } catch {
            toast.error('關聯過程發生錯誤')
        } finally {
            setIsClaiming(false)
        }
    }

    // ============ 取消認領 ============

    const handleUnclaim = async () => {
        if (!tenant?.id || !unclaimOrder) return

        setIsUnclaiming(true)
        try {
            const { data, error } = await supabase.rpc('admin_unclaim_auction_order_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: unclaimOrder.id,
            }) as { data: UnclaimResponse | null; error: Error | null }

            if (error) {
                toast.error(`取消失敗：${error.message}`)
                return
            }

            if (!data?.success) {
                toast.error(data?.message || '取消失敗')
                return
            }

            toast.success(data.message || '已取消認領')
            setUnclaimOrder(null)
            fetchOrders()
        } catch {
            toast.error('取消過程發生錯誤')
        } finally {
            setIsUnclaiming(false)
        }
    }

    // ============ 刪除單筆 ============

    const handleDelete = async () => {
        if (!tenant?.id || !deleteOrder) return

        setIsDeleting(true)
        try {
            const { data, error } = await supabase.rpc('delete_auction_order_v1', {
                p_tenant_id: tenant.id,
                p_auction_order_id: deleteOrder.id,
            }) as { data: DeleteResponse | null; error: Error | null }

            if (error) {
                toast.error(`刪除失敗：${error.message}`)
                return
            }

            if (!data?.success) {
                toast.error(data?.message || '刪除失敗')
                return
            }

            toast.success(data.message || '訂單已刪除')
            setDeleteOrder(null)
            fetchOrders()
        } catch {
            toast.error('刪除過程發生錯誤')
        } finally {
            setIsDeleting(false)
        }
    }

    // ============ 刪除整批 ============

    const handleDeleteBatch = async () => {
        if (!tenant?.id || !deleteBatchDate) return

        setIsDeletingBatch(true)
        try {
            const { data, error } = await supabase.rpc('delete_auction_orders_by_date_v1', {
                p_tenant_id: tenant.id,
                p_auction_date: deleteBatchDate,
            }) as { data: DeleteBatchResponse | null; error: Error | null }

            if (error) {
                toast.error(`刪除失敗：${error.message}`)
                return
            }

            if (!data?.success) {
                toast.error(data?.message || '刪除失敗')
                return
            }

            toast.success(data.message || `已刪除 ${data.deleted_count} 筆訂單`)
            setDeleteBatchDate(null)
            fetchOrders()
        } catch {
            toast.error('刪除過程發生錯誤')
        } finally {
            setIsDeletingBatch(false)
        }
    }

    // ============ 匯入相關 ============

    // 解析邏輯：暱稱 商品名稱(選填) 金額
    // 例如：小幫手2 打鼓玩具 500 或 小幫手2 500
    const parsedEntries = useMemo((): ParsedEntry[] => {
        if (!rawText.trim()) return []

        const lines = rawText.trim().split('\n')
        return lines.map(line => {
            const trimmedLine = line.trim()
            if (!trimmedLine) {
                return { nickname: '', productName: '', amounts: [], totalAmount: 0, note: '', hasMultiple: false, isValid: false, errorMessage: '空行' }
            }

            // 從右邊往左解析：最後是金額，中間可能是商品名，剩下全是暱稱
            // 支援暱稱含空格（如 "Nicole Tung 打鼓玩具 500"）
            const parts = trimmedLine.split(/\s+/)
            if (parts.length < 2) {
                return { nickname: trimmedLine, productName: '', amounts: [], totalAmount: 0, note: '', hasMultiple: false, isValid: false, errorMessage: '缺少金額' }
            }

            // 最後一個詞為金額
            const amountPart = parts[parts.length - 1]

            // 檢查倒數第二個詞是否為金額格式，如果不是就當商品名
            let productName = ''
            let nicknameEndIndex = parts.length - 1 // 預設：暱稱到金額前

            if (parts.length >= 3) {
                const secondLast = parts[parts.length - 2]
                // 如果倒數第二個不是數字/金額格式，就當商品名
                if (!/^\d+(\+\d+)*$/.test(secondLast)) {
                    productName = secondLast
                    nicknameEndIndex = parts.length - 2
                }
            }

            // 剩下的全部是暱稱（支援含空格的暱稱）
            const nickname = parts.slice(0, nicknameEndIndex).join(' ')

            if (!nickname) {
                return { nickname: '', productName: '', amounts: [], totalAmount: 0, note: '', hasMultiple: false, isValid: false, errorMessage: '缺少暱稱' }
            }

            // 解析金額（支援 300+200 格式）
            const amountStrings = amountPart.split('+').map(s => s.trim())
            const amounts: number[] = []
            let hasError = false

            for (const amtStr of amountStrings) {
                const amt = parseInt(amtStr, 10)
                if (isNaN(amt) || amt <= 0) {
                    hasError = true
                    break
                }
                amounts.push(amt)
            }

            if (hasError || amounts.length === 0) {
                return { nickname, productName: '', amounts: [], totalAmount: 0, note: '', hasMultiple: false, isValid: false, errorMessage: '金額格式錯誤' }
            }

            const totalAmount = amounts.reduce((sum, a) => sum + a, 0)
            const hasMultiple = amounts.length > 1
            const note = hasMultiple ? amountPart : ''

            return { nickname, productName, amounts, totalAmount, note, hasMultiple, isValid: true }
        }).filter(e => e.nickname || e.errorMessage)
    }, [rawText])

    const previewStats = useMemo(() => {
        const valid = parsedEntries.filter(e => e.isValid).length
        const invalid = parsedEntries.filter(e => !e.isValid).length
        const totalAmount = parsedEntries.filter(e => e.isValid).reduce((sum, e) => sum + e.totalAmount, 0)
        return { valid, invalid, totalAmount }
    }, [parsedEntries])

    const handleImport = async () => {
        if (!tenant?.id || !rawText.trim()) {
            toast.error('請輸入名單')
            return
        }

        // 日期為選填，不需要驗證

        const validEntries = parsedEntries.filter(e => e.isValid)
        if (validEntries.length === 0) {
            toast.error('沒有有效的資料')
            return
        }

        setIsImporting(true)

        try {
            // 使用 create_auction_order_v1 逐筆建立訂單（支援 product_name）
            let matchedCount = 0
            let pendingCount = 0
            let errorCount = 0

            for (const entry of validEntries) {
                const { data, error } = await supabase.rpc('create_auction_order_v1', {
                    p_tenant_id: tenant.id,
                    p_auction_date: auctionDate.trim() || null,
                    p_winner_nickname: entry.nickname,
                    p_amount: entry.totalAmount,
                    p_product_name: entry.productName || null,
                    p_note: entry.note || null,
                    p_is_arrived: orderIsArrived,
                }) as { data: CreateAuctionOrderResponse | null; error: Error | null }

                if (error || !data?.success) {
                    errorCount++
                    console.error(`建立訂單失敗: ${entry.nickname}`, error || data?.message)
                    continue
                }

                if (data.data?.status === 'matched') {
                    matchedCount++
                } else {
                    pendingCount++
                }
            }

            if (errorCount > 0) {
                toast.warning(`匯入完成：${matchedCount} 筆已建單，${pendingCount} 筆待認領，${errorCount} 筆失敗`)
            } else {
                toast.success(`匯入完成：${matchedCount} 筆已建單，${pendingCount} 筆待認領`)
            }

            setRawText('')
            setShowPreview(false)
            setViewMode('list')
            setSelectedDate(auctionDate)
            fetchOrders()
        } catch {
            toast.error('匯入過程發生錯誤')
        } finally {
            setIsImporting(false)
        }
    }

    // 複製待認領公告
    const handleCopyAnnouncement = () => {
        const pendingOrders = currentDateOrders.filter(o => o.status === 'pending')

        if (pendingOrders.length === 0) {
            toast.error('沒有待認領的訂單')
            return
        }

        const orderList = pendingOrders
            .map(o => {
                const nickname = o.winner_nickname || o.nickname
                return `${nickname}`
            })
            .join('\n')

        const announcement = `📢 ${formatAuctionDate(selectedDate)} - 以下請私訊綁定暱稱：

${orderList}

👉 請私訊輸入：
社群個人暱稱：（你的社群暱稱）`

        navigator.clipboard.writeText(announcement)
        toast.success('已複製到剪貼簿')
    }

    // 狀態 Badge
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'claimed':
            case 'matched':
                return <Badge className="bg-success/20 text-success border-success/30">已認領</Badge>
            case 'pending':
                return <Badge className="bg-warning/20 text-warning border-warning/30">待認領</Badge>
            case 'cancelled':
                return <Badge className="bg-muted/50 text-muted-foreground border-muted">已取消</Badge>
            case 'error':
                return <Badge className="bg-destructive/20 text-destructive border-destructive/30">格式錯誤</Badge>
            default:
                return <Badge variant="outline">未知</Badge>
        }
    }

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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    onClick={() => router.push(`/admin/t/${tenant.slug}/orders`)}
                    className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    <span>返回訂單管理</span>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">手動登記</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">從 LINE 社群 +1 名單登記訂單</p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'import')} className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="list" className="gap-2">
                        <CalendarDays className="h-4 w-4" />
                        已登記列表
                    </TabsTrigger>
                    <TabsTrigger value="import" className="gap-2">
                        <Plus className="h-4 w-4" />
                        新增登記
                    </TabsTrigger>
                </TabsList>

                {/* 新增登記 Tab */}
                <TabsContent value="import" className="space-y-6">
                    <Card className="border-border/50">
                        <CardContent className="pt-6 space-y-6">
                            {/* 日期輸入 */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="auction-date" className="flex items-center gap-1.5 whitespace-nowrap">
                                        <Calendar className="h-4 w-4" />
                                        日期
                                    </Label>
                                    <Input
                                        id="auction-date"
                                        value={auctionDate}
                                        onChange={(e) => setAuctionDate(e.target.value)}
                                        placeholder="0129"
                                        className="w-24 font-mono rounded-xl"
                                        maxLength={4}
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    格式：MMDD（例如 0129），可留空
                                </p>
                            </div>

                            {/* 到貨狀態 */}
                            <div className="flex items-center gap-4">
                                <Label className="flex items-center gap-1.5 whitespace-nowrap">
                                    <Package className="h-4 w-4" />
                                    狀態
                                </Label>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="order-arrived"
                                            checked={!orderIsArrived}
                                            onChange={() => setOrderIsArrived(false)}
                                            className="accent-primary"
                                        />
                                        <span className="text-sm">未到貨</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="order-arrived"
                                            checked={orderIsArrived}
                                            onChange={() => setOrderIsArrived(true)}
                                            className="accent-primary"
                                        />
                                        <span className="text-sm">可結帳</span>
                                    </label>
                                </div>
                            </div>

                            {/* 名單輸入 */}
                            <div className="space-y-2">
                                <Label>名單（每行：暱稱 商品名稱 金額）</Label>
                                <Textarea
                                    placeholder={`小美 打鼓玩具 780\n阿華 500\n小華 可愛熊娃娃 480+570+660`}
                                    value={rawText}
                                    onChange={(e) => {
                                        setRawText(e.target.value)
                                        setShowPreview(false)
                                    }}
                                    className="min-h-[200px] font-mono text-sm rounded-xl"
                                />
                            </div>

                            {/* 操作按鈕 */}
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => setShowPreview(true)}
                                    disabled={!rawText.trim()}
                                    variant="outline"
                                    className="rounded-xl"
                                >
                                    <Eye className="mr-2 h-4 w-4" />
                                    預覽
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={isImporting || !rawText.trim() || !auctionDate.trim()}
                                    className="gradient-primary rounded-xl"
                                >
                                    {isImporting ? (
                                        <>
                                            <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                            匯入中...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="mr-2 h-4 w-4" />
                                            解析並匯入
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* 解析預覽 */}
                            {showPreview && parsedEntries.length > 0 && (
                                <div className="border rounded-xl border-amber-500/30 bg-amber-500/5 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-medium flex items-center gap-2 text-amber-600">
                                            <Eye className="h-4 w-4" />
                                            解析預覽
                                        </span>
                                        <div className="flex items-center gap-4 text-sm">
                                            <span>有效 {previewStats.valid} 筆</span>
                                            {previewStats.invalid > 0 && (
                                                <span className="text-destructive">錯誤 {previewStats.invalid} 筆</span>
                                            )}
                                            <span className="font-medium">
                                                總金額 ${previewStats.totalAmount.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead>暱稱</TableHead>
                                                    <TableHead>商品名稱</TableHead>
                                                    <TableHead className="text-right">金額</TableHead>
                                                    <TableHead>狀態</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {parsedEntries.map((entry, index) => (
                                                    <TableRow
                                                        key={index}
                                                        className={entry.isValid ? '' : 'bg-destructive/5'}
                                                    >
                                                        <TableCell className="font-medium">
                                                            {entry.nickname || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground">
                                                            {entry.productName || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {entry.isValid ? `$${entry.totalAmount.toLocaleString()}` : '-'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {entry.isValid ? (
                                                                <Badge className="bg-success/20 text-success border-success/30">
                                                                    有效
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-destructive/20 text-destructive border-destructive/30">
                                                                    {entry.errorMessage}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 已登記列表 Tab */}
                <TabsContent value="list" className="space-y-6">
                    {isLoadingOrders ? (
                        <div className="space-y-4">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-[400px] w-full rounded-xl" />
                        </div>
                    ) : auctionDates.length === 0 ? (
                        <Card className="border-border/50">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground">尚無登記資料</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    切換到「新增登記」來新增
                                </p>
                                <Button
                                    onClick={() => setViewMode('import')}
                                    className="mt-4 rounded-xl"
                                    variant="outline"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    新增登記
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* 日期選擇 */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                {auctionDates.map((date) => {
                                    const dateOrders = allOrders.filter(o => o.auction_date === date)
                                    const pendingCount = dateOrders.filter(o => o.status === 'pending').length
                                    const isSelected = selectedDate === date

                                    return (
                                        <button
                                            key={date}
                                            onClick={() => setSelectedDate(date)}
                                            className={`
                                                flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all whitespace-nowrap
                                                ${isSelected
                                                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                                    : 'bg-card hover:bg-muted border-border'
                                                }
                                            `}
                                        >
                                            <span className="font-medium">{formatAuctionDate(date)}</span>
                                            {pendingCount > 0 && (
                                                <Badge
                                                    variant="secondary"
                                                    className={`${isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-warning/20 text-warning'}`}
                                                >
                                                    {pendingCount}
                                                </Badge>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* 統計與操作 */}
                            {selectedDate && (
                                <Card className="border-border/50">
                                    <CardContent className="py-4">
                                        <div className="flex items-center justify-between flex-wrap gap-4">
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-warning" />
                                                    <span className="text-sm">待認領 <span className="font-bold">{currentStats.pending}</span></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                                    <span className="text-sm">已認領 <span className="font-bold">{currentStats.claimed}</span></span>
                                                </div>
                                                <div className="text-sm">
                                                    總金額 <span className="font-bold">${currentStats.totalAmount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                                    <SelectTrigger className="w-[100px] h-9 rounded-xl">
                                                        <SelectValue placeholder="篩選" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">全部</SelectItem>
                                                        <SelectItem value="pending">待認領</SelectItem>
                                                        <SelectItem value="claimed">已認領</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    onClick={fetchOrders}
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-xl"
                                                    disabled={isLoadingOrders}
                                                >
                                                    <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                                                </Button>
                                                {currentStats.pending > 0 && (
                                                    <Button
                                                        onClick={handleCopyAnnouncement}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-9 rounded-xl"
                                                    >
                                                        <Copy className="mr-2 h-4 w-4" />
                                                        複製公告
                                                    </Button>
                                                )}
                                                <Button
                                                    onClick={() => setDeleteBatchDate(selectedDate)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    刪除整批
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* 訂單表格 */}
                            {selectedDate && (
                                <Card className="border-border/50">
                                    <CardContent className="p-0">
                                        {filteredOrders.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                                <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                                <p className="text-muted-foreground">
                                                    {statusFilter === 'all' ? '此日期無訂單' : `沒有${statusFilter === 'pending' ? '待認領' : '已認領'}的訂單`}
                                                </p>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="pl-6">暱稱</TableHead>
                                                        <TableHead>商品名稱</TableHead>
                                                        <TableHead className="text-right">金額</TableHead>
                                                        <TableHead>狀態</TableHead>
                                                        <TableHead>會員</TableHead>
                                                        <TableHead className="w-32 text-right pr-6">操作</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <AnimatePresence>
                                                        {filteredOrders.map((order, index) => (
                                                            <motion.tr
                                                                key={order.id}
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -10 }}
                                                                transition={{ delay: index * 0.02 }}
                                                                className="group hover:bg-muted/50 transition-colors"
                                                            >
                                                                <TableCell className="font-medium pl-6">
                                                                    {order.winner_nickname || order.nickname || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-muted-foreground">
                                                                    {order.product_name || '-'}
                                                                </TableCell>
                                                                <TableCell className="text-right font-medium">
                                                                    ${(order.amount ?? 0).toLocaleString()}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {getStatusBadge(order.status)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {order.member_name ? (
                                                                        <span className="inline-flex items-center gap-1 text-success text-sm">
                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                            {order.member_name}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">-</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right pr-6">
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        {order.status === 'pending' && (
                                                                            <>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className="h-8 px-3 rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                                                                                    onClick={() => handleOpenClaimModal(order)}
                                                                                >
                                                                                    <Link2 className="h-4 w-4 mr-1" />
                                                                                    關聯
                                                                                </Button>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                                    onClick={() => setDeleteOrder(order)}
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                        {(order.status === 'claimed' || order.status === 'matched') && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-8 px-3 rounded-lg text-orange-600 hover:text-orange-600 hover:bg-orange-100"
                                                                                onClick={() => setUnclaimOrder(order)}
                                                                            >
                                                                                <Unlink className="h-4 w-4 mr-1" />
                                                                                取消
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </motion.tr>
                                                        ))}
                                                    </AnimatePresence>
                                                </TableBody>
                                            </Table>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>

            {/* 關聯會員 Modal */}
            <Dialog open={claimModalOpen} onOpenChange={setClaimModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            關聯會員
                        </DialogTitle>
                        <DialogDescription>
                            訂單：{selectedOrder?.winner_nickname || selectedOrder?.nickname}
                            {selectedOrder?.product_name && ` - ${selectedOrder.product_name}`}
                            {' '}${(selectedOrder?.amount ?? 0).toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜尋會員暱稱或名稱..."
                                value={memberSearchKeyword}
                                onChange={(e) => setMemberSearchKeyword(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>

                        <div className="border rounded-xl max-h-64 overflow-y-auto">
                            {isSearchingMembers ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : memberSearchResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        {memberSearchKeyword ? '找不到符合的會員' : '尚無會員資料'}
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {memberSearchResults.map((member) => {
                                        const joinDate = member.created_at
                                            ? new Date(member.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
                                            : null

                                        return (
                                            <button
                                                key={member.id}
                                                onClick={() => setSelectedMember(member)}
                                                className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between ${
                                                    selectedMember?.id === member.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                                                }`}
                                            >
                                                <div>
                                                    <p className="font-medium">{member.display_name || member.nickname}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        暱稱：{member.nickname}
                                                        {joinDate && <span className="ml-2 text-xs">· 加入: {joinDate}</span>}
                                                    </p>
                                                </div>
                                                {selectedMember?.id === member.id && (
                                                    <CheckCircle2 className="h-5 w-5 text-primary" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {selectedMember && selectedOrder && (
                            <div className="flex items-center space-x-2 pt-2 border-t">
                                <Checkbox
                                    id="update-nickname"
                                    checked={updateNickname}
                                    onCheckedChange={(checked) => setUpdateNickname(checked === true)}
                                />
                                <label
                                    htmlFor="update-nickname"
                                    className="text-sm font-medium leading-none cursor-pointer"
                                >
                                    同時更新會員暱稱為「{selectedOrder.winner_nickname || selectedOrder.nickname}」
                                </label>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setClaimModalOpen(false)}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleClaim}
                            disabled={!selectedMember || isClaiming}
                            className="gradient-primary rounded-xl"
                        >
                            {isClaiming ? (
                                <>
                                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                    關聯中...
                                </>
                            ) : (
                                '確認關聯'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 取消認領確認 */}
            <AlertDialog open={!!unclaimOrder} onOpenChange={() => setUnclaimOrder(null)}>
                <AlertDialogContent className="glass-strong">
                    <AlertDialogHeader>
                        <AlertDialogTitle>確定要取消認領？</AlertDialogTitle>
                        <AlertDialogDescription>
                            將取消 {unclaimOrder?.winner_nickname || unclaimOrder?.nickname} 的訂單認領，
                            訂單將回到待認領狀態。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">返回</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleUnclaim}
                            disabled={isUnclaiming}
                            className="bg-orange-600 text-white hover:bg-orange-700 rounded-xl"
                        >
                            {isUnclaiming ? '取消中...' : '確定取消認領'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 刪除單筆確認 */}
            <AlertDialog open={!!deleteOrder} onOpenChange={() => setDeleteOrder(null)}>
                <AlertDialogContent className="glass-strong">
                    <AlertDialogHeader>
                        <AlertDialogTitle>確定要刪除此訂單？</AlertDialogTitle>
                        <AlertDialogDescription>
                            將刪除 {deleteOrder?.winner_nickname || deleteOrder?.nickname} 的訂單 (金額: ${(deleteOrder?.amount ?? 0).toLocaleString()})。
                            此操作無法復原。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">返回</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                        >
                            {isDeleting ? '刪除中...' : '確定刪除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 刪除整批確認 */}
            <AlertDialog open={!!deleteBatchDate} onOpenChange={() => setDeleteBatchDate(null)}>
                <AlertDialogContent className="glass-strong">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            確定要刪除整批訂單？
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <p>
                                將刪除 <span className="font-bold">{formatAuctionDate(deleteBatchDate)}</span> 的所有訂單，
                                共 <span className="font-bold">{currentStats.total}</span> 筆，
                                總金額 <span className="font-bold">${currentStats.totalAmount.toLocaleString()}</span>。
                            </p>
                            <p className="text-destructive font-medium">
                                此操作無法復原！
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">返回</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteBatch}
                            disabled={isDeletingBatch}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                        >
                            {isDeletingBatch ? '刪除中...' : '確定刪除整批'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
