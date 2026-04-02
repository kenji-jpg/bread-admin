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
  Clock,
  Flame,
  Package,
  ClipboardList,
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
  Search,
  ChevronDown,
  ArrowUpDown,
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
  image_urls: string[] | null
  description: string | null
  category: string | null
  end_time: string | null
  is_limited: boolean
  limit_qty: number | null
  status: string
  is_expired: boolean
  is_sold_out: boolean
  created_at: string
  has_variants?: boolean
  variants?: { name: string; stock: number }[]
}

interface ProductVariant {
  id: string
  name: string
  stock: number
  sold_qty: number
  sort_order: number
}

interface Tenant {
  id: string
  name: string
  slug: string
  liff_id?: string | null
  plan?: string
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
  variant_name: string | null
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
  const { isReady, isLoggedIn, profile, login, error: liffError } = useLiff()

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
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([])
  const [isLoadingVariants, setIsLoadingVariants] = useState(false)
  // 直接喊單狀態
  const [isOrdering, setIsOrdering] = useState(false)

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
  // 排序
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular'>('newest')
  const [isSortOpen, setIsSortOpen] = useState(false)

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
  const [restockVariants, setRestockVariants] = useState<ProductVariant[]>([])
  const [restockSelectedVariant, setRestockSelectedVariant] = useState<ProductVariant | null>(null)

  // 上架 Modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('')
  const [newProductStock, setNewProductStock] = useState('')
  const [newProductIsLimited, setNewProductIsLimited] = useState(false)
  const [newProductCategory, setNewProductCategory] = useState('')
  const [newProductEndTime, setNewProductEndTime] = useState<number | null>(null) // null=不限時, 30/60/120=分鐘
  const [newProductImages, setNewProductImages] = useState<File[]>([])
  const [newProductPreviews, setNewProductPreviews] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [newProductHasVariants, setNewProductHasVariants] = useState(false)
  const [newProductVariants, setNewProductVariants] = useState<{ name: string; stock: string }[]>([{ name: '', stock: '' }])
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
      console.log('[Shop] loadAllOrders called:', { tenantId: tenant.id, lineUserId: profile.userId })
      const { data, error } = await supabase.rpc('get_shop_all_orders_v1', {
        p_tenant_id: tenant.id,
        p_line_user_id: profile.userId,
      })

      console.log('[Shop] loadAllOrders result:', { data, error })

      if (error) throw error

