'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTenant } from '@/hooks/use-tenant'
import { usePermission } from '@/hooks/use-permission'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
    Store,
    Image as ImageIcon,
    Upload,
    X,
    Loader2,
    GripVertical,
    Plus,
    Trash2,
    Eye,
    Copy,
    Check,
    Palette,
    Type,
    Tag,
    Megaphone,
    ArrowUp,
    ArrowDown,
    Smartphone,
    Package,
    Clock,
    Flame,
    ShoppingCart,
    Shield,
    ExternalLink,
    Lock,
    ScrollText,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

// 壓縮圖片
async function compressImage(file: File, maxWidth = 1200, quality = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new window.Image()
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
                    if (blob) resolve(blob)
                    else reject(new Error('Failed to compress'))
                },
                'image/webp',
                quality,
            )
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
    })
}

interface ShopSettings {
    banner_url?: string | null
    banner_scale?: number | null
    banner_position_x?: number | null
    banner_position_y?: number | null
    announcement?: string | null
    shopping_notice?: string | null
    accent_color?: string | null
    product_sort?: 'created_at' | 'sold_qty' | 'manual'
}

interface ShopCategory {
    id?: string
    name: string
    sort_order: number
    is_visible: boolean
}

const ACCENT_COLORS = [
    { name: '預設', value: '' },
    { name: '珊瑚粉', value: '#FF6B6B' },
    { name: '薄荷綠', value: '#51CF66' },
    { name: '天空藍', value: '#339AF0' },
    { name: '薰衣草', value: '#845EF7' },
    { name: '琥珀橘', value: '#FF922B' },
    { name: '玫瑰紅', value: '#E64980' },
    { name: '青碧', value: '#20C997' },
]

