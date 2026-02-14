'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    CheckCircle2,
    XCircle,
    AlertCircle,
    ArrowLeft,
    Loader2,
    Smartphone,
    Info,
} from 'lucide-react'
import { toast } from 'sonner'

interface ParsedNotification {
    success: boolean
    error?: string
    message?: string
    amount?: number
    tenant_slug?: string
    transfer_date?: string
    tenant_name?: string
    subscription_type?: 'monthly' | 'yearly'
    subscription_ends_at?: string
}

export default function VerifyPaymentPage() {
    const [notificationText, setNotificationText] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [result, setResult] = useState<ParsedNotification | null>(null)
    const { isSuperAdmin } = useAuth()
    const supabase = createClient()

    const handleVerify = async () => {
        if (!notificationText.trim()) {
            toast.error('請輸入 LINE Bank 通知內容')
            return
        }

        setIsProcessing(true)
        setResult(null)

        try {
            const { data, error } = (await supabase.rpc('process_linebank_notification', {
                p_notification_text: notificationText.trim(),
            })) as {
                data: ParsedNotification | null
                error: Error | null
            }

            if (error) {
                console.error('RPC error:', error)
                toast.error('處理失敗：' + error.message)
                setResult({
                    success: false,
                    error: error.message,
                })
                return
            }

            if (!data) {
                toast.error('未收到回應')
                setResult({
                    success: false,
                    error: '未收到回應',
                })
                return
            }

            setResult(data)

            if (data.success) {
                toast.success('付款驗證成功！')
            } else {
                toast.error(data.message || '驗證失敗')
            }
        } catch (error) {
            console.error('Verification error:', error)
            toast.error('處理失敗')
            setResult({
                success: false,
                error: error instanceof Error ? error.message : '未知錯誤',
            })
        } finally {
            setIsProcessing(false)
        }
    }

    const handleClear = () => {
        setNotificationText('')
        setResult(null)
    }

    if (!isSuperAdmin) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">您沒有權限存取此頁面</p>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-6"
        >
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/payments">
                    <Button variant="ghost" size="icon" className="rounded-lg">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">驗證 LINE Bank 付款</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">貼上 LINE 通知內容，自動驗證並升級租戶</p>
                </div>
            </div>

            {/* 使用說明 */}
            <Alert className="border-primary/50 bg-primary/5">
                <Smartphone className="h-4 w-4" />
                <AlertTitle>使用說明</AlertTitle>
                <AlertDescription className="space-y-2 mt-2">
                    <p>1. 開啟 LINE，找到 LINE Bank 的轉帳通知訊息</p>
                    <p>2. 長按訊息 → 選擇「複製」（複製完整訊息內容）</p>
                    <p>3. 貼上到下方文字框，點擊「驗證付款」</p>
                    <p className="text-xs text-muted-foreground mt-2">
                        ⚠️ 系統會自動辨識金額、備註（slug）、時間，並升級對應租戶
                    </p>
                </AlertDescription>
            </Alert>

            {/* 通知內容輸入 */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle>LINE Bank 通知內容</CardTitle>
                    <CardDescription>
                        完整複製 LINE Bank 的轉帳通知訊息（包含金額、備註、時間）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="notification">通知內容</Label>
                        <Textarea
                            id="notification"
                            placeholder={`範例：

您已成功轉出 NT$599 到 張高源

備註：bread-lady
時間：2024/02/14 15:30

--
LINE Bank 連線商業銀行`}
                            value={notificationText}
                            onChange={(e) => setNotificationText(e.target.value)}
                            className="rounded-xl resize-none font-mono text-sm"
                            rows={12}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleVerify}
                            disabled={isProcessing || !notificationText.trim()}
                            className="flex-1 rounded-xl gradient-primary"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    處理中...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    驗證付款
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={handleClear}
                            disabled={isProcessing}
                            variant="outline"
                            className="rounded-xl"
                        >
                            清空
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 驗證結果 */}
            {result && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <Card
                        className={`border-2 ${result.success ? 'border-success/50 bg-success/5' : 'border-destructive/50 bg-destructive/5'}`}
                    >
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {result.success ? (
                                    <>
                                        <CheckCircle2 className="h-5 w-5 text-success" />
                                        <span className="text-success">驗證成功</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-5 w-5 text-destructive" />
                                        <span className="text-destructive">驗證失敗</span>
                                    </>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {result.success ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-muted-foreground">租戶</Label>
                                            <p className="font-medium">{result.tenant_name}</p>
                                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                {result.tenant_slug}
                                            </code>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-muted-foreground">金額</Label>
                                            <p className="font-mono font-bold text-lg">
                                                NT$ {result.amount?.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-muted-foreground">訂閱類型</Label>
                                            <Badge
                                                variant={
                                                    result.subscription_type === 'yearly'
                                                        ? 'default'
                                                        : 'secondary'
                                                }
                                            >
                                                {result.subscription_type === 'monthly'
                                                    ? '月繳'
                                                    : '年繳'}
                                            </Badge>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-muted-foreground">
                                                訂閱到期日
                                            </Label>
                                            <p className="text-sm">
                                                {result.subscription_ends_at
                                                    ? new Date(
                                                          result.subscription_ends_at
                                                      ).toLocaleDateString('zh-TW')
                                                    : '-'}
                                            </p>
                                        </div>
                                    </div>

                                    <Alert className="border-success/50 bg-success/10">
                                        <Info className="h-4 w-4" />
                                        <AlertTitle>處理完成</AlertTitle>
                                        <AlertDescription>
                                            {result.message ||
                                                '已建立付款記錄並升級租戶為 Pro 方案'}
                                        </AlertDescription>
                                    </Alert>

                                    <div className="flex gap-2">
                                        <Link href="/admin/payments" className="flex-1">
                                            <Button variant="outline" className="w-full rounded-xl">
                                                查看所有付款記錄
                                            </Button>
                                        </Link>
                                        <Button
                                            onClick={handleClear}
                                            variant="default"
                                            className="flex-1 rounded-xl"
                                        >
                                            繼續驗證其他付款
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Alert className="border-destructive/50 bg-destructive/10">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>錯誤</AlertTitle>
                                        <AlertDescription>
                                            {result.message || result.error || '未知錯誤'}
                                        </AlertDescription>
                                    </Alert>

                                    <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
                                        <p className="text-sm font-medium">常見問題：</p>
                                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                            <li>備註中的 slug 不存在或拼寫錯誤</li>
                                            <li>金額不符（月繳應為 599，年繳應為 5990）</li>
                                            <li>通知格式不正確（請完整複製 LINE Bank 通知）</li>
                                            <li>租戶已經是 Pro 方案（需使用手動續訂）</li>
                                        </ul>
                                    </div>

                                    <Button
                                        onClick={handleClear}
                                        variant="outline"
                                        className="w-full rounded-xl"
                                    >
                                        重新輸入
                                    </Button>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* 範例通知 */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="text-sm">📱 LINE Bank 通知範例</CardTitle>
                </CardHeader>
                <CardContent>
                    <pre className="text-xs p-4 rounded-lg bg-muted/50 border overflow-x-auto">
                        {`您已成功轉出 NT$599 到 張高源

備註：bread-lady
時間：2024/02/14 15:30

--
LINE Bank 連線商業銀行`}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">
                        💡 系統會自動辨識：金額（599）、備註（bread-lady）、時間（2024/02/14 15:30）
                    </p>
                </CardContent>
            </Card>
        </motion.div>
    )
}
