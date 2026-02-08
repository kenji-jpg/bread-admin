'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { updateTenantSettings } from '@/hooks/use-secure-mutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Tenant, TenantUser, JoinRequest, MaskedPaymentInfo, MaskedAdminLineIds, GenerateBindCodeResponse } from '@/types/database'
import { isMasked } from '@/types/database'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import {
    Settings,
    Store,
    CreditCard,
    MessageCircle,
    Save,
    Eye,
    EyeOff,
    Crown,
    Copy,
    Users,
    UserPlus,
    MoreVertical,
    Shield,
    ShieldOff,
    UserMinus,
    RefreshCw,
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    Mail,
    MessageSquare,
    Inbox,
    AlertTriangle,
    Smartphone,
    Link2,
    Link2Off,
    QrCode,
} from 'lucide-react'

type AssignableRole = 'admin' | 'staff' | 'viewer'

const roleLabels: Record<string, string> = {
    owner: '擁有者',
    admin: '管理員',
    staff: '員工',
    viewer: '檢視者',
}

const roleIcons: Record<string, React.ReactNode> = {
    owner: <Crown className="h-4 w-4 text-amber-500" />,
    admin: <Shield className="h-4 w-4 text-primary" />,
    staff: <Users className="h-4 w-4 text-muted-foreground" />,
    viewer: <Eye className="h-4 w-4 text-muted-foreground" />,
}

