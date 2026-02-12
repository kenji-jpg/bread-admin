'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ArrowLeft, Building2, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewTenantPage() {
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [ownerEmail, setOwnerEmail] = useState('')
    const [plan, setPlan] = useState('basic')
    const [isSaving, setIsSaving] = useState(false)
    const { isSuperAdmin } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    const generateSlug = (name: string) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
    }

    const handleNameChange = (value: string) => {
        setName(value)
        if (!slug || slug === generateSlug(name)) {
            setSlug(generateSlug(value))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name || !slug) {
            toast.error('請填寫必要欄位')
            return
        }

        setIsSaving(true)

        try {
            // 使用 RPC 函數建立租戶（避免直接查詢 tenants 表）
            const { data, error } = await supabase.rpc('register_tenant_with_plan', {
                p_name: name,
                p_slug: slug,
                p_plan_code: plan
            }) as {
                data: { success: boolean; tenant_id?: string; slug?: string; error?: string } | null
                error: Error | null
            }

            if (error) {
                toast.error('建立失敗：' + error.message)
                return
            }

            if (!data?.success) {
                const errorMsg = data?.error || '建立失敗'
                if (errorMsg.includes('slug') || errorMsg.includes('已存在')) {
                    toast.error('Slug 已被使用，請選擇其他名稱')
                } else {
                    toast.error(errorMsg)
                }
                return
            }

            // 如果有提供擁有者 Email，綁定擁有者
            if (ownerEmail) {
                const { error: linkError } = await supabase.rpc('link_tenant_owner', {
                    p_tenant_slug: slug,
                    p_user_email: ownerEmail
                })
                if (linkError) {
                    console.warn('綁定擁有者失敗：', linkError.message)
                    // 不阻擋流程，租戶已建立成功
                }
            }

            toast.success('租戶建立成功！')
            router.push('/admin/tenants')
        } catch (error) {
            toast.error('發生錯誤')
            console.error(error)
        } finally {
            setIsSaving(false)
        }
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
            className="space-y-6 max-w-2xl"
        >
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/tenants">
                    <Button variant="ghost" size="icon" className="rounded-xl">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        <span className="gradient-text">新增租戶</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">建立新的店家帳戶</p>
                </div>
            </div>

            {/* Form */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        租戶資訊
                    </CardTitle>
                    <CardDescription>填寫新租戶的基本資訊</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">店家名稱 *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="例：麵包小姐選購"
                                className="rounded-xl"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="slug">Slug (網址識別碼) *</Label>
                            <Input
                                id="slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="例：bread-lady"
                                className="rounded-xl font-mono"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                用於網址：/admin/t/<span className="text-primary">{slug || 'slug'}</span>
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ownerEmail">擁有者 Email</Label>
                            <Input
                                id="ownerEmail"
                                type="email"
                                value={ownerEmail}
                                onChange={(e) => setOwnerEmail(e.target.value)}
                                placeholder="owner@example.com"
                                className="rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="plan">方案</Label>
                            <Select value={plan} onValueChange={setPlan}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="選擇方案" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="basic">Basic - 基本方案</SelectItem>
                                    <SelectItem value="pro">Pro - 專業方案</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Link href="/admin/tenants" className="flex-1">
                                <Button variant="outline" className="w-full rounded-xl">
                                    取消
                                </Button>
                            </Link>
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="flex-1 gradient-primary rounded-xl"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        建立中...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        建立租戶
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    )
}
