/**
 * 檢查訂閱到期並發送提醒
 *
 * 執行頻率：每天凌晨 2 點
 *
 * 功能：
 * 1. 檢查 3 天內到期的 Pro 租戶
 * 2. 發送續約提醒給租戶 owner
 * 3. 檢查已過期的租戶，自動降級 Basic
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        // 1. 檢查 3 天內到期的租戶（發送提醒）
        const threeDaysLater = new Date()
        threeDaysLater.setDate(threeDaysLater.getDate() + 3)

        const { data: expiringTenants } = await supabase
            .from('tenants')
            .select('id, slug, name, plan_expires_at, owner_email')
            .eq('plan', 'pro')
            .lte('plan_expires_at', threeDaysLater.toISOString())
            .gte('plan_expires_at', new Date().toISOString())

        console.log(`發現 ${expiringTenants?.length || 0} 個即將到期的租戶`)

        // TODO: 發送提醒給租戶（LINE Notify 或 Email）
        for (const tenant of expiringTenants || []) {
            const daysLeft = Math.ceil(
                (new Date(tenant.plan_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )

            console.log(`提醒租戶 ${tenant.slug}，還有 ${daysLeft} 天到期`)

            // TODO: 呼叫通知服務
            // await sendRenewalReminder(tenant, daysLeft)
        }

        // 2. 檢查已過期的租戶（自動降級）
        const { data: expiredTenants } = await supabase
            .from('tenants')
            .select('id, slug, name, plan_expires_at')
            .eq('plan', 'pro')
            .lt('plan_expires_at', new Date().toISOString())

        console.log(`發現 ${expiredTenants?.length || 0} 個已過期的租戶`)

        for (const tenant of expiredTenants || []) {
            console.log(`降級租戶 ${tenant.slug}`)

            await supabase
                .from('tenants')
                .update({
                    plan: 'basic',
                    plan_expires_at: null,
                    subscription_starts_at: null,
                    next_billing_date: null,
                })
                .eq('id', tenant.id)

            // TODO: 發送降級通知
            // await sendDowngradeNotification(tenant)
        }

        return new Response(
            JSON.stringify({
                success: true,
                expiring: expiringTenants?.length || 0,
                expired: expiredTenants?.length || 0,
            }),
            { headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
})
