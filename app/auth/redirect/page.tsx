import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * 登入後跳轉頁面
 * 用來決定已登入用戶應該導向哪裡
 * 這樣可以避免在 middleware 中做複雜的 RPC 呼叫
 */
export default async function AuthRedirectPage() {
    const supabase = await createClient()

    // 取得用戶資訊
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // 檢查是否為超級管理員
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin') as { data: boolean | null }

    if (isSuperAdmin) {
        redirect('/admin')
    }

    // 取得用戶的店家
    const { data: tenantsData } = await supabase.rpc('get_user_tenants_v1') as {
        data: { success: boolean; tenants?: { slug: string }[] } | null
    }

    const firstTenantSlug = tenantsData?.tenants?.[0]?.slug

    if (firstTenantSlug) {
        redirect(`/admin/t/${firstTenantSlug}`)
    }

    // 沒有店家，導向建立店家頁面
    redirect('/create-tenant')
}
