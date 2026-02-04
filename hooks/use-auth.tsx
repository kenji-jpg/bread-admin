'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Tenant } from '@/types/database'

interface TenantInfo {
    id: string
    name: string
    slug: string
    plan: string
    is_active: boolean
    subscription_status: string
    user_role: string
    created_at: string
}

interface AuthContextType {
    user: User | null
    isSuperAdmin: boolean
    tenants: TenantInfo[]
    currentTenant: Tenant | null
    setCurrentTenant: (tenant: Tenant | null) => void
    isLoading: boolean
    signOut: () => Promise<void>
    // 新增：給 TenantProvider 用來更新資料的方法
    updateFromDashboardInit: (data: {
        is_super_admin: boolean
        tenants: TenantInfo[]
    }) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)
    const [tenants, setTenants] = useState<TenantInfo[]>([])
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const initializedRef = useRef(false)
    const currentUserIdRef = useRef<string | null>(null)

    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true

        const supabase = createClient()
        let isMounted = true

        // 初始化：只取得 user，其他資料讓 TenantProvider 處理
        const initAuth = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()

                // 如果組件已卸載，不更新 state
                if (!isMounted) return

                currentUserIdRef.current = user?.id ?? null
                setUser(user)

                // 如果有用戶，做一次基本的初始化（不帶 slug）
                if (user) {
                    const { data } = await supabase.rpc('get_dashboard_init_v1', {
                        p_tenant_slug: null
                    }) as {
                        data: {
                            success: boolean
                            is_super_admin: boolean
                            tenants: TenantInfo[]
                        } | null
                    }

                    // 再次檢查是否已卸載
                    if (!isMounted) return

                    if (data?.success) {
                        setIsSuperAdmin(data.is_super_admin)
                        setTenants(data.tenants || [])
                    } else {
                        // RPC 失敗時重置狀態，避免保留之前用戶的權限
                        setIsSuperAdmin(false)
                        setTenants([])
                    }
                }
            } catch (error) {
                // 如果是 AbortError 或組件已卸載，靜默處理
                if (!isMounted) return
                if (error instanceof Error && error.name === 'AbortError') return

                console.error('Error initializing auth:', error)
                // 錯誤時也要重置狀態
                setIsSuperAdmin(false)
                setTenants([])
            } finally {
                if (isMounted) {
                    setIsLoading(false)
                }
            }
        }

        initAuth()

        // 監聽登入狀態變化
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const newUser = session?.user ?? null
                const newUserId = newUser?.id ?? null
                const previousUserId = currentUserIdRef.current

                // 只在 user ID 真的改變時才更新 state，避免不必要的 re-render
                // TOKEN_REFRESHED 事件不需要更新 user state
                if (event === 'TOKEN_REFRESHED') {
                    // Token refresh 不需要做任何事，middleware 會處理 cookie
                    return
                }

                // 檢查 user 是否真的改變
                if (newUserId === previousUserId && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') {
                    return
                }

                currentUserIdRef.current = newUserId
                setUser(newUser)

                if (!newUser) {
                    setIsSuperAdmin(false)
                    setTenants([])
                    setCurrentTenant(null)
                    setIsLoading(false)
                } else if (event === 'SIGNED_IN') {
                    setIsLoading(true)
                    try {
                        const { data } = await supabase.rpc('get_dashboard_init_v1', {
                            p_tenant_slug: null
                        }) as {
                            data: {
                                success: boolean
                                is_super_admin: boolean
                                tenants: TenantInfo[]
                            } | null
                        }

                        if (data?.success) {
                            setIsSuperAdmin(data.is_super_admin)
                            setTenants(data.tenants || [])
                        } else {
                            setIsSuperAdmin(false)
                            setTenants([])
                        }
                    } catch (error) {
                        console.error('Error fetching user data:', error)
                        setIsSuperAdmin(false)
                        setTenants([])
                    } finally {
                        setIsLoading(false)
                    }
                }
            }
        )

        return () => {
            isMounted = false
            subscription.unsubscribe()
            initializedRef.current = false
        }
    }, [])

    // 給 TenantProvider 用來同步更新資料（用 useCallback 避免無限循環）
    const updateFromDashboardInit = useCallback((data: {
        is_super_admin: boolean
        tenants: TenantInfo[]
    }) => {
        setIsSuperAdmin(data.is_super_admin)
        setTenants(data.tenants || [])
    }, [])

    const signOut = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        setUser(null)
        setIsSuperAdmin(false)
        setTenants([])
        setCurrentTenant(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isSuperAdmin,
                tenants,
                currentTenant,
                setCurrentTenant,
                isLoading,
                signOut,
                updateFromDashboardInit,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
