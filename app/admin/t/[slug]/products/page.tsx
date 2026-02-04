'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { batchUpdateProductStatus } from '@/hooks/use-secure-mutations'
import { useSidebar } from '@/hooks/use-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Product } from '@/types/database'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import type { RestockResponse, OrderItem } from '@/types/database'
import {
    Package,
    Plus,
    Search,
    Power,
    Image as ImageIcon,
    Trash2,
    ChevronRight,
    ChevronDown,
    ChevronLeft,
    ChevronsLeft,
    ChevronsRight,
    PackagePlus,
    ChevronsUpDown,
    Check,
    Clock,
    Hash,
} from 'lucide-react'
import { CopyOrderButton } from './copy-order-button'

// Interfaces & Helpers
interface ProductVariant extends Product {
    variantName: string;
}

interface ProductGroup {
    groupSku: string;
    baseName: string;
    price: number;
    image_url: string | null;
    status: string;
    category: string | null;
    is_limited: boolean;
    limit_qty: number | null;
    end_time: string | null;
    totalStock: number;
    totalSold: number;
    variants: ProductVariant[];
    mainProduct?: Product;
}

const isVariant = (sku: string): boolean => sku.includes('_');
const getGroupSku = (sku: string): string => sku.split('_')[0];
const getVariantName = (sku: string): string | null => {
    const parts = sku.split('_');
    return parts.length > 1 ? parts[1] : null;
};

const groupProducts = (products: Product[]): ProductGroup[] => {
    const groups: Map<string, ProductGroup> = new Map();

    products.forEach(product => {
        const groupSku = getGroupSku(product.sku);
        const variantName = getVariantName(product.sku);

        if (!groups.has(groupSku)) {
            groups.set(groupSku, {
                groupSku,
                baseName: variantName
                    ? product.name.split('-').length > 1 ? product.name.replace(`-${variantName}`, '') : product.name
                    : product.name,
                price: product.price,
                image_url: product.image_url,
                status: product.status,
                category: product.category,
                is_limited: product.is_limited,
                limit_qty: product.limit_qty,
                end_time: product.end_time,
                totalStock: 0,
                totalSold: 0,
                variants: [],
            });
        }

        const group = groups.get(groupSku)!;
        group.totalStock += product.stock;
        group.totalSold += product.sold_qty;

        if (variantName) {
            group.variants.push({
                ...product,
                variantName
            });
        } else {
            group.mainProduct = product;
        }
    });

    // Sort variants by sold_qty desc
    groups.forEach(group => {
        group.variants.sort((a, b) => b.sold_qty - a.sold_qty);
    });

    return Array.from(groups.values());
};

