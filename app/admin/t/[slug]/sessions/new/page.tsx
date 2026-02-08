'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ArrowLeft, Camera, X, Loader2, Copy, Check, Package, Clock } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { getLiffShareUrl } from '@/hooks/use-liff'

// 快速時間選項
const QUICK_TIME_OPTIONS = [
  { label: '10分', minutes: 10 },
  { label: '30分', minutes: 30 },
  { label: '1hr', minutes: 60 },
  { label: '2hr', minutes: 120 },
]

// 計算截止時間（本地時區）
function getEndTimeFromMinutes(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60 * 1000)
  // 使用本地時區格式化，供 datetime-local input 使用
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${mins}`
}

// 格式化顯示時間（簡短版）
function formatEndTime(isoString: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 壓縮圖片
async function compressImage(file: File, maxWidth = 800, quality = 0.8): Promise<Blob> {
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

interface ProductItem {
  id: string
  file: File | null
  preview: string | null
  name: string
  price: string
  stock: string
  endTime: string
  isUploading: boolean
  isUploaded: boolean
  imageUrl: string | null
}

export default function NewSessionPage() {
  const router = useRouter()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 場次資訊
  const [title, setTitle] = useState('')
  const [defaultStock, setDefaultStock] = useState('') // 空 = 預購模式

  // 目前選擇的商品（用於設定截止時間）
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  // 商品列表
  const [products, setProducts] = useState<ProductItem[]>([])

  // 狀態
  const [isCreating, setIsCreating] = useState(false)
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 新增商品（拍照/選檔案）
  const handleAddProduct = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newProducts: ProductItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue

      // 建立預覽
      const preview = URL.createObjectURL(file)

      newProducts.push({
        id: crypto.randomUUID(),
        file,
        preview,
        name: '', // 商品名稱
        price: '',
        stock: defaultStock,
        endTime: '', // 每個商品各自設定
        isUploading: false,
        isUploaded: false,
        imageUrl: null,
      })
    }

    setProducts((prev) => [...prev, ...newProducts])

    // 清除 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 更新商品資訊
  const updateProduct = (id: string, field: keyof ProductItem, value: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  // 刪除商品
  const removeProduct = (id: string) => {
    setProducts((prev) => {
      const product = prev.find((p) => p.id === id)
      if (product?.preview) {
        URL.revokeObjectURL(product.preview)
      }
      return prev.filter((p) => p.id !== id)
    })
  }

  // 為單一商品設定快捷截止時間
  const setProductQuickEndTime = (productId: string, minutes: number) => {
    const formatted = getEndTimeFromMinutes(minutes)
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, endTime: formatted } : p))
    )
    setSelectedProductId(null)
  }

  // 為單一商品設定自訂截止時間
  const setProductCustomEndTime = (productId: string, datetime: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, endTime: datetime } : p))
    )
  }

  // 批次套用截止時間到所有未設定的商品
  const applyEndTimeToAll = (minutes: number) => {
    const formatted = getEndTimeFromMinutes(minutes)
    setProducts((prev) =>
      prev.map((p) => (p.endTime === '' ? { ...p, endTime: formatted } : p))
    )
    toast.success(`已套用到 ${products.filter(p => p.endTime === '').length} 個商品`)
  }

  // 建立場次並上架
  const handleCreate = async () => {
    if (!tenant) return

    if (!title.trim()) {
      toast.error('請輸入場次標題')
      return
    }

    if (products.length === 0) {
      toast.error('請至少上傳一張商品照片')
      return
    }

    // 檢查是否所有商品都有名稱和價格
    const missingName = products.some((p) => !p.name || p.name.trim() === '')
    if (missingName) {
      toast.error('請為所有商品填入名稱')
      return
    }

    const missingPrice = products.some((p) => !p.price || parseFloat(p.price) <= 0)
    if (missingPrice) {
      toast.error('請為所有商品填入價格')
      return
    }

    setIsCreating(true)

    try {
      // 1. 建立場次
      const { data: sessionData, error: sessionError } = await supabase.rpc(
        'create_purchase_session_v1',
        {
          p_tenant_id: tenant.id,
          p_title: title.trim(),
        }
      )

      if (sessionError) throw sessionError
      if (!sessionData.success) {
        toast.error(sessionData.error)
        return
      }

      const sessionId = sessionData.session_id

      // 2. 上傳圖片並建立商品
      for (let i = 0; i < products.length; i++) {
        const product = products[i]

        // 更新上傳狀態
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, isUploading: true } : p
          )
        )

        let imageUrl: string | null = null
        const productSku = `S${Date.now()}-${i + 1}`

        // 上傳圖片
        if (product.file) {
          try {
            const compressedBlob = await compressImage(product.file)
            const compressedFile = new File([compressedBlob], `${productSku}.webp`, {
              type: 'image/webp',
            })

            const filePath = `${tenant.id}/products/${productSku}.webp`
            const { error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(filePath, compressedFile, {
                cacheControl: '3600',
                upsert: true,
              })

            if (!uploadError) {
              const {
                data: { publicUrl },
              } = supabase.storage.from('product-images').getPublicUrl(filePath)
              imageUrl = publicUrl
            }
          } catch (err) {
            console.error('Upload error:', err)
          }
        }

        // 建立商品（直接插入 products 表，確保能取得 id）
        const { data: insertedProduct, error: productError } = await supabase
          .from('products')
          .insert({
            tenant_id: tenant.id,
            name: product.name.trim(),
            price: parseFloat(product.price),
            stock: product.stock ? parseInt(product.stock) : 0, // 預購模式用 0
            sku: productSku,
            status: 'active', // 使用 status 而非 is_active
            is_limited: false,
            end_time: product.endTime
              ? new Date(product.endTime).toISOString()
              : null,
            image_url: imageUrl,
            session_id: sessionId, // 直接設定 session_id
          })
          .select('id')
          .single()

        if (productError) {
          console.error('Create product error:', productError)
        } else {
          console.log('Created product:', insertedProduct?.id)
        }

        // 更新完成狀態
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? { ...p, isUploading: false, isUploaded: true, imageUrl }
              : p
          )
        )
      }

      setCreatedSessionId(sessionId)
      toast.success('場次建立成功！')
    } catch (err) {
      console.error('Create session error:', err)
      toast.error('建立失敗')
    } finally {
      setIsCreating(false)
    }
  }

  // 複製連結（使用 LIFF URL，LINE 內開啟自動授權）
  const copyLink = () => {
    if (!createdSessionId) return
    const url = getLiffShareUrl(`/s/${createdSessionId}`)
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('已複製連結')
    setTimeout(() => setCopied(false), 2000)
  }

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[400px] rounded-2xl" />
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

  // 建立成功畫面
  if (createdSessionId) {
    const shareUrl = getLiffShareUrl(`/s/${createdSessionId}`)

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto py-12"
      >
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">場次建立成功！</h2>
            <p className="text-muted-foreground mb-6">
              已上架 {products.length} 個商品
            </p>

            <div className="bg-muted rounded-xl p-3 mb-4">
              <p className="text-xs text-muted-foreground mb-1">分享連結</p>
              <p className="text-sm font-mono break-all">{shareUrl}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={copyLink}
              >
                {copied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? '已複製' : '複製連結'}
              </Button>
              <Link
                href={`/admin/t/${tenant.slug}/sessions/${createdSessionId}`}
                className="flex-1"
              >
                <Button className="w-full rounded-xl gradient-primary">
                  查看場次
                </Button>
              </Link>
            </div>

            <Link href={`/admin/t/${tenant.slug}/sessions`}>
              <Button variant="ghost" className="mt-4">
                返回列表
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/admin/t/${tenant.slug}/sessions`}>
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">建立代購場次</span>
          </h1>
          <p className="text-muted-foreground text-sm">拍照上架商品</p>
        </div>
      </div>

      {/* 場次設定 */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">場次資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">場次標題 *</Label>
            <Input
              id="title"
              placeholder="例：日本代購 2/6"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultStock">
              預設庫存
              <span className="text-muted-foreground font-normal ml-1">
                （空白 = 預購模式）
              </span>
            </Label>
            <Input
              id="defaultStock"
              type="number"
              min="0"
              placeholder="不填則開放預購"
              value={defaultStock}
              onChange={(e) => setDefaultStock(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* 批次套用截止時間 */}
          {products.some(p => p.endTime === '') && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                快速套用截止時間（未設定的商品）
              </Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_TIME_OPTIONS.map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => applyEndTimeToAll(opt.minutes)}
                  >
                    全部 +{opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 商品上傳區 */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">商品照片</CardTitle>
          <CardDescription>點擊或拍照新增商品</CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleAddProduct}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            {/* 已新增的商品 */}
            {products.map((product, index) => (
              <div
                key={product.id}
                className="relative rounded-xl overflow-hidden border bg-muted"
              >
                {/* 圖片區 */}
                <div className="relative aspect-square">
                  {product.preview && (
                    <Image
                      src={product.preview}
                      alt={`商品 ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  )}

                  {/* 編號 */}
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    #{index + 1}
                  </div>

                  {/* 上傳狀態 */}
                  {product.isUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  {product.isUploaded && (
                    <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}

                  {/* 刪除按鈕 */}
                  {!product.isUploading && !product.isUploaded && (
                    <button
                      type="button"
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
                      onClick={() => removeProduct(product.id)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 輸入區 */}
                <div className="p-2 space-y-2 bg-background">
                  {/* 價格輸入 */}
                  {/* 商品名稱 */}
                  <Input
                    type="text"
                    placeholder="商品名稱"
                    value={product.name}
                    onChange={(e) =>
                      updateProduct(product.id, 'name', e.target.value)
                    }
                    className="h-8 text-sm rounded-lg"
                    disabled={product.isUploading || product.isUploaded}
                  />

                  {/* 價格 */}
                  <Input
                    type="number"
                    placeholder="價格 $"
                    value={product.price}
                    onChange={(e) =>
                      updateProduct(product.id, 'price', e.target.value)
                    }
                    className="h-8 text-sm rounded-lg"
                    disabled={product.isUploading || product.isUploaded}
                  />

                  {/* 截止時間 */}
                  {!product.isUploading && !product.isUploaded && (
                    <div className="space-y-1">
                      {selectedProductId === product.id ? (
                        // 展開的時間選擇器
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {QUICK_TIME_OPTIONS.map((opt) => (
                              <Button
                                key={opt.label}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs rounded"
                                onClick={() => setProductQuickEndTime(product.id, opt.minutes)}
                              >
                                +{opt.label}
                              </Button>
                            ))}
                          </div>
                          <Input
                            type="datetime-local"
                            value={product.endTime}
                            onChange={(e) => setProductCustomEndTime(product.id, e.target.value)}
                            className="h-7 text-xs rounded-lg"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-full text-xs"
                            onClick={() => setSelectedProductId(null)}
                          >
                            收起
                          </Button>
                        </div>
                      ) : (
                        // 收起的狀態
                        <button
                          type="button"
                          className={`w-full flex items-center justify-center gap-1 h-7 text-xs rounded-lg border transition-colors ${
                            product.endTime
                              ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400'
                              : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50'
                          }`}
                          onClick={() => setSelectedProductId(product.id)}
                        >
                          <Clock className="w-3 h-3" />
                          {product.endTime ? formatEndTime(product.endTime) : '設定截止時間'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 新增按鈕 */}
            <button
              type="button"
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCreating}
            >
              <Camera className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">新增</span>
            </button>
          </div>

          {products.length === 0 && (
            <p className="text-center text-muted-foreground text-sm mt-4">
              點擊上方按鈕拍照或選擇照片
            </p>
          )}
        </CardContent>
      </Card>

      {/* 底部按鈕 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t safe-bottom">
        <div className="max-w-2xl mx-auto">
          <Button
            className="w-full gradient-primary rounded-xl h-12"
            onClick={handleCreate}
            disabled={isCreating || products.length === 0}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                建立中...
              </>
            ) : (
              <>
                <Package className="w-4 h-4 mr-2" />
                建立場次（{products.length} 個商品）
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
