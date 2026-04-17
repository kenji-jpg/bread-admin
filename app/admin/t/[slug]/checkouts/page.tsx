'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTenant } from '@/hooks/use-tenant'
import { useCheckout, type CheckoutListItem, type CheckoutDetailResult, type ListCheckoutsResult, type CheckoutItemDetail } from '@/hooks/use-checkout'
import { SHIPPING_METHOD_OPTIONS, type ShippingMethod } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import {
    Receipt,
    Search,
    Truck,
    Bell,
    Link as LinkIcon,
    CheckCircle2,
    Clock,
    Package,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ShoppingCart,
    PackageCheck,
    ExternalLink,
    Copy,
    Trash2,
    Download,
    Calendar,
    X,
    Merge,
} from 'lucide-react'

// 狀態標籤配置 (按照後端文件)
const STATUS_LABELS: Record<string, string> = {
    'pending': '待處理',
    'url_sent': '待下單',
    'ordered': '待出貨',
    'shipped': '待收貨',
    'completed': '已完成',
    // 相容舊資料
    'ready': '待處理',
    'exported': '已匯出',
    'delivered': '已送達'
}

const STATUS_COLORS: Record<string, string> = {
    'pending': 'bg-muted text-muted-foreground',
    'url_sent': 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    'ordered': 'bg-amber-500/20 text-amber-500 border-amber-500/30',
    'shipped': 'bg-orange-500/20 text-orange-500 border-orange-500/30',
    'completed': 'bg-success/20 text-success border-success/30',
    // 相容舊資料
    'ready': 'bg-muted text-muted-foreground',
    'exported': 'bg-muted text-muted-foreground',
    'delivered': 'bg-success/20 text-success border-success/30'
}

// ========================================
// 輔助函式：從 shipping_details 或舊欄位取得值（向後相容）
// ========================================
const getShippingValue = <T,>(
    item: { shipping_details?: any; [key: string]: any },
    key: string
): T | null => {
    // 優先使用 shipping_details
    if (item.shipping_details && item.shipping_details[key] !== undefined) {
        return item.shipping_details[key] as T
    }
    // 向後相容：使用舊欄位
    return item[key] ?? null
}

// 結帳模式組件（可編輯：pending/url_sent/ordered 時可改）
function ShippingMethodCell({ item, onChangeMethod }: { item: CheckoutListItem; onChangeMethod?: (checkoutId: string, method: string) => void }) {
    const method = item.shipping_method || 'myship'
    const canEdit = onChangeMethod && !['shipped', 'completed'].includes(item.shipping_status)

    const colorClass: Record<string, string> = {
        myship: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
        delivery: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
        pickup: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30',
    }

    const labels: Record<string, string> = {
        myship: '🏪 賣貨便',
        delivery: '🚚 宅配',
        pickup: '🏠 自取',
    }

    if (!canEdit) {
        return (
            <Badge className={`${colorClass[method]} text-xs`}>
                {labels[method]}
            </Badge>
        )
    }

    return (
        <Select value={method} onValueChange={(val) => onChangeMethod(item.id, val)}>
            <SelectTrigger className="h-7 w-[110px] text-xs px-2">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="myship">🏪 賣貨便</SelectItem>
                <SelectItem value="myship_free">🏪 賣貨便(免運)</SelectItem>
                <SelectItem value="delivery">🚚 宅配</SelectItem>
                <SelectItem value="pickup">🏠 自取</SelectItem>
            </SelectContent>
        </Select>
    )
}

// 賣貨便系列判斷（含免運）
const isMyshipMethod = (method?: string | null) => method === 'myship' || method === 'myship_free'

