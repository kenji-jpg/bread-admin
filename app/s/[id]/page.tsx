'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useLiff } from '@/hooks/use-liff'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ShoppingCart, Clock, Flame, Package, Minus, Plus, X, Loader2 } from 'lucide-react'
import Image from 'next/image'

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

export default function SessionShopPage() {
  const params = useParams()
  const sessionId = params.id as string
  const supabase = createClient()
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

  // 初始載入
  useEffect(() => {
    loadSession()
  }, [loadSession])

  // 登入後載入喊單
  useEffect(() => {
    if (isLoggedIn && profile && session) {
      loadPreorders()
    }
  }, [isLoggedIn, profile, session, loadPreorders])

  // Realtime 訂閱 - 商品更新
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
          // 更新商品的 sold_qty
          setProducts((prev) =>
            prev.map((p) =>
              p.id === payload.new.id
                ? { ...p, sold_qty: payload.new.sold_qty, stock: payload.new.stock }
                : p
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase])

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
    } catch (err) {
      console.error('Order error:', err)
      toast.error('喊單失敗')
    } finally {
      setIsOrdering(false)
    }
  }

  // 取消喊單
  const handleCancelOrder = async (orderId: string) => {
    if (!profile) return

    try {
      const { data, error } = await supabase.rpc('cancel_preorder_v1', {
        p_order_item_id: orderId,
        p_line_user_id: profile.userId,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error)
        return
      }

      toast.success('已取消')
      loadPreorders()
    } catch (err) {
      console.error('Cancel error:', err)
      toast.error('取消失敗')
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

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold truncate">{session.title}</h1>
          {session.is_open ? (
            <p className="text-xs text-green-600">接單中</p>
          ) : (
            <p className="text-xs text-muted-foreground">已結束</p>
          )}
        </div>
      </header>

      {/* 商品列表 */}
      <main className="p-2">
        <div className="grid grid-cols-3 gap-2">
          {products.map((product, index) => {
            const isExpired = product.is_expired
            const isHot = product.sold_qty >= 5
            const timeRemaining = product.end_time
              ? getTimeRemaining(product.end_time)
              : null

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

                  {/* 已截止 遮罩（代購模式無售完概念） */}
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

      {/* 底部購物車 Bar */}
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

          {isLoggedIn && (
            <Button
              variant="default"
              className="relative"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              我的喊單
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </Button>
          )}
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
                            {order.can_modify && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 h-7"
                                onClick={() => handleCancelOrder(order.id)}
                              >
                                取消
                              </Button>
                            )}
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
    </div>
  )
}
