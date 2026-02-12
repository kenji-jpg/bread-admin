'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Loader2, UserPlus, Send, ArrowLeft, CheckCircle, Clock, LogOut } from 'lucide-react'

interface RequestJoinResponse {
    success: boolean
    request_id?: string
    tenant_name?: string
    message?: string
    error?: string
}

function JoinTenantContent() {
    const { user, isLoading: authLoading, signOut } = useAuth()
    const searchParams = useSearchParams()
    const [slug, setSlug] = useState(searchParams.get('slug') || '')
    const [message, setMessage] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [tenantName, setTenantName] = useState('')
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        // 如果未登入，跳轉到登入頁
        if (!authLoading && !user) {
            router.replace('/login')
        }
    }, [authLoading, user, router])

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    const getUserInitials = () => {
        if (!user?.email) return 'U'
        return user.email.charAt(0).toUpperCase()
    }

    const handleSlugChange = (value: string) => {
        // 只允許小寫英文、數字和連字號
        const formattedSlug = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
        setSlug(formattedSlug)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!slug.trim()) {
            setError('請輸入店家網址代號')
            return
        }

        setIsLoading(true)

        try {
            const { data, error: rpcError } = await supabase.rpc('request_join_tenant', {
                p_tenant_slug: slug.trim(),
                p_message: message.trim() || null,
            }) as { data: RequestJoinResponse | null; error: Error | null }

            if (rpcError) {
                setError(rpcError.message)
                setIsLoading(false)
                return
            }

            if (!data?.success) {
                setError(data?.error || '申請失敗')
                setIsLoading(false)
                return
            }

            // 成功！
            setTenantName(data.tenant_name || '')
            setSuccess(true)
        } catch {
            setError('發生未知錯誤，請稍後再試')
        } finally {
            setIsLoading(false)
        }
    }

    if (authLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">載入中...</p>
                </div>
            </div>
        )
    }

    // 成功畫面
    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

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
                                className="mx-auto w-16 h-16 rounded-2xl bg-success/20 flex items-center justify-center"
                            >
                                <CheckCircle className="w-8 h-8 text-success" />
                            </motion.div>
                            <CardTitle className="text-2xl">申請已送出！</CardTitle>
                            <CardDescription className="space-y-2">
                                <p>
                                    您已成功申請加入 <span className="font-medium text-foreground">{tenantName}</span>
                                </p>
                                <div className="flex items-center justify-center gap-2 text-amber-500">
                                    <Clock className="w-4 h-4" />
                                    <span>等待店家管理員審核</span>
                                </div>
                                <p className="text-sm">
                                    審核通過後，您將收到通知並可進入管理後台
                                </p>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button
                                onClick={() => {
                                    setSuccess(false)
                                    setSlug('')
                                    setMessage('')
                                }}
                                className="w-full h-12"
                                variant="outline"
                            >
                                申請其他店家
                            </Button>
                            <Button
                                onClick={() => router.push('/create-tenant')}
                                className="w-full h-12"
                                variant="ghost"
                            >
                                返回選擇頁面
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
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
                className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"
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
                className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl"
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
                            className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg"
                        >
                            <UserPlus className="w-8 h-8 text-white" />
                        </motion.div>

                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-bold tracking-tight">
                                <span className="gradient-text">加入現有店家</span>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                輸入店家網址代號申請加入
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="slug" className="text-sm font-medium">
                                    店家網址代號 <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="slug"
                                    type="text"
                                    placeholder="例如：my-shop"
                                    value={slug}
                                    onChange={(e) => handleSlugChange(e.target.value)}
                                    required
                                    disabled={isLoading}
                                    className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors font-mono"
                                />
                                <p className="text-sm text-muted-foreground">
                                    請向店家管理員索取網址代號
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="message" className="text-sm font-medium">
                                    申請留言 <span className="text-muted-foreground">（選填）</span>
                                </Label>
                                <Textarea
                                    id="message"
                                    placeholder="簡單說明您想加入的原因..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    disabled={isLoading}
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
                                disabled={isLoading || !slug.trim()}
                                className="w-full h-12 text-base font-medium bg-gradient-to-r from-blue-500 to-cyan-600 hover:opacity-90 transition-opacity"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        申請中...
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
                    © 2026 PlusHub 接單系統
                </motion.p>
            </motion.div>
        </div>
    )
}

export default function JoinTenantPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">載入中...</p>
                </div>
            </div>
        }>
            <JoinTenantContent />
        </Suspense>
    )
}
