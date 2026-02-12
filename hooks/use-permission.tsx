'use client'

import { useMemo } from 'react'
import { useAuth } from './use-auth'
import { useTenant } from './use-tenant'

type Role = 'owner' | 'admin' | 'staff' | 'viewer'

interface Permissions {
    // 角色檢查
    role: Role | null
    isOwner: boolean
    isAdmin: boolean
    isStaff: boolean
    isViewer: boolean

    // 功能權限
    canManageProducts: boolean      // 商品管理
    canManageOrders: boolean        // 訂單管理
    canManageMembers: boolean       // 會員管理
    canManageCheckouts: boolean     // 結帳單管理
    canImportAuctionOrders: boolean // 競標訂單匯入
    canExportData: boolean          // 匯出資料
    canManageSettings: boolean      // 店家設定
    canManageAdmins: boolean        // 管理員管理
    canDeleteTenant: boolean        // 刪除店家

    // 方案權限（Pro 專屬）
    canAccessShop: boolean          // 商城功能
    canUseMyshipEmail: boolean      // 賣貨便自動狀態更新
    canUseChromeExtension: boolean  // Chrome 插件（預留）
}

export function usePermission(): Permissions {
    const { tenants, currentTenant, isSuperAdmin } = useAuth()
    const { tenant, userRole: tenantUserRole } = useTenant()

    const permissions = useMemo(() => {
        // 找到當前租戶的角色
        const activeTenant = tenant || currentTenant

        // 優先使用 TenantProvider 提供的 userRole（從聚合 RPC 取得）
        // 否則從 tenants 列表中找
        let role: Role | null = null

        if (tenantUserRole) {
            role = tenantUserRole as Role
        } else if (activeTenant) {
            const matchedTenant = tenants.find(t => t.id === activeTenant.id)
            role = (matchedTenant?.user_role as Role) || null
        }

        // 超級管理員：角色權限全開，但方案權限仍依租戶實際 plan 判斷
        if (isSuperAdmin) {
            const isPro = activeTenant?.plan === 'pro'
            return {
                role: 'owner' as Role,
                isOwner: true,
                isAdmin: true,
                isStaff: true,
                isViewer: true,
                canManageProducts: true,
                canManageOrders: true,
                canManageMembers: true,
                canManageCheckouts: true,
                canImportAuctionOrders: true,
                canExportData: true,
                canManageSettings: true,
                canManageAdmins: true,
                canDeleteTenant: true,
                canAccessShop: isPro,
                canUseMyshipEmail: isPro,
                canUseChromeExtension: isPro,
            }
        }

        // 角色層級檢查
        const isOwner = role === 'owner'
        const isAdmin = role === 'owner' || role === 'admin'
        const isStaff = role === 'owner' || role === 'admin' || role === 'staff'
        const isViewer = role !== null

        // 方案檢查
        const isPro = activeTenant?.plan === 'pro'

        return {
            role,
            isOwner,
            isAdmin,
            isStaff,
            isViewer,

            // 功能權限映射
            canManageProducts: isStaff,           // owner, admin, staff
            canManageOrders: isStaff,             // owner, admin, staff
            canManageMembers: isAdmin,            // owner, admin
            canManageCheckouts: isStaff,          // owner, admin, staff
            canImportAuctionOrders: isStaff,      // owner, admin, staff
            canExportData: isAdmin,               // owner, admin
            canManageSettings: isOwner,           // owner only
            canManageAdmins: isOwner,             // owner only
            canDeleteTenant: isOwner,             // owner only

            // 方案權限（Pro 專屬）
            canAccessShop: isPro,
            canUseMyshipEmail: isPro,
            canUseChromeExtension: isPro,
        }
    }, [tenants, currentTenant, tenant, tenantUserRole, isSuperAdmin])

    return permissions
}