export default function ShopManagePage() {
    const { tenant, isLoading: tenantLoading } = useTenant()
    const { canAccessShop } = usePermission()
    const supabaseRef = useRef(createClient())
    const supabase = supabaseRef.current

    // Settings state
    const [settings, setSettings] = useState<ShopSettings>({})
    const [categories, setCategories] = useState<ShopCategory[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    // Banner upload
    const [bannerFile, setBannerFile] = useState<File | null>(null)
    const [bannerPreview, setBannerPreview] = useState<string | null>(null)
    const [isUploadingBanner, setIsUploadingBanner] = useState(false)
    const bannerInputRef = useRef<HTMLInputElement>(null)

    // Category editing
    const [newCategoryName, setNewCategoryName] = useState('')

    // LIFF URL copy
    const [copied, setCopied] = useState(false)

    // Load settings
    const loadSettings = useCallback(async () => {
        if (!tenant?.id) return

        try {
            const { data, error } = await supabase.rpc('get_shop_settings_v1', {
                p_tenant_id: tenant.id,
            })

            if (error) throw error

            if (data?.success) {
                setSettings(data.settings || {})
                setCategories(data.categories || [])
            }
        } catch (err) {
            console.error('Load shop settings error:', err)
            toast.error('載入商城設定失敗')
        } finally {
            setIsLoading(false)
        }
    }, [tenant?.id, supabase])

    useEffect(() => {
        if (tenant?.id) loadSettings()
    }, [tenant?.id, loadSettings])

    // Banner upload handler
    const handleBannerUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('請選擇圖片檔案')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('圖片大小不能超過 10MB')
            return
        }

        setBannerFile(file)
        const reader = new FileReader()
        reader.onloadend = () => setBannerPreview(reader.result as string)
        reader.readAsDataURL(file)
    }

    // Save settings
    const handleSave = async () => {
        if (!tenant?.id) return

        setIsSaving(true)
        try {
            let bannerUrl = settings.banner_url || null

            // Upload banner if new file selected
            if (bannerFile) {
                setIsUploadingBanner(true)
                try {
                    const compressed = await compressImage(bannerFile, 1200, 0.85)
                    const filePath = `${tenant.id}/shop/banner-${Date.now()}.webp`
                    const compressedFile = new File([compressed], 'banner.webp', { type: 'image/webp' })

                    const { error: uploadError } = await supabase.storage
                        .from('product-images')
                        .upload(filePath, compressedFile, {
                            cacheControl: '3600',
                            upsert: true,
                        })

                    if (!uploadError) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('product-images')
                            .getPublicUrl(filePath)
                        bannerUrl = publicUrl
                    } else {
                        console.error('Banner upload error:', uploadError)
                        toast.warning('Banner 上傳失敗，其他設定仍會儲存')
                    }
                } catch (err) {
                    console.error('Banner compress error:', err)
                } finally {
                    setIsUploadingBanner(false)
                }
            }

            // Save shop settings
            const { data: settingsResult, error: settingsError } = await supabase.rpc('update_shop_settings_v1', {
                p_tenant_id: tenant.id,
                p_line_user_id: '', // 後台已有認證，此處用空字串
                p_settings: {
                    banner_url: bannerUrl,
                    banner_scale: settings.banner_scale || 1,
                    banner_position_x: settings.banner_position_x ?? 50,
                    banner_position_y: settings.banner_position_y ?? 50,
                    announcement: settings.announcement || null,
                    shopping_notice: settings.shopping_notice || null,
                    accent_color: settings.accent_color || null,
                    product_sort: settings.product_sort || 'created_at',
                },
            })

            if (settingsError) throw settingsError
            if (!settingsResult?.success) throw new Error(settingsResult?.error || '儲存失敗')

            // Save categories
            const { data: catResult, error: catError } = await supabase.rpc('upsert_shop_categories_v1', {
                p_tenant_id: tenant.id,
                p_line_user_id: '',
                p_categories: categories.map((c, i) => ({
                    name: c.name,
                    sort_order: i,
                    is_visible: c.is_visible,
                })),
            })

            if (catError) throw catError
            if (!catResult?.success) throw new Error(catResult?.error || '儲存分類失敗')

            // Update local state
            setSettings(prev => ({ ...prev, banner_url: bannerUrl }))
            setBannerFile(null)

            toast.success('商城設定已儲存')
            loadSettings()
        } catch (err) {
            console.error('Save shop settings error:', err)
            toast.error('儲存失敗')
        } finally {
            setIsSaving(false)
        }
    }

    // Category operations
    const addCategory = () => {
        const name = newCategoryName.trim()
        if (!name) return
        if (categories.some(c => c.name === name)) {
            toast.error('分類名稱已存在')
            return
        }
        setCategories(prev => [...prev, { name, sort_order: prev.length, is_visible: true }])
        setNewCategoryName('')
    }

    const removeCategory = (index: number) => {
        setCategories(prev => prev.filter((_, i) => i !== index))
    }

    const moveCategory = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= categories.length) return
        setCategories(prev => {
            const arr = [...prev]
            const temp = arr[index]
            arr[index] = arr[newIndex]
            arr[newIndex] = temp
            return arr
        })
    }

    const toggleCategoryVisibility = (index: number) => {
        setCategories(prev => prev.map((c, i) =>
            i === index ? { ...c, is_visible: !c.is_visible } : c
        ))
    }

    // Copy LIFF URL（優先使用租戶專屬 LIFF ID）
    const copyLiffUrl = () => {
        if (!tenant?.slug) return
        const liffId = tenant.liff_id || process.env.NEXT_PUBLIC_LIFF_ID || ''
        const url = liffId
            ? `https://liff.line.me/${liffId}/s/shop/${tenant.slug}`
            : `${window.location.origin}/s/shop/${tenant.slug}`
        navigator.clipboard.writeText(url)
        setCopied(true)
        toast.success('已複製商城連結')
        setTimeout(() => setCopied(false), 2000)
    }

    // Remove banner
    const removeBanner = () => {
        setSettings(prev => ({ ...prev, banner_url: null }))
        setBannerFile(null)
        setBannerPreview(null)
    }

    // Get display banner URL
    const displayBannerUrl = bannerPreview || settings.banner_url

    // Plan guard: Basic 方案不可存取商城
    if (!tenantLoading && !canAccessShop) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
            >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                    <Lock className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold mb-2">商城功能為 Pro 方案專屬</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                    升級至 Pro 方案即可使用 LIFF 商城、自訂外觀、分類管理等功能。請聯繫平台管理員升級方案。
                </p>
                <Link href={`/admin/t/${tenant?.slug}`}>
                    <Button variant="outline" className="rounded-xl">
                        返回儀表板
                    </Button>
                </Link>
            </motion.div>
        )
    }

    if (tenantLoading || isLoading) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 max-w-7xl mx-auto space-y-6"
            >
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
                <div className="grid gap-6 lg:grid-cols-5">
                    <div className="lg:col-span-3 space-y-6">
                        <Skeleton className="h-48 rounded-xl" />
                        <Skeleton className="h-32 rounded-xl" />
                    </div>
                    <div className="lg:col-span-2">
                        <Skeleton className="h-[600px] rounded-xl" />
                    </div>
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 max-w-7xl mx-auto"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Store className="h-6 w-6 text-primary" />
                        商城管理
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        設定 LIFF 商城的外觀、分類排序和視覺效果
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyLiffUrl}
                        className="gap-1.5"
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? '已複製' : '複製商城連結'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const url = `/s/shop/${tenant?.slug}`
                            window.open(url, '_blank')
                        }}
                        className="gap-1.5"
                    >
                        <ExternalLink className="h-4 w-4" />
                        開啟商城
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="gap-1.5"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        儲存設定
                    </Button>
                </div>
            </div>

            {/* Main Content: Settings + Preview */}
            <div className="grid gap-6 lg:grid-cols-5">
                {/* Left: Settings */}
                <div className="lg:col-span-3 space-y-6">
                    <Tabs defaultValue="appearance">
                        <TabsList className="mb-4">
                            <TabsTrigger value="appearance" className="gap-1.5">
                                <Palette className="h-4 w-4" />
                                外觀
                            </TabsTrigger>
                            <TabsTrigger value="categories" className="gap-1.5">
                                <Tag className="h-4 w-4" />
                                分類
                            </TabsTrigger>
                        </TabsList>

                        {/* Tab: 外觀設定 */}
                        <TabsContent value="appearance" className="space-y-6">
                            {/* Banner */}
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <ImageIcon className="h-5 w-5" />
                                        標題背景圖
                                    </CardTitle>
                                    <CardDescription>
                                        顯示在商城標題列的背景，寬度撐滿、高度貼齊標題區
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <input
                                        ref={bannerInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) handleBannerUpload(file)
                                        }}
                                    />
                                    {displayBannerUrl ? (() => {
                                        const scale = settings.banner_scale || 1
                                        const posX = settings.banner_position_x ?? 50
                                        const posY = settings.banner_position_y ?? 50

                                        return (
                                            <div className="space-y-2">
                                                <div className="relative group">
                                                    <div
                                                        className="aspect-[3/1] rounded-xl overflow-hidden bg-muted cursor-grab active:cursor-grabbing select-none"
                                                        style={{
                                                            backgroundImage: `url(${displayBannerUrl})`,
                                                            backgroundSize: `${scale * 100}%`,
                                                            backgroundPosition: `${posX}% ${posY}%`,
                                                            backgroundRepeat: 'no-repeat',
                                                        }}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault()
                                                            const startX = e.clientX
                                                            const startY = e.clientY
                                                            const startPosX = posX
                                                            const startPosY = posY
                                                            const rect = e.currentTarget.getBoundingClientRect()
                                                            // Sensitivity scales with zoom: more zoomed = finer control
                                                            const sensitivity = 100 / (rect.width * (scale - 1 + 0.5))

                                                            const handleMouseMove = (ev: MouseEvent) => {
                                                                const dx = (ev.clientX - startX) * sensitivity * -100
                                                                const dy = (ev.clientY - startY) * sensitivity * -100
                                                                setSettings(prev => ({
                                                                    ...prev,
                                                                    banner_position_x: Math.max(0, Math.min(100, startPosX + dx)),
                                                                    banner_position_y: Math.max(0, Math.min(100, startPosY + dy)),
                                                                }))
                                                            }
                                                            const handleMouseUp = () => {
                                                                window.removeEventListener('mousemove', handleMouseMove)
                                                                window.removeEventListener('mouseup', handleMouseUp)
                                                            }
                                                            window.addEventListener('mousemove', handleMouseMove)
                                                            window.addEventListener('mouseup', handleMouseUp)
                                                        }}
                                                        onWheel={(e) => {
                                                            e.preventDefault()
                                                            const delta = e.deltaY > 0 ? -0.05 : 0.05
                                                            setSettings(prev => ({
                                                                ...prev,
                                                                banner_scale: Math.max(1, Math.min(3, (prev.banner_scale || 1) + delta)),
                                                            }))
                                                        }}
                                                    />
                                                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="secondary"
                                                            size="icon"
                                                            className="h-8 w-8 rounded-lg bg-background/80 backdrop-blur"
                                                            onClick={() => bannerInputRef.current?.click()}
                                                        >
                                                            <Upload className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="icon"
                                                            className="h-8 w-8 rounded-lg"
                                                            onClick={removeBanner}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                    {/* Zoom indicator */}
                                                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {Math.round(scale * 100)}%
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs text-muted-foreground">
                                                        滾輪縮放 · 拖曳移動位置
                                                    </p>
                                                    {(scale !== 1 || posX !== 50 || posY !== 50) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 text-xs px-2"
                                                            onClick={() => setSettings(prev => ({
                                                                ...prev,
                                                                banner_scale: 1,
                                                                banner_position_x: 50,
                                                                banner_position_y: 50,
                                                            }))}
                                                        >
                                                            重置
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })() : (
                                        <div
                                            className="aspect-[3/1] rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                                            onClick={() => bannerInputRef.current?.click()}
                                        >
                                            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                            <p className="text-sm text-muted-foreground">點擊上傳標題背景圖</p>
                                            <p className="text-xs text-muted-foreground/60 mt-1">建議寬 1200px，支援 JPG / PNG / WebP</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Announcement */}
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Megaphone className="h-5 w-5" />
                                        商城公告
                                    </CardTitle>
                                    <CardDescription>
                                        顯示在商城頂部的公告文字，例如出貨時間、活動資訊
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        placeholder="例：每週三固定出貨，滿 $500 免運！"
                                        value={settings.announcement || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, announcement: e.target.value }))}
                                        className="rounded-xl resize-none"
                                        rows={2}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        留空則不顯示公告列
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Shopping Notice */}
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <ScrollText className="h-5 w-5" />
                                        購物須知
                                    </CardTitle>
                                    <CardDescription>
                                        首次進入商城的顧客需同意此須知才能購物，不同意則關閉商城
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        placeholder={`範例：
1. 本商城為代購/連線直播商品，下單後請耐心等候到貨通知
2. 商品圖片皆為現場實拍，可能因光線色差略有不同
3. 下單後如需取消，請於截止前透過 LINE 聯繫客服`}
                                        value={settings.shopping_notice || ''}
                                        onChange={(e) => setSettings(prev => ({ ...prev, shopping_notice: e.target.value }))}
                                        className="rounded-xl resize-none"
                                        rows={6}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        留空則不顯示購物須知彈窗
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Accent Color */}
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Palette className="h-5 w-5" />
                                        主題色
                                    </CardTitle>
                                    <CardDescription>
                                        影響商城的按鈕、Badge 和強調色
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {ACCENT_COLORS.map((color) => (
                                            <button
                                                key={color.value}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${(settings.accent_color || '') === color.value
                                                    ? 'border-primary ring-2 ring-primary/20'
                                                    : 'border-border hover:border-primary/50'
                                                    }`}
                                                onClick={() => setSettings(prev => ({ ...prev, accent_color: color.value }))}
                                            >
                                                <div
                                                    className="h-5 w-5 rounded-full border"
                                                    style={{
                                                        backgroundColor: color.value || 'hsl(var(--primary))',
                                                    }}
                                                />
                                                <span className="text-sm">{color.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Product Sort */}
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Type className="h-5 w-5" />
                                        商品排序
                                    </CardTitle>
                                    <CardDescription>
                                        控制商品在商城中的預設排列順序
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { value: 'created_at', label: '最新上架', desc: '新品排前面' },
                                            { value: 'sold_qty', label: '熱銷排序', desc: '銷量高的排前面' },
                                            { value: 'manual', label: '手動排序', desc: '依商品管理順序' },
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                className={`p-3 rounded-xl border text-left transition-all ${(settings.product_sort || 'created_at') === opt.value
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                                    : 'border-border hover:border-primary/50'
                                                    }`}
                                                onClick={() => setSettings(prev => ({
                                                    ...prev,
                                                    product_sort: opt.value as ShopSettings['product_sort'],
                                                }))}
                                            >
                                                <p className="text-sm font-medium">{opt.label}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Tab: 分類管理 */}
                        <TabsContent value="categories" className="space-y-6">
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Tag className="h-5 w-5" />
                                        分類標籤
                                    </CardTitle>
                                    <CardDescription>
                                        管理商城頂部的分類篩選標籤，拖曳可調整順序
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Add category */}
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="輸入分類名稱，例：日本代購"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    addCategory()
                                                }
                                            }}
                                            className="rounded-xl"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={addCategory}
                                            disabled={!newCategoryName.trim()}
                                            className="shrink-0 gap-1"
                                        >
                                            <Plus className="h-4 w-4" />
                                            新增
                                        </Button>
                                    </div>

                                    {/* Category list */}
                                    {categories.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">還沒有分類標籤</p>
                                            <p className="text-xs mt-1">新增分類後，商品的 category 欄位需與分類名稱一致才會歸類</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {categories.map((cat, index) => (
                                                <div
                                                    key={`${cat.name}-${index}`}
                                                    className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${cat.is_visible ? 'bg-card' : 'bg-muted/50 opacity-60'
                                                        }`}
                                                >
                                                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="secondary" className="text-xs">
                                                                #{cat.name}
                                                            </Badge>
                                                            {!cat.is_visible && (
                                                                <span className="text-xs text-muted-foreground">（已隱藏）</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => moveCategory(index, 'up')}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => moveCategory(index, 'down')}
                                                            disabled={index === categories.length - 1}
                                                        >
                                                            <ArrowDown className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Switch
                                                            checked={cat.is_visible}
                                                            onCheckedChange={() => toggleCategoryVisibility(index)}
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                                            onClick={() => removeCategory(index)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <p className="text-xs text-muted-foreground">
                                        💡 分類名稱需與商品的「分類」欄位一致。例如分類「日本代購」對應商品的 category = &quot;日本代購&quot;
                                    </p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right: Live Preview */}
                <div className="lg:col-span-2">
                    <div className="sticky top-20">
                        <div className="flex items-center gap-2 mb-3">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium text-muted-foreground">手機預覽</h3>
                        </div>
                        <ShopPreview
                            tenantName={tenant?.name || '商城'}
                            settings={settings}
                            categories={categories}
                            bannerPreview={bannerPreview}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ===== LIFF 手機預覽元件 =====
function ShopPreview({
    tenantName,
    settings,
    categories,
    bannerPreview,
}: {
    tenantName: string
    settings: ShopSettings
    categories: ShopCategory[]
    bannerPreview: string | null
}) {
    const accentColor = settings.accent_color || ''
    const bannerUrl = bannerPreview || settings.banner_url
    const visibleCategories = categories.filter(c => c.is_visible)

    // 模擬商品資料
    const mockProducts = [
        { name: '日本北海道牛奶糖', price: 280, sold: 12, hasTime: true, stock: 5 },
        { name: '韓國辣炒年糕', price: 150, sold: 8, hasTime: false, stock: 0 },
        { name: '泰國芒果乾', price: 120, sold: 3, hasTime: false, stock: 20 },
        { name: '法國鱈魚肝罐頭', price: 450, sold: 0, hasTime: true, stock: 3 },
        { name: '澳洲蜂蜜', price: 380, sold: 25, hasTime: false, stock: 0 },
        { name: '義大利橄欖油', price: 520, sold: 1, hasTime: false, stock: 10 },
    ]

    return (
        <div className="w-full max-w-[375px] mx-auto bg-background border rounded-[2rem] overflow-hidden shadow-lg">
            {/* Phone frame */}
            <div className="relative">
                {/* Status bar */}
                <div className="h-6 bg-black flex items-center justify-center">
                    <div className="w-20 h-1 bg-gray-700 rounded-full" />
                </div>

                {/* App content */}
                <div className="h-[640px] overflow-y-auto bg-background">
                    {/* Header（含背景圖） */}
                    <div className="sticky top-0 z-10 border-b px-3 py-2 relative overflow-hidden">
                        {bannerUrl ? (
                            <>
                                <div
                                    className="absolute inset-0"
                                    style={{
                                        backgroundImage: `url(${bannerUrl})`,
                                        backgroundSize: `${(settings.banner_scale || 1) * 100}%`,
                                        backgroundPosition: `${settings.banner_position_x ?? 50}% ${settings.banner_position_y ?? 50}%`,
                                        backgroundRepeat: 'no-repeat',
                                    }}
                                />
                                <div className="absolute inset-0 bg-black/50" />
                            </>
                        ) : (
                            <div className="absolute inset-0 bg-background/95 backdrop-blur" />
                        )}
                        <div className="relative z-10">
                            <div className="flex items-center gap-1.5">
                                <Store
                                    className="w-4 h-4"
                                    style={bannerUrl ? { color: 'white' } : accentColor ? { color: accentColor } : undefined}
                                />
                                <span className={`text-sm font-bold truncate ${bannerUrl ? 'text-white' : ''}`}>{tenantName}</span>
                                <Badge
                                    className="text-[10px] px-1 py-0"
                                    style={accentColor ? {
                                        backgroundColor: `${accentColor}15`,
                                        color: accentColor,
                                        borderColor: `${accentColor}30`,
                                    } : undefined}
                                >
                                    <Shield className="w-2.5 h-2.5 mr-0.5" />
                                    管理
                                </Badge>
                            </div>
                            <p className={`text-[10px] mt-0.5 ${bannerUrl ? 'text-green-400' : 'text-green-600'}`}>營業中</p>
                        </div>
                    </div>

                    {/* Announcement */}
                    {settings.announcement && (
                        <div
                            className="mx-2 mt-2 px-3 py-2 rounded-lg text-xs"
                            style={accentColor ? {
                                backgroundColor: `${accentColor}10`,
                                color: accentColor,
                                border: `1px solid ${accentColor}20`,
                            } : {
                                backgroundColor: 'hsl(var(--primary) / 0.05)',
                                border: '1px solid hsl(var(--primary) / 0.1)',
                            }}
                        >
                            <Megaphone className="w-3 h-3 inline mr-1" />
                            {settings.announcement}
                        </div>
                    )}

                    {/* Category pills */}
                    {visibleCategories.length > 0 && (
                        <div className="px-2 pt-2 flex gap-1 overflow-x-auto scrollbar-hide">
                            <span
                                className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                                style={{ backgroundColor: accentColor || 'hsl(var(--primary))' }}
                            >
                                全部
                            </span>
                            {visibleCategories.map(cat => (
                                <span
                                    key={cat.name}
                                    className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
                                >
                                    #{cat.name}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Product grid */}
                    <div className="grid grid-cols-3 gap-1.5 p-2">
                        {mockProducts.map((product, i) => {
                            const isHot = product.sold >= 5
                            return (
                                <div
                                    key={i}
                                    className="relative rounded-lg overflow-hidden bg-card border"
                                >
                                    {/* Sold badge */}
                                    {product.sold > 0 && (
                                        <div
                                            className={`absolute top-0.5 left-0.5 z-10 px-1 py-0.5 rounded-full text-[8px] font-bold text-white ${isHot ? 'bg-red-500' : 'bg-black/60'
                                                }`}
                                        >
                                            +{product.sold}
                                            {isHot && <Flame className="inline w-2 h-2 ml-0.5" />}
                                        </div>
                                    )}

                                    {/* Time / Mode badge */}
                                    {product.hasTime ? (
                                        <div className="absolute top-0.5 right-0.5 z-10 px-1 py-0.5 rounded-full text-[8px] bg-orange-500 text-white">
                                            <Clock className="inline w-2 h-2 mr-0.5" />
                                            2h
                                        </div>
                                    ) : product.sold === 0 && (
                                        <div
                                            className="absolute top-0.5 right-0.5 z-10 px-1 py-0.5 rounded-full text-[8px] text-white"
                                            style={{
                                                backgroundColor: product.stock > 0
                                                    ? (accentColor || '#22c55e')
                                                    : '#3b82f6',
                                            }}
                                        >
                                            {product.stock > 0 ? '現貨' : '預購'}
                                        </div>
                                    )}

                                    {/* Image placeholder */}
                                    <div className="aspect-square bg-muted flex items-center justify-center">
                                        <Package className="w-5 h-5 text-muted-foreground/30" />
                                    </div>

                                    {/* Info */}
                                    <div className="p-1">
                                        <p className="text-[9px] truncate leading-tight">{product.name}</p>
                                        <p
                                            className="text-[10px] font-bold"
                                            style={accentColor ? { color: accentColor } : undefined}
                                        >
                                            ${product.price}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-background border-t px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 bg-muted rounded-full" />
                        <span className="text-[10px]">我的名字</span>
                    </div>
                    <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] text-white"
                        style={{ backgroundColor: accentColor || 'hsl(var(--primary))' }}
                    >
                        <ShoppingCart className="w-3 h-3" />
                        我的訂單
                    </div>
                </div>
            </div>
        </div>
    )
}
