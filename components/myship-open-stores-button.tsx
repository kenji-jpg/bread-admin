'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { useCheckout, type CheckoutListItem } from '@/hooks/use-checkout'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Store, Loader2, Download, Calculator } from 'lucide-react'
import { toast } from 'sonner'

// Chrome Web Store 未公開上架連結（上架後回填；空字串時退回純文字引導）
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/penmofopldbgfnlinapelcnonmfmijkj'

// 手機／平板無法裝桌面 Chrome 外掛，開賣場一律用電腦操作
const isMobileUA = () =>
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

// 賣貨便單一賣場金額上限的快選（湊到接近上限、少開幾個賣場少付幾次運費）
const PRESET_TARGETS = [
    { label: '2萬', value: 20000 },
    { label: '3萬', value: 30000 },
    { label: '4萬', value: 40000 },
    { label: '5萬', value: 50000 },
]

// 開賣場用金額：有預付則用尚欠額，否則用總額
const amountOf = (c: CheckoutListItem) => Number(c.outstanding_amount ?? c.total_amount) || 0

/**
 * 從後台一鍵喚起「賣貨便自動開賣場」外掛（整合第一階段 + 選擇步驟）。
 * - 靠 window.postMessage 與外掛的 content-script 橋接（不需寫死外掛 ID）。
 * - 點按鈕先開「選擇 Modal」：列待處理賣貨便單、勾選、全選、湊金額，只把選定的
 *   checkout id「有序清單」傳給外掛（外掛照此順序建佇列，不再自己抓全部 pending）。
 * - 共用後台登入：把目前 Supabase session 傳給外掛 → 外掛不用再登入一次。
 * - 賣貨便本身的登入仍需使用者手動（7-11 帳號，無法也不該自動化）。
 */
