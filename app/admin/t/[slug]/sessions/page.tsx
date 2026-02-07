'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Plus, Package, Users, Clock, CheckCircle, XCircle, ChevronRight, Copy } from 'lucide-react'
import Link from 'next/link'

interface PurchaseSession {
  id: string
  title: string
  description: string | null
  status: 'open' | 'closed' | 'completed'
  created_at: string
  closed_at: string | null
  completed_at: string | null
  product_count: number
  total_preorders: number
  total_allocated: number
}

export default function SessionsPage() {
  const router = useRouter()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const supabase = createClient()

  const [sessions, setSessions] = useState<PurchaseSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadSessions = useCallback(async () => {
    if (!tenant) return

    try {
      const { data, error } = await supabase.rpc('list_purchase_sessions_v1', {
        p_tenant_id: tenant.id,
        p_limit: 50,
        p_offset: 0,
      })

      if (error) throw error

      if (data.success) {
        setSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('Load sessions error:', err)
      toast.error('載入失敗')
    } finally {
      setIsLoading(false)
    }
  }, [tenant, supabase])

  useEffect(() => {
    if (tenant) {
      loadSessions()
    }
  }, [tenant, loadSessions])

  const copyShareLink = (sessionId: string) => {
    const url = `${window.location.origin}/s/${sessionId}`
    navigator.clipboard.writeText(url)
    toast.success('已複製連結')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            接單中
          </span>
        )
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            補貨中
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <CheckCircle className="w-3 h-3" />
            已結算
          </span>
        )
      default:
        return null
    }
  }

  if (tenantLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">代購場次</span>
          </h1>
          <p className="text-muted-foreground mt-1">管理代購場次、上架商品</p>
        </div>
        <Link href={`/admin/t/${tenant.slug}/sessions/new`}>
          <Button className="gradient-primary rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            建立場次
          </Button>
        </Link>
      </div>

      {/* 場次列表 */}
      <div className="grid gap-4">
        {sessions.map((session, index) => {
          const allocationRate =
            session.total_preorders > 0
              ? Math.round(
                  (session.total_allocated / session.total_preorders) * 100
                )
              : 0

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">
                          {session.title}
                        </h3>
                        {getStatusBadge(session.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {new Date(session.created_at).toLocaleDateString(
                          'zh-TW',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </p>

                      {/* 統計 */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Package className="w-4 h-4" />
                          <span>{session.product_count} 商品</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{session.total_preorders} 預購</span>
                        </div>
                        {session.total_preorders > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${allocationRate}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {allocationRate}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {session.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyShareLink(session.id)
                          }}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          複製連結
                        </Button>
                      )}
                      <Link
                        href={`/admin/t/${tenant.slug}/sessions/${session.id}`}
                      >
                        <Button variant="ghost" size="icon" className="rounded-lg">
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}

        {sessions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">還沒有代購場次</p>
                <Link href={`/admin/t/${tenant.slug}/sessions/new`}>
                  <Button className="gradient-primary rounded-xl">
                    <Plus className="w-4 h-4 mr-2" />
                    建立第一個場次
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  )
}
