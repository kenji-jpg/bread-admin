'use client'

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { directRpc } from '@/lib/supabase/direct-rpc'
import type { Tenant } from '@/types/database'
import { useAuth } from './use-auth'

// Dashboard 統計資料類型
export interface DashboardStats {
    member_count: number
    product_count: number
    active_product_count: number
    today_orders: number
    today_revenue: number
    pending_orders: number
    recent_orders: {
        id: string
        customer_name: string
        item_name: string
        quantity: number
        unit_price: number
        created_at: string
    }[]
}

interface TenantContextType {
    tenant: Tenant | null
    isLoading: boolean
    refetch: () => Promise<void>
    /** 是否為超管跨租戶存取（唯讀模式） */
    isCrossTenantAccess: boolean
    /** 當前用戶在此租戶的角色 */
    userRole: string | null
    /** 租戶真實啟用狀態（超管停用租戶時為 false） */
    actualIsActive: boolean
    /** 是否為超管身份 */
    isSuperAdminUser: boolean
    /** Dashboard 統計資料（從聚合 RPC 取得） */
    stats: DashboardStats | null
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

// RPC 回傳資料型別
interface DashboardInitResponse {
    success: boolean
    is_super_admin: boolean
    tenants: { id: string; name: string; slug: string; plan: string; is_active: boolean; subscription_status: string; user_role: string; created_at: string }[]
    current_tenant: (Tenant & {
        is_active?: boolean
        actual_is_active?: boolean
        is_super_admin?: boolean
        is_cross_tenant_access?: boolean
        user_role?: string
    }) | null
    user_role: string | null
    is_cross_tenant_access: boolean
    stats: DashboardStats | null
    error?: string
}

export function TenantProvider({ children }: { children: ReactNode }) {
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isCrossTenantAccess, setIsCrossTenantAccess] = useState(false)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [actualIsActive, setActualIsActive] = useState(true)
    const [isSuperAdminUser, setIsSuperAdminUser] = useState(false)
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const params = useParams()
    const { setCurrentTenant, updateFromDashboardInit } = useAuth()
    const slug = params?.slug as string | undefined
    const abortControllerRef = useRef<AbortController | null>(null)

    const fetchTenant = useCallback(async (signal?: AbortSignal) => {
        if (!slug) {
            setTenant(null)
            setIsCrossTenantAccess(false)
            setUserRole(null)
            setActualIsActive(true)
            setIsSuperAdminUser(false)
            setStats(null)
            setIsLoading(false)
            return
        }

        setIsLoading(true)

        // Timeout 保護：最多等 10 秒
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        if (!signal) {
            timeoutId = setTimeout(() => {
                console.warn('[Tenant] 載入超時，強制結束 loading')
                setIsLoading(false)
            }, 10000)
        }

        try {
            // 使用 directRpc 繞過 Supabase client 的 auth 初始化阻塞
            const { data, error } = await directRpc<DashboardInitResponse>(
                'get_dashboard_init_v1',
                { p_tenant_slug: slug },
                { signal }
            )

            // 如果請求被取消，不要更新 state
            if (signal?.aborted) {
                return
            }

            if (error) {
                console.error('Error fetching tenant:', error)
                setTenant(null)
                setIsCrossTenantAccess(false)
                setUserRole(null)
                setActualIsActive(true)
                setIsSuperAdminUser(false)
                setStats(null)
                return
            }

            if (data?.success) {
                // 同步更新 AuthContext 的資料
                updateFromDashboardInit({
                    is_super_admin: data.is_super_admin,
                    tenants: data.tenants
                })

                if (data.current_tenant) {
                    const tenantWithAccess: Tenant = {
                        ...data.current_tenant,
                        is_cross_tenant_access: data.is_cross_tenant_access ?? data.current_tenant.is_cross_tenant_access,
                        user_role: (data.user_role ?? data.current_tenant.user_role) as Tenant['user_role']
                    }
                    setTenant(tenantWithAccess)
                    setCurrentTenant(tenantWithAccess)
                    setIsCrossTenantAccess(data.is_cross_tenant_access ?? false)
                    setUserRole(data.user_role ?? null)
                    setActualIsActive(data.current_tenant.actual_is_active ?? data.current_tenant.is_active ?? true)
                    setIsSuperAdminUser(data.current_tenant.is_super_admin ?? data.is_super_admin ?? false)

                    // 設定統計資料
                    setStats(data.stats)
                } else {
                    console.error('Tenant not found:', slug)
                    setTenant(null)
                    setIsCrossTenantAccess(false)
                    setUserRole(null)
                    setActualIsActive(true)
                    setIsSuperAdminUser(false)
                    setStats(null)
                }
            } else {
                console.error('Failed to fetch tenant:', data?.error)
                setTenant(null)
                setIsCrossTenantAccess(false)
                setUserRole(null)
                setActualIsActive(true)
                setIsSuperAdminUser(false)
                setStats(null)
            }
        } catch (error) {
            // 如果是取消錯誤，靜默處理
            if (error instanceof Error && error.name === 'AbortError') {
                return
            }
            console.error('Error fetching tenant:', error)
            setTenant(null)
            setIsCrossTenantAccess(false)
            setUserRole(null)
            setActualIsActive(true)
            setIsSuperAdminUser(false)
            setStats(null)
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
            // 只有在請求沒被取消時才更新 loading state
            if (!signal?.aborted) {
                setIsLoading(false)
            }
        }
    }, [slug, setCurrentTenant, updateFromDashboardInit])

    useEffect(() => {
        // 取消之前的請求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // 建立新的 AbortController
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        fetchTenant(abortController.signal)

        // Cleanup: 組件卸載或 slug 改變時取消請求
        return () => {
            abortController.abort()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug])

    // 提供給外部使用的 refetch，不需要 signal
    const refetch = useCallback(async () => {
        await fetchTenant()
    }, [fetchTenant])

    return (
        <TenantContext.Provider
            value={{
                tenant,
                isLoading,
                refetch,
                isCrossTenantAccess,
                userRole,
                actualIsActive,
                isSuperAdminUser,
                stats,
            }}
        >
            {children}
        </TenantContext.Provider>
    )
}

export function useTenant() {
    const context = useContext(TenantContext)
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider')
    }
    return context
}