export default function SettingsPage() {
    const { tenant, isLoading: tenantLoading, refetch, isCrossTenantAccess } = useTenant()
    const [formData, setFormData] = useState<Partial<Tenant>>({})
    const [isSaving, setIsSaving] = useState(false)
    const [showToken, setShowToken] = useState(false)
    const [showSecret, setShowSecret] = useState(false)
    const [activeTab, setActiveTab] = useState('basic') // 控制當前 Tab
    const supabase = createClient()

    // 團隊成員狀態
    const [members, setMembers] = useState<(TenantUser & { email?: string })[]>([])
    const [callerRole, setCallerRole] = useState<string | null>(null)
    const [membersLoading, setMembersLoading] = useState(true)
    const [membersRefreshing, setMembersRefreshing] = useState(false)

    // 加入申請狀態
    const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
    const [requestsLoading, setRequestsLoading] = useState(true)

    // 對話框狀態
    const [showRoleDialog, setShowRoleDialog] = useState(false)
    const [showSuspendDialog, setShowSuspendDialog] = useState(false)
    const [showRemoveDialog, setShowRemoveDialog] = useState(false)
    const [showApproveDialog, setShowApproveDialog] = useState(false)
    const [showRejectDialog, setShowRejectDialog] = useState(false)
    const [selectedMember, setSelectedMember] = useState<TenantUser | null>(null)
    const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null)
    const [selectedRole, setSelectedRole] = useState<AssignableRole>('staff')
    const [processingId, setProcessingId] = useState<string | null>(null)

    // LINE 綁定碼狀態
    const [showBindCodeDialog, setShowBindCodeDialog] = useState(false)
    const [bindCodeData, setBindCodeData] = useState<{ code: string; expiresAt: Date } | null>(null)
    const [bindCodeCountdown, setBindCodeCountdown] = useState(0)
    const [generatingBindCode, setGeneratingBindCode] = useState(false)

    useEffect(() => {
        if (tenant) {
            // 處理可能被遮罩的欄位
            const paymentInfo = isMasked(tenant.payment_info) ? null : tenant.payment_info
            const adminLineIds = isMasked(tenant.admin_line_ids) ? [] : tenant.admin_line_ids

            setFormData({
                name: tenant.name,
                shop_description: tenant.shop_description,
                business_hours: tenant.business_hours,
                payment_info: paymentInfo as { bank: string; account: string; name: string } | null,
                // 敏感欄位不再從 tenant 載入（RPC 不回傳完整值）
                // 使用者需要輸入新值才會更新
                line_channel_token: '',
                line_channel_secret: '',
                line_oa_id: tenant.line_oa_id,
                admin_line_ids: adminLineIds as string[],
                myship_notify_email: tenant.myship_notify_email || '',
            })
        }
    }, [tenant])

    // 安全取得 payment_info（處理遮罩格式）
    const getPaymentInfo = useCallback(() => {
        if (!formData.payment_info || isMasked(formData.payment_info)) {
            return { bank: '', account: '', name: '' }
        }
        return formData.payment_info as { bank: string; account: string; name: string }
    }, [formData.payment_info])

    // 安全更新 payment_info 單一欄位
    const updatePaymentInfo = useCallback((field: 'bank' | 'account' | 'name', value: string) => {
        const current = getPaymentInfo()
        setFormData(prev => ({
            ...prev,
            payment_info: { ...current, [field]: value },
        }))
    }, [getPaymentInfo])

    // 取得團隊成員
    const fetchMembers = useCallback(async (showRefreshIndicator = false) => {
        if (!tenant?.id) return

        if (showRefreshIndicator) {
            setMembersRefreshing(true)
        }

        try {
            const { data, error } = await supabase.rpc('get_tenant_members', {
                p_tenant_id: tenant.id,
            }) as { data: { success: boolean; members: TenantUser[]; caller_role: string; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('載入成員失敗', { description: error.message })
                return
            }

            if (data?.success) {
                setMembers(data.members || [])
                setCallerRole(data.caller_role)
            } else {
                toast.error('載入成員失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setMembersLoading(false)
            setMembersRefreshing(false)
        }
    }, [tenant?.id, supabase])

    // 取得加入申請
    const fetchJoinRequests = useCallback(async () => {
        if (!tenant?.id) return

        try {
            const { data, error } = await supabase.rpc('get_pending_join_requests', {
                p_tenant_id: tenant.id,
            }) as { data: { success: boolean; requests: JoinRequest[]; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('載入申請失敗', { description: error.message })
                return
            }

            if (data?.success) {
                setJoinRequests(data.requests || [])
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setRequestsLoading(false)
        }
    }, [tenant?.id, supabase])

    useEffect(() => {
        if (!tenantLoading && tenant?.id) {
            fetchMembers()
            fetchJoinRequests()
        }
    }, [tenantLoading, tenant?.id, fetchMembers, fetchJoinRequests])

    // LINE 綁定碼倒數計時
    useEffect(() => {
        if (!bindCodeData) {
            setBindCodeCountdown(0)
            return
        }

        const updateCountdown = () => {
            const now = new Date()
            const remaining = Math.max(0, Math.floor((bindCodeData.expiresAt.getTime() - now.getTime()) / 1000))
            setBindCodeCountdown(remaining)

            if (remaining <= 0) {
                setBindCodeData(null)
            }
        }

        updateCountdown()
        const interval = setInterval(updateCountdown, 1000)
        return () => clearInterval(interval)
    }, [bindCodeData])

    // 生成 LINE 綁定碼
    const handleGenerateBindCode = async (member: TenantUser) => {
        if (!tenant?.id) {
            toast.error('生成失敗', { description: '找不到租戶資訊' })
            return
        }

        setSelectedMember(member)
        setGeneratingBindCode(true)

        try {
            if (process.env.NODE_ENV === 'development') console.log('[LINE Bind] Calling generate_admin_bind_code with tenant_id:', tenant.id)

            const { data, error } = await supabase.rpc('generate_admin_bind_code', {
                p_tenant_id: tenant.id,
            }) as { data: GenerateBindCodeResponse | null; error: Error | null }

            if (process.env.NODE_ENV === 'development') console.log('[LINE Bind] Response:', { data, error })

            if (error) {
                if (process.env.NODE_ENV === 'development') console.error('[LINE Bind] RPC Error:', error)
                toast.error('生成失敗', { description: error.message })
                return
            }

            if (data?.success && data.bind_code && data.expires_at) {
                setBindCodeData({
                    code: data.bind_code,
                    expiresAt: new Date(data.expires_at),
                })
                setShowBindCodeDialog(true)
                toast.success('綁定碼已生成')
            } else {
                if (process.env.NODE_ENV === 'development') console.warn('[LINE Bind] RPC returned failure:', data)
                toast.error('生成失敗', { description: data?.message || data?.error || '未知錯誤' })
            }
        } catch (err) {
            if (process.env.NODE_ENV === 'development') console.error('[LINE Bind] Unexpected error:', err)
            toast.error('系統發生錯誤', { description: err instanceof Error ? err.message : '請稍後再試' })
        } finally {
            setGeneratingBindCode(false)
        }
    }

    // 複製綁定指令
    const copyBindCommand = () => {
        if (!bindCodeData) return
        const command = `管理員綁定 ${bindCodeData.code}`
        navigator.clipboard.writeText(command)
        toast.success('已複製綁定指令', { description: command })
    }

    // 格式化倒數時間
    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleSave = async () => {
        if (!tenant) return

        setIsSaving(true)
        try {
            // 建立更新資料，只在有輸入新值時才包含敏感欄位
            // 遮罩欄位不傳送（跨租戶存取時會是 MaskedField 格式）
            const updateData: Parameters<typeof updateTenantSettings>[2] = {
                name: formData.name,
                shop_description: formData.shop_description,
                business_hours: formData.business_hours as { start: string; end: string } | null,
                payment_info: isMasked(formData.payment_info) ? undefined : formData.payment_info,
                line_oa_id: formData.line_oa_id,
                admin_line_ids: isMasked(formData.admin_line_ids) ? undefined : formData.admin_line_ids,
                myship_notify_email: formData.myship_notify_email || null,
            }

            // 只在使用者有輸入新值時才更新敏感欄位
            if (formData.line_channel_token && formData.line_channel_token.trim() !== '') {
                updateData.line_channel_token = formData.line_channel_token
            }
            if (formData.line_channel_secret && formData.line_channel_secret.trim() !== '') {
                updateData.line_channel_secret = formData.line_channel_secret
            }

            const result = await updateTenantSettings(supabase, tenant.id, updateData)

            if (!result.success) {
                toast.error(result.error || '儲存失敗')
                setIsSaving(false)
                return
            }

            toast.success('設定已儲存')
            // 清空敏感欄位輸入框
            setFormData(prev => ({
                ...prev,
                line_channel_token: '',
                line_channel_secret: '',
            }))
            refetch()
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '儲存失敗'
            toast.error(errorMessage)
        } finally {
            setIsSaving(false)
        }
    }

    // 更新角色
    const handleUpdateRole = async () => {
        if (!selectedMember) return

        setProcessingId(selectedMember.id)
        setShowRoleDialog(false)

        try {
            const { data, error } = await supabase.rpc('update_member_role', {
                p_tenant_user_id: selectedMember.id,
                p_new_role: selectedRole,
            }) as { data: { success: boolean; message?: string; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('更新失敗', { description: error.message })
                return
            }

            if (data?.success) {
                toast.success('角色已更新')
                fetchMembers()
            } else {
                toast.error('更新失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setProcessingId(null)
            setSelectedMember(null)
        }
    }

    // 停權/解除停權
    const handleToggleSuspension = async () => {
        if (!selectedMember) return

        setProcessingId(selectedMember.id)
        setShowSuspendDialog(false)

        try {
            const { data, error } = await supabase.rpc('toggle_member_suspension', {
                p_tenant_user_id: selectedMember.id,
            }) as { data: { success: boolean; is_suspended?: boolean; message?: string; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('操作失敗', { description: error.message })
                return
            }

            if (data?.success) {
                toast.success(data.message)
                fetchMembers()
            } else {
                toast.error('操作失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setProcessingId(null)
            setSelectedMember(null)
        }
    }

    // 移除成員
    const handleRemoveMember = async () => {
        if (!selectedMember) return

        setProcessingId(selectedMember.id)
        setShowRemoveDialog(false)

        try {
            const { data, error } = await supabase.rpc('remove_tenant_member', {
                p_tenant_user_id: selectedMember.id,
            }) as { data: { success: boolean; message?: string; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('移除失敗', { description: error.message })
                return
            }

            if (data?.success) {
                toast.success(data.message)
                fetchMembers()
            } else {
                toast.error('移除失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setProcessingId(null)
            setSelectedMember(null)
        }
    }

    // 核准申請
    const handleApproveRequest = async () => {
        if (!selectedRequest) return

        setProcessingId(selectedRequest.id)
        setShowApproveDialog(false)

        try {
            const { data, error } = await supabase.rpc('review_join_request', {
                p_request_id: selectedRequest.id,
                p_action: 'approve',
                p_assigned_role: selectedRole,
            }) as { data: { success: boolean; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('核准失敗', { description: error.message })
                return
            }

            if (data?.success) {
                toast.success('已核准申請', {
                    description: `${selectedRequest.requester_email} 已成為${roleLabels[selectedRole]}`,
                })
                setJoinRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id))
                fetchMembers()
            } else {
                toast.error('核准失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setProcessingId(null)
            setSelectedRequest(null)
            setSelectedRole('staff')
        }
    }

    // 拒絕申請
    const handleRejectRequest = async () => {
        if (!selectedRequest) return

        setProcessingId(selectedRequest.id)
        setShowRejectDialog(false)

        try {
            const { data, error } = await supabase.rpc('review_join_request', {
                p_request_id: selectedRequest.id,
                p_action: 'reject',
            }) as { data: { success: boolean; error?: string } | null; error: Error | null }

            if (error) {
                toast.error('拒絕失敗', { description: error.message })
                return
            }

            if (data?.success) {
                toast.success('已拒絕申請')
                setJoinRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id))
            } else {
                toast.error('拒絕失敗', { description: data?.error })
            }
        } catch {
            toast.error('發生錯誤')
        } finally {
            setProcessingId(null)
            setSelectedRequest(null)
        }
    }

    // 開啟對話框函數
    const openRoleDialog = (member: TenantUser) => {
        setSelectedMember(member)
        setSelectedRole(member.role === 'owner' ? 'admin' : member.role as AssignableRole)
        setShowRoleDialog(true)
    }

    const openSuspendDialog = (member: TenantUser) => {
        setSelectedMember(member)
        setShowSuspendDialog(true)
    }

    const openRemoveDialog = (member: TenantUser) => {
        setSelectedMember(member)
        setShowRemoveDialog(true)
    }

    const openApproveDialog = (request: JoinRequest) => {
        setSelectedRequest(request)
        setSelectedRole('staff')
        setShowApproveDialog(true)
    }

    const openRejectDialog = (request: JoinRequest) => {
        setSelectedRequest(request)
        setShowRejectDialog(true)
    }

    // 檢查是否可以管理某成員
    const canManageMember = (member: TenantUser) => {
        if (member.role === 'owner') return false
        if (callerRole === 'owner') return true
        if (callerRole === 'admin' && member.role !== 'admin') return true
        return false
    }

    if (tenantLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-64" />
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[200px] rounded-2xl" />
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

    const getPlanBadge = (plan: string) => {
        switch (plan) {
            case 'pro':
                return <Badge className="bg-gradient-to-r from-primary to-accent text-white">Pro</Badge>
            default:
                return <Badge className="bg-primary/20 text-primary border-primary/30">Basic</Badge>
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* 跨租戶存取提示 */}
            {isCrossTenantAccess && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/50 bg-amber-500/10">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-amber-500">超級管理員唯讀模式</p>
                        <p className="text-sm text-amber-500/80 mt-1">
                            您正在以超級管理員身份檢視其他租戶的設定。部分敏感資訊已隱藏，且無法進行編輯操作。
                        </p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">店家設定</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">管理店家資訊、團隊成員與權限</p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:grid-cols-none lg:inline-flex">
                    <TabsTrigger value="basic" className="gap-2">
                        <Store className="h-4 w-4" />
                        <span className="hidden sm:inline">基本資訊</span>
                    </TabsTrigger>
                    <TabsTrigger value="payment" className="gap-2">
                        <CreditCard className="h-4 w-4" />
                        <span className="hidden sm:inline">付款設定</span>
                    </TabsTrigger>
                    <TabsTrigger value="line" className="gap-2">
                        <MessageCircle className="h-4 w-4" />
                        <span className="hidden sm:inline">LINE 設定</span>
                    </TabsTrigger>
                    <TabsTrigger value="team" className="gap-2">
                        <Users className="h-4 w-4" />
                        <span className="hidden sm:inline">團隊管理</span>
                        {joinRequests.length > 0 && (
                            <Badge variant="destructive" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                                {joinRequests.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* 基本資訊 */}
                <TabsContent value="basic">
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Store className="h-5 w-5 text-primary" />
                                        基本資訊
                                    </CardTitle>
                                    <CardDescription>店家的公開資訊</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">店家名稱</Label>
                                        <Input
                                            id="name"
                                            value={formData.name || ''}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">店家描述</Label>
                                        <Input
                                            id="description"
                                            value={formData.shop_description || ''}
                                            onChange={(e) => setFormData({ ...formData, shop_description: e.target.value })}
                                            placeholder="簡短描述您的店家"
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>營業開始時間</Label>
                                            <Input
                                                type="time"
                                                value={formData.business_hours?.start || ''}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        business_hours: { ...formData.business_hours, start: e.target.value, end: formData.business_hours?.end || '' },
                                                    })
                                                }
                                                className="rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>營業結束時間</Label>
                                            <Input
                                                type="time"
                                                value={formData.business_hours?.end || ''}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        business_hours: { ...formData.business_hours, start: formData.business_hours?.start || '', end: e.target.value },
                                                    })
                                                }
                                                className="rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <Button
                                            onClick={handleSave}
                                            disabled={isSaving || isCrossTenantAccess}
                                            className="gradient-primary rounded-xl"
                                        >
                                            <Save className="mr-2 h-4 w-4" />
                                            {isSaving ? '儲存中...' : '儲存變更'}
                                        </Button>
                                        {isCrossTenantAccess && (
                                            <p className="text-xs text-amber-500 mt-2">跨租戶存取時無法編輯</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Crown className="h-5 w-5 text-warning" />
                                        方案資訊
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">目前方案</span>
                                        {getPlanBadge(tenant.plan || 'basic')}
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">訂閱狀態</span>
                                        <Badge
                                            className={
                                                tenant.subscription_status === 'active'
                                                    ? 'bg-success/20 text-success border-success/30'
                                                    : 'bg-destructive/20 text-destructive border-destructive/30'
                                            }
                                        >
                                            {tenant.subscription_status}
                                        </Badge>
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">本月訂單</span>
                                        <span className="font-medium">{tenant.monthly_orders || 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">本月訊息</span>
                                        <span className="font-medium">{tenant.monthly_messages || 0}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/50">
                                <CardHeader>
                                    <CardTitle>店家資訊</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Slug</span>
                                        <code className="text-xs bg-muted px-2 py-1 rounded">{tenant.slug}</code>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">建立時間</span>
                                        <span className="text-sm">
                                            {new Date(tenant.created_at).toLocaleDateString('zh-TW')}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* 付款設定 */}
                <TabsContent value="payment">
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-primary" />
                                付款資訊
                            </CardTitle>
                            <CardDescription>收款帳戶資訊</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* 跨租戶存取時顯示遮罩提示 */}
                            {isCrossTenantAccess && isMasked(tenant?.payment_info) ? (
                                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
                                    <div className="flex items-center gap-2 text-amber-500">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span className="font-medium">敏感資訊已隱藏</span>
                                    </div>
                                    <p className="text-sm text-amber-500/80 mt-1">
                                        {(tenant?.payment_info as MaskedPaymentInfo)?.has_payment_info
                                            ? '此租戶已設定付款資訊'
                                            : '此租戶尚未設定付款資訊'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid gap-4 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>銀行名稱</Label>
                                            <Input
                                                value={getPaymentInfo().bank}
                                                onChange={(e) => updatePaymentInfo('bank', e.target.value)}
                                                placeholder="例：國泰世華"
                                                className="rounded-xl"
                                                disabled={isCrossTenantAccess}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>帳號</Label>
                                            <Input
                                                value={getPaymentInfo().account}
                                                onChange={(e) => updatePaymentInfo('account', e.target.value)}
                                                placeholder="銀行帳號"
                                                className="rounded-xl"
                                                disabled={isCrossTenantAccess}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>戶名</Label>
                                            <Input
                                                value={getPaymentInfo().name}
                                                onChange={(e) => updatePaymentInfo('name', e.target.value)}
                                                placeholder="帳戶戶名"
                                                className="rounded-xl"
                                                disabled={isCrossTenantAccess}
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <Button
                                            onClick={handleSave}
                                            disabled={isSaving || isCrossTenantAccess}
                                            className="gradient-primary rounded-xl"
                                        >
                                            <Save className="mr-2 h-4 w-4" />
                                            {isSaving ? '儲存中...' : '儲存變更'}
                                        </Button>
                                        {isCrossTenantAccess && (
                                            <p className="text-xs text-amber-500 mt-2">跨租戶存取時無法編輯</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* LINE 設定 */}
                <TabsContent value="line">
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MessageCircle className="h-5 w-5 text-primary" />
                                LINE 設定
                            </CardTitle>
                            <CardDescription>LINE Official Account 設定</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Webhook URL</Label>
                                <div className="flex gap-2">
                                    <Input
                                        readOnly
                                        value={`https://kashgsxlrdyuirijocld.supabase.co/functions/v1/line-webhook?tenant_id=${tenant.id}`}
                                        className="rounded-xl bg-muted font-mono text-xs md:text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            navigator.clipboard.writeText(
                                                `https://kashgsxlrdyuirijocld.supabase.co/functions/v1/line-webhook?tenant_id=${tenant.id}`
                                            )
                                            toast.success('已複製 Webhook URL')
                                        }}
                                        className="shrink-0"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    請將此網址貼到 LINE Developers Console 的 Messaging API Webhook settings。
                                </p>
                            </div>
                            <Separator />
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>LINE OA ID</Label>
                                    <Input
                                        value={formData.line_oa_id || ''}
                                        onChange={(e) => setFormData({ ...formData, line_oa_id: e.target.value })}
                                        placeholder="@xxx"
                                        className="rounded-xl"
                                        disabled={isCrossTenantAccess}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Channel Access Token</Label>
                                    {tenant.has_line_channel_token && !formData.line_channel_token && (
                                        <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                            已設定 ✓
                                        </Badge>
                                    )}
                                </div>
                                <div className="relative">
                                    <Input
                                        type={showToken ? 'text' : 'password'}
                                        value={formData.line_channel_token || ''}
                                        onChange={(e) => setFormData({ ...formData, line_channel_token: e.target.value })}
                                        placeholder={tenant.has_line_channel_token ? '輸入新的 Token 以更新' : '請輸入 Token'}
                                        className="rounded-xl pr-10"
                                        disabled={isCrossTenantAccess}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                        onClick={() => setShowToken(!showToken)}
                                        disabled={isCrossTenantAccess}
                                    >
                                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {isCrossTenantAccess
                                        ? '跨租戶存取時無法查看或修改此設定'
                                        : tenant.has_line_channel_token
                                        ? '基於安全考量，已儲存的 Token 不會顯示。如需更新請輸入新值。'
                                        : '請從 LINE Developers Console 取得 Channel Access Token'}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Channel Secret</Label>
                                    {tenant.has_line_channel_secret && !formData.line_channel_secret && (
                                        <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                            已設定 ✓
                                        </Badge>
                                    )}
                                </div>
                                <div className="relative">
                                    <Input
                                        type={showSecret ? 'text' : 'password'}
                                        value={formData.line_channel_secret || ''}
                                        onChange={(e) => setFormData({ ...formData, line_channel_secret: e.target.value })}
                                        placeholder={tenant.has_line_channel_secret ? '輸入新的 Secret 以更新' : '請輸入 Secret'}
                                        className="rounded-xl pr-10"
                                        disabled={isCrossTenantAccess}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                                        onClick={() => setShowSecret(!showSecret)}
                                        disabled={isCrossTenantAccess}
                                    >
                                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {isCrossTenantAccess
                                        ? '跨租戶存取時無法查看或修改此設定'
                                        : tenant.has_line_channel_secret
                                        ? '基於安全考量，已儲存的 Secret 不會顯示。如需更新請輸入新值。'
                                        : '請從 LINE Developers Console 取得 Channel Secret'}
                                </p>
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    賣貨便通知 Email
                                </Label>
                                <Input
                                    type="email"
                                    value={formData.myship_notify_email || ''}
                                    onChange={(e) => setFormData({ ...formData, myship_notify_email: e.target.value })}
                                    placeholder="如 store1@yourdomain.com"
                                    className="rounded-xl"
                                    disabled={isCrossTenantAccess}
                                />
                                <p className="text-xs text-muted-foreground">
                                    設定此 Email 後，賣貨便的訂單通知會自動更新結帳單出貨狀態。請在賣貨便賣家中心填入此 Email 作為通知信箱。
                                </p>
                                {formData.myship_notify_email && (
                                    <Badge variant="outline" className="text-xs">
                                        {formData.myship_notify_email}
                                    </Badge>
                                )}
                            </div>
                            <div className="pt-4">
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving || isCrossTenantAccess}
                                    className="gradient-primary rounded-xl"
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    {isSaving ? '儲存中...' : '儲存變更'}
                                </Button>
                                {isCrossTenantAccess && (
                                    <p className="text-xs text-amber-500 mt-2">跨租戶存取時無法編輯</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 團隊管理 */}
                <TabsContent value="team" className="space-y-6">
                    {/* 成員列表 */}
                    <Card className="border-border/50">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Users className="h-5 w-5 text-primary" />
                                        團隊成員
                                        <Badge variant="secondary" className="ml-2">
                                            {members.length} 人
                                        </Badge>
                                    </CardTitle>
                                    <CardDescription>管理店家的團隊成員與權限</CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchMembers(true)}
                                    disabled={membersRefreshing}
                                >
                                    {membersRefreshing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {membersLoading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-16 rounded-xl" />
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {members.map((member) => (
                                        <div
                                            key={member.id}
                                            className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border gap-3 ${
                                                member.is_suspended ? 'bg-muted/50 opacity-60' : 'bg-muted/30'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                                    {roleIcons[member.role]}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium">
                                                            {member.display_name || member.email}
                                                        </span>
                                                        {member.is_suspended && (
                                                            <Badge variant="destructive" className="text-xs">
                                                                已停權
                                                            </Badge>
                                                        )}
                                                        {/* LINE 綁定狀態 */}
                                                        {member.line_user_id ? (
                                                            <Badge className="bg-[#06C755]/20 text-[#06C755] border-[#06C755]/30 text-xs">
                                                                <Link2 className="w-3 h-3 mr-1" />
                                                                LINE 已綁定
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-muted-foreground text-xs">
                                                                <Link2Off className="w-3 h-3 mr-1" />
                                                                LINE 未綁定
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Mail className="h-3 w-3" />
                                                        {member.email}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 ml-14 md:ml-0">
                                                <Badge
                                                    variant={member.role === 'owner' ? 'default' : 'secondary'}
                                                    className={member.role === 'owner' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : ''}
                                                >
                                                    {roleLabels[member.role]}
                                                </Badge>
                                                {/* LINE 綁定碼按鈕：未綁定時顯示 */}
                                                {!member.line_user_id && !member.is_suspended && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleGenerateBindCode(member)}
                                                        disabled={generatingBindCode}
                                                        className="text-[#06C755] border-[#06C755]/50 hover:bg-[#06C755]/10"
                                                    >
                                                        {generatingBindCode && selectedMember?.id === member.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <QrCode className="w-4 h-4 mr-1" />
                                                                生成綁定碼
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                                {canManageMember(member) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={processingId === member.id}
                                                            >
                                                                {processingId === member.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <MoreVertical className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => openRoleDialog(member)}>
                                                                <Shield className="mr-2 h-4 w-4" />
                                                                變更角色
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => openSuspendDialog(member)}>
                                                                {member.is_suspended ? (
                                                                    <>
                                                                        <Shield className="mr-2 h-4 w-4" />
                                                                        解除停權
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ShieldOff className="mr-2 h-4 w-4" />
                                                                        停權
                                                                    </>
                                                                )}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => openRemoveDialog(member)}
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <UserMinus className="mr-2 h-4 w-4" />
                                                                移除成員
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* 待審核申請 */}
                    <Card className="border-border/50">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <UserPlus className="h-5 w-5 text-primary" />
                                        待審核申請
                                        {joinRequests.length > 0 && (
                                            <Badge variant="destructive" className="ml-2">
                                                {joinRequests.length}
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription>審核用戶的加入店家申請</CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchJoinRequests}
                                    disabled={requestsLoading}
                                >
                                    {requestsLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {requestsLoading ? (
                                <div className="space-y-3">
                                    {[1, 2].map((i) => (
                                        <Skeleton key={i} className="h-20 rounded-xl" />
                                    ))}
                                </div>
                            ) : joinRequests.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                                        <Inbox className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                    <p className="text-muted-foreground">目前沒有待審核的申請</p>
                                </div>
                            ) : (
                                <AnimatePresence>
                                    <div className="space-y-3">
                                        {joinRequests.map((request, index) => (
                                            <motion.div
                                                key={request.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: -100 }}
                                                transition={{ delay: index * 0.05 }}
                                                className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border bg-muted/30 gap-4"
                                            >
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{request.requester_email}</span>
                                                        <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                                                            <Clock className="w-3 h-3 mr-1" />
                                                            待審核
                                                        </Badge>
                                                    </div>
                                                    {request.message && (
                                                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                                            <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                            <span className="italic">&ldquo;{request.message}&rdquo;</span>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        申請時間：{format(new Date(request.created_at), 'yyyy/MM/dd HH:mm', { locale: zhTW })}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openRejectDialog(request)}
                                                        disabled={processingId === request.id}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        {processingId === request.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                拒絕
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => openApproveDialog(request)}
                                                        disabled={processingId === request.id}
                                                        className="bg-success hover:bg-success/90"
                                                    >
                                                        {processingId === request.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                                核准
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </AnimatePresence>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* 變更角色對話框 */}
            <AlertDialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>變更成員角色</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>
                                    變更 <span className="font-medium text-foreground">{selectedMember?.email}</span> 的角色
                                </p>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">選擇新角色</label>
                                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AssignableRole)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">管理員 - 可管理大部分功能</SelectItem>
                                            <SelectItem value="staff">員工 - 可操作日常功能</SelectItem>
                                            <SelectItem value="viewer">檢視者 - 僅可查看資料</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpdateRole}>
                            確定變更
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 停權對話框 */}
            <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {selectedMember?.is_suspended ? '解除停權' : '停權成員'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedMember?.is_suspended
                                ? `確定要解除 ${selectedMember?.email} 的停權嗎？解除後該成員將可以再次存取店家。`
                                : `確定要停權 ${selectedMember?.email} 嗎？停權後該成員將無法存取店家，但資料會保留。`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleToggleSuspension}
                            className={selectedMember?.is_suspended ? '' : 'bg-destructive hover:bg-destructive/90'}
                        >
                            {selectedMember?.is_suspended ? '解除停權' : '確定停權'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 移除成員對話框 */}
            <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>移除成員</AlertDialogTitle>
                        <AlertDialogDescription>
                            確定要將 <span className="font-medium text-foreground">{selectedMember?.email}</span> 從店家移除嗎？
                            此操作無法復原，若要重新加入需再次申請。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRemoveMember}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            <UserMinus className="w-4 h-4 mr-1" />
                            確定移除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 核准申請對話框 */}
            <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>核准加入申請</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>
                                    確定要核准 <span className="font-medium text-foreground">{selectedRequest?.requester_email}</span> 的加入申請嗎？
                                </p>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">指派角色</label>
                                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AssignableRole)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">管理員 - 可管理大部分功能</SelectItem>
                                            <SelectItem value="staff">員工 - 可操作日常功能</SelectItem>
                                            <SelectItem value="viewer">檢視者 - 僅可查看資料</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveRequest} className="bg-success hover:bg-success/90">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            確定核准
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 拒絕申請對話框 */}
            <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>拒絕加入申請</AlertDialogTitle>
                        <AlertDialogDescription>
                            確定要拒絕 <span className="font-medium text-foreground">{selectedRequest?.requester_email}</span> 的加入申請嗎？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRejectRequest} className="bg-destructive hover:bg-destructive/90">
                            <XCircle className="w-4 h-4 mr-1" />
                            確定拒絕
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* LINE 綁定碼對話框 */}
            <AlertDialog open={showBindCodeDialog} onOpenChange={setShowBindCodeDialog}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Smartphone className="h-5 w-5 text-[#06C755]" />
                            LINE 管理員綁定
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>
                                    請在 LINE 官方帳號中輸入以下指令完成綁定：
                                </p>

                                {/* 綁定碼顯示 */}
                                <div className="p-6 bg-muted rounded-xl text-center space-y-3">
                                    <p className="text-sm text-muted-foreground">綁定碼</p>
                                    <p className="text-4xl font-mono font-bold tracking-widest text-foreground">
                                        {bindCodeData?.code || '------'}
                                    </p>
                                    {/* 倒數計時 */}
                                    {bindCodeCountdown > 0 ? (
                                        <div className="flex items-center justify-center gap-2 text-sm">
                                            <Clock className="w-4 h-4 text-amber-500" />
                                            <span className="text-amber-500">
                                                有效時間：{formatCountdown(bindCodeCountdown)}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                                            <XCircle className="w-4 h-4" />
                                            <span>綁定碼已過期</span>
                                        </div>
                                    )}
                                </div>

                                {/* 複製按鈕 */}
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={copyBindCommand}
                                    disabled={!bindCodeData || bindCodeCountdown <= 0}
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    複製綁定指令
                                </Button>

                                {/* 使用說明 */}
                                <div className="p-4 bg-[#06C755]/10 rounded-xl border border-[#06C755]/30">
                                    <p className="text-sm font-medium text-[#06C755] mb-2">
                                        📱 操作步驟
                                    </p>
                                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                                        <li>開啟 LINE 應用程式</li>
                                        <li>進入店家的 LINE 官方帳號聊天室</li>
                                        <li>輸入：<code className="bg-muted px-1 rounded">管理員綁定 {bindCodeData?.code || 'XXXXXX'}</code></li>
                                        <li>收到「綁定成功」訊息即完成</li>
                                    </ol>
                                </div>

                                <p className="text-xs text-muted-foreground text-center">
                                    ⚠️ 綁定碼有效期限為 10 分鐘，過期請重新生成
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>關閉</AlertDialogCancel>
                        {bindCodeCountdown <= 0 && (
                            <AlertDialogAction
                                onClick={() => {
                                    setShowBindCodeDialog(false)
                                    if (selectedMember) {
                                        handleGenerateBindCode(selectedMember)
                                    }
                                }}
                                className="bg-[#06C755] hover:bg-[#06C755]/90"
                            >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                重新生成
                            </AlertDialogAction>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
