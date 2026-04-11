'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useLineAuth } from '@/hooks/use-line-auth'
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
  PackageX,
  Users,
  Camera,
  Timer,
  TimerOff,
  TimerReset,
  Store,
  Eye,
  EyeOff,
  Heart,
  Share2,
  Megaphone,
  CheckCircle,
  Truck,
  MapPin,
  Copy,
  Search,
  ChevronDown,
  ArrowUpDown,
  Menu,
  Pencil,
  Check,
} from 'lucide-react'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'

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

// 裁切圖片（支援白邊填充：圖片縮小超出範圍時填白色）
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pixelCrop.width
      canvas.height = pixelCrop.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      // 先填白色背景
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // 畫圖片（負座標時自動產生白邊）
      ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      )
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Crop failed')),
        'image/jpeg',
        0.92
      )
    }
    img.onerror = reject
    img.src = imageSrc
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
  order_notice?: string | null
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
  created_at: string
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

// 抽出為穩定元件，避免 re-render 造成圖片閃爍
function OrderCard({ order }: { order: OrderItem }) {
  return (
    <div
      className="flex gap-3 p-3 rounded-xl"
      style={{ backgroundColor: '#ffffff', border: '1px solid #E8D5BE' }}
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
}

export default function ShopPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tenantSlug = params.tenantSlug as string
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const { isReady, isLoggedIn, profile, login, logout } = useLineAuth()

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
  const [orderIconPulse, setOrderIconPulse] = useState(false)

  // 現貨結帳 Modal 狀態
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'method' | 'confirm' | 'success'>('method')
  const [selectedShipping, setSelectedShipping] = useState<'myship' | 'delivery' | 'pickup' | null>(null)
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null)

  // 分類篩選
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLineFriend, setIsLineFriend] = useState<boolean | null>(null) // null = 尚未檢查
  const [productTypeFilter, setProductTypeFilter] = useState<'all' | 'stock' | 'preorder'>('all')
  const [isCheckingFriend, setIsCheckingFriend] = useState(false)
  // 桌面版判斷
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 排序
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular'>('popular')
  const [isSortOpen, setIsSortOpen] = useState(false)

  // ========== 收藏 ==========
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const togglingFavoriteRef = useRef(false)

  // ========== 管理員模式 ==========
  const [isStaff, setIsStaff] = useState(false)
  const [staffRole, setStaffRole] = useState<string | null>(null)
  const [staffCheckDone, setStaffCheckDone] = useState(false)
  const [staffModeActive, setStaffModeActive] = useState(true) // 管理員可切換為客人視角
  const showStaffUI = isStaff && staffModeActive // UI 顯示用：管理員且開啟管理模式
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
  const [newProductImages, setNewProductImages] = useState<File[]>([]) // 正方形縮圖
  const [newProductOriginals, setNewProductOriginals] = useState<File[]>([]) // 原圖
  // 裁切狀態
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [cropPendingFiles, setCropPendingFiles] = useState<File[]>([])
  const [cropCurrentIndex, setCropCurrentIndex] = useState(0)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [newProductPreviews, setNewProductPreviews] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [newProductHasVariants, setNewProductHasVariants] = useState(false)
  const [newProductVariants, setNewProductVariants] = useState<{ name: string; stock: string }[]>([{ name: '', stock: '' }])
  const addProductFileRef = useRef<HTMLInputElement>(null)
  const editProductFileRef = useRef<HTMLInputElement>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [editingOrderNotice, setEditingOrderNotice] = useState(false)
  const [orderNoticeValue, setOrderNoticeValue] = useState('')
  const [cropMode, setCropMode] = useState<'add' | 'edit'>('add')
  const editCroppedFilesRef = useRef<File[]>([])

  // 下架/上架
  const [isToggling, setIsToggling] = useState<string | null>(null)
  const [showExtendOptions, setShowExtendOptions] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  // 倒數計時器 tick（每 30 秒更新畫面）
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Modal 開啟時鎖定背景滾動
  useEffect(() => {
    if (selectedProduct) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [selectedProduct])

  // 購物須知
  const [showShoppingNotice, setShowShoppingNotice] = useState(false)
  const [noticeDontShowToday, setNoticeDontShowToday] = useState(false)
  useEffect(() => {
    if (!tenant?.id || !shopSettings.shopping_notice || showStaffUI) return
    // 等好友檢查通過後才顯示購物須知
    if (isLineFriend !== true) return
    const today = new Date().toISOString().slice(0, 10)
    const key = `shopping_notice_dismissed_${tenant.id}`
    const dismissedDate = localStorage.getItem(key)
    if (dismissedDate === today) return
    setShowShoppingNotice(true)
  }, [tenant?.id, shopSettings.shopping_notice, showStaffUI, isLineFriend])

  // 載入商城資料（不依賴 isStaff，避免 staff 判定後重複載入）
  const isStaffRef = useRef(isStaff)
  isStaffRef.current = isStaff

  const initialLoadDone = useRef(false)
  const loadShop = useCallback(async (forceIncludeInactive?: boolean) => {
    try {
      const { data, error } = await supabase.rpc('get_shop_products_v1', {
        p_tenant_slug: tenantSlug,
        p_include_inactive: forceIncludeInactive ?? isStaffRef.current,
      })

      if (error) throw error

      if (!data.success) {
        // 維護模式：即使背景刷新也要顯示
        if (data.error === 'maintenance') {
          if (data.tenant) setTenant(data.tenant)
          setError('maintenance')
          return
        }
        // 只在初次載入時顯示錯誤頁，背景刷新失敗靜默處理
        if (!initialLoadDone.current) setError(data.error)
        return
      }

      initialLoadDone.current = true
      setError(null) // 清除先前錯誤
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
      // 只在初次載入時顯示錯誤頁，Realtime 觸發的重新載入失敗不應覆蓋正常畫面
      if (!initialLoadDone.current) setError('載入失敗')
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

  // 載入收藏
  const loadFavorites = useCallback(async () => {
    if (!profile?.userId) return
    try {
      const { data, error } = await supabase.rpc('get_member_favorites_v1', {
        p_tenant_slug: tenantSlug,
        p_line_user_id: profile.userId,
      })
      if (error) throw error
      if (data?.success && data.product_ids) {
        setFavoriteIds(new Set(data.product_ids))
      }
    } catch (err) {
      console.error('Load favorites error:', err)
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

  // 未登入 → 自動觸發 LINE Login（等商城載入完再跳轉，避免空白頁）
  useEffect(() => {
    if (isReady && !isLoggedIn && tenant) {
      login()
    }
  }, [isReady, isLoggedIn, tenant, login])

  // 登入後載入訂單 + 收藏
  useEffect(() => {
    if (isLoggedIn && profile && tenant) {
      loadMyOrders()
      loadFavorites()
    }
  }, [isLoggedIn, profile, tenant, loadMyOrders, loadFavorites])

  // 登入後檢查 LINE 好友狀態
  const checkLineFriendship = useCallback(async () => {
    if (!tenant?.id || !profile?.userId) return
    // Staff 和 dev 模式跳過檢查
    if (isStaff || isDevStaff) {
      setIsLineFriend(true)
      return
    }
    setIsCheckingFriend(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-line-friendship`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          body: JSON.stringify({ tenant_id: tenant.id, line_user_id: profile.userId }),
        }
      )
      const data = await res.json()
      console.log('[好友檢查]', { userId: profile.userId, result: data })
      setIsLineFriend(data.isFriend === true)
    } catch (err) {
      console.error('[好友檢查] 失敗:', err)
      // 檢查失敗時不阻擋（寬容處理）
      setIsLineFriend(true)
    } finally {
      setIsCheckingFriend(false)
    }
  }, [tenant?.id, profile?.userId, isStaff, isDevStaff])

  useEffect(() => {
    if (isLoggedIn && profile && tenant && isLineFriend === null) {
      checkLineFriendship()
    }
  }, [isLoggedIn, profile, tenant, isLineFriend, checkLineFriendship])

  // URL 帶 ?p=productId 時自動開啟該商品
  const autoOpenDone = useRef(false)
  useEffect(() => {
    if (autoOpenDone.current || products.length === 0) return
    const productId = searchParams.get('p')
    if (!productId) return
    const product = products.find(p => p.id === productId)
    if (product) {
      autoOpenDone.current = true
      handleSelectProduct(product)
    }
  }, [products, searchParams])

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

  // Presence — 追蹤在線人數（所有訪客，不限方案）
  useEffect(() => {
    if (!tenant?.id) return

    const presenceChannel = supabase.channel(`presence-shop-${tenant.id}`, {
      config: { presence: { key: profile?.userId || `anon-${Math.random().toString(36).slice(2)}` } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        // 不需在客戶端處理，僅用於 admin 訂閱
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
            user_id: profile?.userId || 'anonymous',
          })
        }
      })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [tenant?.id, profile?.userId, supabase])

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

  // ========== 收藏 toggle ==========
  const handleToggleFavorite = async (productId: string) => {
    if (!isLoggedIn) { login(); return }
    if (!profile?.userId || togglingFavoriteRef.current) return
    togglingFavoriteRef.current = true

    // 樂觀更新（只觸發一次 re-render）
    const wasFavorited = favoriteIds.has(productId)
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (wasFavorited) next.delete(productId)
      else next.add(productId)
      return next
    })

    try {
      const { data, error } = await supabase.rpc('toggle_member_favorite_v1', {
        p_tenant_slug: tenantSlug,
        p_line_user_id: profile.userId,
        p_product_id: productId,
        p_display_name: profile.displayName || '',
        p_picture_url: profile.pictureUrl || null,
      })
      if (error) throw error
      if (!data?.success) {
        // 回滾
        setFavoriteIds(prev => {
          const next = new Set(prev)
          if (wasFavorited) next.add(productId)
          else next.delete(productId)
          return next
        })
        toast.error('收藏失敗')
      }
    } catch (err) {
      console.error('Toggle favorite error:', err)
      // 回滾
      setFavoriteIds(prev => {
        const next = new Set(prev)
        if (wasFavorited) next.add(productId)
        else next.delete(productId)
        return next
      })
    } finally {
      togglingFavoriteRef.current = false
    }
  }

  // ========== 分享商品 ==========
  const handleShareProduct = async () => {
    if (!selectedProduct || !tenant) return

    // 用 /share/ 路由（有 OG 縮圖），會自動 redirect 到商城
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.plushub.cc'
    const productUrl = `${origin}/share/${tenantSlug}/${selectedProduct.id}`
    const shareText = `${selectedProduct.name} $${selectedProduct.price.toLocaleString()}\n${productUrl}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${tenant.name} — ${selectedProduct.name}`,
          text: `來看看 ${selectedProduct.name} $${selectedProduct.price.toLocaleString()}`,
          url: productUrl,
        })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(productUrl)
      toast.success('連結已複製！')
    }
  }

  // ========== 喊單確認 ==========
  const [showOrderConfirm, setShowOrderConfirm] = useState(false)

  const handleDirectOrderClick = () => {
    if (!selectedProduct || !profile || !tenant) return
    if (selectedProduct.has_variants && !selectedVariant) {
      toast.error('請先選擇規格')
      return
    }
    setShowOrderConfirm(true)
  }

  // ========== 直接喊單 ==========
  const handleDirectOrder = async () => {
    if (!selectedProduct || !profile || !tenant || isOrdering) return
    setShowOrderConfirm(false)

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
        setSelectedVariant(null)
        loadMyOrders()
        // 觸發訂單 icon 動畫
        setTimeout(() => {
          setOrderIconPulse(true)
          setTimeout(() => setOrderIconPulse(false), 2000)
        }, 300)
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
    if (!profile || !tenant || !newProductName.trim() || newProductPrice === '') return

    setIsUploading(true)
    try {
      const thumbnailUrls: string[] = [] // 正方形縮圖（主頁用）
      const originalUrls: string[] = [] // 原圖（詳情頁用）
      const skuBase = `SP${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // 上傳圖片：正方形縮圖 + 原圖
      for (let i = 0; i < newProductImages.length; i++) {
        try {
          const sku = `${skuBase}-${i}`
          // 上傳正方形縮圖
          const thumbBlob = await compressImage(newProductImages[i])
          const thumbFile = new File([thumbBlob], `${sku}.webp`, { type: 'image/webp' })
          const thumbPath = `${tenant.id}/products/${sku}.webp`
          const { error: thumbErr } = await supabase.storage.from('product-images').upload(thumbPath, thumbFile, { cacheControl: '3600', upsert: true })
          if (!thumbErr) {
            const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(thumbPath)
            thumbnailUrls.push(publicUrl)
          }
          // 上傳原圖
          if (newProductOriginals[i]) {
            const origBlob = await compressImage(newProductOriginals[i], 800, 0.85)
            const origFile = new File([origBlob], `${sku}-orig.webp`, { type: 'image/webp' })
            const origPath = `${tenant.id}/products/${sku}-orig.webp`
            const { error: origErr } = await supabase.storage.from('product-images').upload(origPath, origFile, { cacheControl: '3600', upsert: true })
            if (!origErr) {
              const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(origPath)
              originalUrls.push(publicUrl)
            }
          }
        } catch (err) {
          console.error('Upload error for image', i, err)
        }
      }
      const imageUrls = thumbnailUrls // 向後相容

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
        p_stock: newProductIsLimited
          ? newProductHasVariants
            ? newProductVariants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
            : (parseInt(newProductStock) || 0)
          : 0,
        p_image_url: thumbnailUrls[0] || null,
        p_image_urls: originalUrls.length > 0 ? originalUrls : (thumbnailUrls.length > 0 ? thumbnailUrls : null),
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
      setNewProductOriginals([])
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

      toast.success(action === 'deactivate' ? '已關閉商城顯示' : '已開啟商城顯示')
      loadShop()
    } catch (err) {
      console.error('Toggle product error:', err)
      toast.error('操作失敗')
    } finally {
      setIsToggling(null)
    }
  }

  // 管理員：調整商品截止時間（null = 無限期）
  const handleUpdateEndTime = async (productId: string, endTime: Date | null) => {
    if (!profile) return
    try {
      const { data, error } = await supabase.rpc('update_product_end_time_v1', {
        p_product_id: productId,
        p_line_user_id: profile.userId,
        p_end_time: endTime ? endTime.toISOString() : null,
      })
      if (error) throw error
      if (!data.success) {
        toast.error(data.error)
        return
      }
      toast.success(endTime === null ? '已開啟不限時' : endTime > new Date() ? '已延長截止時間' : '已截止')
      loadShop()
    } catch (err) {
      console.error('Update end time error:', err)
      toast.error('操作失敗')
    }
  }

  // 管理員：修改商品價格或名稱
  const handleUpdateProductField = async (productId: string, field: 'price' | 'name') => {
    if (!profile) return
    const params: Record<string, unknown> = {
      p_product_id: productId,
      p_line_user_id: profile.userId,
    }
    if (field === 'price') {
      const price = parseInt(editPriceValue)
      if (!price || price <= 0) { toast.error('價格必須大於 0'); return }
      params.p_price = price
    } else {
      const name = editNameValue.trim()
      if (!name) { toast.error('名稱不可為空'); return }
      params.p_name = name
    }
    try {
      const { data, error } = await supabase.rpc('update_product_price_v1', params)
      if (error) throw error
      if (!data.success) { toast.error(data.error); return }
      toast.success(field === 'price' ? '價格已更新' : '名稱已更新')
      if (field === 'price') setEditingPrice(null)
      else setEditingName(null)
      loadShop()
    } catch (err) {
      console.error('Update product error:', err)
      toast.error('操作失敗')
    }
  }

  // 管理員：更新商品圖片
  const handleEditProductPhoto = async (files: File[]) => {
    if (!selectedProduct || !profile || !tenant) return
    setIsUploadingPhoto(true)
    try {
      const imageUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const sku = `${selectedProduct.id.slice(0, 8)}-${Date.now()}-${i}`
        const compressedBlob = await compressImage(files[i])
        const compressedFile = new File([compressedBlob], `${sku}.webp`, { type: 'image/webp' })
        const path = `${tenant.id}/products/${sku}.webp`
        const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, compressedFile)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        imageUrls.push(urlData.publicUrl)
      }
      // 合併現有圖片 + 新圖片
      const existingUrls = (selectedProduct.image_urls && selectedProduct.image_urls.length > 0)
        ? selectedProduct.image_urls
        : selectedProduct.image_url ? [selectedProduct.image_url] : []
      const allUrls = [...existingUrls, ...imageUrls]
      // 更新 DB（透過 RPC 繞過 RLS）
      const { data, error } = await supabase.rpc('update_product_images_v1', {
        p_product_id: selectedProduct.id,
        p_line_user_id: profile.userId,
        p_image_url: allUrls[0],
        p_image_urls: allUrls,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error)
      toast.success(`已新增 ${files.length} 張圖片`)
      setSelectedProduct({ ...selectedProduct, image_url: allUrls[0], image_urls: allUrls })
      loadShop()
    } catch (err: any) {
      console.error('Upload photo error:', err)
      toast.error('圖片上傳失敗：' + (err?.message || '未知錯誤'))
    } finally {
      setIsUploadingPhoto(false)
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

  // Loading 時不阻擋整個頁面，只在商品區顯示 loading

  // 維護模式
  if (error === 'maintenance') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#ffffff' }}>
        <div className="text-center">
          <div className="text-5xl mb-4">🔧</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#4A2C17' }}>
            {tenant?.name || '商城'}暫時休息中
          </h2>
          <p className="text-sm mb-6" style={{ color: '#8B7355' }}>
            我們正在進行維護，請稍後再回來
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#E8D5BE', color: '#4A2C17' }}
          >
            重新整理
          </button>
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

  // 商城不存在（載入完成後才判斷）
  if (!isLoading && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-white">
        <p className="text-muted-foreground">商城不存在</p>
      </div>
    )
  }

  const orderItemCount = orders.filter((o) => o.status !== 'cancelled').length

  // 管理員：每個商品的訂單統計
  const getProductStats = (productId: string) => {
    const productOrders = allOrders.filter((o) => o.product_id === productId)
    const pendingQty = productOrders.filter((o) => o.status === 'pending').reduce((sum, o) => sum + o.quantity, 0)
    const allocatedQty = productOrders.filter((o) => o.status === 'allocated').reduce((sum, o) => sum + o.quantity, 0)
    const totalQty = productOrders.reduce((sum, o) => sum + o.quantity, 0)
    return { pending: pendingQty, allocated: allocatedQty, total: totalQty }
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
      className="min-h-screen"
      style={{
        '--shop-bg': '#ffffff',
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
      {/* LINE 好友檢查 Modal（阻擋式） */}
      <AnimatePresence>
        {isLoggedIn && isLineFriend === false && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl text-center"
            >
              <div
                className="py-8 px-6"
                style={{ backgroundColor: accentColor || '#D94E2B' }}
              >
                <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden border-3 border-white/30">
                  <Image src="/shop-logo.jpg" alt={tenant?.name || ''} width={80} height={80} className="w-full h-full object-cover" />
                </div>
                <h2 className="text-xl font-bold text-white">{tenant?.name}</h2>
                <p className="text-sm text-white/80 mt-1">歡迎光臨 ✨</p>
              </div>
              <div className="px-6 py-6">
                <p className="text-sm mb-1 font-medium" style={{ color: '#4A2C17' }}>
                  為了讓您收到訂單和出貨通知
                </p>
                <p className="text-sm mb-5" style={{ color: '#8B6B4A' }}>
                  請先加入我們的 LINE 好友
                </p>
                <a
                  href="https://line.me/R/ti/p/@530rmasi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.97]"
                  style={{ backgroundColor: '#06C755' }}
                >
                  加入 LINE 好友
                </a>
                <button
                  className="w-full mt-3 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50"
                  style={{ backgroundColor: '#F3F4F6', color: '#374151' }}
                  onClick={checkLineFriendship}
                  disabled={isCheckingFriend}
                >
                  {isCheckingFriend ? '確認中...' : '我已加好友 ✓'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                      window.close()
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

      {/* 桌面版 Top Bar（sticky） */}
      <nav className="hidden lg:flex items-center justify-between sticky top-0 z-50 border-b px-6 py-3" style={{ backgroundColor: accentColor || '#D94E2B' }}>
        <div className="flex items-center gap-2.5">
          <Image
            src="/shop-logo.jpg"
            alt={tenant?.name || ''}
            width={36}
            height={36}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
          <h1 className="text-lg font-bold" style={{ color: 'white' }}>{tenant?.name || ''}</h1>
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#4ADE80' }} />
            營業中
          </span>
          {showStaffUI && staffStats && (
            <span className="text-[11px] ml-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              訂單 {staffStats.total_orders - staffStats.cancelled_count} · ${staffStats.total_sales.toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStaff && (
            <button
              className="relative p-2 rounded-full transition-colors"
              style={{ color: 'white', backgroundColor: staffModeActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}
              onClick={() => {
                setStaffModeActive(!staffModeActive)
                toast(staffModeActive ? '已切換為客人視角' : '已切換為管理模式', { duration: 1500 })
              }}
              title={staffModeActive ? '切換客人視角' : '切換管理模式'}
            >
              {staffModeActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
          {showStaffUI && (
            <>
              <Badge className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 mr-1">
                <Shield className="w-3 h-3 mr-0.5" />
                管理
              </Badge>
              <button
                className="relative p-2 rounded-full transition-colors"
                style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                onClick={() => { loadAllOrders(); setIsAdminPanelOpen(true) }}
              >
                <Users className="w-5 h-5" />
              </button>
            </>
          )}
          {(isLoggedIn || showStaffUI) && (
            <motion.button
              className="relative p-2 rounded-full transition-colors active:scale-95"
              style={{ color: 'white' }}
              onClick={() => setIsOrderDrawerOpen(true)}
              animate={orderIconPulse ? { scale: [1, 1.4, 1, 1.2, 1] } : {}}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            >
              <div className="relative">
                <ClipboardList className="w-5 h-5" />
                {orderItemCount > 0 && (
                  <motion.span
                    key={orderItemCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.5, 1] }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
                    style={{ backgroundColor: '#fff', color: accentColor || '#D94E2B' }}
                  >
                    {orderItemCount}
                  </motion.span>
                )}
              </div>
            </motion.button>
          )}
          <button
            className="relative p-2 rounded-full transition-colors"
            style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* 手機版 Header（sticky） */}
      <header className="lg:hidden sticky top-0 z-40 border-b relative overflow-hidden">
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
        <div className="px-4 sm:px-6 py-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <Image
                src="/shop-logo.jpg"
                alt={tenant?.name || ''}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold truncate" style={{ color: 'white' }}>{tenant?.name || ''}</h1>
                  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#4ADE80' }} />
                    營業中
                  </span>
                </div>
                {showStaffUI && staffStats && (
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    訂單 {staffStats.total_orders - staffStats.cancelled_count} · ${staffStats.total_sales.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {isStaff && (
                <button
                  className="relative p-1.5 rounded-full transition-colors mr-0.5"
                  style={{ color: 'white', backgroundColor: staffModeActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}
                  onClick={() => {
                    setStaffModeActive(!staffModeActive)
                    toast(staffModeActive ? '已切換為客人視角' : '已切換為管理模式', { duration: 1500 })
                  }}
                  title={staffModeActive ? '切換客人視角' : '切換管理模式'}
                >
                  {staffModeActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              )}
              {showStaffUI && (
                <>
                  <Badge className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 mr-1">
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
              {(isLoggedIn || showStaffUI) && (
                <motion.button
                  className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors active:scale-95"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  onClick={() => setIsOrderDrawerOpen(true)}
                  animate={orderIconPulse ? { scale: [1, 1.4, 1, 1.2, 1] } : {}}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                >
                  {orderIconPulse && (
                    <>
                      {[...Array(5)].map((_, i) => {
                        const angle = (i / 5) * 360
                        const rad = (angle * Math.PI) / 180
                        const dist = 30 + Math.random() * 14
                        const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FFA94D']
                        const color = colors[i % colors.length]
                        const size = 8 + Math.random() * 4
                        return (
                          <motion.div
                            key={`confetti-${i}`}
                            className="absolute rounded-full"
                            style={{ width: size, height: size, backgroundColor: color, top: '50%', left: '50%', marginTop: -size / 2, marginLeft: -size / 2 }}
                            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                            animate={{ opacity: 0, x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, scale: 0 }}
                            transition={{ duration: 0.7, delay: i * 0.02, ease: 'easeOut' }}
                          />
                        )
                      })}
                    </>
                  )}
                  <div className="relative">
                    <ClipboardList className="w-5 h-5" />
                    {orderItemCount > 0 && (
                      <motion.span
                        key={orderItemCount}
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.5, 1] }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 text-[10px] font-bold rounded-full flex items-center justify-center px-0.5"
                        style={{ backgroundColor: orderIconPulse ? '#D94E2B' : '#fff8f0', color: orderIconPulse ? '#fff' : '#D94E2B' }}
                      >
                        {orderItemCount}
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[10px] leading-none">訂單</span>
                </motion.button>
              )}
              <button
                className="relative p-1.5 rounded-full transition-colors"
                style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                onClick={() => setIsMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>


      {/* Announcement Banner */}
      {shopSettings.announcement && (
        <div className="px-4 sm:px-6 lg:px-24 pt-3 max-w-7xl mx-auto">
          <div
            className="px-2 py-1 rounded-lg text-[11px]"
            style={{
              backgroundColor: `${accentColor || '#D94E2B'}12`,
              color: accentColor || '#D94E2B',
              border: `1px solid ${accentColor || '#D94E2B'}25`,
            }}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Megaphone className="w-3 h-3 shrink-0 opacity-70" />
              <div className="overflow-hidden flex-1">
                <div className="whitespace-nowrap animate-[marquee_15s_linear_infinite] hover:[animation-play-state:paused]">
                  <span className="inline-block pr-16">{shopSettings.announcement}</span>
                  <span className="inline-block pr-16">{shopSettings.announcement}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 管理員：操作列 */}
      {showStaffUI && (
        <div className="px-4 py-2 border-b flex gap-2" style={{ backgroundColor: '#FFF5EE' }}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-lg"
            style={{ borderColor: accentColor || '#D94E2B', color: accentColor || '#D94E2B' }}
            onClick={() => { setNewProductImages([]); setNewProductOriginals([]); setNewProductPreviews([]); setIsAddProductOpen(true) }}
          >
            <Camera className="w-3 h-3 mr-1" />
            上架
          </Button>
        </div>
      )}


      {/* 排序 & 商品數量 */}
      {(() => {
        const baseProducts = selectedCategory === '__favorites__'
          ? products.filter(p => favoriteIds.has(p.id))
          : selectedCategory
            ? products.filter(p => p.category === selectedCategory)
            : products
        const afterSearch = searchQuery.trim()
          ? baseProducts.filter(p => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : baseProducts
        const filteredCount = productTypeFilter === 'all'
          ? afterSearch.length
          : afterSearch.filter(p => productTypeFilter === 'stock' ? p.is_limited : !p.is_limited).length
        if (filteredCount === 0) return null
        const sortLabels: Record<string, string> = {
          newest: '最新上架',
          price_asc: '價格低→高',
          price_desc: '價格高→低',
          popular: '熱門優先',
        }
        return (
          <div className="flex items-center justify-between px-3 lg:px-16 py-2 max-w-7xl mx-auto">
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
      <main className="px-3 sm:px-6 lg:px-24 pb-4 max-w-7xl mx-auto" style={{ backgroundColor: '#ffffff' }}>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-2xl animate-pulse" style={{ aspectRatio: '1' }} />
            ))}
          </div>
        ) : (() => {
          const filtered = (selectedCategory === '__favorites__'
            ? products.filter(p => favoriteIds.has(p.id))
            : selectedCategory
              ? products.filter(p => p.category === selectedCategory)
              : products)
            .filter(p => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            .filter(p => productTypeFilter === 'all' || (productTypeFilter === 'stock' ? p.is_limited : !p.is_limited))
            .slice()
            .sort((a, b) => {
              const aUnavailable = a.status !== 'active' || a.is_expired || a.is_sold_out || (a.end_time && new Date(a.end_time).getTime() < Date.now()) || (a.is_limited && a.stock !== null && a.stock <= 0)
              const bUnavailable = b.status !== 'active' || b.is_expired || b.is_sold_out || (b.end_time && new Date(b.end_time).getTime() < Date.now()) || (b.is_limited && b.stock !== null && b.stock <= 0)
              if (aUnavailable && !bUnavailable) return 1
              if (!aUnavailable && bUnavailable) return -1
              if (sortBy === 'price_asc') return a.price - b.price
              if (sortBy === 'price_desc') return b.price - a.price
              if (sortBy === 'popular') return b.sold_qty - a.sold_qty
              return 0
            })

          // 按分類分組（保持 shopCategories 排序）
          const categoryOrder = shopCategories.length > 0
            ? shopCategories.map(c => c.name)
            : [...new Set(filtered.map(p => p.category).filter(Boolean))] as string[]
          const uncategorized = filtered.filter(p => !p.category)
          const groups: { name: string | null; items: typeof filtered }[] = []
          categoryOrder.forEach(cat => {
            const items = filtered.filter(p => p.category === cat)
            if (items.length > 0) groups.push({ name: cat, items })
          })
          if (uncategorized.length > 0) groups.push({ name: null, items: uncategorized })

          // 如果只有一個分類或在篩選模式，不顯示分類標題
          const showCategoryHeaders = !selectedCategory && groups.length > 1

          let globalIndex = 0
          return groups.map((group, gi) => (
            <div key={group.name || '__uncategorized'} className={gi > 0 ? 'mt-6' : ''}>
              {showCategoryHeaders && group.name && (
                <div className="flex items-center gap-3 mb-4 mt-2">
                  <div className="flex-1 h-px" style={{ backgroundColor: '#E5E7EB' }} />
                  <span className="text-xs font-medium px-2" style={{ color: '#9CA3AF' }}>{group.name}</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: '#E5E7EB' }} />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-8">
                {group.items.map((product) => {
                  const index = globalIndex++
              const isExpired = product.end_time
                ? new Date(product.end_time).getTime() < Date.now()
                : product.is_expired
              // 雙模式：is_limited=true 時 stock<=0 才完銷，預購模式永不完銷
              const isSoldOut = product.is_sold_out || (product.is_limited && product.stock !== null && product.stock <= 0)
              const isInactive = product.status !== 'active'
              const isUnavailable = isExpired || isSoldOut || isInactive
              const isHot = product.sold_qty >= 5
              const timeRemaining = product.end_time ? getTimeRemaining(product.end_time) : null
              const pStats = showStaffUI ? getProductStats(product.id) : null
              const mode = getProductMode(product)

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`relative transition-all duration-200 flex flex-col group bg-white rounded-2xl overflow-hidden shadow-sm ${(isUnavailable && !showStaffUI) ? 'opacity-60' : 'cursor-pointer hover:-translate-y-1 hover:shadow-lg'
                    } ${isInactive && showStaffUI ? 'opacity-50' : ''}`}
                  onClick={() => {
                    if (showStaffUI) {
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
                  {/* 右上 badge：即時銷售圓形（≥6 才顯示） */}
                  {isHot && (
                    <motion.div
                      key={product.sold_qty}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                      className="absolute top-1.5 right-1.5 z-10 w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center text-white shadow-lg"
                      style={{ backgroundColor: '#DC2626' }}
                    >
                      <span className="text-[10px] font-medium leading-none">已搶購</span>
                      <span className="text-[17px] font-extrabold leading-tight mt-0.5">+{product.sold_qty}</span>
                    </motion.div>
                  )}

                  {/* 左上 badge：倒數時間 */}
                  {timeRemaining && (
                    <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500 text-white">
                      <Clock className="inline w-3 h-3 mr-0.5" />
                      {timeRemaining}
                    </div>
                  )}

                  {/* 商品圖片 */}
                  <div className="aspect-square relative overflow-hidden" style={{ backgroundColor: '#F5E0C4', WebkitTouchCallout: 'none', userSelect: 'none' }}>
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover pointer-events-none group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        loading={index < 4 ? 'eager' : 'lazy'}
                        priority={index < 4}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
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
                    {isInactive && showStaffUI && !isSoldOut && !isExpired && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">已下架</span>
                      </div>
                    )}
                  </div>

                  {/* 商品資訊 */}
                  <div className="p-2.5 flex flex-col flex-1">
                    <div className="flex items-start gap-1.5">
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium leading-tight"
                        style={{
                          backgroundColor: mode === 'stock' ? '#6B8E5E' : '#D94E2B',
                          color: '#fff8f0',
                        }}
                      >
                        {mode === 'stock' ? '現貨' : '預購'}
                      </span>
                      <p className="text-sm font-medium leading-tight line-clamp-2" style={{ color: '#4A2C17' }}>{product.name}</p>
                    </div>
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

                    {/* 管理員：顯示分配狀態 */}
                    {showStaffUI && pStats && (
                      <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: '#F5E0C4' }}>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>
                            需 {pStats.total} 件（已配 {pStats.allocated}）
                          </span>
                          {pStats.pending > 0 && (
                            <span className="text-orange-600 font-medium">缺 {pStats.pending} 件</span>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </motion.div>
              )
            })}
              </div>
            </div>
          ))
        })()}

        {products.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            {showStaffUI ? (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF5EE' }}>
                  <Camera className="w-8 h-8" style={{ color: accentColor || '#D94E2B' }} />
                </div>
                <p className="text-sm font-medium mb-1">還沒有商品</p>
                <p className="text-xs mb-4">上架第一個商品開始營業吧！</p>
                <Button
                  className="hover:opacity-90 rounded-xl text-white"
                  style={{ backgroundColor: accentColor || '#D94E2B' }}
                  onClick={() => { setNewProductImages([]); setNewProductOriginals([]); setNewProductPreviews([]); setIsAddProductOpen(true) }}
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
            className="fixed inset-0 z-50 bg-black/40 flex justify-center sm:items-center"
            onClick={() => { setSelectedProduct(null); setCarouselIndex(0); setShowExtendOptions(null) }}
          >
            <motion.div
              initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
              animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
              exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
              transition={isDesktop ? { duration: 0.2, ease: 'easeOut' } : { type: 'spring', damping: 25 }}
              className="absolute inset-x-0 top-12 bottom-0 rounded-t-2xl safe-bottom max-w-lg mx-auto flex flex-col sm:static sm:rounded-b-2xl sm:rounded-t-2xl sm:max-h-[85vh] sm:overflow-y-auto"
              style={{ backgroundColor: '#ffffff', ...(isDesktop ? { maxWidth: '36rem' } : {}) }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 拖曳指示條（獨立拖曳區域，加大觸控範圍） */}
              <motion.div
                className="pt-2 pb-3 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center sm:hidden"
                style={{ minHeight: '36px' }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.8 }}
                onDragEnd={(_e, info) => {
                  if (info.offset.y > 60 || info.velocity.y > 300) {
                    setSelectedProduct(null)
                    setCarouselIndex(0)
                  }
                }}
              >
                <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: '#D4B896' }} />
              </motion.div>

              {/* 管理員：編輯圖片 file input */}
              {showStaffUI && (
                <input
                  ref={editProductFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length === 0) return
                    // 進入裁切流程
                    setCropMode('edit')
                    editCroppedFilesRef.current = []
                    setCropPendingFiles(files)
                    setCropCurrentIndex(0)
                    setCropImageSrc(URL.createObjectURL(files[0]))
                    setCrop({ x: 0, y: 0 })
                    setCropZoom(1)
                    e.target.value = ''
                  }}
                />
              )}

              <div className="px-5 pb-5 sm:pt-5 overflow-y-auto flex-1">
              {/* 商品大圖 / 輪播 */}
              <div className="mb-3">
                {modalImages.length > 0 ? (
                  <div className="relative">
                    <div className="overflow-hidden rounded-2xl relative touch-pan-y" style={{ maxHeight: '45vh' }}>
                      <div
                        className="flex"
                        style={{
                          transform: `translateX(-${carouselIndex * 100}%)`,
                          transition: 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
                        }}
                      >
                        {modalImages.map((url, i) => (
                          <div key={i} className="min-w-full relative" style={{ aspectRatio: '4/5', maxHeight: '55vh', WebkitTouchCallout: 'none', userSelect: 'none' }}>
                            <Image
                              src={url}
                              alt={`${selectedProduct.name} ${i + 1}`}
                              fill
                              className="object-contain pointer-events-none"
                              sizes="(max-width: 768px) 100vw, 400px"
                              draggable={false}
                              onContextMenu={(e) => e.preventDefault()}
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
                      <div className="flex justify-center gap-1.5 mt-2">
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
                  <div className="w-full rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#F5E0C4', aspectRatio: '1', maxHeight: '45vh' }}>
                    <Package className="w-16 h-16" style={{ color: '#C4A882' }} />
                  </div>
                )}
                {/* 管理員：新增圖片按鈕 */}
                {showStaffUI && (
                  <button
                    className="w-full mt-2 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1 active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
                    onClick={() => editProductFileRef.current?.click()}
                    disabled={isUploadingPhoto}
                  >
                    {isUploadingPhoto ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 上傳中...</>
                    ) : (
                      <><Camera className="w-3.5 h-3.5" /> 新增圖片</>
                    )}
                  </button>
                )}
                {/* 管理員：圖片管理列（刪除/設封面） */}
                {showStaffUI && modalImages.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {modalImages.map((url, idx) => (
                      <div key={idx} className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border" style={{ borderColor: idx === 0 ? (accentColor || '#D94E2B') : '#E5E7EB' }}>
                        <Image src={url} alt={`圖${idx + 1}`} width={56} height={56} className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center leading-tight py-px">封面</span>
                        )}
                        <button
                          className="absolute top-0 right-0 w-4 h-4 bg-black/60 rounded-bl-md flex items-center justify-center"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (modalImages.length <= 1) { toast.error('至少保留一張圖片'); return }
                            const newUrls = modalImages.filter((_, i) => i !== idx)
                            try {
                              const { data, error } = await supabase.rpc('update_product_images_v1', {
                                p_product_id: selectedProduct.id,
                                p_line_user_id: profile?.userId,
                                p_image_url: newUrls[0],
                                p_image_urls: newUrls,
                              })
                              if (error) throw error
                              if (!data?.success) throw new Error(data?.error)
                              toast.success('圖片已刪除')
                              setSelectedProduct({ ...selectedProduct, image_url: newUrls[0], image_urls: newUrls })
                              loadShop()
                            } catch { toast.error('刪除失敗') }
                          }}
                        >
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 商品資訊 */}
              <div className="mb-2">
                {/* 第一行：名稱 + 收藏/分享 icon */}
                <div className="flex items-start justify-between gap-2">
                  {showStaffUI && editingName === selectedProduct.id ? (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        autoFocus
                        className="flex-1 font-bold text-lg bg-transparent outline-none border-b-2 min-w-0"
                        style={{ color: '#4A2C17', borderColor: '#E8D5BE' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateProductField(selectedProduct.id, 'name')
                          if (e.key === 'Escape') setEditingName(null)
                        }}
                      />
                      <button className="p-1 rounded-full active:scale-90 shrink-0" style={{ color: '#16A34A' }} onClick={() => handleUpdateProductField(selectedProduct.id, 'name')}>
                        <Check className="w-5 h-5" />
                      </button>
                      <button className="p-1 rounded-full active:scale-90 shrink-0" style={{ color: '#8B6B4A' }} onClick={() => setEditingName(null)}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <h3
                      className="font-bold text-lg leading-tight min-w-0 flex items-center gap-1"
                      style={{ color: '#4A2C17' }}
                      onClick={() => {
                        if (showStaffUI) {
                          setEditingName(selectedProduct.id)
                          setEditNameValue(selectedProduct.name)
                        }
                      }}
                    >
                      {selectedProduct.name}
                      {showStaffUI && <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: '#8B6B4A' }} />}
                    </h3>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-full"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        // 先用 DOM 操作即時更新視覺，再觸發 state 更新
                        const svg = e.currentTarget.querySelector('svg')
                        if (svg) {
                          const willBeFav = !favoriteIds.has(selectedProduct.id)
                          svg.style.fill = willBeFav ? '#EF4444' : 'none'
                          svg.style.stroke = willBeFav ? '#EF4444' : '#C4A882'
                          svg.style.transform = 'scale(1.2)'
                          setTimeout(() => { svg.style.transform = 'scale(1)' }, 200)
                        }
                        handleToggleFavorite(selectedProduct.id)
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          fill: favoriteIds.has(selectedProduct.id) ? '#EF4444' : 'none',
                          stroke: favoriteIds.has(selectedProduct.id) ? '#EF4444' : '#C4A882',
                          transition: 'fill 0.3s, stroke 0.3s, transform 0.2s',
                        }}
                      >
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                      </svg>
                    </button>
                    <button
                      className="p-1.5 rounded-full transition-all active:scale-90"
                      style={{ color: '#C4A882' }}
                      onClick={(e) => { e.stopPropagation(); handleShareProduct() }}
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {/* 第二行：價格 + badge */}
                <div className="flex items-center gap-2 mt-0.5">
                  {showStaffUI && editingPrice === selectedProduct.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-bold" style={{ color: accentColor || '#D94E2B' }}>$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editPriceValue}
                        onChange={(e) => setEditPriceValue(e.target.value)}
                        autoFocus
                        className="w-20 text-xl font-bold border-b-2 bg-transparent outline-none"
                        style={{ color: accentColor || '#D94E2B', borderColor: '#E8D5BE' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateProductField(selectedProduct.id, 'price')
                          if (e.key === 'Escape') setEditingPrice(null)
                        }}
                      />
                      <button
                        className="p-1 rounded-full active:scale-90"
                        style={{ color: '#16A34A' }}
                        onClick={() => handleUpdateProductField(selectedProduct.id, 'price')}
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        className="p-1 rounded-full active:scale-90"
                        style={{ color: '#8B6B4A' }}
                        onClick={() => setEditingPrice(null)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="text-xl font-bold flex items-center gap-1"
                      style={{ color: accentColor || '#D94E2B' }}
                      onClick={() => {
                        if (showStaffUI) {
                          setEditingPrice(selectedProduct.id)
                          setEditPriceValue(String(selectedProduct.price))
                        }
                      }}
                    >
                      ${selectedProduct.price.toLocaleString()}
                      {showStaffUI && <Pencil className="w-3.5 h-3.5 ml-0.5" style={{ color: '#8B6B4A' }} />}
                    </p>
                  )}
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
                  <p className="text-xs mt-1 leading-relaxed line-clamp-2" style={{ color: '#8B6B4A' }}>{selectedProduct.description}</p>
                )}
              </div>

              {showStaffUI ? (
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

                      {/* 分類調整 */}
                      {shopCategories.length > 0 && (
                        <select
                          value={selectedProduct.category || ''}
                          onChange={async (e) => {
                            const newCategory = e.target.value || null
                            try {
                              const { data, error } = await supabase.rpc('update_product_images_v1', {
                                p_product_id: selectedProduct.id,
                                p_line_user_id: profile?.userId,
                                p_category: newCategory,
                              })
                              if (error) throw error
                              if (!data?.success) throw new Error(data?.error)
                              toast.success('分類已更新')
                              loadShop()
                              setSelectedProduct({ ...selectedProduct, category: newCategory })
                            } catch { toast.error('更新分類失敗') }
                          }}
                          className="w-full px-3 py-2 rounded-xl text-sm"
                          style={{ backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', color: '#374151' }}
                        >
                          <option value="">無分類</option>
                          {shopCategories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                          ))}
                        </select>
                      )}

                      {/* 規格管理 */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium" style={{ color: '#8B6B4A' }}>規格</p>
                        {productVariants.length > 0 ? (
                          <div className="space-y-1.5">
                            {productVariants.map((v: any) => (
                              <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                <span style={{ color: '#374151' }}>{v.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs" style={{ color: '#9CA3AF' }}>庫存: {v.stock}</span>
                                  <button
                                    className="p-0.5 rounded active:scale-90"
                                    style={{ color: '#EF4444' }}
                                    onClick={async () => {
                                      if (!confirm(`確定刪除規格「${v.name}」？`)) return
                                      try {
                                        const { data, error } = await supabase.rpc('delete_product_variant_v1', {
                                          p_variant_id: v.id,
                                          p_line_user_id: profile?.userId,
                                        })
                                        if (error) throw error
                                        if (!data?.success) { toast.error(data?.error); return }
                                        toast.success('規格已刪除')
                                        // 重新載入規格
                                        const { data: varData } = await supabase.rpc('get_product_variants_v1', { p_product_id: selectedProduct.id })
                                        if (varData?.variants) setProductVariants(varData.variants)
                                        else setProductVariants([])
                                        loadShop()
                                      } catch { toast.error('刪除失敗') }
                                    }}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: '#9CA3AF' }}>無規格</p>
                        )}
                        <button
                          className="w-full py-2 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px dashed #D1D5DB' }}
                          onClick={async () => {
                            const name = prompt('輸入規格名稱（如 S / M / L）')
                            if (!name || !name.trim()) return
                            const stockStr = prompt('庫存數量（預設 0）')
                            const stock = parseInt(stockStr || '0') || 0
                            try {
                              const { data, error } = await supabase.rpc('add_product_variant_v1', {
                                p_product_id: selectedProduct.id,
                                p_line_user_id: profile?.userId,
                                p_name: name.trim(),
                                p_stock: stock,
                              })
                              if (error) throw error
                              if (!data?.success) { toast.error(data?.error); return }
                              toast.success('規格已新增')
                              const { data: varData } = await supabase.rpc('get_product_variants_v1', { p_product_id: selectedProduct.id })
                              if (varData?.variants) setProductVariants(varData.variants)
                              loadShop()
                            } catch { toast.error('新增失敗') }
                          }}
                        >
                          + 新增規格
                        </button>
                      </div>

                      {/* 操作按鈕 */}
                      <div className="grid grid-cols-3 gap-2">
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

                        {/* 截止 / 延長（含選項） */}
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
                        ) : showExtendOptions === selectedProduct.id ? (
                          <>
                            <button
                              className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                              style={{ backgroundColor: '#16A34A', color: '#fff' }}
                              onClick={() => {
                                handleUpdateEndTime(
                                  selectedProduct.id,
                                  new Date(Date.now() + 60 * 60 * 1000)
                                )
                                setShowExtendOptions(null)
                                setSelectedProduct(null)
                              }}
                            >
                              <TimerReset className="w-4 h-4" />
                              +1 小時
                            </button>
                            <button
                              className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                              style={{ backgroundColor: '#2563EB', color: '#fff' }}
                              onClick={() => {
                                handleUpdateEndTime(selectedProduct.id, null)
                                setShowExtendOptions(null)
                                setSelectedProduct(null)
                              }}
                            >
                              <Timer className="w-4 h-4" />
                              不限時
                            </button>
                          </>
                        ) : (
                          <button
                            className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                            style={{ backgroundColor: '#16A34A', color: '#fff' }}
                            onClick={() => setShowExtendOptions(selectedProduct.id)}
                          >
                            <TimerReset className="w-4 h-4" />
                            延長
                          </button>
                        )}

                        {/* 商城顯示 ON/OFF */}
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
                                商城顯示 ON
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
                                商城顯示 OFF
                              </>
                            )}
                          </button>
                        )}

                        {/* 關閉配貨 */}
                        <button
                          className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                          style={{ backgroundColor: '#F97316', color: '#fff' }}
                          onClick={async () => {
                            const productName = selectedProduct.name
                            if (!confirm(`確定要關閉「${productName}」的配貨？\n\n所有等待配貨的訂單將標記為「配貨失敗」，客人會在訂單中看到此狀態。`)) return
                            try {
                              const { data, error } = await supabase.rpc('close_product_allocation_v1', {
                                p_tenant_slug: tenantSlug,
                                p_product_id: selectedProduct.id,
                                p_line_user_id: profile?.userId,
                              })
                              if (error) throw error
                              if (!data?.success) {
                                toast.error(data?.error || '關閉配貨失敗')
                                return
                              }
                              toast.success(`已關閉配貨，${data.cancelled_count} 筆訂單標記為配貨失敗`)
                              setSelectedProduct(null)
                            } catch (err: any) {
                              toast.error('關閉配貨失敗：' + (err.message || '未知錯誤'))
                            }
                          }}
                        >
                          <PackageX className="w-4 h-4" />
                          關閉配貨
                        </button>

                        {/* 關閉 */}
                        <button
                          className="h-12 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                          style={{ border: '1px solid #E8D5BE', backgroundColor: '#ffffff', color: '#8B6B4A' }}
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
                    <div className="mb-2">
                      <span className="text-sm font-medium mb-1.5 block" style={{ color: '#4A2C17' }}>規格</span>
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
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium" style={{ color: '#4A2C17' }}>數量</span>
                          <div className="flex items-center gap-2">
                            <button
                              className="h-8 w-8 rounded-full border-2 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
                              style={{ borderColor: '#D4B896' }}
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              disabled={quantity <= 1}
                            >
                              <Minus className="w-3.5 h-3.5" style={{ color: '#4A2C17' }} />
                            </button>
                            <span className="text-xl font-bold w-8 text-center" style={{ color: '#4A2C17' }}>{quantity}</span>
                            <button
                              className="h-8 w-8 rounded-full border-2 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30"
                              style={{ borderColor: '#D4B896' }}
                              onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                              disabled={quantity >= maxQty}
                            >
                              <Plus className="w-3.5 h-3.5" style={{ color: '#4A2C17' }} />
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

                </>
              )}
              </div>{/* end scrollable area */}

              {/* 固定底部：小計 + 按鈕（客人模式） */}
              {!showStaffUI && (
                <div className="px-5 pb-8 pt-2 border-t shrink-0" style={{ borderColor: '#E8D5BE', backgroundColor: '#ffffff' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm" style={{ color: '#8B6B4A' }}>小計</span>
                    <span className="text-lg font-bold" style={{ color: accentColor || '#D94E2B' }}>
                      ${(selectedProduct.price * quantity).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-[0.97]"
                      style={{ borderColor: '#D4B896', color: '#8B6B4A' }}
                      onClick={() => { setSelectedProduct(null); setQuantity(1) }}
                    >
                      取消
                    </button>
                    <button
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                      style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                      onClick={handleDirectOrderClick}
                      disabled={isOrdering || (selectedProduct.has_variants && !selectedVariant)}
                    >
                      {isOrdering ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : selectedProduct.has_variants && !selectedVariant ? (
                        '請先選擇規格'
                      ) : (
                        `確定喊單${selectedVariant ? `（${selectedVariant.name}）` : ''}`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* 喊單確認提醒 */}
      <AnimatePresence>
        {showOrderConfirm && selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center px-8"
            onClick={() => setShowOrderConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
              style={{ backgroundColor: '#ffffff' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#FEE8D6' }}>
                  <ClipboardList className="w-6 h-6" style={{ color: accentColor || '#D94E2B' }} />
                </div>
                <h3 className="text-base font-bold mb-1" style={{ color: '#4A2C17' }}>確認喊單</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#8B6B4A' }}>
                  喊單後將無法取消或修改，請確認商品、規格與數量無誤後再送出哦！
                </p>
              </div>
              <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: '#F5E0C4' }}>
                <div className="flex justify-between text-sm" style={{ color: '#4A2C17' }}>
                  <span className="font-medium">{selectedProduct.name}</span>
                  <span className="font-bold">${(selectedProduct.price * quantity).toLocaleString()}</span>
                </div>
                {selectedVariant && (
                  <p className="text-xs mt-0.5" style={{ color: '#8B6B4A' }}>規格：{selectedVariant.name}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: '#8B6B4A' }}>數量：{quantity}</p>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all active:scale-[0.97]"
                  style={{ borderColor: '#D4B896', color: '#8B6B4A' }}
                  onClick={() => setShowOrderConfirm(false)}
                >
                  再想想
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                  style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                  onClick={handleDirectOrder}
                  disabled={isOrdering}
                >
                  {isOrdering ? '送出中...' : '確定送出'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 功能選單 Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex justify-start"
            onClick={() => setIsMenuOpen(false)}
          >
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="h-full w-full max-w-sm flex flex-col"
              style={{ backgroundColor: '#ffffff' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E8D5BE' }}>
                <h2 className="text-lg font-bold" style={{ color: '#4A2C17' }}>篩選 & 搜尋</h2>
                <button
                  className="p-1.5 rounded-full transition-colors"
                  style={{ color: '#8B6B4A' }}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 overflow-y-auto flex-1">
                {/* 搜尋框 */}
                <div className="relative mb-5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#C4A882' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜尋商品..."
                    className="w-full pl-10 pr-9 py-2.5 rounded-full text-[16px] sm:text-sm outline-none"
                    style={{ backgroundColor: '#F5F5F5', color: '#374151', border: '1.5px solid #E5E7EB' }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X className="w-4 h-4" style={{ color: '#9CA3AF' }} />
                    </button>
                  )}
                </div>

                {/* 商品類型篩選 */}
                <div className="mb-5">
                  <p className="text-xs font-medium mb-2" style={{ color: '#8B6B4A' }}>商品類型</p>
                  <div className="flex gap-2">
                    {([['all', '全部'], ['stock', '現貨'], ['preorder', '預購']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        className="px-3 py-1.5 rounded-full text-sm font-medium transition-all flex-1"
                        style={{
                          backgroundColor: productTypeFilter === key ? (accentColor || '#8b5e3c') : '#F3F4F6',
                          color: productTypeFilter === key ? '#fff' : '#374151',
                        }}
                        onClick={() => { setProductTypeFilter(key); setIsMenuOpen(false) }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 分類標籤 */}
                {(() => {
                  const orderedCategories = shopCategories.length > 0
                    ? shopCategories.map(c => c.name)
                    : [...new Set(products.map(p => p.category).filter(Boolean))] as string[]
                  const hasFavorites = favoriteIds.size > 0
                  const favCount = products.filter(p => favoriteIds.has(p.id)).length
                  if (orderedCategories.length === 0 && !hasFavorites) return null
                  const getCategoryCount = (cat: string | null) => cat
                    ? products.filter(p => p.category === cat).length
                    : products.length
                  return (
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: '#8B6B4A' }}>分類</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === null ? 'shadow-sm' : ''}`}
                          style={{
                            backgroundColor: selectedCategory === null ? (accentColor || '#8b5e3c') : '#F3F4F6',
                            color: selectedCategory === null ? '#fff' : '#374151',
                          }}
                          onClick={() => { setSelectedCategory(null); setIsMenuOpen(false) }}
                        >
                          全部 ({getCategoryCount(null)})
                        </button>
                        {hasFavorites && favCount > 0 && (
                          <button
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${selectedCategory === '__favorites__' ? 'shadow-sm' : ''}`}
                            style={{
                              backgroundColor: selectedCategory === '__favorites__' ? '#EF4444' : '#FEE2E2',
                              color: selectedCategory === '__favorites__' ? '#fff' : '#DC2626',
                            }}
                            onClick={() => { setSelectedCategory(selectedCategory === '__favorites__' ? null : '__favorites__'); setIsMenuOpen(false) }}
                          >
                            <Heart className="w-3 h-3" fill={selectedCategory === '__favorites__' ? '#fff' : '#DC2626'} />
                            收藏 ({favCount})
                          </button>
                        )}
                        {orderedCategories.map(cat => (
                          <button
                            key={cat}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === cat ? 'shadow-sm' : ''}`}
                            style={{
                              backgroundColor: selectedCategory === cat ? (accentColor || '#8b5e3c') : '#F3F4F6',
                              color: selectedCategory === cat ? '#fff' : '#374151',
                            }}
                            onClick={() => { setSelectedCategory(selectedCategory === cat ? null : cat); setIsMenuOpen(false) }}
                          >
                            {cat} ({getCategoryCount(cat)})
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 我的訂單 Drawer */}
      <AnimatePresence>
        {isOrderDrawerOpen && (() => {
          // 分類訂單：未結帳 vs 已結帳
          const uncheckedOrders = orders.filter((o) => !o.checkout_id && o.status !== 'cancelled')
          const pendingOrders = uncheckedOrders.filter((o) => o.status === 'pending' || o.status === 'partial')
          const confirmedOrders = uncheckedOrders.filter((o) => o.status === 'allocated')
          const failedOrders = orders.filter((o) => o.status === 'cancelled' && !o.checkout_id)

          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex justify-end"
            onClick={() => setIsOrderDrawerOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="h-full w-full max-w-sm flex flex-col"
              style={{ backgroundColor: '#ffffff', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E8D5BE' }}>
                <h2 className="text-lg font-bold" style={{ color: '#4A2C17' }}>我的訂單</h2>
                <div className="flex items-center gap-2">
                  {isLoggedIn && profile && (
                    <div className="flex items-center gap-1.5">
                      {profile.pictureUrl ? (
                        <Image
                          src={profile.pictureUrl}
                          alt={profile.displayName}
                          width={22}
                          height={22}
                          className="w-[22px] h-[22px] rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: accentColor || '#D94E2B', color: 'white' }}>
                          {profile.displayName.charAt(0)}
                        </div>
                      )}
                      <span className="text-xs max-w-[60px] truncate" style={{ color: '#8B6B4A' }}>{profile.displayName}</span>
                    </div>
                  )}
                  <button
                    className="p-1.5 rounded-full transition-colors active:scale-95"
                    style={{ color: '#8B6B4A' }}
                    onClick={() => setIsOrderDrawerOpen(false)}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 訂單告示欄 */}
              {(shopSettings.order_notice || showStaffUI) && (
                <div className="px-5 pt-3 pb-0">
                  {editingOrderNotice ? (
                    <div className="space-y-2">
                      <textarea
                        value={orderNoticeValue}
                        onChange={e => setOrderNoticeValue(e.target.value)}
                        placeholder="輸入訂單告示（留空則不顯示）"
                        className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none text-[16px] sm:text-xs"
                        style={{ backgroundColor: '#F5F5F5', border: '1.5px solid #E5E7EB', color: '#374151' }}
                        rows={3}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
                          onClick={() => setEditingOrderNotice(false)}
                        >取消</button>
                        <button
                          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: accentColor || '#D94E2B' }}
                          onClick={async () => {
                            try {
                              const noticeValue = orderNoticeValue.trim() || null
                              // 用 RPC 或 SQL 合併，不覆蓋其他 settings 欄位
                              const { data: current } = await supabase.from('tenants').select('settings').eq('id', tenant!.id).single()
                              const mergedSettings = { ...(current?.settings || {}), order_notice: noticeValue }
                              const { error } = await supabase.from('tenants').update({ settings: mergedSettings }).eq('id', tenant!.id)
                              if (error) throw error
                              setShopSettings(prev => ({ ...prev, order_notice: noticeValue }))
                              setEditingOrderNotice(false)
                              toast.success('告示已更新')
                            } catch { toast.error('更新失敗') }
                          }}
                        >儲存</button>
                      </div>
                    </div>
                  ) : shopSettings.order_notice ? (
                    <div
                      className="px-3 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: '#FFF5EE', color: accentColor || '#D94E2B', border: `1px solid ${accentColor || '#D94E2B'}20` }}
                      onClick={() => { if (showStaffUI) { setOrderNoticeValue(shopSettings.order_notice || ''); setEditingOrderNotice(true) } }}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="shrink-0">📌</span>
                        <span className="leading-relaxed flex-1">{shopSettings.order_notice}</span>
                        {showStaffUI && <Pencil className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />}
                      </div>
                    </div>
                  ) : showStaffUI ? (
                    <button
                      className="w-full px-3 py-2 rounded-lg text-xs text-center"
                      style={{ backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '1px dashed #D1D5DB' }}
                      onClick={() => { setOrderNoticeValue(''); setEditingOrderNotice(true) }}
                    >
                      + 新增訂單告示
                    </button>
                  ) : null}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {uncheckedOrders.length === 0 && failedOrders.length === 0 ? (
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

              {/* 底部：現貨結帳按鈕（暫時停用，以後再實現）
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
              )} */}
            </motion.div>
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
            className="fixed inset-0 z-50 bg-black/50 flex justify-center items-end sm:items-center"
            onClick={closeCheckoutModal}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-2xl max-h-[85vh] flex flex-col sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh]"
              style={{ backgroundColor: '#ffffff' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #E8D5BE' }}>
                <h2 className="text-lg font-bold" style={{ color: '#4A2C17' }}>
                  {checkoutStep === 'method' && '選擇出貨方式'}
                  {checkoutStep === 'confirm' && '確認結帳'}
                  {checkoutStep === 'success' && '結帳成功'}
                </h2>
                <button onClick={closeCheckoutModal} className="p-1 rounded-full" style={{ color: '#8B6B4A' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step: method */}
              {checkoutStep === 'method' && (
                <div className="flex-1 overflow-y-auto">
                  {/* 可結帳商品明細 */}
                  <div className="p-4 space-y-2">
                    <p className="text-sm font-medium mb-2" style={{ color: '#8B6B4A' }}>結帳商品（{checkoutEligibleOrders.length} 項）</p>
                    {checkoutEligibleOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: '#4A2C17' }}>{order.product_name}</p>
                          <p className="text-xs" style={{ color: '#8B6B4A' }}>${order.unit_price} × {order.quantity}</p>
                        </div>
                        <p className="text-sm font-bold ml-2" style={{ color: '#4A2C17' }}>${order.unit_price * order.quantity}</p>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 font-bold" style={{ borderTop: '2px solid #D4B896', color: '#D94E2B' }}>
                      <span>商品小計</span>
                      <span>${checkoutEligibleTotal}</span>
                    </div>
                  </div>

                  {/* 出貨方式選擇 */}
                  <div className="p-4 pt-0 space-y-3">
                    <p className="text-sm font-medium" style={{ color: '#8B6B4A' }}>選擇出貨方式</p>

                    {/* 賣貨便 */}
                    <button
                      onClick={() => setSelectedShipping('myship')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        border: `2px solid ${selectedShipping === 'myship' ? (accentColor || '#D94E2B') : '#E8D5BE'}`,
                        backgroundColor: selectedShipping === 'myship' ? '#F5E6D3' : 'transparent',
                      }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#E8F5E8' }}>
                        <Store className="w-5 h-5" style={{ color: '#4CAF50' }} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium" style={{ color: '#4A2C17' }}>賣貨便</p>
                        <p className="text-xs" style={{ color: '#8B6B4A' }}>7-11 取貨 · 運費 +$38</p>
                      </div>
                      {selectedShipping === 'myship' && <CheckCircle className="w-5 h-5 shrink-0" style={{ color: accentColor || '#D94E2B' }} />}
                    </button>

                    {/* 宅配 */}
                    <button
                      onClick={() => setSelectedShipping('delivery')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        border: `2px solid ${selectedShipping === 'delivery' ? (accentColor || '#D94E2B') : '#E8D5BE'}`,
                        backgroundColor: selectedShipping === 'delivery' ? '#F5E6D3' : 'transparent',
                      }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#E3F2FD' }}>
                        <Truck className="w-5 h-5" style={{ color: '#2196F3' }} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium" style={{ color: '#4A2C17' }}>宅配</p>
                        <p className="text-xs" style={{ color: '#8B6B4A' }}>宅配到府 · 運費 $80</p>
                      </div>
                      {selectedShipping === 'delivery' && <CheckCircle className="w-5 h-5 shrink-0" style={{ color: accentColor || '#D94E2B' }} />}
                    </button>

                    {/* 自取 */}
                    <button
                      onClick={() => setSelectedShipping('pickup')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        border: `2px solid ${selectedShipping === 'pickup' ? (accentColor || '#D94E2B') : '#E8D5BE'}`,
                        backgroundColor: selectedShipping === 'pickup' ? '#F5E6D3' : 'transparent',
                      }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#FFF3E0' }}>
                        <MapPin className="w-5 h-5" style={{ color: '#FF9800' }} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium" style={{ color: '#4A2C17' }}>自取</p>
                        <p className="text-xs" style={{ color: '#8B6B4A' }}>到店自取 · 免運費</p>
                      </div>
                      {selectedShipping === 'pickup' && <CheckCircle className="w-5 h-5 shrink-0" style={{ color: accentColor || '#D94E2B' }} />}
                    </button>
                  </div>

                  {/* 下一步按鈕 */}
                  <div className="p-4" style={{ borderTop: '1px solid #E8D5BE' }}>
                    <button
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                      disabled={!selectedShipping}
                      onClick={() => setCheckoutStep('confirm')}
                      style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                    >
                      下一步
                    </button>
                  </div>
                </div>
              )}

              {/* Step: confirm */}
              {checkoutStep === 'confirm' && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    {/* 金額明細 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm" style={{ color: '#4A2C17' }}>
                        <span>商品小計（{checkoutEligibleOrders.length} 項）</span>
                        <span>${checkoutEligibleTotal}</span>
                      </div>
                      {selectedShipping === 'myship' && (
                        <div className="flex justify-between text-sm" style={{ color: '#8B6B4A' }}>
                          <span>運費 +$38（不含在結帳金額）</span>
                        </div>
                      )}
                      {selectedShipping === 'delivery' && (
                        <div className="flex justify-between text-sm" style={{ color: '#4A2C17' }}>
                          <span>運費（宅配）</span>
                          <span>$80</span>
                        </div>
                      )}
                      {selectedShipping === 'pickup' && (
                        <div className="flex justify-between text-sm" style={{ color: '#8B6B4A' }}>
                          <span>運費</span>
                          <span>免運</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-2" style={{ borderTop: '2px solid #D4B896', color: '#D94E2B' }}>
                        <span>結帳金額</span>
                        <span>${selectedShipping === 'delivery' ? checkoutEligibleTotal + 80 : checkoutEligibleTotal}</span>
                      </div>
                    </div>

                    {/* 出貨方式 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span style={{ color: '#8B6B4A' }}>出貨方式：</span>
                      <span className="font-medium" style={{ color: '#4A2C17' }}>
                        {selectedShipping === 'myship' && '賣貨便（7-11 取貨）'}
                        {selectedShipping === 'delivery' && '宅配到府'}
                        {selectedShipping === 'pickup' && '到店自取'}
                      </span>
                    </div>
                  </div>

                  {/* 確認按鈕 */}
                  <div className="p-4 space-y-2" style={{ borderTop: '1px solid #E8D5BE' }}>
                    <button
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center"
                      onClick={handleCheckout}
                      disabled={isSubmittingCheckout}
                      style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                    >
                      {isSubmittingCheckout ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          處理中...
                        </>
                      ) : (
                        '確認結帳'
                      )}
                    </button>
                    <button
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                      onClick={() => setCheckoutStep('method')}
                      disabled={isSubmittingCheckout}
                      style={{ border: '1px solid #D4B896', color: '#8B6B4A', backgroundColor: 'transparent' }}
                    >
                      上一步
                    </button>
                  </div>
                </div>
              )}

              {/* Step: success */}
              {checkoutStep === 'success' && checkoutResult && (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: '#E8F5E8' }}>
                      <CheckCircle className="w-8 h-8" style={{ color: '#4CAF50' }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold" style={{ color: '#4A2C17' }}>結帳成功！</h3>
                      <p className="text-sm mt-1" style={{ color: '#8B6B4A' }}>
                        結帳單號：{checkoutResult.checkout_no}
                      </p>
                    </div>

                    {/* 金額摘要 */}
                    <div className="rounded-xl p-4 text-left space-y-2" style={{ backgroundColor: '#F5E6D3' }}>
                      <div className="flex justify-between text-sm" style={{ color: '#4A2C17' }}>
                        <span>商品數量</span>
                        <span>{checkoutResult.item_count} 項</span>
                      </div>
                      <div className="flex justify-between font-bold" style={{ color: '#D94E2B' }}>
                        <span>結帳金額</span>
                        <span>${checkoutResult.total_amount}</span>
                      </div>
                    </div>

                    {/* 出貨方式專屬提示 */}
                    <div className="rounded-xl p-4 text-left" style={{ backgroundColor: '#F5E6D3', border: '1px solid #E8D5BE' }}>
                      {checkoutResult.shipping_method === 'myship' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium flex items-center gap-2" style={{ color: '#4A2C17' }}>
                            <Store className="w-4 h-4" /> 賣貨便取貨
                          </p>
                          <p className="text-sm" style={{ color: '#8B6B4A' }}>
                            請等待賣貨便賣場連結回傳，届時會透過 LINE 通知您取貨資訊。
                          </p>
                        </div>
                      )}
                      {checkoutResult.shipping_method === 'delivery' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium flex items-center gap-2" style={{ color: '#4A2C17' }}>
                            <Truck className="w-4 h-4" /> 宅配到府
                          </p>
                          <p className="text-sm" style={{ color: '#8B6B4A' }}>
                            請依匯款資訊轉帳，匯款完成後請私訊官方帳號通知。
                          </p>
                        </div>
                      )}
                      {checkoutResult.shipping_method === 'pickup' && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium flex items-center gap-2" style={{ color: '#4A2C17' }}>
                            <MapPin className="w-4 h-4" /> 到店自取
                          </p>
                          <p className="text-sm" style={{ color: '#8B6B4A' }}>
                            請依匯款資訊轉帳，匯款完成後請私訊官方帳號通知。
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 匯款資訊（宅配/自取） */}
                    {checkoutResult.shipping_method !== 'myship' && tenant?.payment_info && (
                      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#F5E6D3' }}>
                        <p className="text-sm font-medium" style={{ color: '#4A2C17' }}>匯款資訊</p>
                        {tenant.payment_info.bank && (
                          <div className="flex justify-between text-sm">
                            <span style={{ color: '#8B6B4A' }}>銀行</span>
                            <span style={{ color: '#4A2C17' }}>{tenant.payment_info.bank}</span>
                          </div>
                        )}
                        {tenant.payment_info.account && (
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: '#8B6B4A' }}>帳號</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono" style={{ color: '#4A2C17' }}>{tenant.payment_info.account}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(tenant.payment_info!.account!)
                                  toast.success('已複製帳號')
                                }}
                                className="p-1 rounded-md active:scale-95 transition-transform"
                                style={{ color: '#8B6B4A' }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                        {tenant.payment_info.name && (
                          <div className="flex justify-between text-sm">
                            <span style={{ color: '#8B6B4A' }}>戶名</span>
                            <span style={{ color: '#4A2C17' }}>{tenant.payment_info.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 關閉按鈕 */}
                  <div className="p-4" style={{ borderTop: '1px solid #E8D5BE' }}>
                    <button
                      className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                      onClick={closeCheckoutModal}
                      style={{ backgroundColor: accentColor || '#D94E2B', color: '#fff8f0' }}
                    >
                      關閉
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 管理員面板 Drawer ========== */}
      <AnimatePresence>
        {isAdminPanelOpen && showStaffUI && (
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
        {isAddProductOpen && showStaffUI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 flex justify-center items-end sm:items-center"
            onClick={() => setIsAddProductOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom max-w-lg mx-auto sm:relative sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh] sm:overflow-y-auto"
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
                  // 開啟顯示範圍選擇器（新增模式）
                  setCropMode('add')
                  setCropPendingFiles(toAdd)
                  setCropCurrentIndex(0)
                  setCropImageSrc(URL.createObjectURL(toAdd[0]))
                  setCrop({ x: 0, y: 0 })
                  setCropZoom(1)
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

              {/* 價格 + 庫存（現貨+無規格時才顯示主庫存） */}
              <div className="flex gap-2 mb-3">
                <Input
                  type="number"
                  placeholder="價格（可為負數）"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  className="flex-1 rounded-xl text-[16px]"
                />
                {newProductIsLimited && !newProductHasVariants && (
                  <Input
                    type="number"
                    min="1"
                    placeholder="庫存數量"
                    value={newProductStock}
                    onChange={(e) => setNewProductStock(e.target.value)}
                    className="flex-1 rounded-xl text-[16px]"
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
                          className="flex-1 rounded-xl text-[16px]"
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
                            className="w-20 rounded-xl text-[16px]"
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

              {/* 分類選擇 */}
              {shopCategories.length > 0 && (
                <div className="mb-3">
                  <select
                    value={newProductCategory}
                    onChange={e => setNewProductCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-[16px] sm:text-sm outline-none appearance-none"
                    style={{ backgroundColor: '#F3F4F6', color: newProductCategory ? '#374151' : '#9CA3AF', border: '1.5px solid #E5E7EB' }}
                  >
                    <option value="">選擇分類（可不選）</option>
                    {shopCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
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
                    setNewProductOriginals([])
                    setNewProductPreviews([])
                  }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 hover:opacity-90 text-white"
                  style={{ backgroundColor: accentColor || '#D94E2B' }}
                  onClick={handleAddProduct}
                  disabled={!newProductName.trim() || newProductPrice === '' || isUploading}
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

      {/* ========== 圖片裁切 Modal ========== */}
      <AnimatePresence>
        {cropImageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 flex flex-col"
          >
            {/* 裁切區域 */}
            <div className="relative flex-1">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={cropZoom}
                minZoom={0.3}
                aspect={1}
                restrictPosition={false}
                style={{ containerStyle: { backgroundColor: '#ffffff' } }}
                onCropChange={setCrop}
                onZoomChange={setCropZoom}
                onCropComplete={(_: Area, croppedPixels: Area) => setCroppedAreaPixels(croppedPixels)}
              />
            </div>
            {/* 控制列 */}
            <div className="bg-black/90 px-6 py-5 space-y-4">
              {/* 縮放滑桿 */}
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-xs">縮放</span>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.05}
                  value={cropZoom}
                  onChange={e => setCropZoom(Number(e.target.value))}
                  className="flex-1 accent-white h-1"
                />
              </div>
              {/* 按鈕 */}
              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/30 text-white active:scale-[0.97]"
                  onClick={() => {
                    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc)
                    // 跳過這張，繼續下一張或結束
                    const nextIdx = cropCurrentIndex + 1
                    if (nextIdx < cropPendingFiles.length) {
                      setCropCurrentIndex(nextIdx)
                      setCropImageSrc(URL.createObjectURL(cropPendingFiles[nextIdx]))
                      setCrop({ x: 0, y: 0 })
                      setCropZoom(1)
                    } else {
                      setCropImageSrc(null)
                      setCropPendingFiles([])
                    }
                  }}
                >
                  跳過
                </button>
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white active:scale-[0.97]"
                  style={{ backgroundColor: accentColor || '#D94E2B' }}
                  onClick={async () => {
                    if (!croppedAreaPixels || !cropImageSrc) return
                    try {
                      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels)
                      const croppedFile = new File([croppedBlob], `thumb_${cropPendingFiles[cropCurrentIndex].name}`, { type: 'image/jpeg' })
                      const originalFile = cropPendingFiles[cropCurrentIndex]
                      if (cropMode === 'add') {
                        setNewProductImages(prev => [...prev, croppedFile])
                        setNewProductOriginals(prev => [...prev, originalFile])
                        setNewProductPreviews(prev => [...prev, URL.createObjectURL(croppedBlob)])
                      } else {
                        editCroppedFilesRef.current.push(croppedFile) // 編輯模式存裁切後的圖
                      }
                    } catch {
                      toast.error('選取失敗')
                    }
                    URL.revokeObjectURL(cropImageSrc)
                    // 下一張或結束
                    const nextIdx = cropCurrentIndex + 1
                    if (nextIdx < cropPendingFiles.length) {
                      setCropCurrentIndex(nextIdx)
                      setCropImageSrc(URL.createObjectURL(cropPendingFiles[nextIdx]))
                      setCrop({ x: 0, y: 0 })
                      setCropZoom(1)
                    } else {
                      setCropImageSrc(null)
                      setCropPendingFiles([])
                      // edit 模式：全部裁切完後上傳
                      if (cropMode === 'edit' && editCroppedFilesRef.current.length > 0) {
                        handleEditProductPhoto(editCroppedFilesRef.current)
                        editCroppedFilesRef.current = []
                      }
                    }
                  }}
                >
                  確認顯示範圍 {cropPendingFiles.length > 1 ? `(${cropCurrentIndex + 1}/${cropPendingFiles.length})` : ''}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 補貨 Modal ========== */}
      <AnimatePresence>
        {restockProduct && showStaffUI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 flex justify-center items-end sm:items-center"
            onClick={() => setRestockProduct(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4 safe-bottom max-w-lg mx-auto sm:relative sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh] sm:overflow-y-auto"
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
                            ? 'bg-[#D94E2B] text-white'
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
                  className="flex-1 hover:opacity-90 text-white"
                  style={{ backgroundColor: accentColor || '#D94E2B' }}
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
