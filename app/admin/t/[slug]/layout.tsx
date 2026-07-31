'use client'

import { useTenant } from '@/hooks/use-tenant'
import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CreditCard } from 'lucide-react'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'

/**
 * 租戶層攔截閘門：訂閱到期 / 店家被停用時，把一般使用者導向唯讀「請續費」畫面。
 * - 超管（含跨租戶唯讀）一律放行。
 * - 永久免費（plan_expires_at = NULL / 祖父條款）不算到期。
 * - 一律放行帳務頁，否則被鎖的人無法自己去繳費。
 * 這是「付款強制力」的前端閘門 —— 即使自動停用 cron 尚未啟用，到期也會被擋。
 * （後端 billing 欄位另有 trigger 防止一般 owner 自行竄改到期日，見 migration guard_tenant_billing_columns。）
 */
export default function TenantLayout({ children }: { children: React.ReactNode }) {
    const { tenant, isLoading, actualIsActive, isSuperAdminUser, isCrossTenantAccess } = useTenant()
    const pathname = usePathname()
    const params = useParams()
    const slug = (params?.slug as string) || ''

    // 主內容：預設為頁面；只有「非超管、非跨租戶、到期/停用」時才換成請續費閘門。
    // 導覽元件一律掛載（它自己判斷是否顯示），避免被上面的提早 return 跳過。
    let content: React.ReactNode = children
    const isPrivileged = isSuperAdminUser || isCrossTenantAccess
    if (!isLoading && tenant && !isPrivileged) {
        const expired = !!tenant.plan_expires_at && new Date(tenant.plan_expires_at).getTime() <= Date.now()
        const disabled = actualIsActive === false
        const onBillingPage = !!pathname?.includes('/settings/billing')
        if ((expired || disabled) && !onBillingPage) {
            content = <BillingGate slug={slug} disabled={disabled} expiresAt={tenant.plan_expires_at ?? null} />
        }
    }

    return (
        <>
            {content}
            <OnboardingTour />
        </>
    )
}

function BillingGate({ slug, disabled, expiresAt }: { slug: string; disabled: boolean; expiresAt: string | null }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                    <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
                <h1 className="mb-2 text-xl font-semibold">
                    {disabled ? '店家已停用' : '訂閱已到期'}
                </h1>
                <p className="mb-1 text-sm text-muted-foreground">
                    {disabled
                        ? '此店家目前已停用。續費或聯繫客服後即可恢復使用。'
                        : '你的方案已到期，續費後即可繼續使用完整功能。'}
                </p>
                {expiresAt && !disabled && (
                    <p className="mb-6 text-xs text-muted-foreground">
                        到期日：{new Date(expiresAt).toLocaleDateString('zh-TW')}
                    </p>
                )}
                {(!expiresAt || disabled) && <div className="mb-6" />}
                <Link href={`/admin/t/${slug}/settings/billing`} className="block">
                    <Button className="w-full gap-2 rounded-xl">
                        <CreditCard className="h-4 w-4" />
                        前往續費
                    </Button>
                </Link>
                <p className="mt-4 text-xs text-muted-foreground">
                    需要協助？請透過帳務頁的客服管道聯繫我們。
                </p>
            </div>
        </div>
    )
}
