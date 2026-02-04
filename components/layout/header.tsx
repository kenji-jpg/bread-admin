'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/use-auth'
import { useTenant } from '@/hooks/use-tenant'
import { TenantSwitcher } from './tenant-switcher'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { LogOut, User, Bell, AlertTriangle } from 'lucide-react'

export function Header() {
    const { user, isSuperAdmin, signOut } = useAuth()
    const { tenant, actualIsActive, isSuperAdminUser } = useTenant()
    const router = useRouter()

    // 顯示已停用警告：超管存取已停用的租戶時
    const showDisabledWarning = isSuperAdminUser && !actualIsActive

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    const userInitials = user?.email
        ? user.email.substring(0, 2).toUpperCase()
        : 'U'

    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 backdrop-blur-xl px-6"
        >
            {/* Left Section */}
            <div className="flex items-center gap-4">
                {isSuperAdmin && <TenantSwitcher />}

                {tenant && !isSuperAdmin && (
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                            <span className="text-sm font-bold text-primary-foreground">
                                {tenant.name.charAt(0)}
                            </span>
                        </div>
                        <span className="font-semibold">{tenant.name}</span>
                    </div>
                )}
            </div>

            {/* Center - Disabled Warning */}
            {showDisabledWarning && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">此租戶已停用</span>
                </div>
            )}

            {/* Right Section */}
            <div className="flex items-center gap-2">
                {/* Notifications */}
                <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                </Button>

                {/* Theme Toggle */}
                <ThemeToggle />

                {/* User Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="relative h-10 w-10 rounded-xl hover:bg-muted"
                        >
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm font-medium">
                                    {userInitials}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 glass-strong" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">帳戶</p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    {user?.email}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" />
                            <span>個人設定</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={handleSignOut}
                            className="text-destructive focus:text-destructive"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>登出</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </motion.header>
    )
}
