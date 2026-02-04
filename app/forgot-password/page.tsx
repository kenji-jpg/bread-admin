'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShoppingBag, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
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
                            <CardTitle className="text-2xl">郵件已發送！</CardTitle>
                            <CardDescription>
                                我們已發送密碼重置連結至 <span className="font-medium text-foreground">{email}</span>
                                <br />
                                請查收信箱並點擊連結重置密碼
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => router.push('/login')}
                                className="w-full h-12"
                                variant="outline"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                返回登入
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
                                <span className="gradient-text">忘記密碼</span>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                輸入您的電子郵件，我們將發送重置連結
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4">
                        <form onSubmit={handleResetPassword} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-medium">
                                    電子郵件
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
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
                                        發送中...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="mr-2 h-4 w-4" />
                                        發送重置連結
                                    </>
                                )}
                            </Button>

                            <div className="text-center text-sm pt-2">
                                <a
                                    href="/login"
                                    className="text-primary hover:text-primary/80 transition-colors inline-flex items-center"
                                >
                                    <ArrowLeft className="mr-1 h-3 w-3" />
                                    返回登入
                                </a>
                            </div>
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
