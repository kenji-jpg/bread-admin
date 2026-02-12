'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, Upload, Image as ImageIcon, X, Loader2, Trash2, Plus, Store, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

// 壓縮圖片至最大寬度並輸出為 WebP
async function compressImage(file: File, maxWidth = 800, quality = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            let width = img.width
            let height = img.height

            // 如果圖片寬度大於最大值，等比例縮小
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

// 產生 SKU：P + 月日 + 4位隨機英數字 (共 8 碼)
// 例如：P0125A7X3
function generateSKU(): string {
    const now = new Date()
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    const day = now.getDate().toString().padStart(2, '0')
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除容易混淆的 0/O, 1/I/L
    let rand = ''
    for (let i = 0; i < 4; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `P${month}${day}${rand}`
}

interface Variant {
    id: string
    name: string
    stock: number
}

const DEFAULT_VARIANTS: Record<string, string[]> = {
    '尺寸': ['S', 'M', 'L', 'XL'],
    '顏色': ['黑', '白', '灰'],
    '自訂': []
}

export default function NewProductPage() {
    const router = useRouter()
    const { tenant, isLoading: tenantLoading } = useTenant()
    const { canAccessShop } = usePermission()
    const supabase = createClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Form state
    const [name, setName] = useState('')
    const [sku, setSku] = useState('')  // 自訂 SKU（選填）
    const [price, setPrice] = useState('')
    const [cost, setCost] = useState('')
    const [stock, setStock] = useState('0')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('')
    const [isLimited, setIsLimited] = useState(false)
    const [endTime, setEndTime] = useState('')
    const [showInShop, setShowInShop] = useState(false)

    // SKU 驗證：僅允許英數字、連字號、底線，最多 50 字
    const isValidSku = (value: string): boolean => {
        if (!value) return true // 空白是允許的（後端會自動生成）
        if (value.length > 50) return false
        return /^[a-zA-Z0-9\-_]+$/.test(value)
    }
    const skuError = sku && !isValidSku(sku)
        ? (sku.length > 50 ? 'SKU 長度不可超過 50 字' : '僅允許英數字、連字號(-)、底線(_)')
        : null

    // Variants state
    const [isVariant, setIsVariant] = useState(false)
    const [variantType, setVariantType] = useState('尺寸')
    const [variants, setVariants] = useState<Variant[]>([
        { id: '1', name: 'S', stock: 0 },
        { id: '2', name: 'M', stock: 0 },
        { id: '3', name: 'L', stock: 0 },
        { id: '4', name: 'XL', stock: 0 },
    ])

    const handleVariantTypeChange = (type: string) => {
        setVariantType(type)
        if (type === '自訂') {
            setVariants([{ id: '1', name: '', stock: 0 }])
        } else {
            setVariants(DEFAULT_VARIANTS[type].map((name, i) => ({
                id: (i + 1).toString(),
                name,
                stock: 0
            })))
        }
    }

    const addVariant = () => {
        setVariants([...variants, { id: crypto.randomUUID(), name: '', stock: 0 }])
    }

    const removeVariant = (id: string) => {
        if (variants.length <= 1) {
            toast.error('至少需要一個規格選項')
            return
        }
        setVariants(variants.filter(v => v.id !== id))
    }

    const updateVariant = (id: string, field: keyof Variant, value: string | number) => {
        setVariants(variants.map(v =>
            v.id === id ? { ...v, [field]: value } : v
        ))
    }

    // Image state
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // 驗證檔案類型
        if (!file.type.startsWith('image/')) {
            toast.error('請選擇圖片檔案')
            return
        }

        // 驗證檔案大小（最大 10MB）
        if (file.size > 10 * 1024 * 1024) {
            toast.error('圖片大小不能超過 10MB')
            return
        }

        setImageFile(file)
        // 建立預覽
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

        if (!tenant) {
            toast.error('找不到租戶資料')
            return
        }

        if (!name.trim()) {
            toast.error('請輸入商品名稱')
            return
        }

        if (!price || parseFloat(price) <= 0) {
            toast.error('請輸入有效價格')
            return
        }

        // 驗證 SKU 格式（如果有輸入）
        if (sku && !isValidSku(sku)) {
            toast.error('SKU 格式錯誤：僅限英數字、連字號、底線，最多 50 字')
            return
        }

        setIsSubmitting(true)

        try {
            // 如果用戶有輸入 SKU 就用用戶的，否則用前端生成的（僅用於圖片檔名）
            const imageSku = sku.trim() || generateSKU()
            let imageUrl: string | null = null

            // 上傳圖片（如果有）
            if (imageFile) {
                setIsUploading(true)
                try {
                    // 壓縮圖片
                    const compressedBlob = await compressImage(imageFile)
                    const compressedFile = new File([compressedBlob], `${imageSku}.webp`, {
                        type: 'image/webp',
                    })

                    // 上傳到 Supabase Storage
                    const filePath = `${tenant.id}/products/${imageSku}.webp`
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('product-images')
                        .upload(filePath, compressedFile, {
                            cacheControl: '3600',
                            upsert: true,
                        })

                    if (uploadError) {
                        console.error('Upload error:', uploadError)
                        // 如果 bucket 不存在，繼續但不使用圖片
                        toast.warning('圖片上傳失敗，將建立不含圖片的商品')
                    } else {
                        // 取得公開 URL
                        const { data: { publicUrl } } = supabase.storage
                            .from('product-images')
                            .getPublicUrl(filePath)
                        imageUrl = publicUrl
                    }
                } catch (compressError) {
                    console.error('Compress error:', compressError)
                    toast.warning('圖片處理失敗，將建立不含圖片的商品')
                }
                setIsUploading(false)
            }

            // 建立商品
            if (isVariant) {
                // 驗證規格
                const variantNames = variants.map(v => v.name.trim())
                if (variantNames.some(n => !n)) {
                    toast.error('規格名稱不可為空')
                    setIsSubmitting(false)
                    setIsUploading(false)
                    return
                }
                if (variantNames.some(n => n.includes('_'))) {
                    toast.error('規格名稱不可包含底線 "_"')
                    setIsSubmitting(false)
                    setIsUploading(false)
                    return
                }
                if (new Set(variantNames).size !== variantNames.length) {
                    toast.error('規格名稱不可重複')
                    setIsSubmitting(false)
                    setIsUploading(false)
                    return
                }

                const { error } = await supabase.rpc('create_product_v2', {
                    p_tenant_id: tenant.id,
                    p_name: name.trim(),
                    p_price: parseFloat(price),
                    p_stock: 0, // 有規格時主商品庫存為 0
                    p_sku: sku.trim() || null, // 選填，空白時後端自動生成
                    p_is_limited: isLimited,
                    p_end_time: endTime ? new Date(endTime).toISOString() : null,
                    p_image_url: imageUrl,
                    p_description: description.trim() || null,
                    p_cost: cost ? parseFloat(cost) : null,
                    p_category: category.trim() || null,
                    p_limit_qty: null,
                    p_show_in_shop: showInShop,
                    p_variants: variants.map(v => ({
                        name: v.name.trim(),
                        price: parseFloat(price), // 規格價格預設與主商品相同
                        stock: v.stock
                    }))
                })

                if (error) throw error
            } else {
                const { error } = await supabase.rpc('create_product_v2', {
                    p_tenant_id: tenant.id,
                    p_name: name.trim(),
                    p_price: parseFloat(price),
                    p_stock: parseInt(stock) || 0,
                    p_sku: sku.trim() || null, // 選填，空白時後端自動生成
                    p_is_limited: isLimited,
                    p_end_time: endTime ? new Date(endTime).toISOString() : null,
                    p_image_url: imageUrl,
                    p_description: description.trim() || null,
                    p_cost: cost ? parseFloat(cost) : null,
                    p_category: category.trim() || null,
                    p_limit_qty: null,
                    p_show_in_shop: showInShop,
                    p_variants: null // 無規格商品
                })

                if (error) throw error
            }

            toast.success(`商品「${name}」建立成功！`)
            router.push(`/admin/t/${tenant.slug}/products`)
        } catch (error) {
            console.error('Create product error:', error)
            toast.error('建立商品失敗')
        } finally {
            setIsSubmitting(false)
            setIsUploading(false)
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
            <div className="flex items-center gap-4">
                <Link href={`/admin/t/${tenant.slug}/products`}>
                    <Button variant="ghost" size="icon" className="rounded-xl">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">新增商品</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">建立新商品，可自訂或自動產生 SKU</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* 左側：基本資訊 */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>基本資訊</CardTitle>
                                <CardDescription>商品的基本設定</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                                    <Label htmlFor="sku">
                                        SKU 編號
                                        <span className="text-muted-foreground font-normal ml-1">（選填，留空自動產生）</span>
                                    </Label>
                                    <Input
                                        id="sku"
                                        placeholder="例：COAT-BK-01"
                                        value={sku}
                                        onChange={(e) => setSku(e.target.value.toUpperCase())}
                                        className={`rounded-xl font-mono ${skuError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                        maxLength={50}
                                    />
                                    {skuError ? (
                                        <p className="text-xs text-destructive">⚠️ {skuError}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            僅限英數字、連字號、底線，會自動轉為大寫
                                        </p>
                                    )}
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
                                        <Label htmlFor="cost">成本（選填）</Label>
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

                                <div className="grid gap-4 sm:grid-cols-2">
                                </div>
                                {!isVariant && (
                                    <div className="space-y-2">
                                        <Label htmlFor="stock">初始庫存</Label>
                                        <Input
                                            id="stock"
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={stock}
                                            onChange={(e) => setStock(e.target.value)}
                                            className="rounded-xl"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="category">分類（選填）</Label>
                                    <Input
                                        id="category"
                                        placeholder="例：蛋糕、麵包"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>


                                <div className="space-y-2">
                                    <Label htmlFor="description">商品描述（選填）</Label>
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
                                <CardTitle>商品規格</CardTitle>
                                <CardDescription>設定商品的尺寸、顏色等規格選項</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>此商品有多種規格</Label>
                                        <p className="text-xs text-muted-foreground">
                                            開啟後可設定不同規格的庫存
                                        </p>
                                    </div>
                                    <Switch
                                        checked={isVariant}
                                        onCheckedChange={setIsVariant}
                                    />
                                </div>

                                {isVariant && (
                                    <>
                                        <div className="space-y-3">
                                            <Label>規格類型</Label>
                                            <div className="flex gap-2">
                                                {['尺寸', '顏色', '自訂'].map((type) => (
                                                    <Button
                                                        key={type}
                                                        type="button"
                                                        variant={variantType === type ? 'default' : 'outline'}
                                                        onClick={() => handleVariantTypeChange(type)}
                                                        className={`rounded-xl ${variantType === type ? 'gradient-primary' : ''}`}
                                                    >
                                                        {type}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label>規格選項</Label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={addVariant}
                                                    className="h-8 text-primary"
                                                >
                                                    <Plus className="mr-1 h-3 w-3" />
                                                    新增規格
                                                </Button>
                                            </div>

                                            <div className="border border-border/50 rounded-xl overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted/50">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">規格名稱</th>
                                                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-24">初始庫存</th>
                                                            <th className="px-4 py-2 text-right w-12"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/50">
                                                        {variants.map((variant) => (
                                                            <tr key={variant.id} className="bg-card">
                                                                <td className="p-2">
                                                                    <Input
                                                                        value={variant.name}
                                                                        onChange={(e) => updateVariant(variant.id, 'name', e.target.value)}
                                                                        placeholder="輸入名稱"
                                                                        className="h-9 rounded-lg border-0 bg-muted/50 focus-visible:bg-background focus-visible:ring-1"
                                                                    />
                                                                </td>
                                                                <td className="p-2">
                                                                    <Input
                                                                        type="number"
                                                                        value={variant.stock}
                                                                        onChange={(e) => updateVariant(variant.id, 'stock', parseInt(e.target.value) || 0)}
                                                                        className="h-9 rounded-lg border-0 bg-muted/50 focus-visible:bg-background focus-visible:ring-1"
                                                                    />
                                                                </td>
                                                                <td className="p-2 text-right">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => removeVariant(variant.id)}
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
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>銷售限制</CardTitle>
                                <CardDescription>設定商城顯示、限購與截止時間</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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

                                <div className="flex items-center justify-between">
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

                                <div className="space-y-2">
                                    <Label htmlFor="endTime">收單截止時間（選填）</Label>
                                    <Input
                                        id="endTime"
                                        type="datetime-local"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="rounded-xl"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* 右側：圖片上傳 */}
                    <div className="space-y-6">
                        <Card className="border-border/50">
                            <CardHeader>
                                <CardTitle>商品圖片</CardTitle>
                                <CardDescription>
                                    上傳商品圖片，系統會自動壓縮至適當大小
                                </CardDescription>
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
                                            <p className="text-xs text-muted-foreground">
                                                支援 JPG、PNG、WebP
                                            </p>
                                        </div>
                                    </button>
                                )}

                                <p className="text-xs text-muted-foreground mt-3">
                                    圖片將壓縮至最大 800px 寬度，格式轉換為 WebP 以減少檔案大小
                                </p>
                            </CardContent>
                        </Card>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={isSubmitting || isUploading}
                            className="w-full gradient-primary rounded-xl h-12"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {isUploading ? '上傳圖片中...' : '建立中...'}
                                </>
                            ) : (
                                '建立商品'
                            )}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                            未填寫 SKU 時，系統將自動產生編號
                        </p>
                    </div>
                </div>
            </form>
        </motion.div >
    )
}
