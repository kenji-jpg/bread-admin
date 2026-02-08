'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  Check,
  Package,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { getLiffShareUrl } from '@/hooks/use-liff'

interface SessionProduct {
  id: string
  name: string
  price: number
  stock: number | null
  sold_qty: number
  image_url: string | null
  end_time: string | null
  status: string
}

interface SessionDetail {
  id: string
  title: string
  description: string | null
  status: 'open' | 'closed' | 'completed'
  created_at: string
  closed_at: string | null
  completed_at: string | null
}

interface PreorderItem {
  id: string
  product_id: string
  product_name: string
  member_name: string
  quantity: number
  unit_price: number
  status: string
  created_at: string
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const supabase = createClient()
  const sessionId = params.sessionId as string

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [products, setProducts] = useState<SessionProduct[]>([])
  const [preorders, setPreorders] = useState<PreorderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // 補貨 Modal
  const [restockProduct, setRestockProduct] = useState<SessionProduct | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [isRestocking, setIsRestocking] = useState(false)

  // 結算 Modal
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  const loadSession = useCallback(async () => {
    if (!tenant) return

    try {
      // 取得場次詳情
      const { data: sessionData, error: sessionError } = await supabase.rpc(
        'get_session_detail_v1',
        {
          p_session_id: sessionId,
        }
      )

      if (sessionError) throw sessionError

      if (sessionData.success) {
        setSession(sessionData.session)
      }

      // 取得場次商品
      const { data: productsData, error: productsError } = await supabase.rpc(
        'get_session_products_v1',
        {
          p_session_id: sessionId,
        }
      )

      if (productsError) throw productsError

      if (productsData.success) {
        setProducts(productsData.products || [])
      }

      // 取得預購訂單 (從 order_items 查詢)
      const { data: ordersData, error: ordersError } = await supabase
        .from('order_items')
        .select(`
          id,
          product_id,
          quantity,
          unit_price,
          status,
          created_at,
          products!inner(name, session_id),
          members(display_name)
        `)
        .eq('products.session_id', sessionId)
        .order('created_at', { ascending: false })

      if (!ordersError && ordersData) {
        setPreorders(
          ordersData.map((item: any) => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.products?.name || '商品',
            member_name: item.members?.display_name || '客戶',
            quantity: item.quantity,
            unit_price: item.unit_price || 0,
            status: item.status,
            created_at: item.created_at,
          }))
        )
      }
    } catch (err) {
      console.error('Load session error:', err)
      toast.error('載入失敗')
    } finally {
      setIsLoading(false)
    }
  }, [tenant, sessionId, supabase])

  useEffect(() => {
    if (tenant) {
      loadSession()
    }
  }, [tenant, loadSession])

  // 複製連結
  const copyLink = () => {
    const url = getLiffShareUrl(`/s/${sessionId}`)
    navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('已複製連結')
    setTimeout(() => setCopied(false), 2000)
  }

  // 關閉收單
  const handleCloseSession = async () => {
    if (!session) return

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
    }
  }

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
        toast.success(`已補貨 ${restockQty} 件，分配 ${data.allocated_count} 筆訂單`)
        setRestockProduct(null)
        setRestockQty('')
        loadSession()
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

  // 結算場次
  const handleComplete = async () => {
    setIsCompleting(true)

    try {
      const { data, error } = await supabase.rpc('complete_purchase_session_v1', {
        p_session_id: sessionId,
      })

      if (error) throw error

      if (data.success) {
        toast.success(`場次已結算，取消 ${data.cancelled_count} 筆未分配訂單`)
        setShowCompleteDialog(false)
        loadSession()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      console.error('Complete session error:', err)
      toast.error('結算失敗')
    } finally {
      setIsCompleting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" />
            接單中
          </Badge>
        )
      case 'closed':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            補貨中
          </Badge>
        )
      case 'completed':
        return (
          <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <CheckCircle className="w-3 h-3 mr-1" />
            已結算
          </Badge>
        )
      default:
        return null
    }
  }

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">待分配</Badge>
      case 'allocated':
        return <Badge className="bg-blue-100 text-blue-700">已分配</Badge>
      case 'cancelled':
        return <Badge variant="destructive">已取消</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[200px] rounded-2xl" />
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    )
  }

  if (!tenant || !session) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">找不到場次資料</p>
      </div>
    )
  }

  const pendingCount = preorders.filter((p) => p.status === 'pending').length
  const allocatedCount = preorders.filter((p) => p.status === 'allocated').length
  const totalSales = preorders
    .filter((p) => p.status !== 'cancelled')
    .reduce((sum, p) => sum + p.quantity * p.unit_price, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/t/${tenant.slug}/sessions`}>
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{session.title}</h1>
              {getStatusBadge(session.status)}
            </div>
            <p className="text-muted-foreground text-sm">
              {new Date(session.created_at).toLocaleDateString('zh-TW', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        {session.status === 'open' && (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={copyLink}
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? '已複製' : '複製連結'}
          </Button>
        )}
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{products.length}</span>
            </div>
            <p className="text-sm text-muted-foreground">商品數</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{preorders.length}</span>
            </div>
            <p className="text-sm text-muted-foreground">總預購</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{allocatedCount}</span>
            </div>
            <p className="text-sm text-muted-foreground">已分配</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground">$</span>
              <span className="text-2xl font-bold">{totalSales.toLocaleString()}</span>
            </div>
            <p className="text-sm text-muted-foreground">銷售總額</p>
          </CardContent>
        </Card>
      </div>

      {/* 操作按鈕 */}
      {session.status !== 'completed' && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2 flex-wrap">
              {session.status === 'open' && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleCloseSession}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  關閉收單
                </Button>
              )}
              {session.status === 'closed' && pendingCount > 0 && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setShowCompleteDialog(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  結算場次（取消 {pendingCount} 筆未分配）
                </Button>
              )}
              {session.status === 'closed' && pendingCount === 0 && (
                <Button
                  className="rounded-xl gradient-primary"
                  onClick={() => setShowCompleteDialog(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  結算場次
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 商品列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map((product) => {
              const isExpired = product.end_time && new Date(product.end_time) < new Date()
              const productPreorders = preorders.filter(
                (p) => p.product_id === product.id
              )
              const productPending = productPreorders.filter(
                (p) => p.status === 'pending'
              ).length
              const productAllocated = productPreorders.filter(
                (p) => p.status === 'allocated'
              ).length

              return (
                <div
                  key={product.id}
                  className={`relative rounded-xl border overflow-hidden ${
                    isExpired ? 'opacity-60' : ''
                  }`}
                >
                  {/* 圖片 */}
                  <div className="relative aspect-square bg-muted">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Package className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}

                    {/* 截止時間 */}
                    {product.end_time && (
                      <div
                        className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs ${
                          isExpired
                            ? 'bg-red-500 text-white'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {isExpired ? '已截止' : new Date(product.end_time).toLocaleTimeString('zh-TW', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    )}
                  </div>

                  {/* 資訊 */}
                  <div className="p-2 space-y-1">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-primary font-bold">${product.price}</p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>預購: {product.sold_qty}</span>
                      <span>
                        分配: {productAllocated}/{productPreorders.length}
                      </span>
                    </div>

                    {/* 補貨按鈕 */}
                    {session.status === 'closed' && productPending > 0 && (
                      <Button
                        size="sm"
                        className="w-full mt-2 rounded-lg"
                        onClick={() => {
                          setRestockProduct(product)
                          setRestockQty('')
                        }}
                      >
                        補貨 ({productPending} 待分配)
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 預購列表 */}
      {preorders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">預購訂單</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {preorders.slice(0, 20).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{order.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.member_name} × {order.quantity}
                    </p>
                  </div>
                  {getOrderStatusBadge(order.status)}
                </div>
              ))}
              {preorders.length > 20 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  還有 {preorders.length - 20} 筆訂單...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 補貨 Dialog */}
      <Dialog open={!!restockProduct} onOpenChange={() => setRestockProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>補貨 - {restockProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                目前有{' '}
                {preorders.filter(
                  (p) => p.product_id === restockProduct?.id && p.status === 'pending'
                ).length}{' '}
                筆待分配
              </p>
              <Input
                type="number"
                min="1"
                placeholder="輸入實際購買數量"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockProduct(null)}>
              取消
            </Button>
            <Button
              onClick={handleRestock}
              disabled={!restockQty || isRestocking}
              className="gradient-primary"
            >
              {isRestocking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  處理中...
                </>
              ) : (
                '確認補貨'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 結算確認 Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              確認結算場次？
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {pendingCount > 0 && (
              <p className="text-sm text-destructive">
                還有 {pendingCount} 筆未分配的預購將被取消
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              結算後將無法再進行補貨，已分配的訂單會進入正常結帳流程。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleComplete}
              disabled={isCompleting}
              className="gradient-primary"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  處理中...
                </>
              ) : (
                '確認結算'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
