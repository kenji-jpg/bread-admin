'use client'

import { useState, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { usePermission } from '@/hooks/use-permission'
import { updateProduct } from '@/hooks/use-secure-mutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, Upload, X, Loader2, Store, Lock, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { Product } from '@/types/database'

// 壓縮圖片至最大寬度並輸出為 WebP
async function compressImage(file: File, maxWidth = 400, quality = 0.7): Promise<{ blob: Blob; ext: string; mime: string }> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const objectUrl = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(objectUrl)
            const canvas = document.createElement('canvas')
            let width = img.width
            let height = img.height

            if (width > maxWidth) {
                height = (height * maxWidth) / width
                width = maxWidth
            }

            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            if (!ctx) {
                reject(new Error('Failed to get canvas context'))
                return
            }

            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)

            canvas.toBlob(
                (webpBlob) => {
                    if (webpBlob && webpBlob.size > 100) {
                        resolve({ blob: webpBlob, ext: 'webp', mime: 'image/webp' })
                    } else {
                        canvas.toBlob(
                            (jpegBlob) => {
                                if (jpegBlob && jpegBlob.size > 100) {
                                    resolve({ blob: jpegBlob, ext: 'jpg', mime: 'image/jpeg' })
                                } else {
                                    reject(new Error('Failed to compress image'))
                                }
                            },
                            'image/jpeg',
                            Math.max(quality, 0.85)
                        )
                    }
                },
                'image/webp',
                quality
            )
        }
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('圖片格式不支援（HEIC 請先轉檔）'))
        }
        img.src = objectUrl
    })
}

interface EditVariant {
    id: string
    name: string
    stock: number
    sold_qty: number
    isNew?: boolean  // 新增的規格（尚未儲存到 DB）
}

