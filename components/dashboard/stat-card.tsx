'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LucideIcon, ArrowRight } from 'lucide-react'

interface StatCardProps {
    title: string
    value: string | number
    description?: string
    icon: LucideIcon
    href?: string
    trend?: {
        value: number
        isPositive: boolean
    }
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive'
    className?: string
}

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
    href,
    trend,
    variant = 'default',
    className,
}: StatCardProps) {
    const variantStyles = {
        default: 'from-muted/50 to-muted/30',
        primary: 'from-primary/20 to-primary/5',
        success: 'from-success/20 to-success/5',
        warning: 'from-warning/20 to-warning/5',
        destructive: 'from-destructive/20 to-destructive/5',
    }

    const iconStyles = {
        default: 'bg-muted text-muted-foreground',
        primary: 'bg-primary/20 text-primary',
        success: 'bg-success/20 text-success',
        warning: 'bg-warning/20 text-warning',
        destructive: 'bg-destructive/20 text-destructive',
    }

    const content = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            whileHover={{ scale: 1.02, y: -2 }}
            className={cn(
                'relative overflow-hidden rounded-2xl border border-border/50 p-6',
                'bg-gradient-to-br',
                variantStyles[variant],
                'transition-shadow hover:shadow-soft',
                href && 'cursor-pointer group',
                className
            )}
        >
            {/* Background Decoration */}
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl" />

            <div className="relative flex items-start justify-between">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <p className="text-3xl font-bold tracking-tight">{value}</p>
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                    {trend && (
                        <div className="flex items-center gap-1 pt-1">
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    trend.isPositive ? 'text-success' : 'text-destructive'
                                )}
                            >
                                {trend.isPositive ? '+' : ''}{trend.value}%
                            </span>
                            <span className="text-xs text-muted-foreground">較上月</span>
                        </div>
                    )}
                    {href && (
                        <div className="flex items-center gap-1 pt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>查看詳情</span>
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                        </div>
                    )}
                </div>

                <div
                    className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-xl',
                        iconStyles[variant]
                    )}
                >
                    <Icon className="h-6 w-6" />
                </div>
            </div>
        </motion.div>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }

    return content
}
