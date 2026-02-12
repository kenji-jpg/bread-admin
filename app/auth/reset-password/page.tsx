'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShoppingBag, KeyRound, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [isValidSession, setIsValidSession] = useState(false)
    const [isChecking, setIsChecking] = useState(true)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        // 檢查是否有有效的 session（來自 email 連結）
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setIsValidSession(!!session)
            setIsChecking(false)
        }

        checkSession()
    }, [supabase])

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // 驗證密碼
        if (password !== confirmPassword) {
            setError('兩次輸入的密碼不一致')
            return
        }

        if (password.length < 6) {
            setError('密碼長度至少需要 6 個字元')
            return
        }

        setIsLoading(true)

        try {
            const { error } = await supabase.auth.updateUser({
                password,
            })

            if (error) {
                setError(error.message)
                return
            }

            setSuccess(true)
        } catch {
            setError('發生未知錯誤，請稍後再試')
        } finally {
            setIsLoading(false)
        }
    }

    // 檢查中
    if (isChecking) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">驗證中...</p>
                </div>
            </div>
        )
    }

    // 無效的 session
    if (!isValidSession) {
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
                            <CardTitle className="text-2xl">連結已失效</CardTitle>
                            <CardDescription>
                                此密碼重置連結已失效或已過期。
                                <br />
                                請重新申請密碼重置。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => router.push('/forgot-password')}
                                className="w-full h-12"
                            >
                                重新申請
                            </Button>
                            <Button
                                onClick={() => router.push('/login')}
                                className="w-full h-12"
                                variant="outline"
                            >
                                返回登入
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
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
                            <CardTitle className="text-2xl">密碼已重置！</CardTitle>
                            <CardDescription>
                                您的密碼已成功更新。
                                <br />
                                現在可以使用新密碼登入。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => router.push('/login')}
                                className="w-full h-12 gradient-primary"
                            >
                                前往登入
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

            {/* Floating Orbs */}
            <motion.div
                className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
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
                className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl"
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

            {/* Form Card */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-md"
            >
                <Card className="glass-strong shadow-glow border-border/50">
                    <CardHeader className="text-center space-y-4 pb-2">
                        {/* Logo */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            className="mx-auto w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg"
                        >
                            <ShoppingBag className="w-8 h-8 text-primary-foreground" />
                        </motion.div>

                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-bold tracking-tight">
                                <span className="gradient-text">重置密碼</span>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                請輸入您的新密碼
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4">
                        <form onSubmit={handleResetPassword} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-sm font-medium">
                                    新密碼
                                </Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="至少 6 個字元"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                    className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                                    確認新密碼
                                </Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="再次輸入新密碼"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                    className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
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
                                disabled={isLoading}
                                className="w-full h-12 text-base font-medium gradient-primary hover:opacity-90 transition-opacity"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        更新中...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="mr-2 h-4 w-4" />
                                        更新密碼
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
                    © 2026 PlusHub 選購系統
                </motion.p>
            </motion.div>
        </div>
    )
}
