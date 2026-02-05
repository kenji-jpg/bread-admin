'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { directRpc } from '@/lib/supabase/direct-rpc'
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
    updateFromDashboardInit: (data: {
        is_super_admin: boolean
        tenants: TenantInfo[]
    }) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * 直接從 cookie 解碼 JWT 取得用戶資訊
 * 完全不依賴 Supabase client，避免 AbortError
 */
function getUserFromCookie(): { id: string; email: string } | null {
    try {
        const cookies = document.cookie.split(';')
        const authCookie = cookies.find(c => c.trim().startsWith('sb-') && c.includes('-auth-token'))
        if (!authCookie) return null

        const value = authCookie.split('=').slice(1).join('=').trim()
        // cookie 值可能有 base64- 前綴
        const jsonStr = value.startsWith('base64-')
            ? atob(value.slice(7))
            : decodeURIComponent(value)

        const parsed = JSON.parse(jsonStr)
        const accessToken = parsed.access_token
        if (!accessToken) return null

        // 解碼 JWT payload（第二段）
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const exp = payload.exp * 1000
        if (Date.now() > exp) return null // token 已過期

        return {
            id: payload.sub,
            email: payload.email || ''
        }
    } catch {
        return null
    }
}

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

        let isMounted = true

        const initAuth = async () => {
            const timeoutId = setTimeout(() => {
                if (isMounted) {
                    console.warn('[Auth] 初始化超時，強制結束 loading')
                    setIsLoading(false)
                }
            }, 10000)

            try {
                // ===== 第一步：從 cookie 直接解碼 JWT（零網路請求，不受 AbortError 影響）=====
                const cookieUser = getUserFromCookie()

                if (!cookieUser) {
                    // 沒有有效的 session cookie
                    setUser(null)
                    currentUserIdRef.current = null
                    setIsSuperAdmin(false)
                    setTenants([])
                    return
                }

                // 設定臨時 user（讓 UI 可以先渲染）
                currentUserIdRef.current = cookieUser.id
                setUser({ id: cookieUser.id, email: cookieUser.email } as User)

                // ===== 第二步：直接 fetch 呼叫 RPC（繞過 Supabase client 的 auth 初始化阻塞）=====
                try {
                    const { data, error } = await directRpc<{
                        success: boolean
                        is_super_admin: boolean
                        tenants: TenantInfo[]
                        error?: string
                    }>('get_dashboard_init_v1', { p_tenant_slug: null })

                    if (!isMounted) return

                    if (!error && data?.success) {
                        setIsSuperAdmin(data.is_super_admin)
                        setTenants(data.tenants || [])
                    } else {
                        console.warn('[Auth] RPC 回傳錯誤:', error?.message || data?.error)
                        setIsSuperAdmin(false)
                        setTenants([])
                    }
                } catch (rpcError) {
                    if (!isMounted) return
                    if (rpcError instanceof Error && rpcError.name === 'AbortError') {
                        console.warn('[Auth] RPC 被 abort，使用基本 session')
                    } else {
                        console.error('[Auth] RPC 呼叫失敗:', rpcError)
                    }
                    setIsSuperAdmin(false)
                    setTenants([])
                }

                // ===== 第三步：背景初始化 Supabase client（非阻塞，為後續操作預熱）=====
                // 讓 Supabase client 在背景完成 auth 初始化，
                // 這樣後續的 .from() 查詢和 realtime 訂閱可以正常運作
                const supabase = createClient()
                supabase.auth.getUser().then(({ data: { user: verifiedUser } }) => {
                    if (!isMounted) return
                    if (verifiedUser) {
                        setUser(verifiedUser)
                        currentUserIdRef.current = verifiedUser.id
                    }
                }).catch(() => {
                    // getUser() 常常被 abort，忽略即可
                })

            } catch (error) {
                if (!isMounted) return
                if (error instanceof Error && error.name === 'AbortError') return
                console.error('[Auth] 初始化錯誤:', error)
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

        // 延遲設定 auth state listener，避免在初始化期間觸發
        // Supabase client 的 onAuthStateChange 也會等 initializePromise，
        // 但因為是事件驅動，不會阻塞 initAuth
        const supabase = createClient()
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const newUser = session?.user ?? null
                const newUserId = newUser?.id ?? null
                const previousUserId = currentUserIdRef.current

                if (event === 'TOKEN_REFRESHED') return

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
                        // SIGNED_IN 事件時 Supabase client 已經完成初始化，
                        // 可以安全使用 directRpc（cookie 已更新）
                        const { data } = await directRpc<{
                            success: boolean
                            is_super_admin: boolean
                            tenants: TenantInfo[]
                        }>('get_dashboard_init_v1', { p_tenant_slug: null })

                        if (data?.success) {
                            setIsSuperAdmin(data.is_super_admin)
                            setTenants(data.tenants || [])
                        } else {
                            setIsSuperAdmin(false)
                            setTenants([])
                        }
                    } catch (error) {
                        console.error('[Auth] SIGNED_IN RPC 失敗:', error)
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

    const updateFromDashboardInit = useCallback((data: {
        is_super_admin: boolean
        tenants: TenantInfo[]
    }) => {
        setIsSuperAdmin(data.is_super_admin)
        setTenants(data.tenants || [])
    }, [])

    const signOut = async () => {
        try {
            const supabase = createClient()
            await supabase.auth.signOut()
        } catch {
            // signOut 也可能被 abort，手動清除 cookie
            document.cookie.split(';').forEach(c => {
                const name = c.trim().split('=')[0]
                if (name.startsWith('sb-')) {
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
                }
            })
        }
        setUser(null)
        setIsSuperAdmin(false)
        setTenants([])
        setCurrentTenant(null)
        // 強制跳轉到登入頁
        window.location.href = '/login'
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
