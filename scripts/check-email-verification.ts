/**
 * 檢查 Supabase Email 驗證設定
 *
 * 使用方式：
 * npx tsx scripts/check-email-verification.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 缺少環境變數：NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})

async function checkEmailVerification() {
    console.log('🔍 檢查 Email 驗證設定...\n')

    try {
        // 使用 Admin API 查詢用戶
        const { data, error } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 10,
        })

        if (error) {
            throw error
        }

        const users = data.users.map((u) => ({
            id: u.id,
            email: u.email,
            email_confirmed_at: u.email_confirmed_at,
            created_at: u.created_at,
        }))

        console.log('📊 最近註冊的用戶：')
        console.table(
            users?.map((u) => ({
                Email: u.email,
                已驗證: u.email_confirmed_at ? '✅' : '❌',
                註冊時間: new Date(u.created_at).toLocaleString('zh-TW'),
                驗證時間: u.email_confirmed_at
                    ? new Date(u.email_confirmed_at).toLocaleString('zh-TW')
                    : '未驗證',
            }))
        )

        // 統計驗證率
        const total = users?.length || 0
        const confirmed = users?.filter((u) => u.email_confirmed_at).length || 0
        const rate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0'

        console.log(`\n📈 驗證率：${confirmed}/${total} (${rate}%)`)

        // 檢查是否有未驗證用戶
        const unconfirmed = users?.filter((u) => !u.email_confirmed_at) || []
        if (unconfirmed.length > 0) {
            console.log('\n⚠️  發現未驗證用戶：')
            unconfirmed.forEach((u) => {
                console.log(`   - ${u.email} (註冊於 ${new Date(u.created_at).toLocaleString('zh-TW')})`)
            })
            console.log(
                '\n💡 提示：若這些用戶可以登入，表示 Supabase 的 "Enable email confirmations" 未啟用'
            )
        } else {
            console.log('\n✅ 所有用戶都已驗證 Email')
        }

        console.log('\n🔧 如何啟用強制驗證：')
        console.log('   1. 前往 Supabase Dashboard')
        console.log('   2. Authentication → Settings → Email Auth')
        console.log('   3. 勾選 "Enable email confirmations"')
        console.log('   4. 儲存設定')
    } catch (err) {
        console.error('❌ 檢查失敗：', err)
        process.exit(1)
    }
}

checkEmailVerification()
