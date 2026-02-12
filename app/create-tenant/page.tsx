'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Store, UserPlus, ArrowRight, Sparkles, LogOut, User } from 'lucide-react'

export default function GetStartedPage() {
    const { user, isLoading: authLoading, tenants: userTenants, signOut } = useAuth()
    const router = useRouter()

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    // 取得用戶名稱縮寫
    const getUserInitials = () => {
        if (!user?.email) return 'U'
        return user.email.charAt(0).toUpperCase()
    }

    useEffect(() => {
        // 如果未登入，跳轉到登入頁
        if (!authLoading && !user) {
            router.replace('/login')
        }
        // 如果已有店家，跳轉到該店家
        if (!authLoading && userTenants.length > 0) {
            router.replace(`/admin/t/${userTenants[0].slug}`)
        }
    }, [authLoading, user, userTenants, router])

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

    const options = [
        {
            title: '建立我的店家',
            description: '建立專屬於你的接單系統，成為店家管理者',
            icon: Store,
            href: '/create-tenant/new',
            gradient: 'from-violet-500 to-purple-600',
            features: ['自訂店家名稱與網址', '完整管理權限', '立即開始營運'],
        },
        {
            title: '加入現有店家',
            description: '申請加入已存在的店家，協助管理或查看資料',
            icon: UserPlus,
            href: '/create-tenant/join',
            gradient: 'from-blue-500 to-cyan-600',
            features: ['輸入店家代號申請', '等待管理員審核', '取得對應權限'],
        },
    ]

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

            <div className="relative z-10 w-full max-w-4xl">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-10"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                        className="mx-auto w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg mb-4"
                    >
                        <Sparkles className="w-8 h-8 text-primary-foreground" />
                    </motion.div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">
                        <span className="gradient-text">歡迎使用 PlusHub</span>
                    </h1>
                    <p className="text-muted-foreground">
                        請選擇您想要進行的操作
                    </p>
                </motion.div>

                {/* Options Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                    {options.map((option, index) => (
                        <motion.div
                            key={option.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 * (index + 1) }}
                        >
                            <Card
                                className="glass-strong border-border/50 cursor-pointer group hover:border-primary/50 transition-all duration-300 hover:shadow-glow h-full"
                                onClick={() => router.push(option.href)}
                            >
                                <CardHeader className="pb-4">
                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${option.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                        <option.icon className="w-7 h-7 text-white" />
                                    </div>
                                    <CardTitle className="text-xl flex items-center justify-between">
                                        {option.title}
                                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                    </CardTitle>
                                    <CardDescription className="text-base">
                                        {option.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {option.features.map((feature, i) => (
                                            <li key={i} className="flex items-center text-sm text-muted-foreground">
                                                <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${option.gradient} mr-2`} />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Footer */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-center text-sm text-muted-foreground mt-8"
                >
                    © 2026 PlusHub 接單系統
                </motion.p>
            </div>
        </div>
    )
}