export default function CheckoutsPage() {
    const { tenant, isLoading: tenantLoading } = useTenant()
    const [checkouts, setCheckouts] = useState<CheckoutListItem[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [shippingFilter, setShippingFilter] = useState<string>('all')
    const [paymentFilter, setPaymentFilter] = useState<string>('all')
    const [methodFilter, setMethodFilter] = useState<string>('all')  // 物流方式篩選

    // 分頁狀態
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)

    // Dialog 狀態
    const [storeUrlCheckout, setStoreUrlCheckout] = useState<CheckoutListItem | null>(null)
    const [viewDetailsCheckout, setViewDetailsCheckout] = useState<CheckoutListItem | null>(null)
    const [markOrderedCheckout, setMarkOrderedCheckout] = useState<CheckoutListItem | null>(null)
    const [checkoutDetail, setCheckoutDetail] = useState<CheckoutDetailResult | null>(null)
    const [isLoadingDetail, setIsLoadingDetail] = useState(false)

    // 表單狀態
    const [storeUrl, setStoreUrl] = useState('')
    const [myshipOrderNo, setMyshipOrderNo] = useState('')
    const [isUpdating, setIsUpdating] = useState(false)

    // 選取狀態
    const [selectedCheckouts, setSelectedCheckouts] = useState<Set<string>>(new Set())
    const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
    const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false)
    const [isMerging, setIsMerging] = useState(false)

    // 下載資料 Dialog 狀態
    const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
    const [downloadStartDate, setDownloadStartDate] = useState('')
    const [downloadEndDate, setDownloadEndDate] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)

    // 使用 hook
    const checkoutApi = useCheckout(tenant?.id || '')

    // 用 ref 來保持最新的 API 引用，避免無限循環
    const checkoutApiRef = useRef(checkoutApi)
    checkoutApiRef.current = checkoutApi

    // 載入結帳單列表
    const fetchCheckouts = useCallback(async () => {
        if (!tenant) return

        setIsLoading(true)
        try {
            const result = await checkoutApiRef.current.listCheckouts(
                shippingFilter === 'all' ? undefined : shippingFilter,
                paymentFilter === 'all' ? undefined : paymentFilter,
                pageSize,
                (currentPage - 1) * pageSize,
                debouncedSearch || undefined,
                methodFilter === 'all' ? undefined : methodFilter
            )

            if (result.success) {
                // 處理可能的不同回傳格式
                const checkoutList = (result as any).checkouts || (result as any).data || []
                setCheckouts(Array.isArray(checkoutList) ? checkoutList : [])
                setTotalCount((result as any).total || (result as any).count || checkoutList.length || 0)
            } else {
                toast.error(result.message || '載入結帳單失敗')
                setCheckouts([])
            }
        } catch (error: any) {
            console.error('載入結帳單失敗:', error)
            toast.error('載入結帳單失敗')
            setCheckouts([])
        } finally {
            setIsLoading(false)
        }
    }, [tenant?.id, shippingFilter, paymentFilter, methodFilter, pageSize, currentPage, debouncedSearch])

    // 載入結帳單詳情
    const fetchCheckoutDetail = useCallback(async (checkoutId: string) => {
        if (!tenant) return

        setIsLoadingDetail(true)
        try {
            const result = await checkoutApiRef.current.getDetail(checkoutId)
            if (result.success) {
                setCheckoutDetail(result)
            } else {
                toast.error(result.message || '載入詳情失敗')
            }
        } catch (error: any) {
            console.error('載入詳情失敗:', error)
            toast.error('載入詳情失敗')
        } finally {
            setIsLoadingDetail(false)
        }
    }, [tenant?.id])

    useEffect(() => {
        if (tenant && !tenantLoading) {
            fetchCheckouts()
        }
    }, [tenant?.id, tenantLoading, fetchCheckouts])

    useEffect(() => {
        if (viewDetailsCheckout) {
            fetchCheckoutDetail(viewDetailsCheckout.id)
        } else {
            setCheckoutDetail(null)
        }
    }, [viewDetailsCheckout?.id, fetchCheckoutDetail])

    // 搜尋防抖：輸入 300ms 後才觸發查詢
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // 當篩選條件改變時，重置到第一頁
    useEffect(() => {
        setCurrentPage(1)
    }, [shippingFilter, paymentFilter, methodFilter, pageSize, debouncedSearch])

    // 所有篩選（含搜尋、狀態、結帳模式）已由 RPC 伺服端處理
    const filteredCheckouts = checkouts

    // 統計數據
    const stats = useMemo(() => ({
        pending: checkouts.filter((c) => c.shipping_status === 'pending').length,
        urlSent: checkouts.filter((c) => c.shipping_status === 'url_sent').length,
        ordered: checkouts.filter((c) => c.shipping_status === 'ordered').length,
        shipped: checkouts.filter((c) => c.shipping_status === 'shipped').length,
        completed: checkouts.filter((c) => c.shipping_status === 'completed').length,
    }), [checkouts])

    // 分頁計算
    const totalPages = Math.ceil(totalCount / pageSize)
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + filteredCheckouts.length, totalCount)

    const getShippingBadge = (status: string) => {
        const label = STATUS_LABELS[status] || status
        const color = STATUS_COLORS[status] || 'bg-muted text-muted-foreground'
        return <Badge className={color}>{label}</Badge>
    }

    const getPaymentBadge = (status: string) => {
        if (status === 'paid') {
            return <Badge className="bg-success/20 text-success border-success/30">已付款</Badge>
        }
        return <Badge className="bg-warning/20 text-warning border-warning/30">待付款</Badge>
    }

    // 賣貨便連結 URL 驗證
    const MYSHIP_URL_PREFIX = 'https://myship.7-11.com.tw/'
    const isValidMyshipUrl = (url: string): boolean => {
        return url.startsWith(MYSHIP_URL_PREFIX)
    }

    // 錯誤碼對應訊息
    const getErrorMessage = (errorCode: string): string => {
        const errorMessages: Record<string, string> = {
            'missing_params': '缺少必要參數，請檢查表單',
            'invalid_url': '連結格式錯誤，請使用 myship.7-11 連結',
            'checkout_not_found': '找不到結帳單，請重新載入頁面',
            'url_already_set': '此單已有賣場連結',
            'invalid_status': '狀態不允許（僅待處理狀態可設定）',
            'member_no_line': '客人未綁定 LINE，請人工聯繫',
            'missing_token': '店家未設定 LINE Token，請前往設定頁',
            'rpc_error': '系統錯誤，請稍後重試',
            'network_error': '網路錯誤，請稍後重試',
        }
        return errorMessages[errorCode] || '設定失敗，請稍後重試'
    }

    // 設定賣貨便連結 (pending → url_sent) + LINE 通知
    const handleSetStoreUrl = async () => {
        if (!storeUrlCheckout || !storeUrl) return

        // 前端驗證 URL 格式
        if (!isValidMyshipUrl(storeUrl)) {
            toast.error('連結格式錯誤，請使用 myship.7-11.com.tw 連結')
            return
        }

        setIsUpdating(true)
        try {
            const displayName = storeUrlCheckout.customer_name ||
                                 storeUrlCheckout.member_display_name ||
                                 storeUrlCheckout.member_nickname ||
                                 '顧客'
            const nickname = storeUrlCheckout.member_nickname
            // 賣場名稱格式：名稱(暱稱)，與 Chrome 插件一致
            const customerName = nickname && nickname !== displayName
                ? `${displayName}(${nickname})`
                : displayName

            const result = await checkoutApiRef.current.setUrl(
                storeUrlCheckout.id,
                storeUrl,
                storeUrlCheckout.checkout_no,
                customerName
            )

            if (result.success) {
                // 根據 notify_status 顯示不同訊息
                if (result.notify_status === 'sent') {
                    toast.success('✅ 已設定連結並通知客人')
                } else if (result.notify_status === 'failed') {
                    toast.warning('⚠️ 連結已儲存，但 LINE 通知失敗（需人工聯繫）')
                } else {
                    toast.success('已設定賣貨便連結')
                }
                setStoreUrlCheckout(null)
                setStoreUrl('')
                fetchCheckouts()
            } else {
                // 根據錯誤碼顯示對應訊息
                const errorMsg = getErrorMessage(result.error || '')
                toast.error(errorMsg)
            }
        } catch (error: any) {
            toast.error(error.message || '設定失敗')
        } finally {
            setIsUpdating(false)
        }
    }

    // 標記客人已下單 (url_sent → ordered)
    const handleMarkOrdered = async () => {
        if (!markOrderedCheckout) return

        setIsUpdating(true)
        try {
            const result = await checkoutApiRef.current.markOrdered(markOrderedCheckout.id, myshipOrderNo || undefined)
            if (result.success) {
                toast.success(result.message || '已標記客人下單')
                setMarkOrderedCheckout(null)
                setMyshipOrderNo('')
                fetchCheckouts()
            } else {
                toast.error(result.message || '標記失敗')
            }
        } catch (error: any) {
            toast.error(error.message || '標記失敗')
        } finally {
            setIsUpdating(false)
        }
    }

    // 標記已寄出 (ordered → shipped)
    const handleMarkShipped = async (item: CheckoutListItem) => {
        try {
            const result = await checkoutApiRef.current.markShipped(item.id)
            if (result.success) {
                toast.success(result.message || '已標記寄出')
                fetchCheckouts()
            } else {
                toast.error(result.message || '標記失敗')
            }
        } catch (error: any) {
            toast.error(error.message || '標記失敗')
        }
    }

    // 標記已完成 (shipped → completed)
    const handleMarkCompleted = async (item: CheckoutListItem) => {
        try {
            const result = await checkoutApiRef.current.markCompleted(item.id)
            if (result.success) {
                toast.success(result.message || '已標記完成')
                fetchCheckouts()
            } else {
                toast.error(result.message || '標記失敗')
            }
        } catch (error: any) {
            toast.error(error.message || '標記失敗')
        }
    }

    // 複製連結
    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url)
        toast.success('已複製連結')
    }

    // ========================================
    // 選取與刪除功能
    // ========================================

    // 判斷是否可刪除（只有 pending/url_sent 狀態可刪除）
    const canDeleteCheckout = (status: string): boolean => {
        return ['pending', 'url_sent'].includes(status)
    }

    // 全選 / 取消全選（僅當前頁面可刪除的項目）
    const handleSelectAll = () => {
        const selectableIds = filteredCheckouts
            .filter((c) => canDeleteCheckout(c.shipping_status))
            .map((c) => c.id)

        const allSelected = selectableIds.every((id) => selectedCheckouts.has(id))

        if (allSelected) {
            // 取消選取
            const newSelected = new Set(selectedCheckouts)
            selectableIds.forEach((id) => newSelected.delete(id))
            setSelectedCheckouts(newSelected)
        } else {
            // 全選
            const newSelected = new Set(selectedCheckouts)
            selectableIds.forEach((id) => newSelected.add(id))
            setSelectedCheckouts(newSelected)
        }
    }

    // 切換單筆選取
    const toggleCheckoutSelection = (checkoutId: string) => {
        const newSelected = new Set(selectedCheckouts)
        if (newSelected.has(checkoutId)) {
            newSelected.delete(checkoutId)
        } else {
            newSelected.add(checkoutId)
        }
        setSelectedCheckouts(newSelected)
    }

    // 批量刪除
    const handleBatchDelete = async () => {
        if (selectedCheckouts.size === 0) {
            toast.error('請先選擇結帳單')
            return
        }
        setBatchDeleteConfirm(true)
    }

    const confirmBatchDelete = async () => {
        setIsUpdating(true)
        try {
            const result = await checkoutApiRef.current.batchDeleteCheckouts(Array.from(selectedCheckouts))

            if (!result.success) {
                toast.error(result.error || '刪除失敗')
                return
            }

            // 顯示結果
            toast.success(`成功刪除 ${result.deleted_count} 筆`)

            if (result.skipped_count > 0) {
                toast.warning(`${result.skipped_count} 筆因狀態限制被跳過`)
            }

            if (result.released_items > 0) {
                toast.info(`${result.released_items} 個訂單項目已回到未結帳狀態`)
            }

            setSelectedCheckouts(new Set())
            fetchCheckouts()
        } catch (error: any) {
            toast.error(error.message || '批量刪除失敗')
        } finally {
            setIsUpdating(false)
            setBatchDeleteConfirm(false)
        }
    }

    // 移除結帳單內的單一品項
    const handleRemoveItem = async (checkoutId: string, orderItemId: string, itemName: string) => {
        if (!confirm(`確定要從結帳單中移除「${itemName}」嗎？\n該品項將回到訂單管理。`)) return
        setIsUpdating(true)
        try {
            const result = await checkoutApiRef.current.removeItem(checkoutId, orderItemId)
            if (!result.success) {
                toast.error(result.error || '移除失敗')
                return
            }
            if (result.action === 'checkout_deleted') {
                toast.success(`已移除「${itemName}」，結帳單已無品項，自動刪除`)
            } else {
                toast.success(`已移除「${itemName}」，金額更新為 $${result.new_total_amount?.toLocaleString()}`)
            }
            fetchCheckouts()
        } catch (error: any) {
            toast.error(error.message || '移除失敗')
        } finally {
            setIsUpdating(false)
        }
    }

    // 變更出貨方式
    const handleChangeShippingMethod = async (checkoutId: string, newMethod: string) => {
        const checkout = checkouts.find(c => c.id === checkoutId)
        if (!checkout) return
        const oldMethod = checkout.shipping_method || 'myship'
        if (oldMethod === newMethod) return

        const methodLabels: Record<string, string> = { myship: '賣貨便', myship_free: '賣貨便(免運)', delivery: '宅配', pickup: '自取' }
        if (!confirm(`確定要將出貨方式從「${methodLabels[oldMethod]}」改為「${methodLabels[newMethod]}」嗎？\n出貨狀態會重設為「待處理」。`)) return

        setIsUpdating(true)
        try {
            const fee = newMethod === 'myship' ? 38 : newMethod === 'myship_free' ? 0 : newMethod === 'delivery' ? 0 : 0
            const result = await checkoutApiRef.current.changeShippingMethod(checkoutId, newMethod, fee)
            if (!result.success) {
                toast.error(result.error || '變更失敗')
                return
            }
            toast.success(`出貨方式已改為「${methodLabels[newMethod]}」，金額更新為 $${result.new_total_amount?.toLocaleString()}`)
            fetchCheckouts()
        } catch (error: any) {
            toast.error(error.message || '變更失敗')
        } finally {
            setIsUpdating(false)
        }
    }

    // 計算可刪除數量
    const deletableCount = useMemo(() => {
        return Array.from(selectedCheckouts).filter((id) => {
            const checkout = checkouts.find((c) => c.id === id)
            return checkout && canDeleteCheckout(checkout.shipping_status)
        }).length
    }, [selectedCheckouts, checkouts])

    // 合併驗證
    const mergeInfo = useMemo(() => {
        const ids = Array.from(selectedCheckouts)
        if (ids.length < 2) return { canMerge: false, reason: '請選取至少 2 張' }
        const selected = ids.map(id => checkouts.find(c => c.id === id)).filter(Boolean) as CheckoutListItem[]
        // 狀態檢查
        if (selected.some(c => !['pending', 'url_sent'].includes(c.shipping_status))) {
            return { canMerge: false, reason: '含有非待處理/待下單的結帳單' }
        }
        // 同一會員（用 customer_name 判斷）
        const customerNames = new Set(selected.map(c => c.customer_name))
        if (customerNames.size > 1) return { canMerge: false, reason: '不同會員無法合併' }
        // 預估金額
        const estimatedTotal = selected.reduce((sum, c) => sum + c.total_amount, 0)
        const customerName = selected[0]?.customer_name || '未知'
        const shippingMethod = selected[0]?.shipping_method || 'myship'
        const threshold = (tenant as Record<string, unknown>)?.free_shipping_threshold as number || 3500
        const willAutoFree = threshold > 0 && estimatedTotal >= threshold && shippingMethod === 'myship'
        return { canMerge: true, estimatedTotal, customerName, count: selected.length, willAutoFree, shippingMethod }
    }, [selectedCheckouts, checkouts])

    // 合併處理
    const handleMergeCheckouts = async () => {
        setIsMerging(true)
        try {
            const result = await checkoutApiRef.current.mergeCheckouts(Array.from(selectedCheckouts))
            if (result.success) {
                toast.success(
                    `已合併為 ${result.checkout_no}（$${result.new_total?.toLocaleString()}，${result.item_count} 件）` +
                    (result.auto_free_shipping ? ' 🎉 已自動切換為免運' : '')
                )
                setSelectedCheckouts(new Set())
                setMergeConfirmOpen(false)
                fetchCheckouts()
            } else {
                toast.error(result.error || '合併失敗')
            }
        } catch {
            toast.error('合併失敗')
        } finally {
            setIsMerging(false)
        }
    }

    // ========================================
    // 下載資料功能
    // ========================================

    // 物流方式標籤
    const SHIPPING_METHOD_LABELS: Record<string, string> = {
        myship: '賣貨便',
        delivery: '宅配',
        pickup: '自取',
    }

    // 下載 CSV
    const handleDownloadCSV = () => {
        // 驗證日期
        if (!downloadStartDate || !downloadEndDate) {
            toast.error('請選擇日期區間')
            return
        }

        const startDate = new Date(downloadStartDate)
        const endDate = new Date(downloadEndDate)

        // 設定結束日期為當天的最後一刻
        endDate.setHours(23, 59, 59, 999)

        if (startDate > endDate) {
            toast.error('開始日期不能晚於結束日期')
            return
        }

        setIsDownloading(true)

        try {
            // 根據日期區間篩選資料
            const filteredData = checkouts.filter((item) => {
                const itemDate = new Date(item.created_at)
                return itemDate >= startDate && itemDate <= endDate
            })

            if (filteredData.length === 0) {
                toast.warning('所選日期區間內沒有資料')
                setIsDownloading(false)
                return
            }

            // 定義 CSV 欄位
            const headers = [
                '結帳編號',
                '客戶名稱',
                '總金額',
                '運費',
                '商品數量',
                '付款狀態',
                '出貨狀態',
                '物流方式',
                '是否已通知',
                '建立時間',
            ]

            // 產生 CSV 資料列
            const rows = filteredData.map((item) => [
                item.checkout_no,
                item.customer_name || item.member_display_name || item.member_nickname || '',
                item.total_amount,
                !isMyshipMethod(item.shipping_method || 'myship') ? item.shipping_fee : '',
                item.item_count,
                item.payment_status === 'paid' ? '已付款' : '待付款',
                STATUS_LABELS[item.shipping_status] || item.shipping_status,
                SHIPPING_METHOD_LABELS[item.shipping_method || 'myship'] || item.shipping_method || '',
                item.is_notified ? '是' : '否',
                new Date(item.created_at).toLocaleString('zh-TW'),
            ])

            // 產生 CSV 內容
            const csvContent = [headers, ...rows]
                .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n')

            // 下載檔案
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `checkouts_${downloadStartDate}_${downloadEndDate}.csv`
            link.click()
            URL.revokeObjectURL(url)

            toast.success(`已下載 ${filteredData.length} 筆資料`)
            setDownloadDialogOpen(false)
            setDownloadStartDate('')
            setDownloadEndDate('')
        } catch (error: any) {
            console.error('下載失敗:', error)
            toast.error('下載失敗')
        } finally {
            setIsDownloading(false)
        }
    }

    // 當前頁面可選取項目數
    const selectableCount = useMemo(() => {
        return filteredCheckouts.filter((c) => canDeleteCheckout(c.shipping_status)).length
    }, [filteredCheckouts])

    // 當前頁面是否全選
    const isAllSelected = useMemo(() => {
        const selectableIds = filteredCheckouts
            .filter((c) => canDeleteCheckout(c.shipping_status))
            .map((c) => c.id)
        return selectableIds.length > 0 && selectableIds.every((id) => selectedCheckouts.has(id))
    }, [filteredCheckouts, selectedCheckouts])

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
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    <span className="gradient-text">結帳單管理</span>
                </h1>
                <p className="text-muted-foreground mt-1">管理付款與出貨狀態</p>
            </div>

            {/* Stats Summary */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <Clock className="h-5 w-5 text-muted-foreground" />
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
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                                <LinkIcon className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.urlSent}</p>
                                <p className="text-sm text-muted-foreground">待下單</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                                <ShoppingCart className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.ordered}</p>
                                <p className="text-sm text-muted-foreground">待出貨</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                                <Package className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.shipped}</p>
                                <p className="text-sm text-muted-foreground">待收貨</p>
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
            </div>

            {/* Filters */}
            <Card className="border-border/50">
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜尋單號、客戶、商品..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-xl"
                            />
                        </div>
                        <Select value={shippingFilter} onValueChange={setShippingFilter}>
                            <SelectTrigger className="w-[140px] rounded-xl">
                                <Truck className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="出貨狀態" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部狀態</SelectItem>
                                <SelectItem value="pending">待處理</SelectItem>
                                <SelectItem value="url_sent">待下單</SelectItem>
                                <SelectItem value="ordered">待出貨</SelectItem>
                                <SelectItem value="shipped">待收貨</SelectItem>
                                <SelectItem value="completed">已完成</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                            <SelectTrigger className="w-[140px] rounded-xl">
                                <SelectValue placeholder="付款狀態" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部付款</SelectItem>
                                <SelectItem value="pending">待付款</SelectItem>
                                <SelectItem value="paid">已付款</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={methodFilter} onValueChange={setMethodFilter}>
                            <SelectTrigger className="w-[150px] rounded-xl">
                                <Package className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="結帳模式" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部結帳模式</SelectItem>
                                <SelectItem value="myship">🏪 賣貨便</SelectItem>
                                <SelectItem value="myship_free">🏪 賣貨便(免運)</SelectItem>
                                <SelectItem value="delivery">🚚 宅配</SelectItem>
                                <SelectItem value="pickup">🏠 自取</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setDownloadDialogOpen(true)}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            下載資料
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 批量操作工具列（sticky 固定在底部） */}
            {selectedCheckouts.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <Card className="border-border/50 bg-background/95 backdrop-blur-sm shadow-lg">
                        <CardContent className="py-3 px-5">
                            <div className="flex items-center gap-4">
                                <span className="text-sm">
                                    已選擇 <span className="font-bold">{selectedCheckouts.size}</span> 筆
                                    {deletableCount < selectedCheckouts.size && (
                                        <span className="text-muted-foreground">
                                            （{deletableCount} 筆可刪除）
                                        </span>
                                    )}
                                </span>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setMergeConfirmOpen(true)}
                                    disabled={!mergeInfo.canMerge}
                                    className="rounded-xl"
                                    title={!mergeInfo.canMerge ? mergeInfo.reason : undefined}
                                >
                                    <Merge className="h-4 w-4 mr-2" />
                                    合併結帳單
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleBatchDelete}
                                    disabled={deletableCount === 0}
                                    className="rounded-xl"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    刪除選取
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedCheckouts(new Set())}
                                    className="rounded-xl"
                                >
                                    取消選取
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Checkouts Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                        </div>
                    ) : filteredCheckouts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">尚無結帳單</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table className="min-w-[1100px]">
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-10 pl-4">
                                            <Checkbox
                                                checked={isAllSelected}
                                                onCheckedChange={handleSelectAll}
                                                disabled={selectableCount === 0}
                                                aria-label="全選"
                                            />
                                        </TableHead>
                                        <TableHead className="w-[110px]">單號</TableHead>
                                        <TableHead className="w-[140px]">客戶</TableHead>
                                        <TableHead className="text-right w-[100px]">金額</TableHead>
                                        <TableHead className="w-[220px]">商品明細</TableHead>
                                        <TableHead className="w-[72px]">付款</TableHead>
                                        <TableHead className="w-[72px]">出貨</TableHead>
                                        <TableHead className="w-[110px]">結帳模式</TableHead>
                                        <TableHead className="w-[72px]">通知</TableHead>
                                        <TableHead className="w-[80px]">時間</TableHead>
                                        <TableHead className="w-[80px] pr-4">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredCheckouts.map((item, index) => (
                                        <motion.tr
                                            key={item.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className={`group hover:bg-muted/50 transition-colors ${selectedCheckouts.has(item.id) ? 'bg-muted/30' : ''}`}
                                        >
                                            <TableCell className="pl-4">
                                                <Checkbox
                                                    checked={selectedCheckouts.has(item.id)}
                                                    onCheckedChange={() => toggleCheckoutSelection(item.id)}
                                                    disabled={!canDeleteCheckout(item.shipping_status)}
                                                    aria-label={`選取 ${item.checkout_no}`}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {item.checkout_no}
                                                </code>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="truncate max-w-[140px]">
                                                    {item.customer_name || item.member_display_name || '-'}
                                                    {item.member_nickname && (
                                                        <span className="text-muted-foreground ml-1">({item.member_nickname})</span>
                                                    )}
                                                </div>
                                                {item.member_line_user_id && (
                                                    <Badge variant="outline" className="mt-0.5 text-[10px] px-1 py-0">
                                                        LINE
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold whitespace-nowrap">
                                                ${item.total_amount.toLocaleString()}
                                                {item.shipping_fee > 0 && item.shipping_method !== 'myship' && (
                                                    <div className="text-[10px] text-muted-foreground">
                                                        (+${item.shipping_fee}運費)
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[220px]">
                                                {(() => {
                                                    if (!item.checkout_items) return <span className="text-muted-foreground">-</span>
                                                    try {
                                                        const items: CheckoutItemDetail[] = JSON.parse(item.checkout_items)
                                                        if (items.length === 0) return <span className="text-muted-foreground">-</span>

                                                        const preview = (
                                                            <div className="text-xs space-y-0.5">
                                                                {items.slice(0, 3).map((detail, idx) => (
                                                                    <div key={idx} className="truncate flex justify-between gap-2">
                                                                        <span className="truncate">{detail.name}{detail.variant_name ? `（${detail.variant_name}）` : ''} x{detail.qty}</span>
                                                                        <span className="shrink-0 text-muted-foreground">${detail.subtotal.toLocaleString()}</span>
                                                                    </div>
                                                                ))}
                                                                {items.length > 3 && (
                                                                    <div className="text-muted-foreground">
                                                                        ...還有 {items.length - 3} 項
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )

                                                        return (
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button className="text-left cursor-pointer hover:bg-muted/50 rounded-md px-1 py-0.5 -mx-1 transition-colors">
                                                                        {preview}
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent align="start" className="w-80 p-0">
                                                                    <div className="px-4 py-3 border-b flex items-center justify-between">
                                                                        <p className="font-medium text-sm">商品明細（共 {items.length} 項）</p>
                                                                        {!['shipped', 'completed'].includes(item.shipping_status) && (
                                                                            <span className="text-[10px] text-muted-foreground">點 ✕ 移除品項</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="max-h-64 overflow-y-auto">
                                                                        {items.map((detail, idx) => {
                                                                            const canRemove = !['shipped', 'completed'].includes(item.shipping_status) && items.length > 0
                                                                            return (
                                                                                <div
                                                                                    key={idx}
                                                                                    className="flex items-center justify-between px-4 py-2 text-sm border-b last:border-b-0 group"
                                                                                >
                                                                                    <span className="truncate mr-2 flex-1">{detail.name}{detail.variant_name ? `（${detail.variant_name}）` : ''}</span>
                                                                                    <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                                                                                        <span>x{detail.qty}</span>
                                                                                        <span className="w-16 text-right font-medium text-foreground">
                                                                                            ${detail.subtotal.toLocaleString()}
                                                                                        </span>
                                                                                        {canRemove && detail.order_item_id && (
                                                                                            <button
                                                                                                className="text-destructive/60 hover:text-destructive transition-colors ml-1 p-0.5 rounded hover:bg-destructive/10"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation()
                                                                                                    handleRemoveItem(item.id, detail.order_item_id!, detail.name)
                                                                                                }}
                                                                                                title="移除此品項"
                                                                                            >
                                                                                                <X className="h-3.5 w-3.5" />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-t font-medium text-sm">
                                                                        <span>合計</span>
                                                                        <span>${items.reduce((sum, d) => sum + d.subtotal, 0).toLocaleString()}</span>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        )
                                                    } catch {
                                                        return <span className="text-muted-foreground">-</span>
                                                    }
                                                })()}
                                            </TableCell>
                                            <TableCell>{getPaymentBadge(item.payment_status)}</TableCell>
                                            <TableCell>{getShippingBadge(item.shipping_status)}</TableCell>
                                            {/* 結帳模式欄位 */}
                                            <TableCell>
                                                <ShippingMethodCell item={item} onChangeMethod={handleChangeShippingMethod} />
                                            </TableCell>
                                            {/* 通知狀態欄位 */}
                                            <TableCell>
                                                {item.is_notified ? (
                                                    <Badge
                                                        className="bg-success/20 text-success border-success/30 cursor-pointer hover:bg-success/30"
                                                        onClick={() => toast.info('通知功能開發中')}
                                                    >
                                                        <Bell className="h-3 w-3 mr-1" />
                                                        已通知
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="cursor-pointer hover:bg-muted"
                                                        onClick={() => toast.info('通知功能開發中')}
                                                    >
                                                        <Bell className="h-3 w-3 mr-1" />
                                                        未通知
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                                                {new Date(item.created_at).toLocaleDateString('zh-TW')}
                                            </TableCell>
                                            {/* 操作按鈕 - 根據結帳模式和狀態顯示下一步操作 */}
                                            <TableCell className="pr-4">
                                                {(() => {
                                                    const method = item.shipping_method || 'myship'
                                                    const storeUrl = getShippingValue<string>(item, 'store_url')

                                                    switch (item.shipping_status) {
                                                        case 'pending':
                                                            // 賣貨便：需要先設定連結
                                                            // 宅配/自取：可直接標記已收款
                                                            if (isMyshipMethod(method)) {
                                                                return (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 text-xs"
                                                                        onClick={() => {
                                                                            setStoreUrl('')
                                                                            setStoreUrlCheckout(item)
                                                                        }}
                                                                    >
                                                                        <LinkIcon className="h-3.5 w-3.5 mr-1" />
                                                                        設定連結
                                                                    </Button>
                                                                )
                                                            }
                                                            return (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => {
                                                                        setMyshipOrderNo('')
                                                                        setMarkOrderedCheckout(item)
                                                                    }}
                                                                >
                                                                    {method === 'pickup' ? '確認自取' : '已收款'}
                                                                </Button>
                                                            )
                                                        case 'url_sent':
                                                            // 賣貨便專屬狀態：顯示連結操作 + 已下單按鈕
                                                            return (
                                                                <div className="flex items-center gap-1">
                                                                    {storeUrl && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-7 w-7"
                                                                            onClick={() => window.open(storeUrl, '_blank')}
                                                                            title="開啟連結"
                                                                        >
                                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    )}
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 text-xs"
                                                                        onClick={() => {
                                                                            setMyshipOrderNo('')
                                                                            setMarkOrderedCheckout(item)
                                                                        }}
                                                                    >
                                                                        已下單
                                                                    </Button>
                                                                </div>
                                                            )
                                                        case 'ordered':
                                                            // 自取模式：直接完成（不需要寄出）
                                                            if (method === 'pickup') {
                                                                return (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 text-xs"
                                                                        onClick={() => handleMarkCompleted(item)}
                                                                    >
                                                                        已完成
                                                                    </Button>
                                                                )
                                                            }
                                                            return (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => handleMarkShipped(item)}
                                                                >
                                                                    已寄出
                                                                </Button>
                                                            )
                                                        case 'shipped':
                                                            return (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => handleMarkCompleted(item)}
                                                                >
                                                                    已完成
                                                                </Button>
                                                            )
                                                        case 'completed':
                                                            return (
                                                                <span className="text-xs text-muted-foreground">-</span>
                                                            )
                                                        default:
                                                            return (
                                                                <span className="text-xs text-muted-foreground">-</span>
                                                            )
                                                    }
                                                })()}
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
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">筆</span>
                        </div>
                    </div>

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

                        <div className="flex items-center gap-1 mx-2">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((page) => {
                                    if (page === 1 || page === totalPages) return true
                                    if (Math.abs(page - currentPage) <= 1) return true
                                    return false
                                })
                                .map((page, index, arr) => {
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

            {/* Store URL Dialog */}
            <Dialog open={!!storeUrlCheckout} onOpenChange={() => setStoreUrlCheckout(null)}>
                <DialogContent className="glass-strong">
                    <DialogHeader>
                        <DialogTitle>設定賣貨便連結</DialogTitle>
                        <DialogDescription>
                            為結帳單 {storeUrlCheckout?.checkout_no} 設定賣貨便連結，設定後將自動通知客人
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="storeUrl">賣貨便連結</Label>
                            <Input
                                id="storeUrl"
                                type="url"
                                placeholder="https://myship.7-11.com.tw/cart/confirm/..."
                                value={storeUrl}
                                onChange={(e) => setStoreUrl(e.target.value)}
                                className={`rounded-xl ${storeUrl && !isValidMyshipUrl(storeUrl) ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            />
                            {storeUrl && !isValidMyshipUrl(storeUrl) ? (
                                <p className="text-xs text-destructive">
                                    ⚠️ 連結必須以 https://myship.7-11.com.tw/ 開頭
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    請貼上 myship.7-11.com.tw 的連結，設定後會透過 LINE 通知客人
                                </p>
                            )}
                        </div>
                        {/* 顯示客人資訊 */}
                        {storeUrlCheckout && (
                            <div className="rounded-lg bg-muted/50 p-3 text-sm">
                                <p className="text-muted-foreground">
                                    客人：<span className="text-foreground font-medium">
                                        {storeUrlCheckout.customer_name || storeUrlCheckout.member_display_name || storeUrlCheckout.member_nickname || '未知'}
                                    </span>
                                </p>
                                {storeUrlCheckout.member_line_user_id ? (
                                    <p className="text-success text-xs mt-1">✓ 已綁定 LINE，將自動發送通知</p>
                                ) : (
                                    <p className="text-warning text-xs mt-1">⚠ 未綁定 LINE，設定後需人工通知</p>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setStoreUrlCheckout(null)}
                            className="rounded-xl"
                            disabled={isUpdating}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleSetStoreUrl}
                            disabled={!storeUrl || !isValidMyshipUrl(storeUrl) || isUpdating}
                            className="gradient-primary rounded-xl"
                        >
                            {isUpdating ? '處理中...' : '確認並通知'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mark Ordered Dialog - 根據結帳模式顯示不同內容 */}
            <Dialog open={!!markOrderedCheckout} onOpenChange={() => setMarkOrderedCheckout(null)}>
                <DialogContent className="glass-strong">
                    <DialogHeader>
                        <DialogTitle>
                            {(() => {
                                const method = markOrderedCheckout?.shipping_method || 'myship'
                                if (method === 'delivery') return '確認已收款'
                                if (method === 'pickup') return '確認自取'
                                return '標記客人已下單'
                            })()}
                        </DialogTitle>
                        <DialogDescription>
                            {(() => {
                                const method = markOrderedCheckout?.shipping_method || 'myship'
                                const name = markOrderedCheckout?.customer_name || markOrderedCheckout?.member_display_name || '客人'
                                if (method === 'delivery') return `確認已收到 ${name} 的款項`
                                if (method === 'pickup') return `確認 ${name} 將自取商品`
                                return `確認 ${name} 已在賣貨便下單`
                            })()}
                        </DialogDescription>
                    </DialogHeader>
                    {/* 賣貨便模式才顯示訂單編號輸入 */}
                    {isMyshipMethod(markOrderedCheckout?.shipping_method || 'myship') && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="myshipOrderNo">賣貨便訂單編號（選填）</Label>
                                <Input
                                    id="myshipOrderNo"
                                    placeholder="例如: CM2601147202399"
                                    value={myshipOrderNo}
                                    onChange={(e) => setMyshipOrderNo(e.target.value)}
                                    className="rounded-xl"
                                />
                                <p className="text-xs text-muted-foreground">
                                    可選擇輸入賣貨便訂單編號，方便未來對帳
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setMarkOrderedCheckout(null)}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleMarkOrdered}
                            disabled={isUpdating}
                            className="gradient-primary rounded-xl"
                        >
                            {(() => {
                                if (isUpdating) return '處理中...'
                                const method = markOrderedCheckout?.shipping_method || 'myship'
                                if (method === 'delivery') return '確認收款'
                                if (method === 'pickup') return '確認自取'
                                return '確認已下單'
                            })()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Checkout Details Dialog */}
            <Dialog open={!!viewDetailsCheckout} onOpenChange={() => setViewDetailsCheckout(null)}>
                <DialogContent className="glass-strong max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>結帳單明細</DialogTitle>
                        <DialogDescription>
                            單號：{viewDetailsCheckout?.checkout_no}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {isLoadingDetail ? (
                            <div className="space-y-4 py-4">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                                ))}
                            </div>
                        ) : checkoutDetail?.success ? (
                            <div className="space-y-4">
                                {/* 狀態資訊 */}
                                <div className="flex flex-wrap gap-2 pb-4 border-b">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">付款:</span>
                                        {getPaymentBadge(checkoutDetail.checkout?.payment_status || 'pending')}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">出貨:</span>
                                        {getShippingBadge(checkoutDetail.checkout?.shipping_status || 'pending')}
                                    </div>
                                    {(() => {
                                        const myshipOrderNo = checkoutDetail.checkout
                                            ? getShippingValue<string>(checkoutDetail.checkout, 'myship_order_no')
                                            : null
                                        return myshipOrderNo && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">賣貨便單號:</span>
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {myshipOrderNo}
                                                </code>
                                            </div>
                                        )
                                    })()}
                                </div>

                                {/* 商品列表 */}
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>商品名稱</TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead className="text-right">數量</TableHead>
                                            <TableHead className="text-right">單價</TableHead>
                                            <TableHead className="text-right">小計</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {checkoutDetail.items?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">
                                                    {item.item_name || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                        {item.sku}
                                                    </code>
                                                </TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell className="text-right">${item.unit_price}</TableCell>
                                                <TableCell className="text-right font-medium">
                                                    ${item.subtotal.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(checkoutDetail.checkout?.shipping_fee ?? 0) > 0 && !isMyshipMethod(checkoutDetail.checkout?.shipping_method) && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-right text-muted-foreground">運費</TableCell>
                                                <TableCell className="text-right">
                                                    ${checkoutDetail.checkout?.shipping_fee?.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="bg-muted/50">
                                            <TableCell colSpan={4} className="text-right font-bold">總計</TableCell>
                                            <TableCell className="text-right font-bold text-lg">
                                                ${((checkoutDetail.checkout?.total_amount ?? 0) + (!isMyshipMethod(checkoutDetail.checkout?.shipping_method) ? (checkoutDetail.checkout?.shipping_fee ?? 0) : 0)).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                        {/* 成本摘要（僅有成本資料時顯示） */}
                                        {(() => {
                                            const items = checkoutDetail.items || []
                                            const totalCost = items.reduce((sum, item) => {
                                                if (item.cost != null && item.cost > 0) return sum + item.quantity * item.cost
                                                return sum
                                            }, 0)
                                            const hasCost = items.some(item => item.cost != null && item.cost > 0)
                                            if (!hasCost) return null
                                            const totalRevenue = (checkoutDetail.checkout?.total_amount ?? 0)
                                            const profit = totalRevenue - totalCost
                                            const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0
                                            return (
                                                <>
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-right text-muted-foreground">成本合計</TableCell>
                                                        <TableCell className="text-right text-muted-foreground">
                                                            ${totalCost.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow className="bg-emerald-50 dark:bg-emerald-950/20">
                                                        <TableCell colSpan={4} className="text-right font-bold text-emerald-700 dark:text-emerald-400">
                                                            預估利潤 <span className="font-normal text-sm ml-1">（毛利 {margin}%）</span>
                                                        </TableCell>
                                                        <TableCell className={`text-right font-bold text-lg ${profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-500'}`}>
                                                            ${profit.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                </>
                                            )
                                        })()}
                                    </TableBody>
                                </Table>

                                {/* 賣貨便連結 */}
                                {(() => {
                                    const storeUrl = checkoutDetail.checkout
                                        ? getShippingValue<string>(checkoutDetail.checkout, 'store_url')
                                        : null
                                    return storeUrl && (
                                        <div className="pt-4 border-t">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">賣貨便連結:</span>
                                                <Button
                                                    variant="link"
                                                    size="sm"
                                                    className="h-auto p-0"
                                                    onClick={() => window.open(storeUrl, '_blank')}
                                                >
                                                    開啟連結 <ExternalLink className="ml-1 h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleCopyUrl(storeUrl)}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">無法載入詳情</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Batch Delete Confirm AlertDialog */}
            <AlertDialog open={batchDeleteConfirm} onOpenChange={setBatchDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>確認刪除</AlertDialogTitle>
                        <AlertDialogDescription>
                            已選擇 {selectedCheckouts.size} 筆結帳單，其中 {deletableCount} 筆可刪除。
                            {deletableCount < selectedCheckouts.size && (
                                <span className="block mt-1 text-warning">
                                    不可刪除的結帳單（已下單/已寄出/已完成）將被跳過。
                                </span>
                            )}
                            <span className="block mt-2">
                                刪除後，相關訂單項目將回到未結帳狀態，可重新結帳。
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isUpdating}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmBatchDelete}
                            disabled={isUpdating || deletableCount === 0}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isUpdating ? '刪除中...' : `確認刪除 (${deletableCount} 筆)`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 合併確認 Dialog */}
            <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>合併結帳單</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <p>
                                    將 <span className="font-bold">{mergeInfo.canMerge && 'count' in mergeInfo ? mergeInfo.count : 0}</span> 張結帳單合併為一張
                                    （會員：{mergeInfo.canMerge && 'customerName' in mergeInfo ? mergeInfo.customerName : '-'}）
                                </p>
                                <p>
                                    合併後預估金額：<span className="font-bold text-primary">${mergeInfo.canMerge && 'estimatedTotal' in mergeInfo ? mergeInfo.estimatedTotal?.toLocaleString() : 0}</span>
                                </p>
                                {mergeInfo.canMerge && 'willAutoFree' in mergeInfo && mergeInfo.willAutoFree && (
                                    <p className="text-green-600 font-medium">
                                        🎉 金額達免運門檻，將自動切換為賣貨便(免運)
                                    </p>
                                )}
                                <p className="text-muted-foreground text-xs mt-2">
                                    合併後以最早的結帳單為主單，其餘結帳單將被刪除。
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isMerging}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleMergeCheckouts}
                            disabled={isMerging}
                        >
                            {isMerging ? '合併中...' : '確認合併'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Download Data Dialog */}
            <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
                <DialogContent className="glass-strong sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            下載結帳單資料
                        </DialogTitle>
                        <DialogDescription>
                            選擇日期區間，將依據每筆結帳單的建立時間篩選並匯出 CSV 檔案
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="startDate" className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                開始日期
                            </Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={downloadStartDate}
                                onChange={(e) => setDownloadStartDate(e.target.value)}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endDate" className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                結束日期
                            </Label>
                            <Input
                                id="endDate"
                                type="date"
                                value={downloadEndDate}
                                onChange={(e) => setDownloadEndDate(e.target.value)}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                            <p>📊 將匯出以下欄位：結帳編號、客戶名稱、總金額、運費、商品數量、付款狀態、出貨狀態、物流方式、是否已通知、建立時間</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDownloadDialogOpen(false)
                                setDownloadStartDate('')
                                setDownloadEndDate('')
                            }}
                            className="rounded-xl"
                            disabled={isDownloading}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleDownloadCSV}
                            disabled={!downloadStartDate || !downloadEndDate || isDownloading}
                            className="gradient-primary rounded-xl"
                        >
                            {isDownloading ? '下載中...' : '下載 CSV'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}
