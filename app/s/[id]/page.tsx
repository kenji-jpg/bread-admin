'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useLiff } from '@/hooks/use-liff'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ShoppingCart,
  Clock,
  Flame,
  Package,
  Minus,
  Plus,
  X,
  Loader2,
  Shield,
  PackagePlus,
  XCircle,
  Users,
  Camera,
} from 'lucide-react'
import Image from 'next/image'

// 壓縮圖片（複製自 sessions/new/page.tsx）
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

interface Product {
  id: string
  name: string
  price: number
  stock: number | null
  sold_qty: number
  image_url: string | null
  description: string | null
  end_time: string | null
  is_limited: boolean
  limit_qty: number | null
  status: string
  is_expired: boolean
  is_sold_out: boolean
  created_at: string
}

interface Session {
  id: string
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  title: string
  description: string | null
  status: string
  created_at: string
  closed_at: string | null
  is_open: boolean
}

interface PreorderItem {
  id: string
  product_id: string
  product_name: string
  product_image: string | null
  quantity: number
  arrived_qty: number
  unit_price: number
  subtotal: number
  status: string
  can_modify: boolean
}

interface StaffPreorderItem {
  id: string
  product_id: string
  product_name: string
  member_name: string
  member_picture: string | null
  quantity: number
  arrived_qty: number
  unit_price: number
  status: string
  created_at: string
}

interface StaffStats {
  total_orders: number
  pending_count: number
  allocated_count: number
  cancelled_count: number
  total_sales: number
}

