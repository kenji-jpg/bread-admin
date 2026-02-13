'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useLiff } from '@/hooks/use-liff'
import liff from '@line/liff'
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
  Users,
  Camera,
  TimerOff,
  TimerReset,
  Store,
  Eye,
  EyeOff,
  Megaphone,
  CheckCircle,
  Truck,
  MapPin,
  Copy,
} from 'lucide-react'
import Image from 'next/image'

// 壓縮圖片
async function compressImage(file: File, maxWidth = 400, quality = 0.7): Promise<Blob> {
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
  category: string | null
  end_time: string | null
  is_limited: boolean
  limit_qty: number | null
  status: string
  is_expired: boolean
  is_sold_out: boolean
  created_at: string
}

interface Tenant {
  id: string
  name: string
  slug: string
  liff_id?: string | null
  payment_info?: { bank?: string; account?: string; name?: string }
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
  id: string
  name: string
  sort_order: number
  is_visible: boolean
}

interface CartItem {
  product: Product
  quantity: number
}

interface OrderItem {
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
  is_arrived: boolean
  checkout_id: string | null
}

interface CheckoutResult {
  success: boolean
  checkout_id?: string
  checkout_no?: string
  total_amount?: number
  item_count?: number
  shipping_method?: string
  shipping_fee?: number
  items?: Array<{ name: string; qty: number; unit_price: number; subtotal: number }>
}

interface StaffOrderItem {
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

export default function ShopPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tenantSlug = params.tenantSlug as string
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const { isReady, isLoggedIn, profile, login } = useLiff()

  // Dev mode: ?staff=1 強制開啟管理員模式（僅 localhost）
  const isDevStaff = process.env.NODE_ENV === 'development' && searchParams.get('staff') === '1'

  // 狀態
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 商城外觀設定
  const [shopSettings, setShopSettings] = useState<ShopSettings>({})
  const [shopCategories, setShopCategories] = useState<ShopCategory[]>([])

