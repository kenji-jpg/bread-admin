'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Store, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'

/**
 * 從後台一鍵喚起「賣貨便自動開賣場」外掛（第一階段整合）。
 * - 靠 window.postMessage 與外掛的 content-script 橋接（不需寫死外掛 ID）。
 * - 共用後台登入：把目前 Supabase session 傳給外掛 → 外掛不用再登入一次。
 * - 賣貨便本身的登入仍需使用者手動（7-11 帳號，無法也不該自動化）。
 */
export function MyshipOpenStoresButton() {
    const { tenant } = useTenant()
    const supabase = createClient()
    const [installed, setInstalled] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return
            const d = e.data
            if (!d || typeof d !== 'object') return
            if (d.__plushubExt === 'ready') setInstalled(true)
            if (d.__plushubExt === 'openStoresResult') {
                setBusy(false)
                if (d.ok) toast.success(`已喚起外掛，開始開賣場（${d.count ?? 0} 筆）— 若跳出賣貨便登入，請先登入再繼續`)
                else toast.error(`喚起外掛失敗：${d.error || '未知錯誤'}`)
            }
        }
        window.addEventListener('message', onMsg)
        // 主動探測（橋接可能比本元件早載入，錯過它的自我宣告）
        window.postMessage({ __plushub: 'ping' }, window.location.origin)
        return () => window.removeEventListener('message', onMsg)
    }, [])

    const openStores = async () => {
        if (!tenant?.id) return
        setBusy(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
            setBusy(false)
            toast.error('請先重新登入後台')
            return
        }
        window.postMessage({
            __plushub: 'openStores',
            payload: {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                tenantId: tenant.id,
            },
        }, window.location.origin)
        // 安全網：外掛沒回應就解除 busy
        setTimeout(() => setBusy(false), 8000)
    }

    // 偵測不到外掛 → 顯示安裝引導（之後換成 Chrome 商店未公開連結）
    if (!installed) {
        return (
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5"
                onClick={() => toast.info('請先安裝「賣貨便自動開賣場」Chrome 外掛，安裝後重新整理即可從這裡一鍵開賣場')}>
                <Download className="h-4 w-4" />
                安裝賣貨便外掛
            </Button>
        )
    }

    return (
        <Button size="sm" className="rounded-xl gap-1.5" onClick={openStores} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            批次開賣場
        </Button>
    )
}
