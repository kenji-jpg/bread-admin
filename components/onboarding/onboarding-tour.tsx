'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/hooks/use-tenant'
import { usePermission } from '@/hooks/use-permission'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ArrowUp, Monitor, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * 新戶第一次導覽：LINE 尚未連接時，引導 儀表板 → 店家設定 → LINE 設定 tab。
 * - 觸發：owner/管理員、非跨租戶、tenant 未連接 LINE(has_line_channel_token=false)、未略過。
 * - 桌機：灰色剪影 spotlight + 箭頭 + 底部步驟指示（步驟 X/2）。
 * - 手機(<lg)：不跑導覽，改顯示「請用電腦版操作」提示。
 * - 完成/略過 → dismiss_onboarding_v1 寫 settings.onboarding.line_dismissed=true。
 */
const PAD = 8

type TenantLoose = {
    id?: string
    slug?: string
    has_line_channel_token?: boolean
    settings?: { onboarding?: { line_dismissed?: boolean } }
}

export function OnboardingTour() {
    const { tenant, isCrossTenantAccess, refetch } = useTenant()
    const { canManageSettings } = usePermission()
    const pathname = usePathname()
    const supabase = createClient()

    const [rect, setRect] = useState<DOMRect | null>(null)
    const [isMobile, setIsMobile] = useState(false)
    const [hidden, setHidden] = useState(false)
    const [forcePreview, setForcePreview] = useState(false)
    const completedRef = useRef(false)

    // 預覽用：網址帶 ?tour=1 可強制顯示（已連 LINE / 已略過的租戶也能預覽）。跨頁保留（layout 不卸載）。
    useEffect(() => {
        if (new URLSearchParams(window.location.search).has('tour')) setForcePreview(true)
    }, [])

    const t = tenant as TenantLoose | null
    const slug = t?.slug
    const settingsRoot = slug ? `/admin/t/${slug}/settings` : null
    const onSettings = !!(settingsRoot && pathname?.startsWith(settingsRoot))
    const step = onSettings ? 2 : 1

    const dismissed = t?.settings?.onboarding?.line_dismissed === true
    const hasLine = t?.has_line_channel_token === true
    const eligible = !!t && !isCrossTenantAccess && canManageSettings && (forcePreview || (!hasLine && !dismissed)) && !hidden

    // 手機偵測（<lg 側邊欄收合 → 改顯示提示）
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const dismiss = useCallback(async (key: string = 'line_dismissed') => {
        setHidden(true)
        if (!t?.id) return
        try {
            await supabase.rpc('dismiss_onboarding_v1', { p_tenant_id: t.id, p_key: key })
            refetch()
        } catch { /* 靜默：本地已隱藏 */ }
    }, [t?.id, supabase, refetch])

    const selector = step === 1 ? 'a[href$="/settings"]' : '[data-tour="tab-line"]'

    const findTarget = useCallback((): HTMLElement | null => {
        const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
        return els.find((el) => el.offsetParent !== null) || els[0] || null
    }, [selector])

    // 持續追蹤目標位置 + 偵測第二步完成（LINE tab 變 active）
    useEffect(() => {
        if (!eligible || isMobile) { setRect(null); return }
        let raf = 0
        const loop = () => {
            const el = findTarget()
            if (el) {
                setRect(el.getBoundingClientRect())
                if (step === 2 && !completedRef.current && el.getAttribute('data-state') === 'active') {
                    completedRef.current = true
                    dismiss()
                    toast.success('太好了！在這裡貼上 LINE Token 就完成連接，點「如何取得 Token」看教學。')
                }
            } else {
                setRect(null)
            }
            raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [eligible, isMobile, findTarget, step, dismiss])

    if (!eligible) return null

    // 手機：只顯示「請用電腦版」提示
    if (isMobile) {
        return (
            <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto max-w-md rounded-2xl border border-primary/30 bg-card p-4 shadow-lg">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Monitor className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">建議用電腦版完成設定</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            連接 LINE（貼上 Token / Secret）請用電腦開啟後台 → 店家設定 → LINE 設定。
                        </p>
                    </div>
                    <button onClick={() => dismiss()} className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="關閉">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        )
    }

    if (!rect) return null

    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    const hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }

    // 說明卡位置：第①步(側邊欄)→放右側；第②步(上方 tab)→放下方
    const callout = step === 1
        ? { top: Math.max(12, hole.top - 8), left: hole.left + hole.width + 16, arrow: 'left' as const }
        : { top: hole.top + hole.height + 16, left: Math.max(12, hole.left - 8), arrow: 'up' as const }

    // 容器 pointer-events-none → 中間「洞」可穿透點到目標；暗色遮罩各自 auto → 只擋暗處
    const dim = 'absolute bg-black/60 pointer-events-auto'
    return (
        <div className="pointer-events-none fixed inset-0 z-[60]">
            {/* 四塊遮罩，中間留洞（洞內可點目標） */}
            <div className={dim} style={{ top: 0, left: 0, width: vw, height: Math.max(0, hole.top) }} />
            <div className={dim} style={{ top: hole.top + hole.height, left: 0, width: vw, height: Math.max(0, vh - hole.top - hole.height) }} />
            <div className={dim} style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
            <div className={dim} style={{ top: hole.top, left: hole.left + hole.width, width: Math.max(0, vw - hole.left - hole.width), height: hole.height }} />

            {/* 目標高亮框 */}
            <div
                className="pointer-events-none absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent"
                style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            />

            {/* 說明卡 */}
            <div
                className="pointer-events-auto absolute w-[min(280px,80vw)] rounded-2xl border border-primary/30 bg-card p-4 shadow-xl"
                style={{ top: callout.top, left: Math.min(callout.left, vw - 300) }}
            >
                <div className="flex items-start gap-2">
                    {callout.arrow === 'left'
                        ? <ArrowLeft className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-primary" />
                        : <ArrowUp className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-primary" />}
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">
                            {step === 1 ? '① 先到「店家設定」' : '② 點開「LINE 設定」'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {step === 1
                                ? '點左側「店家設定」，我們幫你連接 LINE 官方帳號。'
                                : '在這裡貼上 Channel Access Token 與 Secret 連接 LINE。可點「如何取得 Token」看教學。'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 底部置中步驟指示 + 略過 */}
            <div className="pointer-events-auto fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/60 bg-card px-4 py-2 shadow-lg">
                <span className="text-sm font-medium">步驟 {step} / 2</span>
                <span className="text-muted-foreground/40">·</span>
                <button onClick={() => dismiss()} className="text-sm text-muted-foreground hover:text-foreground">
                    略過導覽
                </button>
            </div>
        </div>
    )
}