const ProductRow = ({
    group,
    onEdit,
    lineOaId,
    selectedProducts,
    onToggleSelection,
}: {
    group: ProductGroup,
    onEdit: (product: Product) => void,
    lineOaId: string,
    selectedProducts: Set<string>,
    onToggleSelection: (productId: string) => void,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasVariants = group.variants.length > 0;

    // Determine the product to use for single-product actions
    const mainProduct = group.mainProduct;

    // Prepare proxy product for generic fields if mainProduct handles
    // If hasVariants, we need a representative product for fields like end_time, price, etc.
    // group has some fields, but `generateOrderMessage` expects a `Product` object.
    // We can use the first variant as a base and override its name with group.baseName.
    const displayProductForCopy: Product | null = hasVariants
        ? (group.variants[0] ? { ...group.variants[0], name: group.baseName, price: group.price } : null)
        : (mainProduct || null);

    // Use router hook outside or pass navigation handler? 
    // We update onEdit to handle navigation or just pass the function.
    // The parent passes onEdit which calls router.push. Perfect.

    // 點擊整行進入編輯頁面（排除操作按鈕區域）
    const handleRowClick = () => {
        const productToEdit = mainProduct || group.variants[0];
        if (productToEdit) {
            onEdit(productToEdit);
        }
    };

    // 取得此群組的所有商品 ID
    const allProductIds = hasVariants
        ? group.variants.map(v => v.id)
        : (mainProduct ? [mainProduct.id] : [])

    // 檢查是否所有商品都被選中
    const isGroupSelected = allProductIds.length > 0 && allProductIds.every(id => selectedProducts.has(id))
    const isGroupPartialSelected = allProductIds.some(id => selectedProducts.has(id)) && !isGroupSelected

    // 切換群組選取
    const handleGroupSelection = (e: React.MouseEvent) => {
        e.stopPropagation()
        allProductIds.forEach(id => onToggleSelection(id))
    }

    return (
        <>
            <TableRow className="hover:bg-muted/50 border-b cursor-pointer transition-colors">
                <TableCell onClick={(e) => e.stopPropagation()} className="pl-5">
                    <Checkbox
                        checked={isGroupSelected}
                        // @ts-ignore - indeterminate is valid but not in types
                        data-state={isGroupPartialSelected ? 'indeterminate' : isGroupSelected ? 'checked' : 'unchecked'}
                        onCheckedChange={() => {
                            allProductIds.forEach(id => {
                                if (isGroupSelected) {
                                    // 取消選取所有
                                    if (selectedProducts.has(id)) onToggleSelection(id)
                                } else {
                                    // 選取所有
                                    if (!selectedProducts.has(id)) onToggleSelection(id)
                                }
                            })
                        }}
                        aria-label="選擇商品群組"
                    />
                </TableCell>
                <TableCell onClick={handleRowClick}>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted overflow-hidden">
                        {group.image_url ? (
                            <img
                                src={group.image_url}
                                alt={group.baseName}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                    </div>
                </TableCell>
                <TableCell onClick={handleRowClick}>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {group.groupSku}
                    </code>
                </TableCell>
                <TableCell onClick={handleRowClick} className="font-medium max-w-[200px] truncate" title={group.baseName}>
                    {group.baseName}
                    {hasVariants && (
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                            {group.variants.filter(v => v.status === 'active').length}/{group.variants.length} 規格上架
                        </span>
                    )}
                </TableCell>
                <TableCell onClick={handleRowClick}>
                    {group.category ? (
                        <Badge variant="outline" className="text-xs">
                            {group.category}
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                    )}
                </TableCell>
                <TableCell onClick={handleRowClick} className="text-right">${group.price}</TableCell>
                <TableCell onClick={handleRowClick} className="text-right">
                    <span className={group.totalStock < 0 ? 'text-red-500 font-medium' : ''}>
                        {group.totalStock}
                    </span>
                </TableCell>
                <TableCell onClick={handleRowClick} className="text-right">{group.totalSold}</TableCell>
                <TableCell onClick={handleRowClick}>
                    <div className="flex flex-col gap-1">
                        {group.is_limited && group.limit_qty && (
                            <Badge variant="secondary" className="text-xs w-fit">
                                <Hash className="h-3 w-3 mr-1" />
                                限量 {group.limit_qty}
                            </Badge>
                        )}
                        {group.end_time && (
                            <Badge variant="secondary" className="text-xs w-fit">
                                <Clock className="h-3 w-3 mr-1" />
                                {new Date(group.end_time).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                            </Badge>
                        )}
                        {!group.is_limited && !group.end_time && (
                            <span className="text-muted-foreground text-xs">-</span>
                        )}
                    </div>
                </TableCell>
                <TableCell onClick={handleRowClick}>
                    {hasVariants ? (
                        (() => {
                            const allInactive = group.variants.every(v => v.status === 'inactive');
                            const someInactive = group.variants.some(v => v.status === 'inactive');

                            if (allInactive) {
                                return <Badge className="bg-muted text-muted-foreground">已下架</Badge>;
                            } else if (someInactive) {
                                return <Badge className="bg-yellow-100 text-yellow-600 border-yellow-200">部分下架</Badge>;
                            } else {
                                return <Badge className="bg-success/20 text-success border-success/30">上架中</Badge>;
                            }
                        })()
                    ) : (
                        <Badge
                            className={
                                group.status === 'active'
                                    ? 'bg-success/20 text-success border-success/30'
                                    : 'bg-muted text-muted-foreground'
                            }
                        >
                            {group.status === 'active' ? '上架中' : '已下架'}
                        </Badge>
                    )}
                </TableCell>
                <TableCell className="text-center">
                    {displayProductForCopy && (
                        <CopyOrderButton
                            product={displayProductForCopy}
                            variants={hasVariants ? group.variants : undefined}
                            lineOaId={lineOaId}
                        />
                    )}
                </TableCell>
                {hasVariants && (
                    <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </TableCell>
                )}
            </TableRow>

            {isExpanded && group.variants.map((variant, index) => (
                <tr key={variant.id} className={cn(
                    "bg-muted/30 text-sm hover:bg-muted/50 cursor-pointer transition-colors",
                    variant.status === 'inactive' && "opacity-50 bg-gray-50"
                )}>
                    <TableCell onClick={(e) => e.stopPropagation()} className="pl-5">
                        <Checkbox
                            checked={selectedProducts.has(variant.id)}
                            onCheckedChange={() => onToggleSelection(variant.id)}
                            aria-label="選擇商品"
                        />
                    </TableCell>
                    <TableCell onClick={() => onEdit(variant)}></TableCell>
                    <TableCell onClick={() => onEdit(variant)}>
                        <span className={cn(
                            "text-muted-foreground font-mono",
                            variant.status === 'inactive' && "text-gray-400"
                        )}>
                            _{variant.variantName}
                        </span>
                    </TableCell>
                    <TableCell onClick={() => onEdit(variant)}>
                        <div className={cn(
                            "pl-6 flex items-center",
                            variant.status === 'inactive' && "line-through text-gray-400"
                        )}>
                            └─ {variant.variantName}
                            {index === 0 && (
                                <span className="ml-2 text-xs" title="最熱銷">🔥</span>
                            )}
                        </div>
                    </TableCell>
                    <TableCell onClick={() => onEdit(variant)}></TableCell>
                    <TableCell onClick={() => onEdit(variant)} className="text-right">${variant.price}</TableCell>
                    <TableCell onClick={() => onEdit(variant)} className="text-right">
                        <span className={variant.stock < 0 ? 'text-red-500 font-medium' : ''}>
                            {variant.stock}
                        </span>
                    </TableCell>
                    <TableCell onClick={() => onEdit(variant)} className="text-right">{variant.sold_qty}</TableCell>
                    <TableCell onClick={() => onEdit(variant)}></TableCell>
                    <TableCell onClick={() => onEdit(variant)}>
                        <span className={cn(
                            "px-2 py-0.5 text-xs rounded",
                            variant.status === 'active'
                                ? 'bg-success/10 text-success'
                                : 'bg-gray-100 text-gray-500'
                        )}>
                            {variant.status === 'active' ? '上架中' : '已下架'}
                        </span>
                    </TableCell>
                    <TableCell className="text-center">
                        <CopyOrderButton
                            product={variant}
                            lineOaId={lineOaId}
                            isVariant={true}
                        />
                    </TableCell>
                </tr>
            ))}
        </>
    );
};


export default function ProductsPage() {
    const router = useRouter()
    const { tenant, isLoading: tenantLoading } = useTenant()
    const { collapsed: sidebarCollapsed } = useSidebar()
    const [products, setProducts] = useState<Product[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    // 全域補貨 Dialog 狀態
    const [globalRestockOpen, setGlobalRestockOpen] = useState(false)
    const [globalRestockSkuOpen, setGlobalRestockSkuOpen] = useState(false)
    const [globalRestockSku, setGlobalRestockSku] = useState('')
    const [globalRestockQty, setGlobalRestockQty] = useState('')
    const [isGlobalRestocking, setIsGlobalRestocking] = useState(false)
    const [orders, setOrders] = useState<OrderItem[]>([])

    // 選取狀態
    const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())

    // 刪除確認對話框
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // 分頁狀態
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const supabase = createClient()

    const fetchProducts = async () => {
        if (!tenant) return
        setIsLoading(true)

        const { data } = await supabase
            .from('products')
            .select('*')
            .eq('tenant_id', tenant.id)
            .neq('status', 'deleted')  // 排除已刪除的商品
            .order('created_at', { ascending: false })

        if (data) {
            setProducts(data)
        }
        setIsLoading(false)
    }

    // 取得訂單（用於補貨 SKU 選擇）
    const fetchOrders = async () => {
        if (!tenant) return

        const { data } = await supabase
            .from('order_items')
            .select('*, member:members(*), product:products(*)')
            .eq('tenant_id', tenant.id)
            .eq('is_arrived', false)
            .order('created_at', { ascending: false })

        if (data) {
            setOrders(data)
        }
    }

    // 全域補貨
    const handleGlobalRestock = async () => {
        if (!globalRestockSku || !globalRestockQty || !tenant) return

        setIsGlobalRestocking(true)
        try {
            const { data, error } = await supabase.rpc('restock_product_v2', {
                p_tenant_id: tenant.id,
                p_sku: globalRestockSku,
                p_quantity: parseInt(globalRestockQty),
            })

            if (error) {
                toast.error('補貨失敗：' + error.message)
                return
            }

            const result = data as RestockResponse
            if (result.success) {
                toast.success(result.message)
                setGlobalRestockOpen(false)
                setGlobalRestockSku('')
                setGlobalRestockQty('')
                fetchProducts()
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            toast.error('補貨失敗')
        } finally {
            setIsGlobalRestocking(false)
        }
    }

    useEffect(() => {
        if (!tenant || tenantLoading) return

        fetchProducts()

        // 即時訂閱 - 當 products 表變動時自動更新
        const channel = supabase
            .channel(`products-${tenant.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'products',
                    filter: `tenant_id=eq.${tenant.id}`,
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setProducts((prev) => [payload.new as Product, ...prev])
                    } else if (payload.eventType === 'UPDATE') {
                        setProducts((prev) =>
                            prev.map((p) =>
                                p.id === payload.new.id ? (payload.new as Product) : p
                            )
                        )
                    } else if (payload.eventType === 'DELETE') {
                        setProducts((prev) =>
                            prev.filter((p) => p.id !== payload.old.id)
                        )
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [tenant, tenantLoading, supabase])

    const filteredProducts = products.filter((product) =>
        searchQuery === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const groupedProducts = groupProducts(filteredProducts)

    // 分頁計算
    const totalCount = groupedProducts.length
    const totalPages = Math.ceil(totalCount / pageSize)
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, totalCount)
    const paginatedProducts = groupedProducts.slice(startIndex, endIndex)

    // 當搜尋條件或分頁大小改變時，重置到第一頁
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery, pageSize])

    // 產生頁碼按鈕
    const getPageNumbers = () => {
        const pages: (number | 'ellipsis')[] = []
        const showPages = 5 // 顯示的頁碼數量

        if (totalPages <= showPages + 2) {
            // 總頁數較少時顯示所有頁碼
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i)
            }
        } else {
            // 總是顯示第一頁
            pages.push(1)

            if (currentPage > 3) {
                pages.push('ellipsis')
            }

            // 計算中間頁碼範圍
            const start = Math.max(2, currentPage - 1)
            const end = Math.min(totalPages - 1, currentPage + 1)

            for (let i = start; i <= end; i++) {
                pages.push(i)
            }

            if (currentPage < totalPages - 2) {
                pages.push('ellipsis')
            }

            // 總是顯示最後一頁
            pages.push(totalPages)
        }

        return pages
    }

    // 選取功能
    const toggleProductSelection = (productId: string) => {
        const newSelected = new Set(selectedProducts)
        if (newSelected.has(productId)) {
            newSelected.delete(productId)
        } else {
            newSelected.add(productId)
        }
        setSelectedProducts(newSelected)
    }

    // 取得 ProductGroup 中所有產品 ID 的輔助函數
    const getProductIdsFromGroup = (group: ProductGroup): string[] => {
        const ids: string[] = []
        if (group.mainProduct) {
            ids.push(group.mainProduct.id)
        }
        group.variants.forEach(v => ids.push(v.id))
        return ids
    }

    // 當前頁面所有產品 ID
    const currentPageProductIds = paginatedProducts.flatMap(getProductIdsFromGroup)

    // 判斷當前頁面是否全選
    const isAllSelected = currentPageProductIds.length > 0 &&
        currentPageProductIds.every(id => selectedProducts.has(id))

    // 全選 / 取消全選（只針對當前頁面顯示的產品）
    const handleSelectAll = () => {
        if (isAllSelected) {
            // 取消選取當前頁面的產品
            const newSelected = new Set(selectedProducts)
            currentPageProductIds.forEach(id => newSelected.delete(id))
            setSelectedProducts(newSelected)
        } else {
            // 選取當前頁面的所有產品（保留其他頁面已選取的）
            const newSelected = new Set(selectedProducts)
            currentPageProductIds.forEach(id => newSelected.add(id))
            setSelectedProducts(newSelected)
        }
    }

    // 批量上架
    const handleBatchActivate = async () => {
        if (selectedProducts.size === 0 || !tenant) return

        try {
            const result = await batchUpdateProductStatus(
                supabase,
                tenant.id,
                Array.from(selectedProducts),
                'active'
            )

            if (!result.success) {
                toast.error(result.error || '批量上架失敗')
                return
            }

            setProducts(prev =>
                prev.map(p =>
                    selectedProducts.has(p.id) ? { ...p, status: 'active' } : p
                )
            )
            toast.success(`已上架 ${result.updated_count || selectedProducts.size} 個商品`)
            setSelectedProducts(new Set())
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '批量上架失敗'
            toast.error(errorMessage)
        }
    }

    // 批量下架
    const handleBatchDeactivate = async () => {
        if (selectedProducts.size === 0 || !tenant) return

        try {
            const result = await batchUpdateProductStatus(
                supabase,
                tenant.id,
                Array.from(selectedProducts),
                'inactive'
            )

            if (!result.success) {
                toast.error(result.error || '批量下架失敗')
                return
            }

            setProducts(prev =>
                prev.map(p =>
                    selectedProducts.has(p.id) ? { ...p, status: 'inactive' } : p
                )
            )
            toast.success(`已下架 ${result.updated_count || selectedProducts.size} 個商品`)
            setSelectedProducts(new Set())
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '批量下架失敗'
            toast.error(errorMessage)
        }
    }

    // 計算選中商品的統計
    const selectedStats = useMemo(() => {
        const activeCount = Array.from(selectedProducts).filter(id => {
            const product = products.find(p => p.id === id)
            return product?.status === 'active'
        }).length
        const inactiveCount = selectedProducts.size - activeCount
        return { activeCount, inactiveCount }
    }, [selectedProducts, products])

    // 批量刪除
    const handleBatchDelete = async () => {
        if (selectedProducts.size === 0 || !tenant) return

        setIsDeleting(true)
        try {
            const { data, error } = await supabase.rpc('batch_delete_products_v1', {
                p_tenant_id: tenant.id,
                p_product_ids: Array.from(selectedProducts),
                p_force_soft_delete: false,
            })

            if (error) {
                toast.error('刪除失敗：' + error.message)
                return
            }

            if (!data?.success) {
                toast.error(data?.error || '刪除失敗')
                return
            }

            // 顯示詳細結果
            const messages = []

            if (data.hard_deleted_count > 0) {
                messages.push(`${data.hard_deleted_count} 筆已永久刪除`)
            }

            if (data.soft_deleted_count > 0) {
                messages.push(`${data.soft_deleted_count} 筆已下架（有關聯訂單）`)
            }

            if (data.skipped_count > 0) {
                messages.push(`${data.skipped_count} 筆被跳過`)
            }

            if (messages.length > 0) {
                toast.success(messages.join('，'))
            }

            // 移除硬刪除的，更新軟刪除的狀態
            setProducts(prev => prev.filter(p => {
                if (data.hard_deleted_ids?.includes(p.id)) return false
                if (data.soft_deleted_ids?.includes(p.id)) return false  // 也隱藏軟刪除的
                return true
            }))
            setSelectedProducts(new Set())
            setDeleteDialogOpen(false)
        } catch (error: any) {
            toast.error('刪除失敗：' + (error.message || '未知錯誤'))
            console.error(error)
        } finally {
            setIsDeleting(false)
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">商品管理</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">管理店家所有商品</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                            fetchOrders()
                            setGlobalRestockOpen(true)
                        }}
                    >
                        <PackagePlus className="mr-2 h-4 w-4" />
                        補貨
                    </Button>
                    <Link href={`/admin/t/${tenant.slug}/products/new`}>
                        <Button variant="outline" className="rounded-xl">
                            <Plus className="mr-2 h-4 w-4" />
                            新增商品
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Search */}
            <Card className="border-border/50">
                <CardContent className="pt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="搜尋商品名稱、SKU、分類..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-xl"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Products Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-lg" />
                            ))}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">
                                {searchQuery ? '找不到符合條件的商品' : '尚無商品'}
                            </p>
                            <Link href={`/admin/t/${tenant.slug}/products/new`} className="mt-4">
                                <Button variant="outline" className="rounded-xl">
                                    <Plus className="mr-2 h-4 w-4" />
                                    新增第一個商品
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto px-4">
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
                                        <TableHead className="w-[72px]">圖片</TableHead>
                                        <TableHead className="w-[180px]">SKU</TableHead>
                                        <TableHead>名稱</TableHead>
                                        <TableHead className="w-[80px]">分類</TableHead>
                                        <TableHead className="w-[80px] text-right">價格</TableHead>
                                        <TableHead className="w-[60px] text-right">庫存</TableHead>
                                        <TableHead className="w-[60px] text-right">已售</TableHead>
                                        <TableHead className="w-[100px]">限購</TableHead>
                                        <TableHead className="w-[80px]">狀態</TableHead>
                                        <TableHead className="w-[70px] text-center">社群訊息</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedProducts.map((group) => (
                                        <ProductRow
                                            key={group.groupSku}
                                            group={group}
                                            onEdit={(p) => router.push(`/admin/t/${tenant.slug}/products/${p.id}/edit`)}
                                            lineOaId={tenant.line_oa_id || ''}
                                            selectedProducts={selectedProducts}
                                            onToggleSelection={toggleProductSelection}
                                        />
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
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => setPageSize(Number(v))}
                        >
                            <SelectTrigger className="w-[100px] h-8 rounded-lg">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10 筆</SelectItem>
                                <SelectItem value="20">20 筆</SelectItem>
                                <SelectItem value="50">50 筆</SelectItem>
                                <SelectItem value="100">100 筆</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 右側：分頁按鈕 */}
                    {totalPages > 1 && (
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
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>

                            {getPageNumbers().map((page, index) =>
                                page === 'ellipsis' ? (
                                    <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">...</span>
                                ) : (
                                    <Button
                                        key={page}
                                        variant={currentPage === page ? 'default' : 'outline'}
                                        size="icon"
                                        className="h-8 w-8 rounded-lg"
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </Button>
                                )
                            )}

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
                    )}
                </div>
            )}

            {/* 刪除確認 Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="glass-strong">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            確認刪除商品
                        </DialogTitle>
                        <DialogDescription>
                            確定要刪除選取的 {selectedProducts.size} 個商品嗎？此操作無法復原。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleBatchDelete}
                            disabled={isDeleting}
                            variant="destructive"
                            className="rounded-xl"
                        >
                            {isDeleting ? '刪除中...' : '確認刪除'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 全域補貨 Dialog */}
            <Dialog open={globalRestockOpen} onOpenChange={setGlobalRestockOpen}>
                <DialogContent className="glass-strong">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PackagePlus className="h-5 w-5 text-primary" />
                            商品補貨
                        </DialogTitle>
                        <DialogDescription>
                            選擇商品 SKU 並輸入補貨數量，系統會自動分配庫存給等待中的訂單
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>選擇商品 SKU</Label>
                            <Popover open={globalRestockSkuOpen} onOpenChange={setGlobalRestockSkuOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-full justify-between rounded-xl"
                                    >
                                        {globalRestockSku || '選擇商品...'}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="搜尋 SKU 或商品名稱..." />
                                        <CommandList>
                                            <CommandEmpty>找不到商品</CommandEmpty>
                                            <CommandGroup heading="有待補貨訂單的商品">
                                                {(() => {
                                                    const skuMap = new Map<string, { name: string; count: number }>()
                                                    orders.forEach(o => {
                                                        if (!skuMap.has(o.sku)) {
                                                            skuMap.set(o.sku, {
                                                                name: o.product?.name || o.sku,
                                                                count: o.quantity - o.arrived_qty
                                                            })
                                                        } else {
                                                            const existing = skuMap.get(o.sku)!
                                                            existing.count += o.quantity - o.arrived_qty
                                                        }
                                                    })
                                                    return Array.from(skuMap.entries()).map(([sku, info]) => (
                                                        <CommandItem
                                                            key={sku}
                                                            value={`${sku} ${info.name}`}
                                                            onSelect={() => {
                                                                setGlobalRestockSku(sku)
                                                                setGlobalRestockSkuOpen(false)
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    globalRestockSku === sku ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            <span className="font-mono text-xs mr-2">{sku}</span>
                                                            <span className="text-muted-foreground truncate">{info.name}</span>
                                                            <Badge variant="secondary" className="ml-auto">
                                                                待補 {info.count}
                                                            </Badge>
                                                        </CommandItem>
                                                    ))
                                                })()}
                                            </CommandGroup>
                                            <CommandGroup heading="所有商品">
                                                {products.map(p => (
                                                    <CommandItem
                                                        key={p.id}
                                                        value={`${p.sku} ${p.name}`}
                                                        onSelect={() => {
                                                            setGlobalRestockSku(p.sku)
                                                            setGlobalRestockSkuOpen(false)
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                globalRestockSku === p.sku ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <span className="font-mono text-xs mr-2">{p.sku}</span>
                                                        <span className="text-muted-foreground truncate">{p.name}</span>
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            庫存: {p.stock}
                                                        </span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="restock-qty">補貨數量</Label>
                            <Input
                                id="restock-qty"
                                type="number"
                                min="1"
                                placeholder="輸入數量"
                                value={globalRestockQty}
                                onChange={(e) => setGlobalRestockQty(e.target.value)}
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setGlobalRestockOpen(false)
                                setGlobalRestockSku('')
                                setGlobalRestockQty('')
                            }}
                            className="rounded-xl"
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleGlobalRestock}
                            disabled={!globalRestockSku || !globalRestockQty || isGlobalRestocking}
                            className="rounded-xl"
                        >
                            {isGlobalRestocking ? '補貨中...' : '確認補貨'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 浮動操作列 - 選取商品時出現 */}
            <AnimatePresence>
                {selectedProducts.size > 0 && (
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
                                    已選 <span className="font-semibold text-foreground">{selectedProducts.size}</span> 個商品
                                </span>
                                <div className="h-4 w-px bg-border" />
                                {selectedStats.inactiveCount > 0 && (
                                    <Button
                                        onClick={handleBatchActivate}
                                        size="sm"
                                        className="bg-success hover:bg-success/90 text-success-foreground rounded-full h-7 px-3 text-xs"
                                    >
                                        <Power className="mr-1 h-3 w-3" />
                                        上架 ({selectedStats.inactiveCount})
                                    </Button>
                                )}
                                {selectedStats.activeCount > 0 && (
                                    <Button
                                        onClick={handleBatchDeactivate}
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full h-7 px-3 text-xs"
                                    >
                                        <Power className="mr-1 h-3 w-3" />
                                        下架 ({selectedStats.activeCount})
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setDeleteDialogOpen(true)}
                                    variant="destructive"
                                    size="sm"
                                    className="rounded-full h-7 px-3 text-xs"
                                >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    刪除
                                </Button>
                                <Button
                                    onClick={() => setSelectedProducts(new Set())}
                                    variant="ghost"
                                    size="sm"
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
