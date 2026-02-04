'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Store, Send, ArrowLeft, LogOut, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import type {
    GetMyCreateRequestResponse,
    RequestCreateTenantResponse,
    MyCreateRequest
} from '@/types/database'

// 網址代號驗證規則
const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/

type PageState = 'loading' | 'form' | 'pending' | 'rejected'

export default function CreateNewTenantPage() {
    const { user, isLoading: authLoading, signOut } = useAuth()
    const [pageState, setPageState] = useState<PageState>('loading')
    const [existingRequest, setExistingRequest] = useState<MyCreateRequest | null>(null)

    // 表單狀態
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [slugError, setSlugError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    // 檢查用戶現有的申請狀態
    const checkExistingRequest = useCallback(async () => {
        try {
            const { data, error: rpcError } = await supabase.rpc('get_my_create_request')

            if (rpcError) {
                console.error('Error checking request:', rpcError)
                setPageState('form')
                return
            }

            const result = data as GetMyCreateRequestResponse

            if (!result.success) {
                setPageState('form')
                return
            }

            if (!result.has_request) {
                setPageState('form')
                return
            }

            const request = result.request

            switch (request.status) {
                case 'pending':
                    setExistingRequest(request)
                    setPageState('pending')
                    break
                case 'approved':
                    // 已核准，跳轉到租戶管理頁
                    router.replace(`/admin/t/${request.tenant_slug}`)
                    break
                case 'rejected':
                    setExistingRequest(request)
                    setPageState('rejected')
                    break
            }
        } catch (err) {
            console.error('Error checking request:', err)
            setPageState('form')
        }
    }, [supabase, router])

    useEffect(() => {
        // 如果未登入，跳轉到登入頁
        if (!authLoading && !user) {
            router.replace('/login')
            return
        }

        // 登入後檢查申請狀態
        if (!authLoading && user) {
            checkExistingRequest()
        }
    }, [authLoading, user, router, checkExistingRequest])

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    const getUserInitials = () => {
        if (!user?.email) return 'U'
        return user.email.charAt(0).toUpperCase()
    }

    // 自動產生 slug
    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30)
    }

    const handleNameChange = (value: string) => {
        setName(value)
        const newSlug = generateSlug(value)
        setSlug(newSlug)
        validateSlug(newSlug)
    }

    const handleSlugChange = (value: string) => {
        const formattedSlug = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
        setSlug(formattedSlug)
        validateSlug(formattedSlug)
    }

    const validateSlug = (value: string) => {
        if (!value) {
            setSlugError('請輸入網址代號')
            return false
        }
        if (value.length < 3) {
            setSlugError('網址代號至少需要 3 個字元')
            return false
        }
        if (!slugRegex.test(value)) {
            setSlugError('只能使用小寫英文、數字和連字號（不能以連字號開頭或結尾）')
            return false
        }
        setSlugError(null)
        return true
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!name.trim()) {
            setError('請輸入店家名稱')
            return
        }

        if (!validateSlug(slug)) {
            return
        }

        setIsSubmitting(true)

        try {
            const { data, error: rpcError } = await supabase.rpc('request_create_tenant', {
                p_name: name.trim(),
                p_slug: slug.trim(),
                p_plan_code: 'basic',
                p_message: message.trim() || null,
            }) as { data: RequestCreateTenantResponse | null; error: Error | null }

            if (rpcError) {
                setError(rpcError.message)
                return
            }

            if (!data?.success) {
                setError(data?.error || '申請失敗')
                return
            }

            // 申請成功！顯示審核中狀態
            setExistingRequest({
                id: data.request_id,
                tenant_name: name.trim(),
                tenant_slug: slug.trim(),
                status: 'pending',
                reject_reason: null,
                created_at: new Date().toISOString(),
                reviewed_at: null,
            })
            setPageState('pending')
        } catch {
            setError('發生未知錯誤，請稍後再試')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleRetryApply = () => {
        setExistingRequest(null)
        setName('')
        setSlug('')
        setMessage('')
        setError(null)
        setSlugError(null)
        setPageState('form')
    }

    // Loading 狀態
    if (authLoading || !user || pageState === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">載入中...</p>
                </div>
            </div>
        )
    }

    // 共用的背景和用戶選單
    const renderBackground = () => (
        <>
            {/* Top Right User Menu */}
            <div className="absolute top-4 right-4 z-20">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                    {getUserInitials()}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">我的帳號</p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    {user?.email}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>登出</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

            {/* Floating Orbs */}
            <motion.div
                className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"
                animate={{
                    x: [0, 50, 0],
                    y: [0, 30, 0],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />
            <motion.div
                className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"
                animate={{
                    x: [0, -30, 0],
                    y: [0, -50, 0],
                    scale: [1, 1.15, 1],
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />
        </>
    )

    // 審核中畫面
    if (pageState === 'pending' && existingRequest) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
                {renderBackground()}

                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="relative z-10 w-full max-w-md"
                >
                    <Card className="glass-strong shadow-glow border-border/50">
                        <CardHeader className="text-center space-y-4">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200 }}
                                className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center"
                            >
                                <Clock className="w-8 h-8 text-amber-500" />
                            </motion.div>
                            <CardTitle className="text-2xl">申請審核中</CardTitle>
                            <CardDescription className="space-y-2">
                                <p>
                                    您的店家申請 <span className="font-medium text-foreground">「{existingRequest.tenant_name}」</span> 正在等待管理員審核
                                </p>
                                <p className="text-sm">
                                    審核通過後，您將可以直接進入管理後台
                                </p>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">店家名稱</span>
                                    <span className="font-medium">{existingRequest.tenant_name}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">網址代號</span>
                                    <span className="font-mono">{existingRequest.tenant_slug}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">申請時間</span>
                                    <span>{new Date(existingRequest.created_at).toLocaleString('zh-TW')}</span>
                                </div>
                            </div>
                            <Button
                                onClick={() => router.push('/create-tenant')}
                                className="w-full h-12"
                                variant="outline"
                            >
                                返回選擇頁面
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        )
    }

    // 被拒絕畫面
    if (pageState === 'rejected' && existingRequest) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
                {renderBackground()}

                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="relative z-10 w-full max-w-md"
                >
                    <Card className="glass-strong shadow-glow border-border/50">
                        <CardHeader className="text-center space-y-4">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 200 }}
                                className="mx-auto w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center"
                            >
                                <XCircle className="w-8 h-8 text-destructive" />
                            </motion.div>
                            <CardTitle className="text-2xl">申請未通過</CardTitle>
                            <CardDescription>
                                很抱歉，您的店家申請 <span className="font-medium text-foreground">「{existingRequest.tenant_name}」</span> 未通過審核
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {existingRequest.reject_reason && (
                                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                                    <p className="text-sm font-medium text-destructive mb-1">拒絕原因</p>
                                    <p className="text-sm text-muted-foreground">{existingRequest.reject_reason}</p>
                                </div>
                            )}
                            <Button
                                onClick={handleRetryApply}
                                className="w-full h-12 bg-gradient-to-r from-violet-500 to-purple-600"
                            >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                重新申請
                            </Button>
                            <Button
                                onClick={() => router.push('/create-tenant')}
                                className="w-full h-12"
                                variant="outline"
                            >
                                返回選擇頁面
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        )
    }

    // 申請表單
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {renderBackground()}

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Back Button */}
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => router.push('/create-tenant')}
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回選擇
                </motion.button>

                <Card className="glass-strong shadow-glow border-border/50">
                    <CardHeader className="text-center space-y-4 pb-2">
                        {/* Logo */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg"
                        >
                            <Store className="w-8 h-8 text-white" />
                        </motion.div>

                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-bold tracking-tight">
                                <span className="gradient-text">申請建立店家</span>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                填寫資料後送出申請，等待管理員審核
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">
                                    店家名稱 <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="我的團購小舖"
                                    value={name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    required
                                    disabled={isSubmitting}
                                    className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="slug" className="text-sm font-medium">
                                    網址代號 <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="slug"
                                    type="text"
                                    placeholder="my-shop"
                                    value={slug}
                                    onChange={(e) => handleSlugChange(e.target.value)}
                                    required
                                    disabled={isSubmitting}
                                    className={`h-12 bg-background/50 border-border/50 focus:border-primary transition-colors font-mono ${slugError ? 'border-destructive' : ''}`}
                                />
                                {slugError ? (
                                    <p className="text-sm text-destructive">{slugError}</p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        此代號將用於您的店家後台網址：/admin/t/<span className="font-mono text-foreground">{slug || 'your-slug'}</span>
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message" className="text-sm font-medium">
                                    申請留言 <span className="text-muted-foreground">（選填）</span>
                                </Label>
                                <Textarea
                                    id="message"
                                    placeholder="簡單說明您想建立店家的原因..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    disabled={isSubmitting}
                                    rows={3}
                                    className="bg-background/50 border-border/50 focus:border-primary transition-colors resize-none"
                                />
                            </div>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <Button
                                type="submit"
                                disabled={isSubmitting || !!slugError}
                                className="w-full h-12 text-base font-medium bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 transition-opacity"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        送出中...
                                    </>
                                ) : (
                                    <>
                                        <Send className="mr-2 h-4 w-4" />
                                        送出申請
                                    </>
                                )}
                            </Button>

                        </form>
                    </CardContent>
                </Card>

                {/* Footer */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-sm text-muted-foreground mt-6"
                >
                    © 2026 LINE 團購管理系統
                </motion.p>
            </motion.div>
        </div>
    )
}
