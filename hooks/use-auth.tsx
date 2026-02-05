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

        // 初始化：先用 getSession() 從本地取得 session（不發網路請求），
        // 再用 getUser() 向 server 驗證（可能會被 abort）
        const initAuth = async () => {
            // Timeout 保護：最多等 15 秒
            const timeoutId = setTimeout(() => {
                if (isMounted) {
                    console.warn('[Auth] 初始化超時，強制結束 loading')
                    setIsLoading(false)
                }
            }, 15000)

            try {
                // 第一步：從本地 session 快速取得 user（不會卡住）
                const { data: { session } } = await supabase.auth.getSession()
                if (!isMounted) return

                const sessionUser = session?.user ?? null
                currentUserIdRef.current = sessionUser?.id ?? null
                setUser(sessionUser)

                // 如果沒有 session，直接結束
                if (!sessionUser) {
                    setIsSuperAdmin(false)
                    setTenants([])
                    return
                }

                // 第二步：向 server 驗證 user（可能較慢，但不阻塞 UI）
                // 同時發起 RPC 呼叫取得角色資料
                try {
                    const [userResult, rpcResult] = await Promise.all([
                        supabase.auth.getUser().catch(() => ({ data: { user: null } })),
                        (supabase.rpc('get_dashboard_init_v1', {
                            p_tenant_slug: null
                        }) as unknown as Promise<{
                            data: {
                                success: boolean
                                is_super_admin: boolean
                                tenants: TenantInfo[]
                            } | null
                        }>)
                    ])

                    if (!isMounted) return

                    // 如果 server 驗證 user 無效，清除 session
                    const verifiedUser = userResult.data.user
                    if (!verifiedUser) {
                        setUser(null)
                        currentUserIdRef.current = null
                        setIsSuperAdmin(false)
                        setTenants([])
                        return
                    }

                    // 更新為 server 驗證後的 user
                    setUser(verifiedUser)
                    currentUserIdRef.current = verifiedUser.id

                    if (rpcResult.data?.success) {
                        setIsSuperAdmin(rpcResult.data.is_super_admin)
                        setTenants(rpcResult.data.tenants || [])
                    } else {
                        setIsSuperAdmin(false)
                        setTenants([])
                    }
                } catch (innerError) {
                    // getUser() 或 RPC 失敗（例如 AbortError），
                    // 但我們已經有 session user，嘗試只用 RPC
                    if (!isMounted) return
                    if (innerError instanceof Error && innerError.name === 'AbortError') {
                        // AbortError: 用 session user 繼續，嘗試單獨呼叫 RPC
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
                            if (!isMounted) return
                            if (data?.success) {
                                setIsSuperAdmin(data.is_super_admin)
                                setTenants(data.tenants || [])
                            }
                        } catch {
                            // RPC 也失敗了，保持 session user 但沒有角色資料
                            console.warn('[Auth] RPC 呼叫失敗，使用基本 session')
                        }
                        return
                    }
                    console.error('Error verifying user:', innerError)
                    setIsSuperAdmin(false)
                    setTenants([])
                }
            } catch (error) {
                if (!isMounted) return
                if (error instanceof Error && error.name === 'AbortError') return

                console.error('Error initializing auth:', error)
                setIsSuperAdmin(false)
                setTenants([])
            } finally {
                clearTimeout(timeoutId)
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