export default function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
    const { productId } = use(params)
    const router = useRouter()
    const { tenant, isLoading: tenantLoading } = useTenant()
    const { canAccessShop } = usePermission()
    const supabase = createClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Product state
    const [product, setProduct] = useState<Product | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Form state
    const [name, setName] = useState('')
    const [sku, setSku] = useState('')
    const [price, setPrice] = useState('')
    const [cost, setCost] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('')
    const [status, setStatus] = useState<boolean>(true)
    const [isLimited, setIsLimited] = useState(false)
    const [endTime, setEndTime] = useState('')
    const [showInShop, setShowInShop] = useState(false)

    // Read-only state
    const [stock, setStock] = useState(0)
    const [soldQty, setSoldQty] = useState(0)
    const [arrivedAt, setArrivedAt] = useState<string | null>(null)

    // Variant state
    const [hasVariants, setHasVariants] = useState(false)
    const [variants, setVariants] = useState<EditVariant[]>([])
    const [isLoadingVariants, setIsLoadingVariants] = useState(false)

    // Image state (multi-image support, up to 5)
    const [imageFiles, setImageFiles] = useState<File[]>([])
    const [imagePreviews, setImagePreviews] = useState<string[]>([])
    const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (!tenant || tenantLoading) return

        const fetchProduct = async () => {
            setIsLoading(true)
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('id', productId)
                .eq('tenant_id', tenant.id)
                .single()

            if (error) {
                console.error('Fetch product error:', error)
                toast.error('找不到商品')
                router.push(`/admin/t/${tenant.slug}/products`)
                return
            }

            if (data) {
                setProduct(data)
                setName(data.name)
                setSku(data.sku)
                setPrice(data.price.toString())
                setCost(data.cost ? data.cost.toString() : '')
                setDescription(data.description || '')
                setCategory(data.category || '')
                setStatus(data.status === 'active')
                setIsLimited(data.is_limited)
                setEndTime(data.end_time ? new Date(data.end_time).toISOString().slice(0, 16) : '')
                setShowInShop(data.show_in_shop ?? false)
                // Load multi-image: prefer image_urls, fallback to image_url
                const urls = (data as Record<string, unknown>).image_urls && Array.isArray((data as Record<string, unknown>).image_urls) && ((data as Record<string, unknown>).image_urls as string[]).length > 0
                    ? (data as Record<string, unknown>).image_urls as string[]
                    : data.image_url ? [data.image_url] : []
                setExistingImageUrls(urls)
                setImagePreviews(urls)
                setHasVariants(data.has_variants ?? false)

                // Read-only fields
                setStock(data.stock)
                setSoldQty(data.sold_qty)
                setArrivedAt(data.arrived_at)

                // 載入規格
                if (data.has_variants) {
                    setIsLoadingVariants(true)
                    const { data: variantData } = await supabase.rpc('get_product_variants_v1', {
                        p_product_id: data.id
                    })
                    const variantList = variantData?.variants ?? variantData
                    if (variantList && Array.isArray(variantList)) {
                        setVariants(variantList.map((v: { id: string; name: string; stock: number; sold_qty: number }) => ({
                            id: v.id,
                            name: v.name,
                            stock: v.stock,
                            sold_qty: v.sold_qty,
                        })))
                    }
                    setIsLoadingVariants(false)
                }
            }
            setIsLoading(false)
        }

        fetchProduct()
    }, [tenant, tenantLoading, productId, supabase, router])

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        const totalCurrent = existingImageUrls.length + imageFiles.length
        const maxNew = 5 - totalCurrent
        if (maxNew <= 0) {
            toast.error('最多只能上傳 5 張圖片')
            return
        }

        const validFiles: File[] = []
        for (const file of files.slice(0, maxNew)) {
            if (!file.type.startsWith('image/')) {
                toast.error(`${file.name} 不是圖片檔案，已跳過`)
                continue
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error(`${file.name} 超過 10MB，已跳過`)
                continue
            }
            validFiles.push(file)
        }

        if (validFiles.length === 0) return

        if (files.length > maxNew) {
            toast.warning(`已選取前 ${maxNew} 張，最多共 5 張`)
        }

        setImageFiles(prev => [...prev, ...validFiles])

        // Generate previews for new files
        for (const file of validFiles) {
            const reader = new FileReader()
            reader.onload = (ev) => {
                setImagePreviews(prev => [...prev, ev.target?.result as string])
            }
            reader.readAsDataURL(file)
        }
    }

    const removeImage = (index: number) => {
        const totalExisting = existingImageUrls.length
        if (index < totalExisting) {
            // Removing an existing image
            setExistingImageUrls(prev => prev.filter((_, i) => i !== index))
        } else {
            // Removing a new file
            const fileIndex = index - totalExisting
            setImageFiles(prev => prev.filter((_, i) => i !== fileIndex))
        }
        setImagePreviews(prev => prev.filter((_, i) => i !== index))
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!tenant || !product) return

        if (!name.trim()) {
            toast.error('請輸入商品名稱')
            return
        }

        if (!price || parseFloat(price) <= 0) {
            toast.error('請輸入有效價格')
            return
        }

        setIsSubmitting(true)

        try {
            // Upload new image files (only the newly added ones)
            const newUploadedUrls: string[] = []
            if (imageFiles.length > 0) {
                setIsUploading(true)
                for (let i = 0; i < imageFiles.length; i++) {
                    try {
                        const compressed = await compressImage(imageFiles[i])
                        const compressedFile = new File([compressed.blob], `${sku}-${i}.${compressed.ext}`, {
                            type: compressed.mime,
                        })

                        const filePath = `${tenant.id}/products/${sku}-${Date.now()}-${i}.${compressed.ext}`
                        const { error: uploadError } = await supabase.storage
                            .from('product-images')
                            .upload(filePath, compressedFile, {
                                cacheControl: '3600',
                                upsert: true,
                                contentType: compressed.mime,
                            })

                        if (uploadError) {
                            console.error('Upload error:', uploadError)
                            toast.warning(`第 ${i + 1} 張圖片上傳失敗，已跳過`)
                        } else {
                            const { data: { publicUrl } } = supabase.storage
                                .from('product-images')
                                .getPublicUrl(filePath)
                            newUploadedUrls.push(publicUrl)
                        }
                    } catch (compressError) {
                        console.error('Compress error:', compressError)
                        toast.warning(`第 ${i + 1} 張圖片處理失敗，已跳過`)
                    }
                }
                setIsUploading(false)
            }

            // Combine existing URLs (kept by user) + newly uploaded URLs
            const finalImageUrls = [...existingImageUrls, ...newUploadedUrls].slice(0, 5)

            const result = await updateProduct(supabase, tenant.id, productId, {
                name: name.trim(),
                price: parseFloat(price),
                cost: cost ? parseFloat(cost) : null,
                description: description.trim() || null,
                category: category.trim() || null,
                status: status ? 'active' : 'inactive',
                is_limited: isLimited,
                limit_qty: null,
                end_time: endTime || null,
                image_url: finalImageUrls[0] || null,
                image_urls: finalImageUrls.length > 0 ? finalImageUrls : null,
                show_in_shop: showInShop,
            })

            if (!result.success) {
                throw new Error(result.error || '更新商品失敗')
            }

            // 儲存規格變更（含關閉規格的情況）
            if (hasVariants) {
                const variantNames = variants.map(v => v.name.trim())
                if (variantNames.some(n => !n)) {
                    toast.error('規格名稱不可為空')
                    setIsSubmitting(false)
                    return
                }
                if (new Set(variantNames).size !== variantNames.length) {
                    toast.error('規格名稱不可重複')
                    setIsSubmitting(false)
                    return
                }

                const { data: variantResult, error: variantError } = await supabase.rpc('update_product_variants_v1', {
                    p_product_id: productId,
                    p_tenant_id: tenant.id,
                    p_variants: variants.map((v, idx) => ({
                        id: v.isNew ? null : v.id,
                        name: v.name.trim(),
                        stock: v.stock,
                        sort_order: idx,
                    }))
                })
                if (variantError || (variantResult && !variantResult.success)) {
                    console.error('Update variants error:', variantError || variantResult?.error)
                    toast.warning('商品已更新，但規格儲存失敗：' + (variantResult?.error || variantError?.message))
                }
            } else if (product?.has_variants) {
                // 從有規格切換為無規格 → 傳空陣列讓 RPC 停用所有規格並設 has_variants=false
                await supabase.rpc('update_product_variants_v1', {
                    p_product_id: productId,
                    p_tenant_id: tenant.id,
                    p_variants: [],
                })
            }

            toast.success('商品更新成功！')
            router.push(`/admin/t/${tenant.slug}/products`)
        } catch (error) {
            console.error('Update product error:', error)
            toast.error('更新商品失敗')
        } finally {
            setIsSubmitting(false)
            setIsUploading(false)
        }
    }

    if (tenantLoading || isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-[600px] rounded-2xl" />
            </div>
        )
    }

    if (!tenant) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col gap-4">
                <Link
                    href={`/admin/t/${tenant.slug}/products`}
                    className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    返回商品列表
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            <span className="gradient-text">編輯商品</span>
                        </h1>
                        <p className="text-muted-foreground mt-1">編輯商品資訊與庫存狀態</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Left: Basic Info */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>基本資訊</CardTitle>
                                <CardDescription>商品的基本設定</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">商品名稱 *</Label>
                                        <Input
                                            id="name"
                                            placeholder="輸入商品名稱"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="rounded-xl"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="sku">SKU</Label>
                                        <Input
                                            id="sku"
                                            value={sku}
                                            onChange={(e) => setSku(e.target.value)}
                                            className="rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="price">售價 *</Label>
                                        <Input
                                            id="price"
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            className="rounded-xl"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="cost">成本</Label>
                                        <Input
                                            id="cost"
                                            type="number"
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            value={cost}
                                            onChange={(e) => setCost(e.target.value)}
                                            className="rounded-xl"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="category">分類</Label>
                                    <Input
                                        id="category"
                                        placeholder="例：蛋糕、麵包"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">商品描述</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="商品說明..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="rounded-xl min-h-[100px]"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>銷售設定</CardTitle>
                                <CardDescription>設定上下架狀態與限購條件</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                                    <div className="space-y-0.5">
                                        <Label>上架狀態</Label>
                                        <p className="text-xs text-muted-foreground">
                                            {status ? '目前為上架狀態' : '目前為下架狀態'}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={status}
                                        onCheckedChange={setStatus}
                                    />
                                </div>

                                <div className={`flex items-center justify-between p-3 rounded-xl ${canAccessShop ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50 border border-border/50'}`}>
                                    <div className="flex items-center gap-3">
                                        <Store className={`h-5 w-5 ${canAccessShop ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <Label className={!canAccessShop ? 'text-muted-foreground' : ''}>顯示在商城</Label>
                                                {!canAccessShop && (
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-primary/30 text-primary">
                                                        <Lock className="h-2.5 w-2.5 mr-0.5" />
                                                        Pro
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {canAccessShop ? '開啟後此商品會出現在 LIFF 商城頁面' : '升級 Pro 方案後可使用商城功能'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={showInShop}
                                        onCheckedChange={setShowInShop}
                                        disabled={!canAccessShop}
                                    />
                                </div>
                                {showInShop && !status && (
                                    <p className="text-xs text-amber-600 mt-1 ml-1">
                                        ⚠️ 商品目前為下架狀態，即使開啟也不會顯示在商城
                                    </p>
                                )}

                                <div className="flex items-center justify-between mt-4">
                                    <div className="space-y-0.5">
                                        <Label>現貨模式</Label>
                                        <p className="text-xs text-muted-foreground">
                                            開啟後庫存不得小於 0，售完即停止購買
                                        </p>
                                    </div>
                                    <Switch
                                        checked={isLimited}
                                        onCheckedChange={setIsLimited}
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="endTime">收單截止日期</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="endTime"
                                                type="datetime-local"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="rounded-xl flex-1"
                                            />
                                            {endTime && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="rounded-xl h-10 w-10 shrink-0"
                                                    onClick={() => setEndTime('')}
                                                    title="清除截止日期（改為長期）"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {endTime ? `截止時間：${new Date(endTime).toLocaleString('zh-TW')}` : '未設定截止日期（長期收單）'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 商品規格 */}
                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>商品規格</CardTitle>
                                <CardDescription>設定商品的尺寸、顏色等規格選項（同價格不同選項）</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>此商品有多種規格</Label>
                                        <p className="text-xs text-muted-foreground">
                                            開啟後可設定不同規格的獨立庫存
                                        </p>
                                    </div>
                                    <Switch
                                        checked={hasVariants}
                                        onCheckedChange={(checked) => {
                                            setHasVariants(checked)
                                            if (checked && variants.length === 0) {
                                                setVariants([{ id: crypto.randomUUID(), name: '', stock: 0, sold_qty: 0, isNew: true }])
                                            }
                                        }}
                                    />
                                </div>

                                {hasVariants && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label>規格選項</Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setVariants([...variants, { id: crypto.randomUUID(), name: '', stock: 0, sold_qty: 0, isNew: true }])}
                                                className="h-8 text-primary"
                                            >
                                                <Plus className="mr-1 h-3 w-3" />
                                                新增規格
                                            </Button>
                                        </div>

                                        {isLoadingVariants ? (
                                            <div className="text-sm text-muted-foreground py-4 text-center">載入規格中...</div>
                                        ) : (
                                            <div className="border border-border/50 rounded-xl overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted/50">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">規格名稱</th>
                                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-20">
                                                                庫存
                                                                {!isLimited && <span className="ml-1 text-[10px] text-muted-foreground/60">（追蹤用）</span>}
                                                            </th>
                                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-20">已售</th>
                                                            <th className="px-4 py-2 text-right w-12"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/50">
                                                        {variants.map((variant) => (
                                                            <tr key={variant.id} className="bg-card">
                                                                <td className="p-2">
                                                                    <Input
                                                                        value={variant.name}
                                                                        onChange={(e) => setVariants(variants.map(v =>
                                                                            v.id === variant.id ? { ...v, name: e.target.value } : v
                                                                        ))}
                                                                        placeholder="輸入名稱"
                                                                        className="h-9 rounded-lg border-0 bg-muted/50 focus-visible:bg-background focus-visible:ring-1"
                                                                    />
                                                                </td>
                                                                <td className="p-2">
                                                                    <Input
                                                                        type="number"
                                                                        value={variant.stock}
                                                                        onChange={(e) => setVariants(variants.map(v =>
                                                                            v.id === variant.id ? { ...v, stock: parseInt(e.target.value) || 0 } : v
                                                                        ))}
                                                                        className="h-9 rounded-lg border-0 bg-muted/50 focus-visible:bg-background focus-visible:ring-1"
                                                                    />
                                                                </td>
                                                                <td className="p-2 text-center text-muted-foreground">
                                                                    {variant.sold_qty}
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => {
                                                                            if (variants.length <= 1) {
                                                                                toast.error('至少需要一個規格選項')
                                                                                return
                                                                            }
                                                                            setVariants(variants.filter(v => v.id !== variant.id))
                                                                        }}
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right: Status & Image */}
                    <div className="space-y-6">
                        <Card className="border-border/50 bg-muted/20">
                            <CardHeader>
                                <CardTitle>庫存狀態</CardTitle>
                                <CardDescription>
                                    庫存與銷售數據（唯讀）
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label>目前庫存</Label>
                                    <span className={`text-xl ${stock < 0 ? 'text-red-500 font-bold' : 'font-bold'}`}>
                                        {stock}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <Label>已售數量</Label>
                                    <span className="text-lg">{soldQty}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <Label>到貨時間</Label>
                                    <span className="text-sm text-muted-foreground">
                                        {arrivedAt ? new Date(arrivedAt).toLocaleDateString() : '-'}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    庫存與到貨時間需透過補貨功能調整
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>商品圖片</CardTitle>
                                <CardDescription>最多 5 張，第一張為主圖</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />

                                <div className="grid grid-cols-3 gap-3">
                                    {imagePreviews.map((preview, index) => (
                                        <div key={index} className="relative group">
                                            <div className="aspect-square rounded-xl overflow-hidden border border-border/50">
                                                <img
                                                    src={preview}
                                                    alt={`商品圖 ${index + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            {index === 0 && (
                                                <Badge className="absolute top-1 left-1 text-[10px] px-1.5 py-0 h-5">
                                                    主圖
                                                </Badge>
                                            )}
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => removeImage(index)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}

                                    {imagePreviews.length < 5 && (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center gap-1"
                                        >
                                            <Upload className="h-5 w-5 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">
                                                {imagePreviews.length === 0 ? '上傳圖片' : '加更多'}
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-4">
                            <Link href={`/admin/t/${tenant.slug}/products`} className="w-full">
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl h-12"
                                    type="button"
                                >
                                    取消
                                </Button>
                            </Link>

                            <Button
                                type="submit"
                                disabled={isSubmitting || isUploading}
                                className="w-full gradient-primary rounded-xl h-12"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        儲存中...
                                    </>
                                ) : (
                                    '儲存'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </motion.div>
    )
}