  // 選購 Modal 狀態
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  // 購物車狀態
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isSubmittingCart, setIsSubmittingCart] = useState(false)

  // 我的訂單 Drawer 狀態
  const [isOrderDrawerOpen, setIsOrderDrawerOpen] = useState(false)

  // 現貨結帳 Modal 狀態
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'method' | 'confirm' | 'success'>('method')
  const [selectedShipping, setSelectedShipping] = useState<'myship' | 'delivery' | 'pickup' | null>(null)
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null)

  // 分類篩選
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // ========== 管理員模式 ==========
  const [isStaff, setIsStaff] = useState(false)
  const [staffRole, setStaffRole] = useState<string | null>(null)
  const [staffCheckDone, setStaffCheckDone] = useState(false)
  const [allOrders, setAllOrders] = useState<StaffOrderItem[]>([])
  const [staffStats, setStaffStats] = useState<StaffStats | null>(null)
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)

  // 補貨 Modal
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [isRestocking, setIsRestocking] = useState(false)

  // 上架 Modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductStock, setNewProductStock] = useState('')
  const [newProductIsLimited, setNewProductIsLimited] = useState(false)
  const [newProductCategory, setNewProductCategory] = useState('')
  const [newProductEndTime, setNewProductEndTime] = useState<number | null>(null) // null=不限時, 30/60/120=分鐘
  const [newProductImage, setNewProductImage] = useState<File | null>(null)
  const [newProductPreview, setNewProductPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const addProductFileRef = useRef<HTMLInputElement>(null)

  // 下架/上架
  const [isToggling, setIsToggling] = useState<string | null>(null)

  // 倒數計時器 tick（每 30 秒更新畫面）
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // 購物須知
  const [showShoppingNotice, setShowShoppingNotice] = useState(false)
  const [noticeDontShowToday, setNoticeDontShowToday] = useState(false)
  useEffect(() => {
    if (!tenant?.id || !shopSettings.shopping_notice || isStaff) return
    // 檢查今日是否已勾選「今日不再出現」
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const key = `shopping_notice_dismissed_${tenant.id}`
    const dismissedDate = localStorage.getItem(key)
    if (dismissedDate === today) return // 今日已勾選不再顯示
    setShowShoppingNotice(true)
  }, [tenant?.id, shopSettings.shopping_notice, isStaff])

  // 載入商城資料（不依賴 isStaff，避免 staff 判定後重複載入）
  const isStaffRef = useRef(isStaff)
  isStaffRef.current = isStaff

  const loadShop = useCallback(async (forceIncludeInactive?: boolean) => {
    try {
      const { data, error } = await supabase.rpc('get_shop_products_v1', {
        p_tenant_slug: tenantSlug,
        p_include_inactive: forceIncludeInactive ?? isStaffRef.current,
      })

      if (error) throw error

      if (!data.success) {
        setError(data.error)
        return
      }

      setTenant(data.tenant)
      setProducts(data.products || [])
      setShopSettings(data.shop_settings || {})
      setShopCategories((data.categories || []).filter((c: ShopCategory) => c.is_visible))

      // 動態設定頁面標題為店家名稱
      if (data.tenant?.name) {
        document.title = `${data.tenant.name} | PlusHub`
      }
    } catch (err) {
      console.error('Load shop error:', err)
      setError('載入失敗')
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug, supabase])

  // 載入我的訂單
  const loadMyOrders = useCallback(async () => {
    if (!profile?.userId) return

    try {
      const { data, error } = await supabase.rpc('get_shop_member_orders_v1', {
        p_tenant_slug: tenantSlug,
        p_line_user_id: profile.userId,
      })

      if (error) throw error

      if (data.success) {
        setOrders(data.orders || [])
      }
    } catch (err) {
      console.error('Load orders error:', err)
    }
  }, [tenantSlug, profile?.userId, supabase])

  // 載入全部訂單（管理員）
  const loadAllOrders = useCallback(async () => {
    if (!profile?.userId || !isStaff || !tenant) return

    try {
      const { data, error } = await supabase.rpc('get_shop_all_orders_v1', {
        p_tenant_id: tenant.id,
        p_line_user_id: profile.userId,
      })

      if (error) throw error

      if (data.success) {
        setAllOrders(data.orders || [])
        setStaffStats(data.stats || null)
      }
    } catch (err) {
      console.error('Load all orders error:', err)
    }
  }, [profile?.userId, isStaff, tenant, supabase])

  // 初始載入
  useEffect(() => {
    loadShop()
  }, [loadShop])

  // 登入後載入訂單
  useEffect(() => {
    if (isLoggedIn && profile && tenant) {
      loadMyOrders()
    }
  }, [isLoggedIn, profile, tenant, loadMyOrders])

  // Dev mode：強制開啟管理員模式
  useEffect(() => {
    if (isDevStaff && tenant && !staffCheckDone) {
      console.log('[Shop] Dev mode: forcing staff role')
      setIsStaff(true)
      setStaffRole('owner')
      setStaffCheckDone(true)
      loadShop(true) // 重載含 inactive 商品
    }
  }, [isDevStaff, tenant, staffCheckDone, loadShop])

  // 獨立 effect：檢查管理員身份
  useEffect(() => {
    if (isDevStaff) return // Dev mode 跳過 RPC 檢查
    if (!isLoggedIn || !profile?.userId || !tenant?.id || staffCheckDone) return

    setStaffCheckDone(true)
    const tenantId = tenant.id
    const lineUserId = profile.userId
    console.log('[Shop] Checking staff role for:', lineUserId, 'tenant:', tenantId)

      ; (async () => {
        try {
          const { data, error } = await supabase.rpc('check_staff_by_line_id_v1', {
            p_line_user_id: lineUserId,
            p_tenant_id: tenantId,
          })
          if (error) {
            console.error('[Shop] Check staff RPC error:', error)
            setStaffCheckDone(false)
            return
          }
          console.log('[Shop] Staff check result:', JSON.stringify(data))
          if (data?.success && data.is_staff) {
            setIsStaff(true)
            setStaffRole(data.role)
          }
        } catch (err) {
          console.error('[Shop] Check staff error:', err)
          setStaffCheckDone(false)
        }
      })()
  }, [isDevStaff, isLoggedIn, profile?.userId, tenant?.id, staffCheckDone, supabase])

  // 管理員身份確認後，重載商品（含 inactive）+ 載入全部訂單
  useEffect(() => {
    if (isStaff && tenant) {
      loadShop(true) // 重載含 inactive 商品
      loadAllOrders()
    }
  }, [isStaff, tenant, loadAllOrders])

  // Realtime 訂閱 - 商品即時同步（UPDATE / INSERT / DELETE）
  useEffect(() => {
    if (!tenant?.id) return

    const channel = supabase
      .channel(`shop-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          if (payload.new.session_id !== null) return
          const newData = payload.new

          // 商品被下架、停用、或移出商城
          if (newData.status !== 'active' || newData.show_in_shop === false) {
            if (isStaff && newData.show_in_shop) {
              // 管理者：下架的商城商品仍要顯示，重新載入
              loadShop()
            } else {
              // 客人：直接移除
              setProducts((prev) => prev.filter((p) => p.id !== newData.id))
            }
            return
          }

          setProducts((prev) => {
            const exists = prev.some((p) => p.id === newData.id)

            // 商品不在列表中但現在符合條件 → 重新載入商城
            if (!exists) {
              loadShop()
              return prev
            }

            return prev.map((p) =>
              p.id === newData.id
                ? {
                  ...p,
                  name: newData.name,
                  price: newData.price,
                  sold_qty: newData.sold_qty,
                  stock: newData.stock,
                  end_time: newData.end_time,
                  status: newData.status,
                  category: newData.category,
                  image_url: newData.image_url,
                  limit_qty: newData.limit_qty,
                  is_limited: newData.is_limited,
                  is_sold_out: newData.is_limited && newData.stock != null && newData.stock <= 0,
                  is_expired: newData.end_time ? new Date(newData.end_time) < new Date() : false,
                }
                : p
            )
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'products',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          if (payload.new.session_id !== null) return
          if (payload.new.show_in_shop && (payload.new.status === 'active' || isStaff)) {
            loadShop()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'products',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          // 商品被刪除 → 立即從列表移除
          setProducts((prev) => prev.filter((p) => p.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenant?.id, supabase, loadShop])

  // 已移除 30 秒輪詢 — Realtime 訂閱已處理商品即時同步

  // 加入購物車
  const handleAddToCart = () => {
    if (!selectedProduct) return

    setCart((prev) => {
      // 同商品累加數量
      const existing = prev.find((item) => item.product.id === selectedProduct.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === selectedProduct.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { product: selectedProduct, quantity }]
    })

    toast.success(`已加入購物車：${selectedProduct.name} x${quantity}`)
    setSelectedProduct(null)
    setQuantity(1)
  }

  // 確認下單（批次送出購物車）
  const handleSubmitCart = async () => {
    if (!profile || !tenant || cart.length === 0) return

    setIsSubmittingCart(true)
    const successIds: string[] = []
    const failedItems: string[] = []

    for (const item of cart) {
      try {
        const { data, error } = await supabase.rpc('create_shop_order_v1', {
          p_tenant_id: tenant.id,
          p_product_id: item.product.id,
          p_line_user_id: profile.userId,
          p_quantity: item.quantity,
          p_display_name: profile.displayName,
          p_picture_url: profile.pictureUrl,
        })

        if (error) throw error

        if (!data.success) {
          toast.error(`${item.product.name}：${data.error}`)
          failedItems.push(item.product.id)
        } else {
          successIds.push(item.product.id)
        }
      } catch (err) {
        console.error('Order error:', err)
        toast.error(`${item.product.name} 下單失敗`)
        failedItems.push(item.product.id)
      }
    }

    if (successIds.length > 0) {
      toast.success(`成功下單 ${successIds.length} 項商品`)
    }

    // 只清除成功的商品，失敗的留在購物車
    if (failedItems.length > 0) {
      setCart((prev) => prev.filter((c) => failedItems.includes(c.product.id)))
    } else {
      setCart([])
      setIsCartOpen(false)
    }

    loadMyOrders()
    if (isStaff) loadAllOrders()
    setIsSubmittingCart(false)
  }

  // ========== 現貨結帳 ==========
  const checkoutEligibleOrders = orders.filter(
    (o) => o.is_arrived && !o.checkout_id && o.status !== 'cancelled'
  )
  const checkoutEligibleTotal = checkoutEligibleOrders.reduce(
    (sum, o) => sum + o.unit_price * o.quantity, 0
  )

  const handleCheckout = async () => {
    if (!tenant || !profile?.userId || !selectedShipping) return

    setIsSubmittingCheckout(true)
    try {
      const { data, error } = await supabase.rpc('create_checkout_v2', {
        p_tenant_id: tenant.id,
        p_line_user_id: profile.userId,
        p_shipping_method: selectedShipping,
        p_receiver_name: profile.displayName || null,
        p_receiver_phone: null,
        p_receiver_store_id: null,
      })

      if (error) throw error

      if (data.success) {
        setCheckoutResult(data)
        setCheckoutStep('success')
        loadMyOrders()
      } else {
        toast.error(data.message || '結帳失敗')
        if (data.error === 'no_ready_orders') {
          closeCheckoutModal()
          loadMyOrders()
        }
      }
    } catch (err) {
      console.error('Checkout error:', err)
      toast.error('結帳失敗，請稍後重試')
    } finally {
      setIsSubmittingCheckout(false)
    }
  }

  const closeCheckoutModal = () => {
    setIsCheckoutModalOpen(false)
    setCheckoutStep('method')
    setSelectedShipping(null)
    setCheckoutResult(null)
  }

  // ========== 管理員操作 ==========

  // 補貨
  const handleRestock = async () => {
    if (!restockProduct || !restockQty) return

    setIsRestocking(true)
    try {
      const { data, error } = await supabase.rpc('restock_product_by_id_v1', {
        p_product_id: restockProduct.id,
        p_quantity: parseInt(restockQty),
      })

      if (error) throw error

      if (data.success) {
        toast.success(data.message || `已補貨 ${restockQty} 件`)
        setRestockProduct(null)
        setRestockQty('')
        loadShop()
        loadAllOrders()
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

  // 上架新商品
  const handleAddProduct = async () => {
    if (!profile || !tenant || !newProductName.trim() || !newProductPrice) return

    setIsUploading(true)
    try {
      let imageUrl: string | null = null
      const sku = `SP${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // 上傳圖片
      if (newProductImage) {
        try {
          const compressedBlob = await compressImage(newProductImage)
          const compressedFile = new File([compressedBlob], `${sku}.webp`, {
            type: 'image/webp',
          })

          const filePath = `${tenant.id}/products/${sku}.webp`
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
          } else {
            console.error('Upload error:', uploadError)
          }
        } catch (err) {
          console.error('Compress/upload error:', err)
        }
      }

      // 呼叫 RPC 建立商品
      const endTimeValue = newProductEndTime
        ? new Date(Date.now() + newProductEndTime * 60 * 1000).toISOString()
        : null

      const { data, error } = await supabase.rpc('add_shop_product_v1', {
        p_tenant_id: tenant.id,
        p_line_user_id: profile.userId,
        p_name: newProductName.trim(),
        p_price: parseFloat(newProductPrice),
        p_stock: newProductIsLimited && newProductStock ? parseInt(newProductStock) : 0,
        p_image_url: imageUrl,
        p_is_limited: newProductIsLimited,
        p_category: newProductCategory || null,
        p_end_time: endTimeValue,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error)
        return
      }

      toast.success(`已上架 ${newProductName.trim()}`)
      // 清空表單（保留分類、模式、時限設定，方便連續上架）
      setNewProductName('')
      setNewProductPrice('')
      setNewProductStock('')
      setNewProductImage(null)
      setNewProductPreview(null)
      setIsAddProductOpen(false)
      loadShop()
    } catch (err) {
      console.error('Add product error:', err)
      toast.error('上架失敗')
    } finally {
      setIsUploading(false)
    }
  }

  // 下架/上架商品
  const handleToggleProduct = async (productId: string, action: 'activate' | 'deactivate') => {
    if (!profile) return

    setIsToggling(productId)
    try {
      const { data, error } = await supabase.rpc('toggle_shop_product_v1', {
        p_product_id: productId,
        p_line_user_id: profile.userId,
        p_action: action,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error)
        return
      }

      toast.success(action === 'deactivate' ? '已下架' : '已上架')
      loadShop()
    } catch (err) {
      console.error('Toggle product error:', err)
      toast.error('操作失敗')
    } finally {
      setIsToggling(null)
    }
  }

  // 管理員：調整商品截止時間
  const handleUpdateEndTime = async (productId: string, endTime: Date) => {
    if (!profile) return
    try {
      const { data, error } = await supabase.rpc('update_product_end_time_v1', {
        p_product_id: productId,
        p_line_user_id: profile.userId,
        p_end_time: endTime.toISOString(),
      })
      if (error) throw error
      if (!data.success) {
        toast.error(data.error)
        return
      }
      toast.success(endTime > new Date() ? '已延長截止時間' : '已截止')
      loadShop()
    } catch (err) {
      console.error('Update end time error:', err)
      toast.error('操作失敗')
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

  // Loading 狀態（不等 LIFF init，商品資料到就顯示）
  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <Skeleton className="h-12 w-48 mb-4" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(6)].map((_, i) => (
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

  // 商城不存在
  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">商城不存在</p>
      </div>
    )
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const orderItemCount = orders.filter((o) => o.status !== 'cancelled').length

  // 管理員：每個商品的訂單統計
  const getProductStats = (productId: string) => {
    const productOrders = allOrders.filter((o) => o.product_id === productId)
    const pending = productOrders.filter((o) => o.status === 'pending').length
    const allocated = productOrders.filter((o) => o.status === 'allocated').length
    return { pending, allocated, total: productOrders.length }
  }

  // 判斷商品模式：is_limited=true → 現貨模式，is_limited=false 但 stock>0 → 有現貨，否則 → 預購模式
  const getProductMode = (product: Product) => {
    if (product.is_limited) return 'stock'
    // 預購商品補貨後 stock>0 也顯示為有現貨
    if (product.stock !== null && product.stock > 0) return 'stock'
    return 'preorder'
  }

  const accentColor = shopSettings.accent_color || ''

  return (
    <div className="min-h-screen pb-20">
      {/* 購物須知 Modal */}
      <AnimatePresence>
        {showShoppingNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="px-5 pt-5 pb-3 border-b">
                <h2 className="text-base font-bold flex items-center gap-2">
                  📋 購物須知
                </h2>
              </div>
              <div className="px-5 py-4 overflow-y-auto flex-1">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {shopSettings.shopping_notice}
                </p>
              </div>
              <div className="px-5 py-4 border-t space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noticeDontShowToday}
                    onChange={(e) => setNoticeDontShowToday(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-primary"
                  />
                  <span className="text-sm text-muted-foreground">今日不再出現</span>
                </label>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => {
                      try {
                        liff.closeWindow()
                      } catch {
                        window.close()
                      }
                    }}
                  >
                    不同意
                  </Button>
                  <Button
                    className="flex-1 rounded-xl"
                    onClick={() => {
                      if (tenant?.id && noticeDontShowToday) {
                        const today = new Date().toISOString().slice(0, 10)
                        localStorage.setItem(`shopping_notice_dismissed_${tenant.id}`, today)
                      }
                      setShowShoppingNotice(false)
                    }}
                  >
                    同意
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header（含背景圖） */}
      <header className="sticky top-0 z-40 border-b relative overflow-hidden">
        {shopSettings.banner_url ? (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${shopSettings.banner_url})`,
                backgroundSize: `${(shopSettings.banner_scale || 1) * 100}%`,
                backgroundPosition: `${shopSettings.banner_position_x ?? 50}% ${shopSettings.banner_position_y ?? 50}%`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            <div className="absolute inset-0 bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0 bg-background/95 backdrop-blur" />
        )}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5" style={accentColor && !shopSettings.banner_url ? { color: accentColor } : shopSettings.banner_url ? { color: 'white' } : undefined} />
            <h1 className={`text-lg font-bold truncate ${shopSettings.banner_url ? 'text-white' : ''}`}>{tenant.name}</h1>
            {isStaff && (
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                <Shield className="w-3 h-3 mr-0.5" />
                管理
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-xs ${shopSettings.banner_url ? 'text-green-400' : 'text-green-600'}`}>營業中</p>
            {isStaff && staffStats && (
              <p className={`text-xs ${shopSettings.banner_url ? 'text-white/70' : 'text-muted-foreground'}`}>
                · 訂單 {staffStats.total_orders - staffStats.cancelled_count} · $
                {staffStats.total_sales.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Announcement */}
      {shopSettings.announcement && (
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
          {shopSettings.announcement}
        </div>
      )}

      {/* 管理員：操作列 */}
      {isStaff && (
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
        </div>
      )}

      {/* 分類標籤篩選 */}
      {(() => {
        // 優先使用後台設定的分類（有排序），fallback 到商品動態分類
        const orderedCategories = shopCategories.length > 0
          ? shopCategories.map(c => c.name)
          : [...new Set(products.map(p => p.category).filter(Boolean))] as string[]
        if (orderedCategories.length === 0) return null
        return (
          <div className="px-2 pt-2 pb-0 flex gap-1.5 overflow-x-auto scrollbar-hide">
            <button
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors text-white"
              style={{
                backgroundColor: selectedCategory === null
                  ? (accentColor || 'hsl(var(--primary))')
                  : 'transparent',
                color: selectedCategory === null
                  ? 'white'
                  : 'hsl(var(--muted-foreground))',
                ...(selectedCategory !== null ? { backgroundColor: 'hsl(var(--muted))' } : {}),
              }}
              onClick={() => setSelectedCategory(null)}
            >
              全部
            </button>
            {orderedCategories.map(cat => (
              <button
                key={cat}
                className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: selectedCategory === cat
                    ? (accentColor || 'hsl(var(--primary))')
                    : 'hsl(var(--muted))',
                  color: selectedCategory === cat
                    ? 'white'
                    : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                #{cat}
              </button>
            ))}
          </div>
        )
      })()}

      {/* 商品列表 */}
      <main className="p-2">
        <div className="grid grid-cols-2 gap-2">
          {(selectedCategory ? products.filter(p => p.category === selectedCategory) : products)
            .slice()
            .sort((a, b) => {
              const aUnavailable = a.status !== 'active' || a.is_expired || a.is_sold_out || (a.end_time && new Date(a.end_time).getTime() < Date.now()) || (a.is_limited && a.stock !== null && a.stock <= 0)
              const bUnavailable = b.status !== 'active' || b.is_expired || b.is_sold_out || (b.end_time && new Date(b.end_time).getTime() < Date.now()) || (b.is_limited && b.stock !== null && b.stock <= 0)
              if (aUnavailable && !bUnavailable) return 1
              if (!aUnavailable && bUnavailable) return -1
              return 0
            })
            .map((product, index) => {
              const isExpired = product.end_time
                ? new Date(product.end_time).getTime() < Date.now()
                : product.is_expired
              // 雙模式：is_limited=true 時 stock<=0 才完銷，預購模式永不完銷
              const isSoldOut = product.is_sold_out || (product.is_limited && product.stock !== null && product.stock <= 0)
              const isInactive = product.status !== 'active'
              const isUnavailable = isExpired || isSoldOut || isInactive
              const isHot = product.sold_qty >= 5
              const timeRemaining = product.end_time ? getTimeRemaining(product.end_time) : null
              const pStats = isStaff ? getProductStats(product.id) : null
              const mode = getProductMode(product)

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className={`relative rounded-xl overflow-hidden bg-card border ${(isUnavailable && !isStaff) ? 'opacity-60' : 'cursor-pointer active:scale-95'
                    } transition-transform ${isInactive && isStaff ? 'opacity-50 ring-1 ring-gray-400 dark:ring-gray-600' : ''}`}
                  onClick={() => {
                    if (isStaff) {
                      // 管理者：任何商品都可以點擊管理
                      setSelectedProduct(product)
                      return
                    }
                    if (isUnavailable) return
                    if (isSoldOut) return
                    if (isExpired) return
                    if (!isLoggedIn) {
                      login()
                      return
                    }
                    setSelectedProduct(product)
                    setQuantity(1)
                  }}
                >
                  {/* 左上 badges：已售數量 */}
                  {product.sold_qty > 0 && (
                    <motion.div
                      key={product.sold_qty}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                      className={`absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-full text-xs font-bold text-white ${isHot ? 'bg-red-500' : 'bg-black/60'
                        }`}
                    >
                      已售 {product.sold_qty}
                      {isHot && <Flame className="inline w-3 h-3 ml-0.5" />}
                    </motion.div>
                  )}

                  {/* 右上 badges：預購/現貨 + 倒數時間 */}
                  <div className="absolute top-1 right-1 z-10 flex flex-col items-end gap-0.5">
                    <div
                      className={`px-1.5 py-0.5 rounded-full text-xs text-white ${mode === 'stock' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                    >
                      {mode === 'stock' ? '現貨' : '預購'}
                    </div>
                    {timeRemaining && (
                      <div className="px-1.5 py-0.5 rounded-full text-xs bg-orange-500 text-white">
                        <Clock className="inline w-3 h-3 mr-0.5" />
                        {timeRemaining}
                      </div>
                    )}
                  </div>

                  {/* 商品圖片 */}
                  <div className="aspect-square relative bg-muted">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 200px"
                        loading={index < 4 ? 'eager' : 'lazy'}
                        priority={index < 4}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}

                    {/* 已截止 / 已完銷 遮罩 */}
                    {isExpired && !isSoldOut && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">已截止</span>
                      </div>
                    )}
                    {isSoldOut && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">已完銷</span>
                      </div>
                    )}
                    {isInactive && isStaff && !isSoldOut && !isExpired && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">已下架</span>
                      </div>
                    )}
                  </div>

                  {/* 商品資訊 */}
                  <div className="p-2">
                    <p className="text-xs truncate">{product.name}</p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-bold" style={accentColor ? { color: accentColor } : undefined}>${product.price}</p>
                      {mode === 'stock' && product.stock !== null && product.stock > 0 && (
                        <span className="text-xs text-muted-foreground">
                          剩{product.stock}
                        </span>
                      )}
                    </div>
                    {product.is_limited && product.limit_qty && (
                      <p className="text-xs text-orange-600">限購 {product.limit_qty}</p>
                    )}

                    {/* 管理員：顯示分配狀態（操作按鈕移至 Modal） */}
                    {isStaff && pStats && (
                      <div className="mt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {pStats.allocated}/{pStats.total}
                          </span>
                          {pStats.pending > 0 && (
                            <span className="text-orange-600">{pStats.pending}待</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {isStaff ? (
              <div>
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">還沒有商品</p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => setIsAddProductOpen(true)}
                >
                  <Camera className="w-4 h-4 mr-1" />
                  上架第一個商品
                </Button>
              </div>
            ) : (
              <div>
                <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>商城尚未開放</p>
              </div>
            )}
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
                  loadAllOrders()
                  setIsAdminPanelOpen(true)
                }}
              >
                <Users className="w-4 h-4 mr-1" />
                訂單
              </Button>
            )}

            {/* 顧客：我的訂單按鈕 */}
            {isLoggedIn && (
              <Button variant="outline" size="sm" className="relative" onClick={() => setIsOrderDrawerOpen(true)}>
                <Package className="w-4 h-4 mr-1" />
                訂單
                {orderItemCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                    {orderItemCount}
                  </span>
                )}
              </Button>
            )}

            {/* 顧客：購物車按鈕（管理者不顯示） */}
            {isLoggedIn && !isStaff && (
              <Button
                variant="default"
                className="relative"
                onClick={() => setIsCartOpen(true)}
                style={accentColor ? { backgroundColor: accentColor } : undefined}
              >
                <ShoppingCart className="w-4 h-4 mr-1" />
                購物車
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

      {/* 商品 Modal：管理者 = 管理面板 / 客人 = 加入購物車 */}
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
              {/* 商品資訊（共用） */}
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
                  <p className="text-2xl font-bold text-primary">${selectedProduct.price}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getProductMode(selectedProduct) === 'stock'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                        }`}
                    >
                      {getProductMode(selectedProduct) === 'stock'
                        ? `現貨 (剩 ${selectedProduct.stock})`
                        : '預購'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      已售 {selectedProduct.sold_qty}
                    </span>
                  </div>
                </div>
              </div>

              {isStaff ? (
                /* ===== 管理者模式：管理面板 ===== */
                (() => {
                  const pStats = getProductStats(selectedProduct.id)
                  const isExpiredProduct = selectedProduct.end_time
                    ? new Date(selectedProduct.end_time).getTime() < Date.now()
                    : selectedProduct.is_expired

                  return (
                    <div className="space-y-3">
                      {/* 訂單統計 */}
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl text-sm">
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold">{pStats.total}</p>
                          <p className="text-xs text-muted-foreground">總訂單</p>
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold text-green-600">{pStats.allocated}</p>
                          <p className="text-xs text-muted-foreground">已分配</p>
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold text-orange-600">{pStats.pending}</p>
                          <p className="text-xs text-muted-foreground">待處理</p>
                        </div>
                      </div>

                      {/* 操作按鈕 */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* 補貨 */}
                        <Button
                          variant="outline"
                          className="h-12 border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400"
                          onClick={() => {
                            setRestockProduct(selectedProduct)
                            setRestockQty('')
                            setSelectedProduct(null)
                          }}
                        >
                          <PackagePlus className="w-4 h-4 mr-1" />
                          補貨
                        </Button>

                        {/* 截止 / 延長 */}
                        {!isExpiredProduct ? (
                          <Button
                            variant="outline"
                            className="h-12 border-red-200 text-red-700 dark:border-red-800 dark:text-red-400"
                            onClick={() => {
                              handleUpdateEndTime(selectedProduct.id, new Date())
                              setSelectedProduct(null)
                            }}
                          >
                            <TimerOff className="w-4 h-4 mr-1" />
                            截止收單
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-12 border-green-200 text-green-700 dark:border-green-800 dark:text-green-400"
                            onClick={() => {
                              handleUpdateEndTime(
                                selectedProduct.id,
                                new Date(Date.now() + 60 * 60 * 1000)
                              )
                              setSelectedProduct(null)
                            }}
                          >
                            <TimerReset className="w-4 h-4 mr-1" />
                            延長 1 小時
                          </Button>
                        )}

                        {/* 上架 / 下架 */}
                        {selectedProduct.status !== 'active' ? (
                          <Button
                            variant="outline"
                            className="h-12 border-green-200 text-green-700 dark:border-green-800 dark:text-green-400"
                            onClick={() => {
                              handleToggleProduct(selectedProduct.id, 'activate')
                              setSelectedProduct(null)
                            }}
                            disabled={isToggling === selectedProduct.id}
                          >
                            {isToggling === selectedProduct.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Eye className="w-4 h-4 mr-1" />
                                上架
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-12 border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-400"
                            onClick={() => {
                              handleToggleProduct(selectedProduct.id, 'deactivate')
                              setSelectedProduct(null)
                            }}
                            disabled={isToggling === selectedProduct.id}
                          >
                            {isToggling === selectedProduct.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <EyeOff className="w-4 h-4 mr-1" />
                                下架
                              </>
                            )}
                          </Button>
                        )}

                        {/* 關閉 */}
                        <Button
                          variant="outline"
                          className="h-12"
                          onClick={() => setSelectedProduct(null)}
                        >
                          <X className="w-4 h-4 mr-1" />
                          關閉
                        </Button>
                      </div>
                    </div>
                  )
                })()
              ) : (
                /* ===== 客人模式：加入購物車 ===== */
                <>
                  {/* 數量選擇 */}
                  {(() => {
                    const inCartQty = cart.find((c) => c.product.id === selectedProduct.id)?.quantity || 0
                    let maxQty = 99
                    if (selectedProduct.is_limited) {
                      if (selectedProduct.stock !== null) {
                        maxQty = Math.min(maxQty, selectedProduct.stock - inCartQty)
                      }
                      if (selectedProduct.limit_qty) {
                        maxQty = Math.min(maxQty, selectedProduct.limit_qty - inCartQty)
                      }
                    }
                    maxQty = Math.max(maxQty, 0)

                    return (
                      <>
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
                            <span className="text-xl font-bold w-8 text-center">{quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-full"
                              onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                              disabled={quantity >= maxQty}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {selectedProduct.is_limited && selectedProduct.limit_qty && (
                          <p className="text-sm text-orange-600 mb-2">
                            此商品限購 {selectedProduct.limit_qty} 個
                            {inCartQty > 0 && `（購物車已有 ${inCartQty} 個）`}
                          </p>
                        )}
                        {selectedProduct.is_limited && selectedProduct.stock !== null && inCartQty > 0 && (
                          <p className="text-sm text-muted-foreground mb-2">
                            購物車已有 {inCartQty} 個，剩餘可加 {Math.max(0, selectedProduct.stock - inCartQty)} 個
                          </p>
                        )}
                      </>
                    )
                  })()}

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setSelectedProduct(null)}>
                      取消
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleAddToCart}
                      style={accentColor ? { backgroundColor: accentColor } : undefined}
                    >
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      加入購物車 ${selectedProduct.price * quantity}
                    </Button>
                  </div>
                </>
              )}
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
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl max-h-[80vh] flex flex-col safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-bold">
                  購物車
                  {cart.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {cart.length} 項商品
                    </span>
                  )}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCartOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>購物車是空的</p>
                    <p className="text-xs mt-1">點選商品加入購物車</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex gap-3 p-3 rounded-xl border"
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {item.product.image_url ? (
                            <Image
                              src={item.product.image_url}
                              alt={item.product.name}
                              width={56}
                              height={56}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-medium truncate text-sm">{item.product.name}</p>
                            <button
                              className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-0.5"
                              onClick={() => setCart((prev) => prev.filter((c) => c.product.id !== item.product.id))}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-sm font-bold" style={accentColor ? { color: accentColor } : undefined}>
                            ${item.product.price * item.quantity}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              className="w-7 h-7 rounded-full border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  setCart((prev) => prev.filter((c) => c.product.id !== item.product.id))
                                } else {
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.product.id === item.product.id
                                        ? { ...c, quantity: c.quantity - 1 }
                                        : c
                                    )
                                  )
                                }
                              }}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                            <button
                              className="w-7 h-7 rounded-full border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              onClick={() => {
                                // 現貨模式：受庫存+限購限制；預購模式：不限
                                let max = 99
                                if (item.product.is_limited) {
                                  if (item.product.stock !== null) {
                                    max = Math.min(max, item.product.stock)
                                  }
                                  if (item.product.limit_qty) {
                                    max = Math.min(max, item.product.limit_qty)
                                  }
                                }
                                if (item.quantity < max) {
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.product.id === item.product.id
                                        ? { ...c, quantity: c.quantity + 1 }
                                        : c
                                    )
                                  )
                                }
                              }}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 購物車底部：合計 + 確認下單 */}
              {cart.length > 0 && (
                <div className="p-4 border-t bg-background">
                  <div className="flex justify-between text-sm mb-3">
                    <span>合計</span>
                    <span className="text-lg font-bold" style={accentColor ? { color: accentColor } : undefined}>
                      ${cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)}
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSubmitCart}
                    disabled={isSubmittingCart}
                    style={accentColor ? { backgroundColor: accentColor } : undefined}
                  >
                    {isSubmittingCart ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ShoppingCart className="w-4 h-4 mr-2" />
                    )}
                    {isSubmittingCart ? '下單中...' : `確認下單（${cart.length} 項）`}
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 我的訂單 Drawer */}
      <AnimatePresence>
        {isOrderDrawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setIsOrderDrawerOpen(false)}
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
                <h2 className="text-lg font-bold">我的訂單</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsOrderDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="p-4 overflow-y-auto h-[calc(100vh-140px)]">
                {orders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">還沒有訂單</p>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className={`flex gap-3 p-3 rounded-xl border ${order.status === 'cancelled' ? 'opacity-50 bg-muted' : ''
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
                          <p className="font-medium truncate">{order.product_name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${order.unit_price} × {order.quantity}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${order.checkout_id
                                ? 'bg-blue-100 text-blue-700'
                                : order.status === 'allocated'
                                  ? 'bg-green-100 text-green-700'
                                  : order.status === 'cancelled'
                                    ? 'bg-gray-100 text-gray-500'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                            >
                              {order.checkout_id
                                ? '已結帳'
                                : order.status === 'allocated'
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

              {/* 訂單底部 */}
              {orders.filter((o) => o.status !== 'cancelled').length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background safe-bottom">
                  <div className="flex justify-between text-sm mb-2">
                    <span>已購得</span>
                    <span className="font-bold text-green-600">
                      $
                      {orders
                        .filter((o) => o.arrived_qty > 0 && !o.checkout_id)
                        .reduce((sum, o) => sum + o.arrived_qty * o.unit_price, 0)}
                    </span>
                  </div>
                  {orders.some((o) => o.checkout_id) && (
                    <div className="flex justify-between text-sm mb-2">
                      <span>已結帳</span>
                      <span className="font-bold text-blue-600">
                        $
                        {orders
                          .filter((o) => o.checkout_id)
                          .reduce((sum, o) => sum + o.quantity * o.unit_price, 0)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm mb-3">
                    <span>等待中</span>
                    <span className="text-muted-foreground">
                      $
                      {orders
                        .filter((o) => o.status !== 'cancelled' && !o.checkout_id)
                        .reduce(
                          (sum, o) => sum + (o.quantity - o.arrived_qty) * o.unit_price,
                          0
                        )}
                    </span>
                  </div>
                  {checkoutEligibleOrders.length > 0 && (
                    <Button
                      className="w-full rounded-xl"
                      onClick={() => {
                        setIsOrderDrawerOpen(false)
                        setIsCheckoutModalOpen(true)
                      }}
                      style={shopSettings.accent_color ? { backgroundColor: shopSettings.accent_color } : undefined}
                    >
                      現貨結帳（{checkoutEligibleOrders.length} 項 · ${checkoutEligibleTotal}）
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 現貨結帳 Modal ========== */}
      <AnimatePresence>
        {isCheckoutModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
            onClick={closeCheckoutModal}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-background rounded-t-2xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-bold">
                  {checkoutStep === 'method' && '選擇出貨方式'}
                  {checkoutStep === 'confirm' && '確認結帳'}
                  {checkoutStep === 'success' && '結帳成功'}
                </h2>
                <button onClick={closeCheckoutModal} className="p-1 rounded-full hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step: method */}
              {checkoutStep === 'method' && (
                <div className="flex-1 overflow-y-auto">
                  {/* 可結帳商品明細 */}
                  <div className="p-4 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground mb-2">結帳商品（{checkoutEligibleOrders.length} 項）</p>
                    {checkoutEligibleOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{order.product_name}</p>
                          <p className="text-xs text-muted-foreground">${order.unit_price} × {order.quantity}</p>
                        </div>
                        <p className="text-sm font-bold ml-2">${order.unit_price * order.quantity}</p>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 font-bold">
                      <span>商品小計</span>
                      <span>${checkoutEligibleTotal}</span>
                    </div>
                  </div>

                  {/* 出貨方式選擇 */}
                  <div className="p-4 pt-0 space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">選擇出貨方式</p>

                    {/* 賣貨便 */}
                    <button
                      onClick={() => setSelectedShipping('myship')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        selectedShipping === 'myship' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium">賣貨便</p>
                        <p className="text-xs text-muted-foreground">7-11 取貨 · 運費 $38（另計）</p>
                      </div>
                      {selectedShipping === 'myship' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </button>

                    {/* 宅配 */}
                    <button
                      onClick={() => setSelectedShipping('delivery')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        selectedShipping === 'delivery' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium">宅配</p>
                        <p className="text-xs text-muted-foreground">宅配到府 · 運費 $80</p>
                      </div>
                      {selectedShipping === 'delivery' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </button>

                    {/* 自取 */}
                    <button
                      onClick={() => setSelectedShipping('pickup')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        selectedShipping === 'pickup' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium">自取</p>
                        <p className="text-xs text-muted-foreground">到店自取 · 免運費</p>
                      </div>
                      {selectedShipping === 'pickup' && <CheckCircle className="w-5 h-5 text-primary shrink-0" />}
                    </button>
                  </div>

                  {/* 下一步按鈕 */}
                  <div className="p-4 border-t">
                    <Button
                      className="w-full rounded-xl"
                      disabled={!selectedShipping}
                      onClick={() => setCheckoutStep('confirm')}
                      style={shopSettings.accent_color ? { backgroundColor: shopSettings.accent_color } : undefined}
                    >
                      下一步
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: confirm */}
              {checkoutStep === 'confirm' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    {/* 金額明細 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>商品小計（{checkoutEligibleOrders.length} 項）</span>
                        <span>${checkoutEligibleTotal}</span>
                      </div>
                      {selectedShipping === 'myship' && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>運費 $38（賣貨便另計，不含在結帳金額）</span>
                        </div>
                      )}
                      {selectedShipping === 'delivery' && (
                        <div className="flex justify-between text-sm">
                          <span>運費（宅配）</span>
                          <span>$80</span>
                        </div>
                      )}
                      {selectedShipping === 'pickup' && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>運費</span>
                          <span>免運</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>結帳金額</span>
                        <span>${selectedShipping === 'delivery' ? checkoutEligibleTotal + 80 : checkoutEligibleTotal}</span>
                      </div>
                    </div>

                    {/* 出貨方式 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">出貨方式：</span>
                      <span className="font-medium">
                        {selectedShipping === 'myship' && '賣貨便（7-11 取貨）'}
                        {selectedShipping === 'delivery' && '宅配到府'}
                        {selectedShipping === 'pickup' && '到店自取'}
                      </span>
                    </div>
                  </div>

                  {/* 確認按鈕 */}
                  <div className="p-4 border-t space-y-2">
                    <Button
                      className="w-full rounded-xl"
                      onClick={handleCheckout}
                      disabled={isSubmittingCheckout}
                      style={shopSettings.accent_color ? { backgroundColor: shopSettings.accent_color } : undefined}
                    >
                      {isSubmittingCheckout ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          處理中...
                        </>
                      ) : (
                        '確認結帳'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl"
                      onClick={() => setCheckoutStep('method')}
                      disabled={isSubmittingCheckout}
                    >
                      上一步
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: success */}
              {checkoutStep === 'success' && checkoutResult && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">結帳成功！</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        結帳單號：{checkoutResult.checkout_no}
                      </p>
                    </div>

                    {/* 金額摘要 */}
                    <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>商品數量</span>
                        <span>{checkoutResult.item_count} 項</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>結帳金額</span>
                        <span>${checkoutResult.total_amount}</span>
                      </div>
                    </div>

                    {/* 出貨方式專屬提示 */}
                    <div className="bg-blue-50 rounded-xl p-4 text-left">
                      {checkoutResult.shipping_method === 'myship' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                            <Store className="w-4 h-4" /> 賣貨便取貨
                          </p>
                          <p className="text-sm text-blue-700">
                            請等待賣貨便賣場連結回傳，届時會透過 LINE 通知您取貨資訊。
                          </p>
                        </div>
                      )}
                      {checkoutResult.shipping_method === 'delivery' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                            <Truck className="w-4 h-4" /> 宅配到府
                          </p>
                          <p className="text-sm text-blue-700">
                            請依匯款資訊轉帳，匯款完成後等待店家確認出貨。
                          </p>
                        </div>
                      )}
                      {checkoutResult.shipping_method === 'pickup' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                            <MapPin className="w-4 h-4" /> 到店自取
                          </p>
                          <p className="text-sm text-blue-700">
                            請依匯款資訊轉帳，店家確認後安排取貨。
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 匯款資訊（宅配/自取） */}
                    {checkoutResult.shipping_method !== 'myship' && tenant?.payment_info && (
                      <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium">匯款資訊</p>
                        {tenant.payment_info.bank && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">銀行</span>
                            <span>{tenant.payment_info.bank}</span>
                          </div>
                        )}
                        {tenant.payment_info.account && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">帳號</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono">{tenant.payment_info.account}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(tenant.payment_info!.account!)
                                  toast.success('已複製帳號')
                                }}
                                className="p-1 rounded-md hover:bg-muted active:scale-95 transition-transform"
                              >
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        )}
                        {tenant.payment_info.name && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">戶名</span>
                            <span>{tenant.payment_info.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 關閉按鈕 */}
                  <div className="p-4 border-t">
                    <Button
                      className="w-full rounded-xl"
                      onClick={closeCheckoutModal}
                      style={shopSettings.accent_color ? { backgroundColor: shopSettings.accent_color } : undefined}
                    >
                      關閉
                    </Button>
                  </div>
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
                    {staffRole === 'owner'
                      ? '負責人'
                      : staffRole === 'admin'
                        ? '管理員'
                        : '工作人員'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsAdminPanelOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* 統計 */}
              {staffStats && (
                <div className="grid grid-cols-3 gap-2 p-4 border-b">
                  <div className="text-center">
                    <p className="text-lg font-bold">
                      {staffStats.total_orders - staffStats.cancelled_count}
                    </p>
                    <p className="text-xs text-muted-foreground">總訂單</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{staffStats.allocated_count}</p>
                    <p className="text-xs text-muted-foreground">已分配</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">
                      ${staffStats.total_sales.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">銷售額</p>
                  </div>
                </div>
              )}

              {/* 訂單列表 - 按商品分組 */}
              <div className="p-4 overflow-y-auto h-[calc(100vh-220px)]">
                {products.map((product) => {
                  const productOrders = allOrders.filter(
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
                              <span className="text-muted-foreground flex-shrink-0">
                                ×{order.quantity}
                              </span>
                            </div>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${order.status === 'allocated'
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

                {allOrders.filter((o) => o.status !== 'cancelled').length === 0 && (
                  <p className="text-center text-muted-foreground py-8">尚無訂單</p>
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
              />

              {/* 預購/現貨 切換 */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${!newProductIsLimited
                    ? 'bg-blue-500 text-white'
                    : 'bg-muted text-muted-foreground'
                    }`}
                  onClick={() => {
                    setNewProductIsLimited(false)
                    setNewProductStock('')
                  }}
                >
                  預購
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${newProductIsLimited
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
                    }`}
                  onClick={() => setNewProductIsLimited(true)}
                >
                  現貨
                </button>
              </div>

              {/* 價格 + 庫存（現貨模式才顯示庫存） */}
              <div className="flex gap-2 mb-3">
                <Input
                  type="number"
                  min="1"
                  placeholder="價格"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  className="flex-1 rounded-xl"
                />
                {newProductIsLimited && (
                  <Input
                    type="number"
                    min="1"
                    placeholder="庫存數量"
                    value={newProductStock}
                    onChange={(e) => setNewProductStock(e.target.value)}
                    className="flex-1 rounded-xl"
                  />
                )}
              </div>

              {/* 分類標籤 */}
              {shopCategories.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1.5">分類標籤</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!newProductCategory
                        ? 'bg-purple-500 text-white'
                        : 'bg-muted text-muted-foreground'
                        }`}
                      onClick={() => setNewProductCategory('')}
                    >
                      無
                    </button>
                    {shopCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${newProductCategory === cat.name
                          ? 'bg-purple-500 text-white'
                          : 'bg-muted text-muted-foreground'
                          }`}
                        onClick={() => setNewProductCategory(cat.name)}
                      >
                        #{cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 限時設定 */}
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1.5">收單時限</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${newProductEndTime === null
                      ? 'bg-gray-700 text-white'
                      : 'bg-muted text-muted-foreground'
                      }`}
                    onClick={() => setNewProductEndTime(null)}
                  >
                    不限時
                  </button>
                  {[30, 60, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${newProductEndTime === mins
                        ? 'bg-orange-500 text-white'
                        : 'bg-muted text-muted-foreground'
                        }`}
                      onClick={() => setNewProductEndTime(mins)}
                    >
                      {mins >= 60 ? `${mins / 60}hr` : `${mins}分`}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                {newProductIsLimited
                  ? '現貨模式：庫存售完即完銷'
                  : '預購模式：不限數量，到貨後補貨分配'}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsAddProductOpen(false)
                    setNewProductName('')
                    setNewProductPrice('')
                    setNewProductStock('')
                    setNewProductIsLimited(false)
                    setNewProductCategory('')
                    setNewProductEndTime(null)
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
              <h3 className="text-lg font-bold mb-1">補貨 - {restockProduct.name}</h3>
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
              />

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setRestockProduct(null)}>
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