export default function SessionShopPage() {
  const params = useParams()
  const sessionId = params.id as string
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const { isReady, isLoggedIn, profile, login, isInClient } = useLiff()

  // 狀態
  const [session, setSession] = useState<Session | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [preorders, setPreorders] = useState<PreorderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 選購 Modal 狀態
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [isOrdering, setIsOrdering] = useState(false)

  // 購物車 Drawer 狀態
  const [isCartOpen, setIsCartOpen] = useState(false)

  // ========== 管理員模式 ==========
  const [isStaff, setIsStaff] = useState(false)
  const [staffRole, setStaffRole] = useState<string | null>(null)
  const [allPreorders, setAllPreorders] = useState<StaffPreorderItem[]>([])
  const [staffStats, setStaffStats] = useState<StaffStats | null>(null)
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)

  // 補貨 Modal
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [isRestocking, setIsRestocking] = useState(false)

  // 關閉收單
  const [isClosing, setIsClosing] = useState(false)

  // 上架 Modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductStock, setNewProductStock] = useState('')
  const [newProductImage, setNewProductImage] = useState<File | null>(null)
  const [newProductPreview, setNewProductPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const addProductFileRef = useRef<HTMLInputElement>(null)

  // 載入場次資料
  const loadSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_session_products_v1', {
        p_session_id: sessionId,
      })

      if (error) throw error

      if (!data.success) {
        setError(data.error)
        return
      }

      setSession(data.session)
      setProducts(data.products || [])
    } catch (err) {
      console.error('Load session error:', err)
      setError('載入失敗')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, supabase])

  // 載入我的喊單
  const loadPreorders = useCallback(async () => {
    if (!profile?.userId || !session?.tenant_id) return

    try {
      const { data, error } = await supabase.rpc('get_member_preorders_v1', {
        p_session_id: sessionId,
        p_line_user_id: profile.userId,
      })

      if (error) throw error

      if (data.success) {
        setPreorders(data.orders || [])
      }
    } catch (err) {
      console.error('Load preorders error:', err)
    }
  }, [sessionId, profile?.userId, session?.tenant_id, supabase])

  // 檢查是否為管理員（不用 useCallback，直接在 effect 中呼叫避免 timing issue）
  const staffCheckedRef = useRef(false)

  // 載入全部預購訂單（管理員）
  const loadAllPreorders = useCallback(async () => {
    if (!profile?.userId || !isStaff) return

    try {
      const { data, error } = await supabase.rpc('get_session_all_preorders_v1', {
        p_session_id: sessionId,
        p_line_user_id: profile.userId,
      })

      if (error) throw error

      if (data.success) {
        setAllPreorders(data.orders || [])
        setStaffStats(data.stats || null)
      }
    } catch (err) {
      console.error('Load all preorders error:', err)
    }
  }, [sessionId, profile?.userId, isStaff, supabase])

  // 初始載入
  useEffect(() => {
    loadSession()
  }, [loadSession])

  // 登入後載入喊單 + 檢查管理員
  useEffect(() => {
    if (isLoggedIn && profile && session) {
      loadPreorders()

      // 只檢查一次管理員身份（避免重複呼叫）
      if (!staffCheckedRef.current) {
        staffCheckedRef.current = true
        console.log('[LIFF] Checking staff role:', profile.userId, session.tenant_id)
        ;(async () => {
          try {
            const { data, error } = await supabase.rpc('check_staff_by_line_id_v1', {
              p_line_user_id: profile.userId,
              p_tenant_id: session.tenant_id,
            })
            if (error) {
              console.error('[LIFF] Check staff RPC error:', error)
              return
            }
            console.log('[LIFF] Staff check result:', data)
            if (data?.success && data.is_staff) {
              setIsStaff(true)
              setStaffRole(data.role)
            }
          } catch (err) {
            console.error('[LIFF] Check staff error:', err)
          }
        })()
      }
    }
  }, [isLoggedIn, profile, session, loadPreorders, supabase])

  // 管理員身份確認後，載入全部訂單
  useEffect(() => {
    if (isStaff) {
      loadAllPreorders()
    }
  }, [isStaff, loadAllPreorders])

  // Realtime 訂閱 - 商品更新（sold_qty, stock 即時跳動）
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === payload.new.id
                ? { ...p, sold_qty: payload.new.sold_qty, stock: payload.new.stock }
                : p
            )
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'products',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          // 新商品加入 → 重新載入
          loadSession()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, loadSession])

  // 喊單
  const handleOrder = async () => {
    if (!selectedProduct || !profile || !session) return

    setIsOrdering(true)
    try {
      const { data, error } = await supabase.rpc('create_preorder_v1', {
        p_tenant_id: session.tenant_id,
        p_product_id: selectedProduct.id,
        p_line_user_id: profile.userId,
        p_quantity: quantity,
        p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error)
        return
      }

      toast.success(`已喊單 ${selectedProduct.name} x${quantity}`)
      setSelectedProduct(null)
      setQuantity(1)
      loadPreorders()
      if (isStaff) loadAllPreorders()
    } catch (err) {
      console.error('Order error:', err)
      toast.error('喊單失敗')
    } finally {
      setIsOrdering(false)
    }
  }

  // ========== 管理員操作 ==========

  // 補貨
  const handleRestock = async () => {
    if (!restockProduct || !restockQty) return

    setIsRestocking(true)
    try {
      const { data, error } = await supabase.rpc('restock_session_product_v1', {
        p_product_id: restockProduct.id,
        p_actual_qty: parseInt(restockQty),
      })

      if (error) throw error

      if (data.success) {
        toast.success(`已補貨 ${restockQty} 件，分配 ${data.allocated_count} 筆`)
        setRestockProduct(null)
        setRestockQty('')
        loadSession()
        loadAllPreorders()
      } else {
        toast.error(data.error || '補貨失敗')
      }
    } catch (err) {
      console.error('Restock error:', err)
      toast.error('補貨失敗')
    } finally {
      setIsRestocking(false)
    }
  }

  // 關閉收單
  const handleCloseSession = async () => {
    setIsClosing(true)
    try {
      const { data, error } = await supabase.rpc('close_purchase_session_v1', {
        p_session_id: sessionId,
      })

      if (error) throw error

      if (data.success) {
        toast.success('已關閉收單')
        loadSession()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      console.error('Close session error:', err)
      toast.error('操作失敗')
    } finally {
      setIsClosing(false)
    }
  }

  // 上架新商品
  const handleAddProduct = async () => {
    if (!profile || !session || !newProductName.trim() || !newProductPrice) return

    setIsUploading(true)
    try {
      let imageUrl: string | null = null
      const sku = `S${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // 上傳圖片
      if (newProductImage) {
        try {
          const compressedBlob = await compressImage(newProductImage)
          const compressedFile = new File([compressedBlob], `${sku}.webp`, {
            type: 'image/webp',
          })

          const filePath = `${session.tenant_id}/products/${sku}.webp`
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
            imageUrl = publicUrl
          } else {
            console.error('Upload error:', uploadError)
          }
        } catch (err) {
          console.error('Compress/upload error:', err)
        }
      }

      // 呼叫 RPC 建立商品
      const { data, error } = await supabase.rpc('add_session_product_v1', {
        p_session_id: sessionId,
        p_line_user_id: profile.userId,
        p_name: newProductName.trim(),
        p_price: parseFloat(newProductPrice),
        p_stock: newProductStock ? parseInt(newProductStock) : 0,
        p_image_url: imageUrl,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error)
        return
      }

      toast.success(`已上架 ${newProductName.trim()}`)
      // 清空表單
      setNewProductName('')
      setNewProductPrice('')
      setNewProductStock('')
      setNewProductImage(null)
      setNewProductPreview(null)
      setIsAddProductOpen(false)
      // Realtime INSERT 會自動觸發 loadSession，但手動也呼叫一次確保
      loadSession()
    } catch (err) {
      console.error('Add product error:', err)
      toast.error('上架失敗')
    } finally {
      setIsUploading(false)
    }
  }

  // 計算倒數時間
  const getTimeRemaining = (endTime: string) => {
    const diff = new Date(endTime).getTime() - Date.now()
    if (diff <= 0) return null

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Loading 狀態
  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen p-4">
        <Skeleton className="h-12 w-48 mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(9)].map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  // 錯誤狀態
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>重新載入</Button>
        </div>
      </div>
    )
  }

  // 場次不存在
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">場次不存在</p>
      </div>
    )
  }

  const cartItemCount = preorders.filter((o) => o.status !== 'cancelled').length

  // 管理員：每個商品的預購統計
  const getProductStats = (productId: string) => {
    const productOrders = allPreorders.filter((o) => o.product_id === productId)
    const pending = productOrders.filter((o) => o.status === 'pending').length
    const allocated = productOrders.filter((o) => o.status === 'allocated').length
    return { pending, allocated, total: productOrders.length }
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{session.title}</h1>
            {isStaff && (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                <Shield className="w-3 h-3 mr-0.5" />
                管理
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session.is_open ? (
              <p className="text-xs text-green-600">接單中</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {session.status === 'closed' ? '補貨中' : '已結算'}
              </p>
            )}
            {isStaff && staffStats && (
              <p className="text-xs text-muted-foreground">
                · 預購 {staffStats.total_orders - staffStats.cancelled_count} · ${staffStats.total_sales.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* 管理員：操作列 */}
      {isStaff && session.is_open && (
        <div className="px-4 py-2 border-b bg-purple-50 dark:bg-purple-950/20 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-lg border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400"
            onClick={() => setIsAddProductOpen(true)}
          >
            <Camera className="w-3 h-3 mr-1" />
            上架
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-lg border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400"
            onClick={handleCloseSession}
            disabled={isClosing}
          >
            {isClosing ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3 mr-1" />
            )}
            關閉收單
          </Button>
        </div>
      )}

      {/* 商品列表 */}
      <main className="p-2">
        <div className="grid grid-cols-3 gap-2">
          {products.map((product, index) => {
            const isExpired = product.is_expired
            const isHot = product.sold_qty >= 5
            const timeRemaining = product.end_time
              ? getTimeRemaining(product.end_time)
              : null
            const pStats = isStaff ? getProductStats(product.id) : null

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                className={`relative rounded-xl overflow-hidden bg-card border ${
                  isExpired
                    ? 'opacity-60'
                    : 'cursor-pointer active:scale-95'
                } transition-transform`}
                onClick={() => {
                  if (isExpired || !session.is_open) return
                  if (!isLoggedIn) {
                    login()
                    return
                  }
                  setSelectedProduct(product)
                  setQuantity(1)
                }}
              >
                {/* 已售數量標籤 */}
                {product.sold_qty > 0 && (
                  <motion.div
                    key={product.sold_qty}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    className={`absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full text-xs font-bold text-white ${
                      isHot ? 'bg-red-500' : 'bg-black/60'
                    }`}
                  >
                    +{product.sold_qty}
                    {isHot && <Flame className="inline w-3 h-3 ml-0.5" />}
                  </motion.div>
                )}

                {/* 倒數時間 */}
                {timeRemaining && (
                  <div className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-full text-xs bg-orange-500 text-white">
                    <Clock className="inline w-3 h-3 mr-0.5" />
                    {timeRemaining}
                  </div>
                )}

                {/* 商品圖片 */}
                <div className="aspect-square relative bg-muted">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 33vw, 200px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* 已截止 遮罩 */}
                  {isExpired && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-sm font-bold">已截止</span>
                    </div>
                  )}
                </div>

                {/* 商品資訊 */}
                <div className="p-2">
                  <p className="text-xs truncate">{product.name}</p>
                  <p className="text-sm font-bold text-primary">
                    ${product.price}
                  </p>
                  {product.is_limited && product.limit_qty && (
                    <p className="text-xs text-orange-600">
                      限購 {product.limit_qty}
                    </p>
                  )}

                  {/* 管理員：顯示分配狀態 + 補貨按鈕 */}
                  {isStaff && pStats && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{pStats.allocated}/{pStats.total}</span>
                        {pStats.pending > 0 && (
                          <span className="text-orange-600">{pStats.pending}待</span>
                        )}
                      </div>
                      {session.status === 'closed' && pStats.pending > 0 && (
                        <button
                          className="w-full h-6 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded flex items-center justify-center gap-0.5"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRestockProduct(product)
                            setRestockQty('')
                          }}
                        >
                          <PackagePlus className="w-3 h-3" />
                          補貨
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            目前沒有商品
          </div>
        )}
      </main>

      {/* 底部 Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t px-4 py-3 safe-bottom">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoggedIn && profile ? (
              <>
                {profile.pictureUrl && (
                  <Image
                    src={profile.pictureUrl}
                    alt={profile.displayName}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <span className="text-sm">{profile.displayName}</span>
              </>
            ) : (
              <Button size="sm" onClick={login}>
                LINE 登入
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 管理員：管理面板按鈕 */}
            {isStaff && (
              <Button
                variant="outline"
                size="sm"
                className="border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400"
                onClick={() => {
                  loadAllPreorders()
                  setIsAdminPanelOpen(true)
                }}
              >
                <Users className="w-4 h-4 mr-1" />
                訂單
              </Button>
            )}

            {/* 顧客：購物車按鈕 */}
            {isLoggedIn && (
              <Button
                variant="default"
                className="relative"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                喊單
                {cartItemCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {cartItemCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 喊單 Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-4 mb-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                  {selectedProduct.image_url ? (
                    <Image
                      src={selectedProduct.image_url}
                      alt={selectedProduct.name}
                      width={96}
                      height={96}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                  <p className="text-2xl font-bold text-primary">
                    ${selectedProduct.price}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    已售 {selectedProduct.sold_qty} 個
                  </p>
                </div>
              </div>

              {/* 數量選擇 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm">數量</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-xl font-bold w-8 text-center">
                    {quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => {
                      const max = selectedProduct.limit_qty || 99
                      setQuantity(Math.min(max, quantity + 1))
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {selectedProduct.is_limited && selectedProduct.limit_qty && (
                <p className="text-sm text-orange-600 mb-4">
                  此商品限購 {selectedProduct.limit_qty} 個
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedProduct(null)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleOrder}
                  disabled={isOrdering}
                >
                  {isOrdering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    `確定喊單 $${selectedProduct.price * quantity}`
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 購物車 Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setIsCartOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute top-0 right-0 bottom-0 w-full max-w-sm bg-background"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-bold">我的喊單</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCartOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="p-4 overflow-y-auto h-[calc(100vh-140px)]">
                {preorders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    還沒有喊單
                  </p>
                ) : (
                  <div className="space-y-3">
                    {preorders.map((order) => (
                      <div
                        key={order.id}
                        className={`flex gap-3 p-3 rounded-xl border ${
                          order.status === 'cancelled'
                            ? 'opacity-50 bg-muted'
                            : ''
                        }`}
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {order.product_image ? (
                            <Image
                              src={order.product_image}
                              alt={order.product_name}
                              width={64}
                              height={64}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {order.product_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            ${order.unit_price} × {order.quantity}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                order.status === 'allocated'
                                  ? 'bg-green-100 text-green-700'
                                  : order.status === 'cancelled'
                                  ? 'bg-gray-100 text-gray-500'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {order.status === 'allocated'
                                ? '已購得'
                                : order.status === 'cancelled'
                                ? '已取消'
                                : order.status === 'partial'
                                ? `部分購得 (${order.arrived_qty}/${order.quantity})`
                                : '等待配貨'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 購物車底部 */}
              {preorders.filter((o) => o.status !== 'cancelled').length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background safe-bottom">
                  <div className="flex justify-between text-sm mb-2">
                    <span>已購得</span>
                    <span className="font-bold text-green-600">
                      $
                      {preorders
                        .filter((o) => o.arrived_qty > 0)
                        .reduce(
                          (sum, o) => sum + o.arrived_qty * o.unit_price,
                          0
                        )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-3">
                    <span>等待中</span>
                    <span className="text-muted-foreground">
                      $
                      {preorders
                        .filter((o) => o.status !== 'cancelled')
                        .reduce(
                          (sum, o) =>
                            sum +
                            (o.quantity - o.arrived_qty) * o.unit_price,
                          0
                        )}
                    </span>
                  </div>
                  <Button className="w-full" disabled>
                    等待配貨中
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 管理員面板 Drawer ========== */}
      <AnimatePresence>
        {isAdminPanelOpen && isStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setIsAdminPanelOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute top-0 right-0 bottom-0 w-full max-w-sm bg-background"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="text-lg font-bold">管理面板</h2>
                  <p className="text-xs text-muted-foreground">
                    {staffRole === 'owner' ? '負責人' : staffRole === 'admin' ? '管理員' : '工作人員'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsAdminPanelOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* 統計 */}
              {staffStats && (
                <div className="grid grid-cols-3 gap-2 p-4 border-b">
                  <div className="text-center">
                    <p className="text-lg font-bold">{staffStats.total_orders - staffStats.cancelled_count}</p>
                    <p className="text-xs text-muted-foreground">總預購</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{staffStats.allocated_count}</p>
                    <p className="text-xs text-muted-foreground">已分配</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">${staffStats.total_sales.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">銷售額</p>
                  </div>
                </div>
              )}

              {/* 訂單列表 - 按商品分組 */}
              <div className="p-4 overflow-y-auto h-[calc(100vh-220px)]">
                {products.map((product) => {
                  const productOrders = allPreorders.filter(
                    (o) => o.product_id === product.id && o.status !== 'cancelled'
                  )
                  if (productOrders.length === 0) return null

                  return (
                    <div key={product.id} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold">{product.name}</h3>
                        <span className="text-xs text-muted-foreground">
                          ${product.price} · {productOrders.length} 筆
                        </span>
                      </div>
                      <div className="space-y-1">
                        {productOrders.map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/50 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {order.member_picture && (
                                <Image
                                  src={order.member_picture}
                                  alt=""
                                  width={20}
                                  height={20}
                                  className="rounded-full flex-shrink-0"
                                />
                              )}
                              <span className="truncate">{order.member_name}</span>
                              <span className="text-muted-foreground flex-shrink-0">×{order.quantity}</span>
                            </div>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                order.status === 'allocated'
                                  ? 'bg-green-100 text-green-700'
                                  : order.status === 'partial'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {order.status === 'allocated'
                                ? '已配'
                                : order.status === 'partial'
                                ? `${order.arrived_qty}/${order.quantity}`
                                : '待配'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {allPreorders.filter((o) => o.status !== 'cancelled').length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    尚無預購訂單
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 上架商品 Modal ========== */}
      <AnimatePresence>
        {isAddProductOpen && isStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setIsAddProductOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4">上架新商品</h3>

              {/* 拍照/選圖 */}
              <input
                ref={addProductFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setNewProductImage(file)
                    setNewProductPreview(URL.createObjectURL(file))
                  }
                }}
              />

              <div
                className="w-full h-32 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-4 cursor-pointer overflow-hidden"
                onClick={() => addProductFileRef.current?.click()}
              >
                {newProductPreview ? (
                  <Image
                    src={newProductPreview}
                    alt="預覽"
                    width={200}
                    height={128}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Camera className="w-8 h-8 mx-auto mb-1" />
                    <p className="text-sm">拍照或選擇圖片</p>
                  </div>
                )}
              </div>

              {/* 商品名稱 */}
              <Input
                placeholder="商品名稱"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="mb-3 rounded-xl"
                autoFocus
              />

              {/* 價格 + 庫存 */}
              <div className="flex gap-2 mb-4">
                <Input
                  type="number"
                  min="1"
                  placeholder="價格"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  className="flex-1 rounded-xl"
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="庫存（空白=預購）"
                  value={newProductStock}
                  onChange={(e) => setNewProductStock(e.target.value)}
                  className="flex-1 rounded-xl"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsAddProductOpen(false)
                    setNewProductName('')
                    setNewProductPrice('')
                    setNewProductStock('')
                    setNewProductImage(null)
                    setNewProductPreview(null)
                  }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleAddProduct}
                  disabled={!newProductName.trim() || !newProductPrice || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-1" />
                      確認上架
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 補貨 Modal ========== */}
      <AnimatePresence>
        {restockProduct && isStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setRestockProduct(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-1">
                補貨 - {restockProduct.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {(() => {
                  const stats = getProductStats(restockProduct.id)
                  return `${stats.pending} 筆待分配`
                })()}
              </p>

              <Input
                type="number"
                min="1"
                placeholder="輸入實際購買數量"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="mb-4 rounded-xl"
                autoFocus
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRestockProduct(null)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleRestock}
                  disabled={!restockQty || isRestocking}
                >
                  {isRestocking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <PackagePlus className="w-4 h-4 mr-1" />
                      確認補貨
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
