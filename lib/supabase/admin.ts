import { createClient } from '@supabase/supabase-js'

/**
 * Service role Supabase client（僅限 Server 端使用）
 * 繞過 RLS，用於不需要 user auth 的伺服端操作
 * 例如：OG share 頁面需要讀取 tenant + product 資料，但爬蟲沒有 auth cookies
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
