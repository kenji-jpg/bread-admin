'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/hooks/use-tenant'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function BillingPage() {
    const { tenant } = useTenant()
    const [copied, setCopied] = useState<string | null>(null)
    const { toast } = useToast()

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        setCopied(label)
        toast({
            title: '已複製',
            description: `${label}已複製到剪貼簿`,
        })
        setTimeout(() => setCopied(null), 2000)
    }

    const isExpiringSoon =
        tenant?.plan === 'pro' &&
        tenant?.plan_expires_at &&
        new Date(tenant.plan_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

    const isExpired =
        tenant?.plan === 'pro' &&
        tenant?.plan_expires_at &&
        new Date(tenant.plan_expires_at) < new Date()

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
                            {tenant?.plan === 'pro' ? 'Pro 專業版' : 'Basic 免費版'}
                        </Badge>
                        {tenant?.plan_expires_at && (
                            <span className="text-sm text-muted-foreground">
                                到期日：{new Date(tenant.plan_expires_at).toLocaleDateString('zh-TW')}
                            </span>
                        )}
                    </div>

                    {/* 到期提醒 */}
                    {isExpired && (
                        <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-destructive">訂閱已過期</p>
                                <p className="text-sm text-muted-foreground">請盡快續訂以繼續使用 Pro 功能</p>
                            </div>
                        </div>
                    )}

                    {isExpiringSoon && !isExpired && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-amber-900">訂閱即將到期</p>
                                <p className="text-sm text-amber-800">
                                    還剩{' '}
                                    {Math.ceil(
                                        (new Date(tenant.plan_expires_at!).getTime() - Date.now()) /
                                            (1000 * 60 * 60 * 24)
                                    )}{' '}
                                    天，請及時續訂
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 升級 Pro / 續訂 */}
            {(tenant?.plan === 'basic' || isExpired || isExpiringSoon) && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {tenant?.plan === 'basic' ? '升級 Pro 專業版' : '續訂 Pro 專業版'}
                        </CardTitle>
                        <CardDescription>
                            透過銀行轉帳付款，轉帳後約 5-10 分鐘自動開通
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* 方案價格 */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground">選擇方案</h3>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="border-2 border-primary rounded-lg p-4 space-y-2">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-bold">NT$ 599</span>
                                        <span className="text-sm text-muted-foreground">/ 月</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">每月訂閱，隨時可停</p>
                                </div>
                                <div className="border rounded-lg p-4 space-y-2 relative">
                                    <Badge className="absolute -top-2 -right-2" variant="secondary">
                                        省 NT$ 1,198
                                    </Badge>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-3xl font-bold">NT$ 5,990</span>
                                        <span className="text-sm text-muted-foreground">/ 年</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">年繳優惠，省兩個月</p>
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
                                <div className="border-t pt-3 mt-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-destructive">⚠️ 轉帳備註</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="destructive" className="font-mono text-sm">
                                                {tenant?.slug}
                                            </Badge>
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
                                </div>
                            </div>
                        </div>

                        {/* 重要提醒 */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                            <h4 className="font-semibold text-amber-900 flex items-center gap-2">
                                <AlertCircle className="h-5 w-5" />
                                重要提醒
                            </h4>
                            <ul className="text-sm text-amber-800 space-y-2">
                                <li className="flex items-start gap-2">
                                    <span className="font-bold mt-0.5">1.</span>
                                    <span>
                                        轉帳備註<strong>務必填寫</strong>：
                                        <Badge variant="outline" className="ml-1 font-mono">
                                            {tenant?.slug}
                                        </Badge>
                                    </span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-bold mt-0.5">2.</span>
                                    <span>
                                        金額：月費 <strong>NT$ 599</strong> 或 年費{' '}
                                        <strong>NT$ 5,990</strong>
                                    </span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-bold mt-0.5">3.</span>
                                    <span>轉帳後約 5-10 分鐘自動開通（系統自動處理）</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="font-bold mt-0.5">4.</span>
                                    <span>若超過 1 小時未開通，請透過客服系統聯繫我們</span>
                                </li>
                            </ul>
                        </div>

                        {/* 一鍵複製全部 */}
                        <Button
                            onClick={() => {
                                const info = `銀行：連線商業銀行（LINE Bank）\n代碼：824\n帳號：111003274710\n戶名：張高源\n備註：${tenant?.slug}\n金額：NT$ 599（月費）或 NT$ 5,990（年費）`
                                navigator.clipboard.writeText(info)
                                toast({
                                    title: '✅ 已複製轉帳資訊',
                                    description: '已複製完整轉帳資訊到剪貼簿',
                                })
                            }}
                            variant="outline"
                            className="w-full"
                        >
                            📋 一鍵複製完整轉帳資訊
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Pro 功能說明 */}
            <Card>
                <CardHeader>
                    <CardTitle>Pro 專業版功能</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>LIFF 商城（顧客端購物頁面）</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>賣貨便 Email 自動化（自動更新出貨狀態）</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>Chrome 插件整合</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>商城分類管理（無限制）</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>優先客服支援</span>
                        </li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    )
}