      if (data.success) {
        setAllOrders(data.orders || [])
        setStaffStats(data.stats || null)
      } else {
        console.warn('[Shop] loadAllOrders RPC failed:', data.error)
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

  // Realtime 訂閱 - 商品即時同步（僅 Max 方案或 Staff 啟用）
  useEffect(() => {
    if (!tenant?.id) return
    if (tenant.plan !== 'max' && !isStaff) return

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
  }, [tenant?.id, tenant?.plan, isStaff, supabase, loadShop])

  // 已移除 30 秒輪詢 — Realtime 訂閱已處理商品即時同步

  // ========== 選擇商品（載入規格）==========
  const handleSelectProduct = async (product: Product) => {
    setSelectedProduct(product)
    setCarouselIndex(0)
    setQuantity(1)
    setSelectedVariant(null)
    setProductVariants([])

    if (product.has_variants) {
      setIsLoadingVariants(true)
      try {
        const { data, error } = await supabase.rpc('get_product_variants_v1', {
          p_product_id: product.id,
        })
        if (!error && data?.variants) {
          setProductVariants(data.variants)
        }
      } catch (err) {
        console.error('Load variants error:', err)
      } finally {
        setIsLoadingVariants(false)
      }
    }
  }

  // ========== 直接喊單 ==========
  const handleDirectOrder = async () => {
    if (!selectedProduct || !profile || !tenant) return
    // 有規格但沒選 → 擋住
    if (selectedProduct.has_variants && !selectedVariant) {
      toast.error('請先選擇規格')
      return
    }

    setIsOrdering(true)
    try {
      const { data, error } = await supabase.rpc('create_shop_order_v1', {
        p_tenant_id: tenant.id,
        p_product_id: selectedProduct.id,
        p_line_user_id: profile.userId,
        p_quantity: quantity,
        p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl,
        p_variant_id: selectedVariant?.id || null,
      })

      if (error) throw error

      if (!data.success) {
        toast.error(data.error || '喊單失敗')
      } else {
        toast.success(`已喊單：${selectedProduct.name} x${quantity}`)
        setSelectedProduct(null)
        setQuantity(1)
        loadMyOrders()
      }
    } catch (err) {
      console.error('Direct order error:', err)
      toast.error('喊單失敗，請稍後再試')
    } finally {
      setIsOrdering(false)
    }
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
    // 有規格但沒選
    if (restockProduct.has_variants && !restockSelectedVariant) {
      toast.error('請先選擇要補貨的規格')
      return
    }

    setIsRestocking(true)
    try {
      const { data, error } = await supabase.rpc('restock_product_by_id_v1', {
        p_product_id: restockProduct.id,
        p_quantity: parseInt(restockQty),
        p_variant_id: restockSelectedVariant?.id || null,
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
      const imageUrls: string[] = []
      const skuBase = `SP${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // 上傳圖片（支援多張）
      for (let i = 0; i < newProductImages.length; i++) {
        try {
          const sku = `${skuBase}-${i}`
          const compressedBlob = await compressImage(newProductImages[i])
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
            imageUrls.push(publicUrl)
          } else {
            console.error('Upload error for image', i, uploadError)
          }
        } catch (err) {
          console.error('Compress/upload error for image', i, err)
        }
      }

      // 呼叫 RPC 建立商品
      const endTimeValue = newProductEndTime
        ? new Date(Date.now() + newProductEndTime * 60 * 1000).toISOString()
        : null

      // 規格處理
      const variantsPayload = newProductHasVariants
        ? newProductVariants
            .filter((v) => v.name.trim())
            .map((v) => ({ name: v.name.trim(), stock: parseInt(v.stock) || 0 }))
        : null

      const { data, error } = await supabase.rpc('add_shop_product_v1', {
        p_tenant_id: tenant.id,
        p_line_user_id: profile.userId,
        p_name: newProductName.trim(),
        p_price: parseFloat(newProductPrice),
        p_stock: newProductIsLimited && newProductStock ? parseInt(newProductStock) : 0,
        p_image_url: imageUrls[0] || null,
        p_image_urls: imageUrls.length > 0 ? imageUrls : null,
        p_is_limited: newProductIsLimited,
        p_category: newProductCategory || null,
        p_end_time: endTimeValue,
        p_variants: variantsPayload,
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
      setNewProductImages([])
      setNewProductPreviews([])
      setNewProductHasVariants(false)
      setNewProductVariants([{ name: '', stock: '' }])
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

  // LIFF 錯誤（未設定 LIFF ID 等）
  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-2">{liffError}</p>
          <p className="text-xs text-muted-foreground">請聯繫店家管理員設定 LINE Login</p>
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

  // 商城主題色：麵包超人紅橘色
  const accentColor = '#D94E2B'

  return (
    <div
      className="min-h-screen max-w-lg mx-auto"
      style={{
        '--shop-bg': '#FEF0DB',
        '--shop-card': '#ffffff',
        '--shop-card-border': '#F5E0C4',
        '--shop-text': '#4A2C17',
        '--shop-text-sub': '#8B6B4A',
        '--shop-muted': '#F7D9B4',
        '--shop-accent': accentColor,
        backgroundColor: 'var(--shop-bg)',
        color: 'var(--shop-text)',
      } as React.CSSProperties}
    >
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

      {/* Header */}
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
            <div className="absolute inset-0 bg-black/40" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: '#D94E2B' }} />
        )}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: shopSettings.banner_url ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.2)',
                }}
              >
                <Store className="w-4 h-4" style={{ color: 'white' }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold truncate" style={{ color: 'white' }}>{tenant.name}</h1>
                  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#bbf7d0' }} />
                    營業中
                  </span>
                </div>
                {isStaff && staffStats && (
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    訂單 {staffStats.total_orders - staffStats.cancelled_count} · ${staffStats.total_sales.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {isStaff && (
                <>
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px] px-1.5 py-0.5 mr-1">
                    <Shield className="w-3 h-3 mr-0.5" />
                    管理
                  </Badge>
                  <button
                    className="relative p-2 rounded-full transition-colors"
                    style={{ color: 'white' }}
                    onClick={() => { loadAllOrders(); setIsAdminPanelOpen(true) }}
                  >
                    <Users className="w-5 h-5" />
                  </button>
                </>
              )}
              {/* 訂單 */}
              {isLoggedIn && !isStaff && (
                <button
                  className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors active:scale-95"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  onClick={() => setIsOrderDrawerOpen(true)}
                >
                  <div className="relative">
                    <ClipboardList className="w-5 h-5" />
                    {orderItemCount > 0 && (
                      <motion.span
                        key={orderItemCount}
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
                        style={{ backgroundColor: '#fff8f0', color: '#D94E2B' }}
                      >
                        {orderItemCount}
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[10px] leading-none">訂單</span>
                </button>
              )}
              {/* 購物車已移除，改為直接喊單 */}
              {/* 未登入：登入按鈕 */}
              {!isLoggedIn && (
                <button
                  className="rounded-full h-7 px-3 text-[10px] font-medium transition-all active:scale-95"
                  style={{ backgroundColor: '#D94E2B', color: '#fff8f0' }}
                  onClick={login}
                >
                  登入
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Announcement Banner */}
      {shopSettings.announcement && (
        <div
          className="px-4 py-3 text-sm font-medium"
          style={{
            background: `linear-gradient(135deg, ${accentColor || '#D94E2B'}, ${accentColor ? accentColor + 'dd' : '#C44425'})`,
            color: '#fff8f0',
          }}
        >
          <div className="flex items-start gap-2">
            <Megaphone className="w-4 h-4 shrink-0 mt-0.5 opacity-90" />
            <span className="leading-relaxed">{shopSettings.announcement}</span>
          </div>
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
        const orderedCategories = shopCategories.length > 0
          ? shopCategories.map(c => c.name)
          : [...new Set(products.map(p => p.category).filter(Boolean))] as string[]
        if (orderedCategories.length === 0) return null
        const getCategoryCount = (cat: string | null) => cat
          ? products.filter(p => p.category === cat).length
          : products.length
        return (
          <div className="px-3 pt-2.5 pb-0 flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedCategory === null ? 'shadow-sm' : ''}`}
              style={{
                backgroundColor: selectedCategory === null
                  ? (accentColor || '#8b5e3c')
                  : '#F7D9B4',
                color: selectedCategory === null
                  ? '#fff8f0'
                  : '#8B6B4A',
              }}
              onClick={() => setSelectedCategory(null)}
            >
              全部 ({getCategoryCount(null)})
            </button>
            {orderedCategories.map(cat => (
              <button
                key={cat}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedCategory === cat ? 'shadow-sm' : ''}`}
                style={{
                  backgroundColor: selectedCategory === cat
                    ? (accentColor || '#8b5e3c')
                    : '#F7D9B4',
                  color: selectedCategory === cat
                    ? '#fff8f0'
                    : '#8B6B4A',
                }}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                {cat} ({getCategoryCount(cat)})
              </button>
            ))}
          </div>
        )
      })()}

      {/* 排序 & 商品數量 */}
      {(() => {
        const filteredCount = selectedCategory
          ? products.filter(p => p.category === selectedCategory).length
          : products.length
        if (filteredCount === 0) return null
        const sortLabels: Record<string, string> = {
          newest: '最新上架',
          price_asc: '價格低→高',
          price_desc: '價格高→低',
          popular: '熱門優先',
        }
        return (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs" style={{ color: '#8B6B4A' }}>{filteredCount} 件商品</span>
            <div className="relative">
              <button
                className="flex items-center gap-1 text-xs transition-colors"
                style={{ color: '#8B6B4A' }}
                onClick={() => setIsSortOpen(!isSortOpen)}
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortLabels[sortBy]}
                <ChevronDown className={`w-3 h-3 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSortOpen && (
                <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20 min-w-[120px] py-1" style={{ backgroundColor: '#ffffff', border: '1px solid #f0e6d9' }}>
                  {(Object.entries(sortLabels) as [typeof sortBy, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                      style={{ color: sortBy === key ? (accentColor || '#8b5e3c') : '#8b7355', fontWeight: sortBy === key ? 500 : 400 }}
                      onClick={() => { setSortBy(key); setIsSortOpen(false) }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* 商品列表 */}
      <main className="px-3 pb-2">
        <div className="grid grid-cols-2 gap-3">
          {(selectedCategory ? products.filter(p => p.category === selectedCategory) : products)
            .slice()
            .sort((a, b) => {
              const aUnavailable = a.status !== 'active' || a.is_expired || a.is_sold_out || (a.end_time && new Date(a.end_time).getTime() < Date.now()) || (a.is_limited && a.stock !== null && a.stock <= 0)
              const bUnavailable = b.status !== 'active' || b.is_expired || b.is_sold_out || (b.end_time && new Date(b.end_time).getTime() < Date.now()) || (b.is_limited && b.stock !== null && b.stock <= 0)
              if (aUnavailable && !bUnavailable) return 1
              if (!aUnavailable && bUnavailable) return -1
              // 自訂排序
              if (sortBy === 'price_asc') return a.price - b.price
              if (sortBy === 'price_desc') return b.price - a.price
              if (sortBy === 'popular') return b.sold_qty - a.sold_qty
              return 0 // newest = 預設（API 已按 created_at 排序）
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
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`relative transition-all flex flex-col ${(isUnavailable && !isStaff) ? 'opacity-60' : 'cursor-pointer'
                    } ${isInactive && isStaff ? 'opacity-50' : ''}`}
                  onClick={() => {
                    if (isStaff) {
                      handleSelectProduct(product)
                      return
                    }
                    if (isUnavailable) return
                    if (!isLoggedIn) {
                      login()
                      return
                    }
                    handleSelectProduct(product)
                  }}
                >
                  {/* 左上 badges：已售數量 */}
                  {product.sold_qty > 0 && (
                    <motion.div
                      key={product.sold_qty}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                      className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full text-xs font-bold text-white ${isHot ? 'bg-red-500' : 'bg-black/60'
                        }`}
                    >
                      +{product.sold_qty}
                      {isHot && <Flame className="inline w-3 h-3 ml-0.5" />}
                    </motion.div>
                  )}

                  {/* 右上 badges：預購/現貨 + 倒數時間 */}
                  <div className="absolute top-1.5 right-1.5 z-10 flex flex-col items-end gap-0.5">
                    <div
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: mode === 'stock' ? '#6B8E5E' : '#D94E2B',
                        color: '#fff8f0',
                      }}
                    >
                      {mode === 'stock' ? '現貨' : '預購'}
                    </div>
                    {timeRemaining && (
                      <div className="px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500 text-white">
                        <Clock className="inline w-3 h-3 mr-0.5" />
                        {timeRemaining}
                      </div>
                    )}
                  </div>

                  {/* 商品圖片 */}
                  <div className="aspect-square relative overflow-hidden rounded-2xl" style={{ backgroundColor: '#F5E0C4' }}>
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
                        <Package className="w-10 h-10 text-muted-foreground/40" />
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
                  <div className="p-2.5 flex flex-col flex-1">
                    <p className="text-sm leading-tight line-clamp-2" style={{ color: '#4A2C17' }}>{product.name}</p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-xs" style={{ color: '#8B6B4A' }}>$</span>
                      <span className="text-base font-bold" style={{ color: accentColor || '#8b5e3c' }}>{product.price.toLocaleString()}</span>
                      {mode === 'stock' && product.stock !== null && product.stock > 0 && (
                        <span className="text-[10px] ml-auto" style={{ color: '#8B6B4A' }}>
                          剩 {product.stock}
                        </span>
                      )}
                    </div>
                    {product.is_limited && product.limit_qty && (
                      <p className="text-[10px] mt-0.5" style={{ color: '#D94E2B' }}>限購 {product.limit_qty}</p>
                    )}

                    {/* 規格標籤 */}
                    {product.has_variants && product.variants && product.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.variants.map((v) => {
                          const isSoldOut = product.is_limited && v.stock <= 0
                          return (
                            <span
                              key={v.name}
                              className={`text-[10px] px-1.5 py-0.5 rounded-md ${isSoldOut ? 'line-through opacity-40' : ''}`}
                              style={{
                                backgroundColor: isSoldOut ? '#E8D5BE' : '#F5E0C4',
                                color: '#4A2C17',
                              }}
                            >
                              {v.name}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* 管理員：顯示分配狀態 */}
                    {isStaff && pStats && (
                      <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: '#F5E0C4' }}>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            已配 {pStats.allocated}/{pStats.total}
                          </span>
                          {pStats.pending > 0 && (
                            <span className="text-orange-600 font-medium">{pStats.pending} 待處理</span>
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
          <div className="text-center py-16 text-muted-foreground">
            {isStaff ? (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center mb-4">
                  <Camera className="w-8 h-8 text-purple-400" />
                </div>
                <p className="text-sm font-medium mb-1">還沒有商品</p>
                <p className="text-xs mb-4">上架第一個商品開始營業吧！</p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700 rounded-xl"
                  onClick={() => setIsAddProductOpen(true)}
                >
                  <Camera className="w-4 h-4 mr-1" />
                  上架商品
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Store className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium mb-1">商城尚未開放</p>
                <p className="text-xs">敬請期待</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 底部 Bar 已移除 — 操作按鈕統一在 Header */}

      {/* 商品 Modal：管理者 = 管理面板 / 客人 = 喊單面板 */}
      <AnimatePresence>
        {selectedProduct && (() => {
          const modalImages = (selectedProduct.image_urls && selectedProduct.image_urls.length > 0)
            ? selectedProduct.image_urls
            : selectedProduct.image_url
              ? [selectedProduct.image_url]
              : []
          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex justify-center"
            onClick={() => { setSelectedProduct(null); setCarouselIndex(0) }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute inset-x-0 top-12 bottom-0 rounded-t-2xl overflow-y-auto safe-bottom max-w-lg mx-auto"
              style={{ backgroundColor: '#FFF8F0' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 拖曳指示條 */}
              <div className="sticky top-0 z-10 pt-3 pb-2" style={{ backgroundColor: '#FFF8F0' }}>
                <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: '#D4B896' }} />
              </div>

              <div className="px-5 pb-5">
              {/* 商品大圖 / 輪播 */}
              <div className="mb-4">
                {modalImages.length > 0 ? (
                  <div className="relative">
                    <div className="overflow-hidden rounded-2xl relative touch-pan-y">
                      <div
                        className="flex"
                        style={{
                          transform: `translateX(-${carouselIndex * 100}%)`,
                          transition: 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                      >
                        {modalImages.map((url, i) => (
                          <div key={i} className="min-w-full aspect-square relative">
                            <Image
                              src={url}
                              alt={`${selectedProduct.name} ${i + 1}`}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, 400px"
                            />
                          </div>
                        ))}
                      </div>
                      {/* 手勢偵測層 */}
                      {modalImages.length > 1 && (
                        <motion.div
                          key={`drag-${carouselIndex}`}
                          className="absolute inset-0 z-10"
                          drag="x"
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.15}
                          dragMomentum={false}
                          onDragEnd={(_e, info) => {
                            const threshold = 50
                            if (info.offset.x < -threshold && carouselIndex < modalImages.length - 1) {
                              setCarouselIndex(prev => prev + 1)
                            } else if (info.offset.x > threshold && carouselIndex > 0) {
                              setCarouselIndex(prev => prev - 1)
                            }
                          }}
                        />
                      )}
                    </div>
                    {/* 圓點指示器 */}
                    {modalImages.length > 1 && (
                      <div className="flex justify-center gap-1.5 mt-3">
                        {modalImages.map((_, i) => (
                          <button
                            key={i}
                            className="w-2 h-2 rounded-full transition-all"
                            style={{
                              backgroundColor: i === carouselIndex ? (accentColor || '#D94E2B') : '#D4B896',
                              transform: i === carouselIndex ? 'scale(1.3)' : 'scale(1)',
                            }}
                            onClick={() => setCarouselIndex(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full aspect-square rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#F5E0C4' }}>
                    <Package className="w-16 h-16" style={{ color: '#C4A882' }} />
                  </div>
                )}
              </div>

              {/* 商品資訊 */}
              <div className="mb-5">
                <h3 className="font-bold text-lg leading-tight" style={{ color: '#4A2C17' }}>{selectedProduct.name}</h3>
                <p className="text-2xl font-bold mt-1" style={{ color: accentColor || '#D94E2B' }}>${selectedProduct.price.toLocaleString()}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: getProductMode(selectedProduct) === 'stock' ? '#E8F5E2' : '#FEE8D6',
                      color: getProductMode(selectedProduct) === 'stock' ? '#4A7C3F' : '#B8461B',
                    }}
                  >
                    {getProductMode(selectedProduct) === 'stock'
                      ? `現貨 (剩 ${selectedProduct.stock})`
                      : '預購'}
                  </span>
                  <span className="text-xs" style={{ color: '#8B6B4A' }}>
                    已售 {selectedProduct.sold_qty}
                  </span>
                </div>
                {selectedProduct.description && (
                  <p className="text-sm mt-3 leading-relaxed" style={{ color: '#8B6B4A' }}>{selectedProduct.description}</p>
                )}
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
                      <div className="flex items-center gap-3 p-3 rounded-xl text-sm" style={{ backgroundColor: '#F5E0C4' }}>
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold" style={{ color: '#4A2C17' }}>{pStats.total}</p>
                          <p className="text-xs" style={{ color: '#8B6B4A' }}>總訂單</p>
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold" style={{ color: '#4A7C3F' }}>{pStats.allocated}</p>
                          <p className="text-xs" style={{ color: '#8B6B4A' }}>已分配</p>
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-lg font-bold" style={{ color: '#D94E2B' }}>{pStats.pending}</p>
                          <p className="text-xs" style={{ color: '#8B6B4A' }}>待處理</p>
                        </div>
                      </div>

                      {/* 操作按鈕 */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* 補貨 */}
                        <button
                          className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                          style={{ backgroundColor: '#7C3AED', color: '#fff' }}
                          onClick={async () => {
                            const prod = selectedProduct
                            setRestockProduct(prod)
                            setRestockQty('')
                            setRestockSelectedVariant(null)
                            setRestockVariants([])
                            setSelectedProduct(null)
                            // 載入規格
                            if (prod.has_variants) {
                              try {
                                const { data } = await supabase.rpc('get_product_variants_v1', { p_product_id: prod.id })
                                if (data?.variants) setRestockVariants(data.variants)
                              } catch {}
                            }
                          }}
                        >
                          <PackagePlus className="w-4 h-4" />
                          補貨
                        </button>

                        {/* 截止 / 延長 */}
                        {!isExpiredProduct ? (
                          <button
                            className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                            style={{ backgroundColor: '#DC2626', color: '#fff' }}
                            onClick={() => {
                              handleUpdateEndTime(selectedProduct.id, new Date())
                              setSelectedProduct(null)
                            }}
                          >
                            <TimerOff className="w-4 h-4" />
                            截止收單
                          </button>
                        ) : (
                          <button
                            className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                            style={{ backgroundColor: '#16A34A', color: '#fff' }}
                            onClick={() => {
                              handleUpdateEndTime(
                                selectedProduct.id,
                                new Date(Date.now() + 60 * 60 * 1000)
                              )
                              setSelectedProduct(null)
                            }}
                          >
                            <TimerReset className="w-4 h-4" />
                            延長 1 小時
                          </button>
                        )}

                        {/* 上架 / 下架 */}
                        {selectedProduct.status !== 'active' ? (
                          <button
                            className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-40"
                            style={{ backgroundColor: '#16A34A', color: '#fff' }}
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
                                <Eye className="w-4 h-4" />
                                上架
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-40"
                            style={{ backgroundColor: '#E8D5BE', color: '#4A2C17' }}
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
                                <EyeOff className="w-4 h-4" />
                                下架
                              </>
                            )}
                          </button>
                        )}

                        {/* 關閉 */}
                        <button
                          className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                          style={{ border: '1px solid #E8D5BE', backgroundColor: '#FFF8F0', color: '#8B6B4A' }}
                          onClick={() => setSelectedProduct(null)}
                        >
                          <X className="w-4 h-4" />
                          關閉
                        </button>
                      </div>
                    </div>
                  )
                })()
              ) : (
                /* ===== 客人模式：直接喊單 ===== */
                <>
                  {/* 規格選擇 */}
                  {selectedProduct.has_variants && (
                    <div className="mb-4">
                      <span className="text-sm font-medium mb-2 block" style={{ color: '#4A2C17' }}>規格</span>
                      {isLoadingVariants ? (
                        <div className="flex justify-center py-3">
                          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#D4B896' }} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {productVariants.map((v) => {
                            const isSelected = selectedVariant?.id === v.id
                            const isSoldOut = selectedProduct.is_limited && v.stock <= 0
                            return (
                              <button
                                key={v.id}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${isSoldOut ? 'opacity-40 line-through' : ''}`}
                                style={{
                                  backgroundColor: isSelected ? (accentColor || '#D94E2B') : '#F5E0C4',
                                  color: isSelected ? '#fff8f0' : '#4A2C17',
                                  border: isSelected ? 'none' : '1px solid #E8D5BE',
                                }}
                                onClick={() => !isSoldOut && setSelectedVariant(v)}
                                disabled={isSoldOut}
                              >
                                {v.name}
                                {selectedProduct.is_limited && (
                                  <span className="ml-1 opacity-60">({v.stock})</span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 數量選擇 */}
                  {(() => {
                    let maxQty = 99
                    if (selectedProduct.is_limited) {
                      const stockRef = selectedProduct.has_variants && selectedVariant
                        ? selectedVariant.stock
                        : selectedProduct.stock
                      if (stockRef !== null && stockRef !== undefined) {
                        maxQty = Math.min(maxQty, stockRef)
                      }
                      if (selectedProduct.limit_qty) {
                        maxQty = Math.min(maxQty, selectedProduct.limit_qty)
                      }
                    }
                    maxQty = Math.max(maxQty, 1)

                    return (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-medium" style={{ color: '#4A2C17' }}>數量</span>
                          <div className="flex items-center gap-3">
                            <button
                              className="h-10 w-10 rounded-full border-2 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
                              style={{ borderColor: '#D4B896' }}
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              disabled={quantity <= 1}
                            >
                              <Minus className="w-4 h-4" style={{ color: '#4A2C17' }} />
                            </button>
                            <span className="text-2xl font-bold w-10 text-center" style={{ color: '#4A2C17' }}>{quantity}</span>
                            <button
                              className="h-10 w-10 rounded-full border-2 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
                              style={{ borderColor: '#D4B896' }}
                              onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                              disabled={quantity >= maxQty}
                            >
                              <Plus className="w-4 h-4" style={{ color: '#4A2C17' }} />
                            </button>
                          </div>
                        </div>

                        {selectedProduct.is_limited && selectedProduct.limit_qty && (
                          <p className="text-sm text-orange-600 mb-2">
                            此商品限購 {selectedProduct.limit_qty} 個
                          </p>
                        )}
                      </>
                    )
                  })()}

                  {/* 小計 */}
                  <div className="flex items-center justify-between py-3 mb-4 border-t" style={{ borderColor: '#E8D5BE' }}>
                    <span className="text-sm" style={{ color: '#8B6B4A' }}>小計</span>
                    <span className="text-xl font-bold" style={{ color: accentColor || '#D94E2B' }}>
                      ${(selectedProduct.price * quantity).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all active:scale-[0.97]"
                      style={{ borderColor: '#D4B896', color: '#8B6B4A' }}
                      onClick={() => { setSelectedProduct(null); setQuantity(1) }}
                    >
                      取消
                    </button>
                    <button
                      className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                      style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                      onClick={handleDirectOrder}
                      disabled={isOrdering || (selectedProduct.has_variants && !selectedVariant)}
                    >
                      {isOrdering ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : selectedProduct.has_variants && !selectedVariant ? (
                        '請先選擇規格'
                      ) : (
                        `確定喊單 $${(selectedProduct.price * quantity).toLocaleString()}${selectedVariant ? `（${selectedVariant.name}）` : ''}`
                      )}
                    </button>
                  </div>
                </>
              )}
              </div>{/* end px-5 pb-5 */}
            </motion.div>
          </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* 我的訂單 Drawer */}
      <AnimatePresence>
        {isOrderDrawerOpen && (() => {
          // 分類訂單
          const pendingOrders = orders.filter((o) => o.status === 'pending' || (o.status === 'partial' && !o.checkout_id))
          const confirmedOrders = orders.filter((o) => (o.status === 'allocated' || o.checkout_id) && o.status !== 'cancelled')
          const failedOrders = orders.filter((o) => o.status === 'cancelled')

          const OrderCard = ({ order }: { order: OrderItem }) => (
            <div
              className="flex gap-3 p-3 rounded-xl"
              style={{ backgroundColor: '#FFF8F0', border: '1px solid #E8D5BE' }}
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: '#F5E0C4' }}>
                {order.product_image ? (
                  <Image
                    src={order.product_image}
                    alt={order.product_name}
                    width={56}
                    height={56}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-5 h-5" style={{ color: '#C4A882' }} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: '#4A2C17' }}>
                  {order.product_name}
                  {order.variant_name && (
                    <span className="ml-1 font-normal" style={{ color: '#8B6B4A' }}>({order.variant_name})</span>
                  )}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8B6B4A' }}>
                  ${order.unit_price.toLocaleString()} × {order.quantity}
                </p>
              </div>
            </div>
          )

          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex justify-center"
            onClick={() => setIsOrderDrawerOpen(false)}
          >
            <div className="relative w-full max-w-lg h-full">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute top-0 right-0 bottom-0 w-full max-w-sm flex flex-col"
              style={{ backgroundColor: '#FEF0DB' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E8D5BE' }}>
                <h2 className="text-lg font-bold" style={{ color: '#4A2C17' }}>我的訂單</h2>
                <button
                  className="p-1.5 rounded-full transition-colors active:scale-95"
                  style={{ color: '#8B6B4A' }}
                  onClick={() => setIsOrderDrawerOpen(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {orders.length === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3" style={{ color: '#D4B896' }} />
                    <p style={{ color: '#8B6B4A' }}>還沒有訂單</p>
                    <p className="text-xs mt-1" style={{ color: '#B8A08A' }}>點選商品即可喊單</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* 等待配貨 */}
                    {pendingOrders.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E8A63A' }} />
                          <span className="text-sm font-semibold" style={{ color: '#8B6B4A' }}>
                            等待配貨（{pendingOrders.length}）
                          </span>
                        </div>
                        <div className="space-y-2">
                          {pendingOrders.map((order) => <OrderCard key={order.id} order={order} />)}
                        </div>
                      </div>
                    )}

                    {/* 確定購入 */}
                    {confirmedOrders.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6B8E5E' }} />
                          <span className="text-sm font-semibold" style={{ color: '#8B6B4A' }}>
                            確定購入（{confirmedOrders.length}）
                          </span>
                        </div>
                        <div className="space-y-2">
                          {confirmedOrders.map((order) => <OrderCard key={order.id} order={order} />)}
                        </div>
                      </div>
                    )}

                    {/* 配貨失敗 */}
                    {failedOrders.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C4735E' }} />
                          <span className="text-sm font-semibold" style={{ color: '#8B6B4A' }}>
                            配貨失敗（{failedOrders.length}）
                          </span>
                        </div>
                        <div className="space-y-2 opacity-60">
                          {failedOrders.map((order) => <OrderCard key={order.id} order={order} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 底部：現貨結帳按鈕 */}
              {checkoutEligibleOrders.length > 0 && (
                <div className="px-5 py-4 safe-bottom" style={{ borderTop: '1px solid #E8D5BE' }}>
                  <button
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                    style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                    onClick={() => {
                      setIsOrderDrawerOpen(false)
                      setIsCheckoutModalOpen(true)
                    }}
                  >
                    現貨結帳（{checkoutEligibleOrders.length} 項 · ${checkoutEligibleTotal.toLocaleString()}）
                  </button>
                </div>
              )}
            </motion.div>
            </div>
          </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ========== 現貨結帳 Modal ========== */}
      <AnimatePresence>
        {isCheckoutModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex justify-center items-end"
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
            className="fixed inset-0 z-50 bg-black/50 flex justify-center"
            onClick={() => setIsAdminPanelOpen(false)}
          >
            <div className="relative w-full max-w-lg h-full">
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
            </div>
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
            className="fixed inset-0 z-[60] bg-black/50 flex justify-center"
            onClick={() => setIsAddProductOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom max-w-lg mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4">上架新商品</h3>

              {/* 拍照/選圖（多張） */}
              <input
                ref={addProductFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return
                  const remaining = 5 - newProductImages.length
                  const toAdd = files.slice(0, remaining)
                  if (toAdd.length < files.length) {
                    toast.error(`最多上傳 5 張圖片`)
                  }
                  setNewProductImages((prev) => [...prev, ...toAdd])
                  setNewProductPreviews((prev) => [
                    ...prev,
                    ...toAdd.map((f) => URL.createObjectURL(f)),
                  ])
                  // Reset input so same file can be re-selected
                  e.target.value = ''
                }}
              />

              <div className="mb-4">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {newProductPreviews.map((preview, idx) => (
                    <div key={idx} className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-muted-foreground/30">
                      <Image
                        src={preview}
                        alt={`預覽 ${idx + 1}`}
                        width={80}
                        height={80}
                        className="object-cover w-full h-full"
                      />
                      {idx === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">封面</span>
                      )}
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                        onClick={() => {
                          setNewProductImages((prev) => prev.filter((_, i) => i !== idx))
                          setNewProductPreviews((prev) => {
                            URL.revokeObjectURL(prev[idx])
                            return prev.filter((_, i) => i !== idx)
                          })
                        }}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {newProductPreviews.length < 5 && (
                    <div
                      className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer"
                      onClick={() => addProductFileRef.current?.click()}
                    >
                      <div className="text-center text-muted-foreground">
                        <Camera className="w-5 h-5 mx-auto mb-0.5" />
                        <p className="text-[10px]">{newProductPreviews.length === 0 ? '拍照/選圖' : `${newProductPreviews.length}/5`}</p>
                      </div>
                    </div>
                  )}
                </div>
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

              {/* 規格開關 */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">規格（同價格不同選項）</p>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      newProductHasVariants ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
                    }`}
                    onClick={() => {
                      setNewProductHasVariants(!newProductHasVariants)
                      if (!newProductHasVariants) setNewProductVariants([{ name: '', stock: '' }])
                    }}
                  >
                    {newProductHasVariants ? '已開啟' : '關閉'}
                  </button>
                </div>
                {newProductHasVariants && (
                  <div className="space-y-2">
                    {newProductVariants.map((v, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input
                          placeholder={`規格 ${idx + 1}（如 S / M / L）`}
                          value={v.name}
                          onChange={(e) => {
                            const arr = [...newProductVariants]
                            arr[idx] = { ...arr[idx], name: e.target.value }
                            setNewProductVariants(arr)
                          }}
                          className="flex-1 rounded-xl text-sm"
                        />
                        {newProductIsLimited && (
                          <Input
                            type="number"
                            min="0"
                            placeholder="庫存"
                            value={v.stock}
                            onChange={(e) => {
                              const arr = [...newProductVariants]
                              arr[idx] = { ...arr[idx], stock: e.target.value }
                              setNewProductVariants(arr)
                            }}
                            className="w-20 rounded-xl text-sm"
                          />
                        )}
                        {newProductVariants.length > 1 && (
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-600 p-1"
                            onClick={() => setNewProductVariants(newProductVariants.filter((_, i) => i !== idx))}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs text-orange-600 font-medium"
                      onClick={() => setNewProductVariants([...newProductVariants, { name: '', stock: '' }])}
                    >
                      + 新增規格
                    </button>
                  </div>
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
                    setNewProductImages([])
                    setNewProductPreviews([])
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
            className="fixed inset-0 z-[60] bg-black/50 flex justify-center"
            onClick={() => setRestockProduct(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom max-w-lg mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-1">補貨 - {restockProduct.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {(() => {
                  const stats = getProductStats(restockProduct.id)
                  return `${stats.pending} 筆待分配`
                })()}
              </p>

              {/* 規格選擇（有規格時） */}
              {restockProduct.has_variants && restockVariants.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">選擇規格</p>
                  <div className="flex flex-wrap gap-2">
                    {restockVariants.map((v) => (
                      <button
                        key={v.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          restockSelectedVariant?.id === v.id
                            ? 'bg-purple-600 text-white'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => setRestockSelectedVariant(v)}
                      >
                        {v.name}
                        <span className="ml-1 opacity-60">({v.stock})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                  disabled={!restockQty || isRestocking || (restockProduct.has_variants && !restockSelectedVariant)}
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
