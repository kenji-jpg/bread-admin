'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShoppingBag, Sparkles } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                // 提供友善的錯誤訊息
                if (error.message.includes('Email not confirmed')) {
                    setError('請先驗證您的 Email。若未收到驗證信，請返回註冊頁面重新發送。')
                } else if (error.message.includes('Invalid login credentials')) {
                    setError('Email 或密碼錯誤，請檢查後重試')
                } else if (error.message.includes('Email link is invalid or has expired')) {
                    setError('驗證連結已過期，請重新發送驗證信')
                } else {
                    setError(error.message)
                }
                return
            }

            router.push('/admin')
            router.refresh()
        } catch {
            setError('發生未知錯誤，請稍後再試')
        } finally {
            setIsLoading(false)
        }
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

            {/* Login Card */}
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
                                <span className="gradient-text">PlusHub 接單系統</span>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                登入您的管理後台
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4">
                        <form onSubmit={handleLogin} className="space-y-5">
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

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-sm font-medium">
                                    密碼
                                </Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
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
                                        登入中...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        登入
                                    </>
                                )}
                            </Button>

                            <div className="flex items-center justify-between text-sm pt-2">
                                <a
                                    href="/register"
                                    className="text-primary hover:text-primary/80 transition-colors"
                                >
                                    還沒有帳號？立即註冊
                                </a>
                                <a
                                    href="/forgot-password"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    忘記密碼？
                                </a>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-sm text-muted-foreground mt-6 space-y-1"
                >
                    <div className="flex items-center justify-center gap-2">
                        <a href="/terms" target="_blank" className="hover:text-foreground transition-colors">服務條款</a>
                        <span>·</span>
                        <a href="/privacy" target="_blank" className="hover:text-foreground transition-colors">隱私政策</a>
                    </div>
                    <p>© 2026 PlusHub 接單系統</p>
                </motion.div>
            </motion.div>
        </div>
    )
}
