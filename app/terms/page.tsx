import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LegalContentRenderer, type ContentSection } from '@/components/legal-content-renderer'

export const metadata = {
    title: '服務條款 - PlusHub',
}

// 預設內容（DB 無資料時 fallback）
const DEFAULT_SECTIONS: ContentSection[] = [
    { title: '1. 服務說明', body: 'PlusHub（以下簡稱「本服務」）是由 PlusHub 團隊經營的多租戶團購管理 SaaS 平台。', items: null },
]

export default async function TermsPage() {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_platform_content_v1', { p_content_type: 'terms' })

    const title = data?.success ? data.title : '服務條款'
    const sections: ContentSection[] = data?.success ? data.content : DEFAULT_SECTIONS
    const updatedAt = data?.success ? data.updated_at : null

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <Link
                    href="/login"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8"
                >
                    <ArrowLeft className="h-4 w-4" />
                    返回
                </Link>

                <h1 className="text-3xl font-bold mb-2">{title}</h1>
                <p className="text-sm text-muted-foreground mb-8">
                    最後更新日期：{updatedAt
                        ? new Date(updatedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
                        : '2026 年 2 月 16 日'
                    }
                </p>

                <LegalContentRenderer sections={sections} />

                <div className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
                    © 2026 PlusHub 接單系統
                </div>
            </div>
        </div>
    )
}
