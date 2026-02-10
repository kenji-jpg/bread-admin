'use client'

import { useState, useRef, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { updateProduct } from '@/hooks/use-secure-mutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, Upload, X, Loader2, Store } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/types/database'

// 壓縮圖片至最大寬度並輸出為 WebP
async function compressImage(file: File, maxWidth = 800, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
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

            ctx.drawImage(img, 0, 0, width, height)
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob)
                    } else {
                        reject(new Error('Failed to compress image'))
                    }
                },
                'image/webp',
                quality
            )
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
    })
}

export default function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
    const { productId } = use(params)
    const router = useRouter()
    const { tenant, isLoading: tenantLoading } = useTenant()
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
    const [limitQty, setLimitQty] = useState('')
    const [endTime, setEndTime] = useState('')
    const [showInShop, setShowInShop] = useState(false)

    // Read-only state
    const [stock, setStock] = useState(0)
    const [soldQty, setSoldQty] = useState(0)
    const [arrivedAt, setArrivedAt] = useState<string | null>(null)

    // Image state
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
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
                setLimitQty(data.limit_qty ? data.limit_qty.toString() : '')
                setEndTime(data.end_time ? new Date(data.end_time).toISOString().slice(0, 16) : '')
                setShowInShop(data.show_in_shop ?? false)
                setImagePreview(data.image_url)

                // Read-only fields
                setStock(data.stock)
                setSoldQty(data.sold_qty)
                setArrivedAt(data.arrived_at)
            }
            setIsLoading(false)
        }

        fetchProduct()
    }, [tenant, tenantLoading, productId, supabase, router])

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            toast.error('請選擇圖片檔案')
            return
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('圖片大小不能超過 10MB')
            return
        }

        setImageFile(file)
        const reader = new FileReader()
        reader.onload = (e) => {
            setImagePreview(e.target?.result as string)
        }
        reader.readAsDataURL(file)
    }

    const removeImage = () => {
        setImageFile(null)
        setImagePreview(null)
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
            let imageUrl: string | null = imagePreview

            // Upload new image if selected
            if (imageFile) {
                setIsUploading(true)
                try {
                    const compressedBlob = await compressImage(imageFile)
                    const compressedFile = new File([compressedBlob], `${sku}.webp`, {
                        type: 'image/webp',
                    })

                    const filePath = `${tenant.id}/products/${sku}-${Date.now()}.webp`
                    const { error: uploadError } = await supabase.storage
                        .from('product-images')
                        .upload(filePath, compressedFile, {
                            cacheControl: '3600',
                            upsert: true,
                        })

                    if (uploadError) {
                        console.error('Upload error:', uploadError)
                        toast.warning('圖片上傳失敗，保留原圖')
                    } else {
                        const { data: { publicUrl } } = supabase.storage
                            .from('product-images')
                            .getPublicUrl(filePath)
                        imageUrl = publicUrl
                    }
                } catch (compressError) {
                    console.error('Compress error:', compressError)
                    toast.warning('圖片處理失敗，保留原圖')
                }
                setIsUploading(false)
            } else if (!imagePreview) {
                // Image removed
                imageUrl = null
            }

            const result = await updateProduct(supabase, tenant.id, productId, {
                name: name.trim(),
                price: parseFloat(price),
                cost: cost ? parseFloat(cost) : null,
                description: description.trim() || null,
                category: category.trim() || null,
                status: status ? 'active' : 'inactive',
                is_limited: isLimited,
                limit_qty: isLimited && limitQty ? parseInt(limitQty) : null,
                end_time: endTime || null,
                image_url: imageUrl,
                show_in_shop: showInShop,
            })

            if (!result.success) {
                throw new Error(result.error || '更新商品失敗')
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

                                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                                    <div className="flex items-center gap-3">
                                        <Store className="h-5 w-5 text-primary" />
                                        <div className="space-y-0.5">
                                            <Label>顯示在商城</Label>
                                            <p className="text-xs text-muted-foreground">
                                                開啟後此商品會出現在 LIFF 商城頁面
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={showInShop}
                                        onCheckedChange={setShowInShop}
                                    />
                                </div>
                                {showInShop && !status && (
                                    <p className="text-xs text-amber-600 mt-1 ml-1">
                                        ⚠️ 商品目前為下架狀態，即使開啟也不會顯示在商城
                                    </p>
                                )}

                                <div className="flex items-center justify-between mt-4">
                                    <div className="space-y-0.5">
                                        <Label>限購商品</Label>
                                        <p className="text-xs text-muted-foreground">
                                            單件商品限購數量
                                        </p>
                                    </div>
                                    <Switch
                                        checked={isLimited}
                                        onCheckedChange={setIsLimited}
                                    />
                                </div>

                                {isLimited && (
                                    <div className="grid gap-4 sm:grid-cols-2 mt-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="limitQty">限購數量</Label>
                                            <Input
                                                id="limitQty"
                                                type="number"
                                                min="1"
                                                placeholder="0"
                                                value={limitQty}
                                                onChange={(e) => setLimitQty(e.target.value)}
                                                className="rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="endTime">收單截止日期</Label>
                                            <Input
                                                id="endTime"
                                                type="datetime-local"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="rounded-xl"
                                            />
                                        </div>
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
                            </CardHeader>
                            <CardContent>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />

                                {imagePreview ? (
                                    <div className="relative">
                                        <div className="aspect-square rounded-xl overflow-hidden border border-border/50">
                                            <img
                                                src={imagePreview}
                                                alt="預覽"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="absolute top-2 right-2 h-8 w-8 rounded-full"
                                            onClick={removeImage}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center gap-3"
                                    >
                                        <div className="p-3 bg-muted rounded-full">
                                            <Upload className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium">點擊上傳圖片</p>
                                        </div>
                                    </button>
                                )}
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
