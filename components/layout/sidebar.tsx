'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTenant } from '@/hooks/use-tenant'
import { useAuth } from '@/hooks/use-auth'
import { useSidebar } from '@/hooks/use-sidebar'
import { Badge } from '@/components/ui/badge'
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    Users,
    Receipt,
    Settings,
    Building2,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    ShoppingBag,
} from 'lucide-react'

interface NavItem {
    title: string
    href: string
    icon: React.ReactNode
}

export function Sidebar() {
    const { collapsed, toggle } = useSidebar()
    const pathname = usePathname()
    const { tenant, actualIsActive, isSuperAdminUser } = useTenant()
    const { isSuperAdmin } = useAuth()

    const tenantSlug = tenant?.slug
    // 顯示已停用標籤：超管存取已停用的租戶時
    const showDisabledBadge = isSuperAdminUser && !actualIsActive

    const mainNavItems: NavItem[] = tenantSlug
        ? [
            {
                title: '儀表板',
                href: `/admin/t/${tenantSlug}`,
                icon: <LayoutDashboard className="h-5 w-5" />,
            },
            {
                title: '商城',
                href: `/admin/t/${tenantSlug}/shop`,
                icon: <ShoppingBag className="h-5 w-5" />,
            },
            {
                title: '商品管理',
                href: `/admin/t/${tenantSlug}/products`,
                icon: <Package className="h-5 w-5" />,
            },
            {
                title: '訂單管理',
                href: `/admin/t/${tenantSlug}/orders`,
                icon: <ShoppingCart className="h-5 w-5" />,
            },
            {
                title: '結帳單管理',
                href: `/admin/t/${tenantSlug}/checkouts`,
                icon: <Receipt className="h-5 w-5" />,
            },
            {
                title: '會員管理',
                href: `/admin/t/${tenantSlug}/members`,
                icon: <Users className="h-5 w-5" />,
            },
            {
                title: '店家設定',
                href: `/admin/t/${tenantSlug}/settings`,
                icon: <Settings className="h-5 w-5" />,
            },
        ]
        : []

    const superAdminItems: NavItem[] = isSuperAdmin
        ? [
            {
                title: '租戶總覽',
                href: '/admin',
                icon: <LayoutDashboard className="h-5 w-5" />,
            },
            {
                title: '租戶管理',
                href: '/admin/tenants',
                icon: <Building2 className="h-5 w-5" />,
            },
        ]
        : []

    const isActive = (href: string) => {
        // 精確匹配：儀表板頁面 (/admin 或 /admin/t/xxx)
        if (pathname === href) return true

        // 子頁面匹配：只有當不是根路徑時才用 startsWith
        // 但要排除儀表板本身（避免 /admin/t/xxx 匹配 /admin/t/xxx/orders）
        const tenantDashboardPattern = /^\/admin\/t\/[^/]+$/
        const isHrefTenantDashboard = tenantDashboardPattern.test(href)

        if (!isHrefTenantDashboard && href !== '/admin' && pathname?.startsWith(href + '/')) {
            return true
        }

        return false
    }

    return (
        <motion.aside
            initial={false}
            animate={{ width: collapsed ? 72 : 260 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
                'fixed left-0 top-0 z-40 h-screen',
                'bg-sidebar border-r border-sidebar-border',
                'flex flex-col'
            )}
        >
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
                <AnimatePresence mode="wait">
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-3"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                                <Package className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <span className="font-semibold text-foreground">團購管理</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    className="h-9 w-9 rounded-lg hover:bg-sidebar-accent"
                >
                    {collapsed ? (
                        <ChevronRight className="h-4 w-4" />
                    ) : (
                        <ChevronLeft className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-4">
                <nav className="space-y-1">
                    {/* Super Admin Section */}
                    {superAdminItems.length > 0 && (
                        <div className="mb-4">
                            {!collapsed && (
                                <p className="mb-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    平台管理
                                </p>
                            )}
                            {superAdminItems.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    isActive={isActive(item.href)}
                                    collapsed={collapsed}
                                />
                            ))}
                        </div>
                    )}

                    {/* Tenant Section */}
                    {mainNavItems.length > 0 && (
                        <div>
                            {!collapsed && (
                                <div className="mb-2 px-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        {tenant?.name || '店家管理'}
                                    </p>
                                    {showDisabledBadge && (
                                        <Badge variant="destructive" className="mt-1 text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            已停用
                                        </Badge>
                                    )}
                                </div>
                            )}
                            {collapsed && showDisabledBadge && (
                                <div className="flex justify-center mb-2">
                                    <div className="h-2 w-2 rounded-full bg-destructive" title="此租戶已停用" />
                                </div>
                            )}
                            {mainNavItems.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    isActive={isActive(item.href)}
                                    collapsed={collapsed}
                                />
                            ))}
                        </div>
                    )}
                </nav>
            </ScrollArea>
        </motion.aside>
    )
}

interface NavLinkProps {
    item: NavItem
    isActive: boolean
    collapsed: boolean
}

function NavLink({ item, isActive, collapsed }: NavLinkProps) {
    return (
        <Link href={item.href}>
            <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                    'hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-accent text-sidebar-primary',
                    collapsed && 'justify-center px-2'
                )}
            >
                <span
                    className={cn(
                        'flex-shrink-0 transition-colors',
                        isActive ? 'text-sidebar-primary' : 'text-muted-foreground'
                    )}
                >
                    {item.icon}
                </span>
                <AnimatePresence mode="wait">
                    {!collapsed && (
                        <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                                'text-sm font-medium truncate',
                                isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground'
                            )}
                        >
                            {item.title}
                        </motion.span>
                    )}
                </AnimatePresence>

                {/* Active Indicator */}
                {isActive && !collapsed && (
                    <motion.div
                        layoutId="activeIndicator"
                        className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary"
                    />
                )}
            </motion.div>
        </Link>
    )
}
