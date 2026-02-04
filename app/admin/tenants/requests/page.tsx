'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    ArrowLeft,
    FileText,
    RefreshCw,
    Store,
    Mail,
    Calendar,
    MessageSquare,
    Inbox,
} from 'lucide-react'
import Link from 'next/link'
import type {
    GetPendingCreateRequestsResponse,
    ReviewCreateRequestResponse,
    PendingCreateRequest,
} from '@/types/database'

export default function TenantRequestsPage() {
    const { isSuperAdmin, isLoading: authLoading } = useAuth()
    const [requests, setRequests] = useState<PendingCreateRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)

    // 拒絕對話框狀態
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
    const [rejectingRequest, setRejectingRequest] = useState<PendingCreateRequest | null>(null)
    const [rejectReason, setRejectReason] = useState('')

    // 核准確認對話框狀態
    const [approveDialogOpen, setApproveDialogOpen] = useState(false)
    const [approvingRequest, setApprovingRequest] = useState<PendingCreateRequest | null>(null)

    const supabase = createClient()

    // 載入待審核申請
    const loadRequests = useCallback(async () => {
        setIsLoading(true)
        try {
            const { data, error } = await supabase.rpc('get_pending_create_requests')

            if (error) {
                toast.error('載入失敗：' + error.message)
                return
            }

            const result = data as GetPendingCreateRequestsResponse

            if (!result.success) {
                toast.error(result.error)
                return
            }

            setRequests(result.requests)
        } catch (err) {
            console.error('Error loading requests:', err)
            toast.error('載入失敗')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        if (!authLoading && isSuperAdmin) {
            loadRequests()
        }
    }, [authLoading, isSuperAdmin, loadRequests])

    // 核准申請
    const handleApprove = async () => {
        if (!approvingRequest) return

        setProcessingId(approvingRequest.id)

        try {
            const { data, error } = await supabase.rpc('review_create_request', {
                p_request_id: approvingRequest.id,
                p_action: 'approve',
            }) as { data: ReviewCreateRequestResponse | null; error: Error | null }

            if (error) {
                toast.error('核准失敗：' + error.message)
                return
            }

            if (!data?.success) {
                toast.error(data?.error || '核准失敗')
                return
            }

            if (data.action === 'approved') {
                toast.success(`已核准！租戶「${data.tenant_slug}」建立成功`)
            }

            // 從列表移除
            setRequests(prev => prev.filter(r => r.id !== approvingRequest.id))
            setApproveDialogOpen(false)
            setApprovingRequest(null)
        } catch {
            toast.error('核准失敗')
        } finally {
            setProcessingId(null)
        }
    }

    // 拒絕申請
    const handleReject = async () => {
        if (!rejectingRequest) return

        setProcessingId(rejectingRequest.id)

        try {
            const { data, error } = await supabase.rpc('review_create_request', {
                p_request_id: rejectingRequest.id,
                p_action: 'reject',
                p_reject_reason: rejectReason.trim() || null,
            }) as { data: ReviewCreateRequestResponse | null; error: Error | null }

            if (error) {
                toast.error('拒絕失敗：' + error.message)
                return
            }

            if (!data?.success) {
                toast.error(data?.error || '拒絕失敗')
                return
            }

            toast.success('已拒絕申請')

            // 從列表移除
            setRequests(prev => prev.filter(r => r.id !== rejectingRequest.id))
            setRejectDialogOpen(false)
            setRejectingRequest(null)
            setRejectReason('')
        } catch {
            toast.error('拒絕失敗')
        } finally {
            setProcessingId(null)
        }
    }

    const openApproveDialog = (request: PendingCreateRequest) => {
        setApprovingRequest(request)
        setApproveDialogOpen(true)
    }

    const openRejectDialog = (request: PendingCreateRequest) => {
        setRejectingRequest(request)
        setRejectReason('')
        setRejectDialogOpen(true)
    }

    const getPlanBadge = (plan: string) => {
        switch (plan) {
            case 'pro':
                return <Badge className="bg-gradient-to-r from-primary to-accent text-white border-0">Pro</Badge>
            default:
                return <Badge className="bg-primary/20 text-primary border-primary/30">Basic</Badge>
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    // 非超管無權限
    if (!authLoading && !isSuperAdmin) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">您沒有權限存取此頁面</p>
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
                <div className="flex items-center gap-4">
                    <Link href="/admin/tenants">
                        <Button variant="ghost" size="icon" className="rounded-xl">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            <span className="gradient-text">租戶建立審核</span>
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            審核用戶提交的租戶建立申請
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-3 py-1">
                        <Clock className="h-3 w-3 mr-1" />
                        {requests.length} 筆待審核
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadRequests}
                        disabled={isLoading}
                        className="rounded-xl"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        重新整理
                    </Button>
                </div>
            </div>

            {/* Content */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        待審核申請
                    </CardTitle>
                    <CardDescription>
                        審核並決定是否核准用戶建立租戶的申請
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                <Inbox className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium">目前沒有待審核的申請</h3>
                            <p className="text-muted-foreground mt-1">
                                當有新的租戶建立申請時，會顯示在這裡
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>申請者</TableHead>
                                    <TableHead>租戶資訊</TableHead>
                                    <TableHead>方案</TableHead>
                                    <TableHead>留言</TableHead>
                                    <TableHead>申請時間</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">{request.requester_email}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Store className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium">{request.tenant_name}</span>
                                                </div>
                                                <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                    {request.tenant_slug}
                                                </code>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {getPlanBadge(request.plan_code)}
                                        </TableCell>
                                        <TableCell>
                                            {request.message ? (
                                                <div
                                                    className="flex items-center gap-1 text-sm text-muted-foreground cursor-help"
                                                    title={request.message}
                                                >
                                                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                                                    <span className="max-w-[150px] truncate">
                                                        {request.message}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Calendar className="h-4 w-4" />
                                                {formatDate(request.created_at)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => openApproveDialog(request)}
                                                    disabled={processingId === request.id}
                                                    className="bg-success hover:bg-success/90 text-white"
                                                >
                                                    {processingId === request.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <CheckCircle className="h-4 w-4 mr-1" />
                                                            核准
                                                        </>
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => openRejectDialog(request)}
                                                    disabled={processingId === request.id}
                                                >
                                                    {processingId === request.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <XCircle className="h-4 w-4 mr-1" />
                                                            拒絕
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* 核准確認對話框 */}
            <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>確認核准</DialogTitle>
                        <DialogDescription>
                            確定要核准此租戶建立申請嗎？
                        </DialogDescription>
                    </DialogHeader>
                    {approvingRequest && (
                        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">申請者</span>
                                <span>{approvingRequest.requester_email}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">店家名稱</span>
                                <span className="font-medium">{approvingRequest.tenant_name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">網址代號</span>
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {approvingRequest.tenant_slug}
                                </code>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">方案</span>
                                {getPlanBadge(approvingRequest.plan_code)}
                            </div>
                            {approvingRequest.message && (
                                <div className="pt-2 border-t">
                                    <span className="text-muted-foreground text-sm">留言</span>
                                    <p className="text-sm mt-1">{approvingRequest.message}</p>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setApproveDialogOpen(false)}
                            disabled={processingId !== null}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleApprove}
                            disabled={processingId !== null}
                            className="bg-success hover:bg-success/90 text-white"
                        >
                            {processingId ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    處理中...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    確認核准
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 拒絕對話框 */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>拒絕申請</DialogTitle>
                        <DialogDescription>
                            請輸入拒絕原因（選填），讓申請者了解為何被拒絕
                        </DialogDescription>
                    </DialogHeader>
                    {rejectingRequest && (
                        <>
                            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">申請者</span>
                                    <span>{rejectingRequest.requester_email}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">店家名稱</span>
                                    <span className="font-medium">{rejectingRequest.tenant_name}</span>
                                </div>
                                {rejectingRequest.message && (
                                    <div className="pt-2 border-t">
                                        <span className="text-muted-foreground text-sm">留言</span>
                                        <p className="text-sm mt-1">{rejectingRequest.message}</p>
                                    </div>
                                )}
                            </div>
                            <Textarea
                                placeholder="請輸入拒絕原因..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                            />
                        </>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRejectDialogOpen(false)}
                            disabled={processingId !== null}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={processingId !== null}
                        >
                            {processingId ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    處理中...
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    確認拒絕
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}