export function MyshipOpenStoresButton() {
    const { tenant } = useTenant()
    const supabase = createClient()
    const { listCheckouts } = useCheckout(tenant?.id || '')
    const [installed, setInstalled] = useState(false)
    const [busy, setBusy] = useState(false)

    // Modal 狀態
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [checkouts, setCheckouts] = useState<CheckoutListItem[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [target, setTarget] = useState('')

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

    // 抓待處理的賣貨便結帳單（分頁拉全 + client 端過濾賣貨便系列，與外掛邏輯一致）
    const loadPending = useCallback(async () => {
        if (!tenant?.id) return
        setLoading(true)
        try {
            const PAGE = 50
            let all: CheckoutListItem[] = []
            let offset = 0
            for (let i = 0; i < 40; i++) { // 上限 2000 筆保險絲
                const res = await listCheckouts('pending', undefined, PAGE, offset)
                const page = res?.checkouts || []
                all = all.concat(page)
                const total = res?.total || 0
                offset += PAGE
                if (total > 0 ? offset >= total : page.length < PAGE) break
            }
            // 只留賣貨便系列（shipping_method 多為 NULL，前端預設賣貨便）
            const myship = all.filter(c =>
                !c.shipping_method || c.shipping_method === 'myship' || c.shipping_method === 'myship_free'
            )
            setCheckouts(myship)
            setSelected(new Set(myship.map(c => c.id))) // 預設全選
        } catch {
            toast.error('讀取待處理結帳單失敗，請重試')
            setCheckouts([])
            setSelected(new Set())
        } finally {
            setLoading(false)
        }
    }, [tenant?.id, listCheckouts])

    const openModal = () => {
        setTarget('')
        setOpen(true)
        loadPending()
    }

    const toggleOne = (id: string, checked: boolean) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (checked) next.add(id); else next.delete(id)
            return next
        })
    }

    const allChecked = checkouts.length > 0 && selected.size === checkouts.length
    const toggleAll = (checked: boolean) => {
        setSelected(checked ? new Set(checkouts.map(c => c.id)) : new Set())
    }

    // 湊金額：依清單「排列順序」由上往下拿，能加就加、會超過的跳過，湊出總額 ≤ 目標的一組
    // （與外掛 popup.js fillToTarget 同一套貪心規則）
    const fillToTarget = (t: number) => {
        if (!Number.isFinite(t) || t <= 0) {
            toast.error('請輸入有效的目標金額')
            return
        }
        let sum = 0
        const picked: string[] = []
        for (const c of checkouts) {
            const amt = amountOf(c)
            if (amt <= 0) continue
            if (sum + amt <= t) {
                picked.push(c.id)
                sum += amt
            }
        }
        if (picked.length === 0) {
            toast.error(`沒有可湊的單（最小一筆就超過 $${t.toLocaleString()}）`)
            return
        }
        setSelected(new Set(picked))
        const gap = t - sum
        toast.success(`已湊 $${sum.toLocaleString()}（${picked.length} 筆），距目標還差 $${gap.toLocaleString()}`)
    }

    const selectedTotal = checkouts.reduce((s, c) => (selected.has(c.id) ? s + amountOf(c) : s), 0)

    const confirmOpen = async () => {
        if (!tenant?.id || selected.size === 0) return
        setBusy(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
            setBusy(false)
            toast.error('請先重新登入後台')
            return
        }
        // 依清單順序輸出選定的 id（外掛照此順序建佇列）
        const checkoutIds = checkouts.filter(c => selected.has(c.id)).map(c => c.id)
        window.postMessage({
            __plushub: 'openStores',
            payload: {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                tenantId: tenant.id,
                checkoutIds,
            },
        }, window.location.origin)
        setOpen(false)
        // 安全網：外掛沒回應就解除 busy
        setTimeout(() => setBusy(false), 8000)
    }

    // 手機／平板：外掛只能在電腦版 Chrome，直接擋並說明
    if (isMobileUA()) {
        return (
            <span className="text-xs text-muted-foreground px-2 py-1.5 rounded-lg bg-muted/50">
                批次開賣場請用電腦版 Chrome
            </span>
        )
    }

    // 偵測不到外掛 → 第一次安裝引導（開 Chrome Web Store 未公開頁；安裝後自動偵測，免手動重整）
    if (!installed) {
        const onInstall = () => {
            if (CHROME_STORE_URL) {
                window.open(CHROME_STORE_URL, '_blank', 'noopener,noreferrer')
                toast.info('安裝完成後回到本頁即可自動偵測；若沒反應請重新整理')
            } else {
                toast.info('請先安裝「賣貨便自動開賣場」Chrome 外掛，安裝後重新整理即可從這裡一鍵開賣場')
            }
        }
        return (
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onInstall}>
                <Download className="h-4 w-4" />
                安裝開賣場外掛
            </Button>
        )
    }

    return (
        <>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={openModal} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                批次開賣場
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>選擇要開賣場的結帳單</DialogTitle>
                        <DialogDescription>
                            勾選要開的賣貨便單，或用「湊金額」湊到接近單店上限（少開幾個賣場、少付幾次運費）。
                        </DialogDescription>
                    </DialogHeader>

                    {/* 湊金額工具列 */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {PRESET_TARGETS.map(p => (
                            <Button key={p.value} type="button" variant="outline" size="sm"
                                className="rounded-lg h-8 px-2.5"
                                onClick={() => { setTarget(String(p.value)); fillToTarget(p.value) }}>
                                {p.label}
                            </Button>
                        ))}
                        <div className="flex items-center gap-1.5 ml-auto">
                            <Input type="number" inputMode="numeric" min={0} step={1000}
                                placeholder="目標金額" value={target}
                                onChange={e => setTarget(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') fillToTarget(parseInt(target, 10)) }}
                                className="h-8 w-28 rounded-lg" />
                            <Button type="button" size="sm" variant="secondary" className="rounded-lg h-8 gap-1"
                                onClick={() => fillToTarget(parseInt(target, 10))}>
                                <Calculator className="h-3.5 w-3.5" /> 湊
                            </Button>
                        </div>
                    </div>

                    {/* 全選列 */}
                    <div className="flex items-center gap-2 border-b pb-2">
                        <Checkbox id="myship-select-all" checked={allChecked}
                            onCheckedChange={v => toggleAll(v === true)}
                            disabled={loading || checkouts.length === 0} />
                        <label htmlFor="myship-select-all" className="text-sm font-medium cursor-pointer select-none">
                            全選（共 {checkouts.length} 筆）
                        </label>
                    </div>

                    {/* 清單 */}
                    <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> 讀取中…
                            </div>
                        ) : checkouts.length === 0 ? (
                            <div className="py-10 text-center text-muted-foreground text-sm">
                                沒有待開賣場的賣貨便結帳單
                            </div>
                        ) : checkouts.map(c => {
                            const isSel = selected.has(c.id)
                            const shortNo = (c.checkout_no || '').split('-').pop() || c.checkout_no
                            const name = c.member_nickname || c.member_display_name || c.customer_name || '客人'
                            return (
                                <label key={c.id}
                                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${isSel ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
                                    <Checkbox checked={isSel} onCheckedChange={v => toggleOne(c.id, v === true)} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">{name}</div>
                                        <div className="text-xs text-muted-foreground">#{shortNo} · {c.item_count} 項</div>
                                    </div>
                                    <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                                        ${amountOf(c).toLocaleString()}
                                    </div>
                                </label>
                            )
                        })}
                    </div>

                    <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            已選 <span className="font-semibold text-foreground">{selected.size}</span> 筆 ·
                            合計 <span className="font-semibold text-foreground tabular-nums">${selectedTotal.toLocaleString()}</span>
                        </div>
                        <Button className="rounded-xl gap-1.5" disabled={selected.size === 0 || busy} onClick={confirmOpen}>
                            <Store className="h-4 w-4" />
                            開始開賣場（{selected.size}）
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
