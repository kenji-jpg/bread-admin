'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/hooks/use-tenant'
import { Copy, Check, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type BillingCycle = 'monthly' | 'yearly'
type TargetPlan = 'basic' | 'pro'

const PLANS = {
    basic: { name: 'Basic 基本版', monthly: 199, yearly: 1990, yearlySave: 398 },
    pro: { name: 'Pro 專業版', monthly: 699, yearly: 6990, yearlySave: 1398 },
}

export default function BillingPage() {
    const { tenant } = useTenant()
    const [copied, setCopied] = useState<string | null>(null)
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly')
    const [selectedTarget, setSelectedTarget] = useState<TargetPlan>(
        tenant?.plan === 'pro' ? 'pro' : 'basic'
    )

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        setCopied(label)
        toast.success(`${label}已複製到剪貼簿`)
        setTimeout(() => setCopied(null), 2000)
    }

    // 到期判斷（不限方案）
    const isExpiringSoon =
        tenant?.plan_expires_at &&
        new Date(tenant.plan_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 &&
        new Date(tenant.plan_expires_at) > new Date()

    const isExpired =
        tenant?.plan_expires_at &&
        new Date(tenant.plan_expires_at) < new Date()

    const daysLeft = tenant?.plan_expires_at
        ? Math.ceil((new Date(tenant.plan_expires_at).getTime() - Date.now()) / 86400000)
        : null

    const targetPlan = PLANS[selectedTarget]
    const currentAmount = selectedCycle === 'monthly' ? targetPlan.monthly : targetPlan.yearly
    const shouldShowUpgrade = isExpired || isExpiringSoon || tenant?.plan === 'basic'

    // 判斷是否為免費（plan_expires_at = NULL 的現有租戶）
    const isFreeGrandfathered = !tenant?.plan_expires_at

    return (
        <div className="space-y-6">
            {/* 當前方案 */}
            <Card>
                <CardHeader>
                    <CardTitle>當前方案</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Badge variant={tenant?.plan === 'pro' ? 'default' : 'secondary'} className="text-sm">
                            {PLANS[tenant?.plan as TargetPlan]?.name || 'Basic 基本版'}
                        </Badge>
                        {tenant?.plan_expires_at && (
                            <span className="text-sm text-muted-foreground">
                                到期日：{new Date(tenant.plan_expires_at).toLocaleDateString('zh-TW')}
                            </span>
                        )}
                        {isFreeGrandfathered && (
                            <Badge variant="outline" className="text-xs">
                                免費使用中
                            </Badge>
                        )}
                    </div>

                    {/* 到期提醒 */}
                    {isExpired && (
                        <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-destructive">方案已過期</p>
                                <p className="text-sm text-muted-foreground">請盡快續費以繼續使用服務</p>
                            </div>
                        </div>
                    )}

                    {isExpiringSoon && !isExpired && (
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">方案即將到期</p>
                                <p className="text-sm text-muted-foreground">
                                    還剩 {daysLeft} 天，請及時續費
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 續訂 / 升級 */}
            {shouldShowUpgrade && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {tenant?.plan === 'pro' ? '續訂方案' : '續訂 / 升級方案'}
                        </CardTitle>
                        <CardDescription>
                            透過銀行轉帳付款，轉帳後約 5-10 分鐘自動開通
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* 目標方案選擇（Basic 用戶可選 Basic 或 Pro） */}
                        {tenant?.plan !== 'pro' && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm text-muted-foreground">選擇方案</h3>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <button
                                        onClick={() => setSelectedTarget('basic')}
                                        className={cn(
                                            'border-2 rounded-lg p-4 text-left transition-all relative',
                                            selectedTarget === 'basic'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/50'
                                        )}
                                    >
                                        {selectedTarget === 'basic' && (
                                            <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                                        )}
                                        <p className="font-semibold">Basic 基本版</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            商品、訂單、結帳、會員管理
                                        </p>
                                        <p className="text-lg font-bold mt-2">NT$ 199 <span className="text-sm font-normal text-muted-foreground">/ 月</span></p>
                                    </button>
                                    <button
                                        onClick={() => setSelectedTarget('pro')}
                                        className={cn(
                                            'border-2 rounded-lg p-4 text-left transition-all relative',
                                            selectedTarget === 'pro'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/50'
                                        )}
                                    >
                                        <Badge className="absolute -top-2 -right-2" variant="default">
                                            推薦
                                        </Badge>
                                        {selectedTarget === 'pro' && (
                                            <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                                        )}
                                        <p className="font-semibold">Pro 專業版</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            LIFF 商城、賣貨便自動化、Chrome 插件
                                        </p>
                                        <p className="text-lg font-bold mt-2">NT$ 699 <span className="text-sm font-normal text-muted-foreground">/ 月</span></p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 月繳 / 年繳選擇 */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground">繳費週期</h3>
                            <div className="grid gap-3 md:grid-cols-2">
                                {/* 月繳 */}
                                <button
                                    onClick={() => setSelectedCycle('monthly')}
                                    className={cn(
                                        'border-2 rounded-lg p-4 space-y-2 text-left transition-all',
                                        selectedCycle === 'monthly'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50'
                                    )}
                                >
                                    {selectedCycle === 'monthly' && (
                                        <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-primary" />
                                    )}
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-bold">NT$ {targetPlan.monthly.toLocaleString()}</span>
                                        <span className="text-sm text-muted-foreground">/ 月</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">每月訂閱，隨時可停</p>
                                </button>

                                {/* 年繳 */}
                                <button
                                    onClick={() => setSelectedCycle('yearly')}
                                    className={cn(
                                        'border-2 rounded-lg p-4 space-y-2 text-left transition-all relative',
                                        selectedCycle === 'yearly'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50'
                                    )}
                                >
                                    <Badge className="absolute -top-2 -right-2" variant="secondary">
                                        省 NT$ {targetPlan.yearlySave.toLocaleString()}
                                    </Badge>
                                    {selectedCycle === 'yearly' && (
                                        <CheckCircle2 className="absolute top-2 left-2 h-5 w-5 text-primary" />
                                    )}
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-bold">NT$ {targetPlan.yearly.toLocaleString()}</span>
                                        <span className="text-sm text-muted-foreground">/ 年</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">年繳優惠，省兩個月</p>
                                </button>
                            </div>
                        </div>

                        {/* 即時顯示應付金額 */}
                        <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/20">
                            <div className="flex items-baseline justify-between">
                                <span className="text-sm font-medium text-muted-foreground">應付金額</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold gradient-text">
                                        NT$ {currentAmount.toLocaleString()}
                                    </span>
                                    <Badge variant={selectedCycle === 'yearly' ? 'default' : 'secondary'}>
                                        {selectedCycle === 'monthly' ? '月繳' : '年繳'} {targetPlan.name}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* 轉帳資訊 */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground">轉帳資訊</h3>
                            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">銀行</span>
                                    <span className="font-medium">連線商業銀行（LINE Bank）</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">代碼</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-medium">824</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => copyToClipboard('824', '銀行代碼')}
                                        >
                                            {copied === '銀行代碼' ? (
                                                <Check className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">帳號</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-medium">111003274710</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => copyToClipboard('111003274710', '帳號')}
                                        >
                                            {copied === '帳號' ? (
                                                <Check className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">戶名</span>
                                    <span className="font-medium">張高源</span>
                                </div>
                                <div className="flex justify-between items-center border-t pt-3">
                                    <span className="text-sm text-muted-foreground">備註（必填）</span>
                                    <div className="flex items-center gap-2">
                                        <code className="font-mono font-medium text-destructive bg-destructive/10 px-2 py-1 rounded">
                                            {tenant?.slug}
                                        </code>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => copyToClipboard(tenant?.slug || '', '備註')}
                                        >
                                            {copied === '備註' ? (
                                                <Check className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center border-t pt-3">
                                    <span className="text-sm text-muted-foreground font-semibold">
                                        轉帳金額
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg text-primary">
                                            NT$ {currentAmount.toLocaleString()}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() =>
                                                copyToClipboard(currentAmount.toString(), '金額')
                                            }
                                        >
                                            {copied === '金額' ? (
                                                <Check className="h-4 w-4 text-green-600" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 一鍵複製全部 */}
                        <Button
                            onClick={() => {
                                const info = `銀行：連線商業銀行（LINE Bank）\n代碼：824\n帳號：111003274710\n戶名：張高源\n備註：${tenant?.slug}\n方案：${targetPlan.name}（${selectedCycle === 'monthly' ? '月繳' : '年繳'}）\n金額：NT$ ${currentAmount.toLocaleString()}`
                                navigator.clipboard.writeText(info)
                                toast.success('已複製完整轉帳資訊到剪貼簿')
                            }}
                            variant="default"
                            className="w-full gradient-primary"
                        >
                            📋 一鍵複製完整轉帳資訊（NT$ {currentAmount.toLocaleString()}）
                        </Button>

                        {/* 重要提醒 */}
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p className="font-semibold text-foreground">📌 重要提醒</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>
                                    備註<span className="text-destructive font-bold">必須填寫</span>您的租戶
                                    slug：<code className="bg-muted px-1 rounded">{tenant?.slug}</code>
                                </li>
                                <li>
                                    轉帳金額：
                                    <span className="font-mono font-bold text-primary">
                                        NT$ {currentAmount.toLocaleString()}
                                    </span>
                                </li>
                                <li>轉帳後約 5-10 分鐘自動開通，請勿重複轉帳</li>
                                <li>
                                    如有問題請聯繫客服：
                                    <a
                                        href="mailto:admin@plushub.cc"
                                        className="text-primary hover:underline ml-1"
                                    >
                                        admin@plushub.cc
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pro 功能清單（Basic 用戶升級誘因） */}
            {(shouldShowUpgrade || tenant?.plan === 'basic') && (
                <Card>
                    <CardHeader>
                        <CardTitle>Pro 專業版功能</CardTitle>
                        <CardDescription>升級後立即解鎖以下功能</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                                <span className="text-sm">
                                    <span className="font-semibold">LIFF 商城</span> -
                                    顧客透過專屬連結瀏覽商品並下單
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                                <span className="text-sm">
                                    <span className="font-semibold">賣貨便 Email 自動化</span> -
                                    自動追蹤訂單狀態，無需手動更新
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                                <span className="text-sm">
                                    <span className="font-semibold">Chrome 插件</span> -
                                    快速開賣場、一鍵複製訂單（即將推出）
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                                <span className="text-sm">
                                    <span className="font-semibold">優先客服支援</span> -
                                    更快的回應時間
                                </span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
