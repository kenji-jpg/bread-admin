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

        // 超級管理員擁有所有權限
        if (isSuperAdmin) {
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
            }
        }

        // 角色層級檢查
        const isOwner = role === 'owner'
        const isAdmin = role === 'owner' || role === 'admin'
        const isStaff = role === 'owner' || role === 'admin' || role === 'staff'
        const isViewer = role !== null

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
        }
    }, [tenants, currentTenant, tenant, tenantUserRole, isSuperAdmin])

    return permissions
}

// 便捷的權限檢查 HOC
export function withPermission<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    requiredPermission: keyof Omit<Permissions, 'role'>
) {
    return function PermissionGuard(props: P) {
        const permissions = usePermission()

        if (!permissions[requiredPermission]) {
            return (
                <div className="flex h-[60vh] items-center justify-center">
                    <div className="text-center">
                        <p className="text-muted-foreground">您沒有權限存取此功能</p>
                    </div>
                </div>
            )
        }

        return <WrappedComponent {...props} />
    }
}
