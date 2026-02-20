/**
 * 檢查訂閱到期並發送提醒 + 暫停租戶
 *
 * 執行頻率：每天凌晨 2 點
 *
 * 功能：
 * 1. 檢查 3 天內到期的租戶（所有方案），發送續約提醒
 * 2. 檢查已過期的租戶，自動暫停（is_active = false）
 *    - Pro/Max 到期 → 降級 basic + 暫停
 *    - Basic 到期 → 保持 basic + 暫停
 *
 * 注意：plan_expires_at = NULL 的租戶（現有免費租戶）不受影響
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        // 1. 檢查 3 天內到期的租戶（不限方案，只要有 plan_expires_at）
        const threeDaysLater = new Date()
        threeDaysLater.setDate(threeDaysLater.getDate() + 3)

        const { data: expiringTenants } = await supabase
            .from('tenants')
            .select('id, slug, name, plan, plan_expires_at, owner_email')
            .not('plan_expires_at', 'is', null)
            .lte('plan_expires_at', threeDaysLater.toISOString())
            .gte('plan_expires_at', new Date().toISOString())
            .eq('is_active', true)

        console.log(`發現 ${expiringTenants?.length || 0} 個即將到期的租戶`)

        for (const tenant of expiringTenants || []) {
            const daysLeft = Math.ceil(
                (new Date(tenant.plan_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )

            console.log(`提醒租戶 ${tenant.slug}（${tenant.plan}），還有 ${daysLeft} 天到期`)

            // TODO: 呼叫通知服務
            // await sendRenewalReminder(tenant, daysLeft)
        }

        // 2. 檢查已過期的租戶（自動暫停）
        const { data: expiredTenants } = await supabase
            .from('tenants')
            .select('id, slug, name, plan, plan_expires_at')
            .not('plan_expires_at', 'is', null)
            .lt('plan_expires_at', new Date().toISOString())
            .eq('is_active', true)

        console.log(`發現 ${expiredTenants?.length || 0} 個已過期的租戶`)

        for (const tenant of expiredTenants || []) {
            console.log(`暫停租戶 ${tenant.slug}（原方案: ${tenant.plan}）`)

            await supabase
                .from('tenants')
                .update({
                    plan: 'basic', // Pro/Max → basic, Basic 保持 basic
                    is_active: false,
                    plan_expires_at: null,
                    subscription_starts_at: null,
                    next_billing_date: null,
                })
                .eq('id', tenant.id)

            // TODO: 發送暫停通知
            // await sendSuspensionNotification(tenant)
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
