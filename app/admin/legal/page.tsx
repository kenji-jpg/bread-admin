'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
    FileText,
    Plus,
    Trash2,
    Loader2,
    ExternalLink,
    Save,
    ArrowUp,
    ArrowDown,
    Clock,
} from 'lucide-react'

// Section 內容類型
type SectionType = 'body' | 'items' | 'labeled'

interface LabeledItem {
    label: string
    text: string
}

interface ContentSection {
    title: string
    body: string | null
    items: string[] | LabeledItem[] | null
}

// 用於編輯的內部結構
interface EditableSection {
    title: string
    type: SectionType
    body: string
    items: string[]         // 純文字列表項
    labeledItems: LabeledItem[] // 帶標籤列表項
}

function sectionToEditable(section: ContentSection): EditableSection {
    let type: SectionType = 'body'
    let items: string[] = []
    let labeledItems: LabeledItem[] = []

    if (section.items && section.items.length > 0) {
        if (typeof section.items[0] === 'object' && 'text' in section.items[0]) {
            type = 'labeled'
            labeledItems = section.items as LabeledItem[]
        } else {
            type = 'items'
            items = section.items as string[]
        }
    }

    return {
        title: section.title,
        type,
        body: section.body || '',
        items,
        labeledItems,
    }
}

function editableToSection(editable: EditableSection): ContentSection {
    switch (editable.type) {
        case 'body':
            return {
                title: editable.title,
                body: editable.body || null,
                items: null,
            }
        case 'items':
            return {
                title: editable.title,
                body: editable.body || null,
                items: editable.items.filter(i => i.trim()),
            }
        case 'labeled':
            return {
                title: editable.title,
                body: editable.body || null,
                items: editable.labeledItems.filter(i => i.text.trim()),
            }
    }
}

function createEmptySection(): EditableSection {
    return {
        title: '',
        type: 'body',
        body: '',
        items: [''],
        labeledItems: [{ label: '', text: '' }],
    }
}

export default function LegalPage() {
    const { isSuperAdmin, isLoading: authLoading } = useAuth()
    const router = useRouter()
    const supabase = createClient()

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('terms')

    // 服務條款
    const [termsTitle, setTermsTitle] = useState('服務條款')
    const [termsSections, setTermsSections] = useState<EditableSection[]>([])
    const [termsUpdatedAt, setTermsUpdatedAt] = useState<string | null>(null)

    // 隱私政策
    const [privacyTitle, setPrivacyTitle] = useState('隱私政策')
    const [privacySections, setPrivacySections] = useState<EditableSection[]>([])
    const [privacyUpdatedAt, setPrivacyUpdatedAt] = useState<string | null>(null)

    // 非超管重導向
    useEffect(() => {
        if (!authLoading && !isSuperAdmin) {
            router.push('/admin')
        }
    }, [authLoading, isSuperAdmin, router])

    // 載入資料
    const loadContent = useCallback(async () => {
        setIsLoading(true)
        try {
            const [termsRes, privacyRes] = await Promise.all([
                supabase.rpc('get_platform_content_v1', { p_content_type: 'terms' }),
                supabase.rpc('get_platform_content_v1', { p_content_type: 'privacy' }),
            ])

            if (termsRes.data?.success) {
                setTermsTitle(termsRes.data.title)
                setTermsSections((termsRes.data.content as ContentSection[]).map(sectionToEditable))
                setTermsUpdatedAt(termsRes.data.updated_at)
            }
            if (privacyRes.data?.success) {
                setPrivacyTitle(privacyRes.data.title)
                setPrivacySections((privacyRes.data.content as ContentSection[]).map(sectionToEditable))
                setPrivacyUpdatedAt(privacyRes.data.updated_at)
            }
        } catch {
            toast.error('載入失敗')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        if (!authLoading && isSuperAdmin) {
            loadContent()
        }
    }, [authLoading, isSuperAdmin, loadContent])

    // 儲存
    const handleSave = async (contentType: 'terms' | 'privacy') => {
        setIsSaving(true)
        try {
            const title = contentType === 'terms' ? termsTitle : privacyTitle
            const sections = contentType === 'terms' ? termsSections : privacySections
            const contentSections = sections.map(editableToSection)

            const { data, error } = await supabase.rpc('update_platform_content_v1', {
                p_content_type: contentType,
                p_title: title,
                p_content: contentSections,
            })

            if (error) throw error
            if (!data?.success) throw new Error('更新失敗')

            toast.success(`${contentType === 'terms' ? '服務條款' : '隱私政策'}已更新`)

            // 更新時間
            const now = new Date().toISOString()
            if (contentType === 'terms') setTermsUpdatedAt(now)
            else setPrivacyUpdatedAt(now)
        } catch (err) {
            toast.error(`儲存失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
        } finally {
            setIsSaving(false)
        }
    }

    // Section 操作 helpers
    const updateSection = (
        contentType: 'terms' | 'privacy',
        index: number,
        updater: (s: EditableSection) => EditableSection
    ) => {
        const setter = contentType === 'terms' ? setTermsSections : setPrivacySections
        setter(prev => prev.map((s, i) => (i === index ? updater({ ...s }) : s)))
    }

    const addSection = (contentType: 'terms' | 'privacy') => {
        const setter = contentType === 'terms' ? setTermsSections : setPrivacySections
        setter(prev => [...prev, createEmptySection()])
    }

    const removeSection = (contentType: 'terms' | 'privacy', index: number) => {
        const setter = contentType === 'terms' ? setTermsSections : setPrivacySections
        setter(prev => prev.filter((_, i) => i !== index))
    }

    const moveSection = (contentType: 'terms' | 'privacy', index: number, direction: 'up' | 'down') => {
        const setter = contentType === 'terms' ? setTermsSections : setPrivacySections
        setter(prev => {
            const newArr = [...prev]
            const swapIndex = direction === 'up' ? index - 1 : index + 1
            if (swapIndex < 0 || swapIndex >= newArr.length) return prev
            ;[newArr[index], newArr[swapIndex]] = [newArr[swapIndex], newArr[index]]
            return newArr
        })
    }

    if (authLoading || (!isSuperAdmin && !authLoading)) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        )
    }

    const renderSectionEditor = (
        contentType: 'terms' | 'privacy',
        sections: EditableSection[],
    ) => (
        <div className="space-y-4">
            {sections.map((section, sIdx) => (
                <Card key={sIdx} className="border-border/50">
                    <CardContent className="pt-4 space-y-3">
                        {/* Section header */}
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs shrink-0">
                                #{sIdx + 1}
                            </Badge>
                            <Input
                                value={section.title}
                                onChange={e => updateSection(contentType, sIdx, s => ({ ...s, title: e.target.value }))}
                                placeholder="段落標題（如：1. 服務說明）"
                                className="flex-1 font-medium"
                            />
                            <div className="flex gap-1 shrink-0">
                                <Button
                                    variant="ghost" size="icon" className="h-8 w-8"
                                    onClick={() => moveSection(contentType, sIdx, 'up')}
                                    disabled={sIdx === 0}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost" size="icon" className="h-8 w-8"
                                    onClick={() => moveSection(contentType, sIdx, 'down')}
                                    disabled={sIdx === sections.length - 1}
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => removeSection(contentType, sIdx)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* 內容類型選擇 */}
                        <div className="flex items-center gap-3">
                            <Label className="text-xs text-muted-foreground shrink-0">內容類型</Label>
                            <Select
                                value={section.type}
                                onValueChange={(val: SectionType) =>
                                    updateSection(contentType, sIdx, s => ({
                                        ...s,
                                        type: val,
                                        // 切換類型時確保有預設值
                                        items: val === 'items' && s.items.length === 0 ? [''] : s.items,
                                        labeledItems: val === 'labeled' && s.labeledItems.length === 0 ? [{ label: '', text: '' }] : s.labeledItems,
                                    }))
                                }
                            >
                                <SelectTrigger className="w-[160px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="body">段落文字</SelectItem>
                                    <SelectItem value="items">列表</SelectItem>
                                    <SelectItem value="labeled">帶標籤列表</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Body（段落 or 列表前導文字） */}
                        {(section.type === 'body' || section.type === 'items') && (
                            <div>
                                <Label className="text-xs text-muted-foreground">
                                    {section.type === 'body' ? '段落內容' : '前導文字（可留空）'}
                                </Label>
                                <Textarea
                                    value={section.body}
                                    onChange={e => updateSection(contentType, sIdx, s => ({ ...s, body: e.target.value }))}
                                    placeholder="輸入文字內容..."
                                    className="mt-1 min-h-[80px]"
                                />
                            </div>
                        )}

                        {/* 純文字列表 */}
                        {section.type === 'items' && (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">列表項目</Label>
                                {section.items.map((item, iIdx) => (
                                    <div key={iIdx} className="flex gap-2">
                                        <span className="text-xs text-muted-foreground mt-2.5 shrink-0">•</span>
                                        <Textarea
                                            value={item}
                                            onChange={e => updateSection(contentType, sIdx, s => {
                                                const newItems = [...s.items]
                                                newItems[iIdx] = e.target.value
                                                return { ...s, items: newItems }
                                            })}
                                            placeholder="列表項目內容..."
                                            className="min-h-[40px] text-sm"
                                            rows={1}
                                        />
                                        <Button
                                            variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                            onClick={() => updateSection(contentType, sIdx, s => ({
                                                ...s,
                                                items: s.items.filter((_, j) => j !== iIdx),
                                            }))}
                                            disabled={section.items.length <= 1}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    variant="outline" size="sm" className="text-xs"
                                    onClick={() => updateSection(contentType, sIdx, s => ({
                                        ...s,
                                        items: [...s.items, ''],
                                    }))}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    新增項目
                                </Button>
                            </div>
                        )}

                        {/* 帶標籤列表 */}
                        {section.type === 'labeled' && (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">帶標籤項目</Label>
                                {section.labeledItems.map((item, iIdx) => (
                                    <div key={iIdx} className="flex gap-2 items-start">
                                        <Input
                                            value={item.label}
                                            onChange={e => updateSection(contentType, sIdx, s => {
                                                const newItems = [...s.labeledItems]
                                                newItems[iIdx] = { ...newItems[iIdx], label: e.target.value }
                                                return { ...s, labeledItems: newItems }
                                            })}
                                            placeholder="標籤（如：非交易當事人：）"
                                            className="w-[200px] shrink-0 text-sm"
                                        />
                                        <Textarea
                                            value={item.text}
                                            onChange={e => updateSection(contentType, sIdx, s => {
                                                const newItems = [...s.labeledItems]
                                                newItems[iIdx] = { ...newItems[iIdx], text: e.target.value }
                                                return { ...s, labeledItems: newItems }
                                            })}
                                            placeholder="內容..."
                                            className="min-h-[40px] text-sm"
                                            rows={1}
                                        />
                                        <Button
                                            variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                            onClick={() => updateSection(contentType, sIdx, s => ({
                                                ...s,
                                                labeledItems: s.labeledItems.filter((_, j) => j !== iIdx),
                                            }))}
                                            disabled={section.labeledItems.length <= 1}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                                <Button
                                    variant="outline" size="sm" className="text-xs"
                                    onClick={() => updateSection(contentType, sIdx, s => ({
                                        ...s,
                                        labeledItems: [...s.labeledItems, { label: '', text: '' }],
                                    }))}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    新增項目
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => addSection(contentType)}
            >
                <Plus className="h-4 w-4 mr-2" />
                新增段落
            </Button>
        </div>
    )

    return (
        <div className="p-6 max-w-4xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                <div>
                    <h1 className="text-2xl font-bold">法律條款管理</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        編輯服務條款與隱私政策，儲存後公開頁面即時更新
                    </p>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-[300px] w-full" />
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="terms" className="gap-1.5">
                                <FileText className="h-4 w-4" />
                                服務條款
                            </TabsTrigger>
                            <TabsTrigger value="privacy" className="gap-1.5">
                                <FileText className="h-4 w-4" />
                                隱私政策
                            </TabsTrigger>
                        </TabsList>

                        {/* 服務條款 */}
                        <TabsContent value="terms" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">服務條款</CardTitle>
                                        <div className="flex items-center gap-3">
                                            {termsUpdatedAt && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(termsUpdatedAt).toLocaleString('zh-TW')}
                                                </span>
                                            )}
                                            <Button
                                                variant="outline" size="sm"
                                                onClick={() => window.open('/terms', '_blank')}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                                預覽
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleSave('terms')}
                                                disabled={isSaving}
                                            >
                                                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                                儲存
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label>頁面標題</Label>
                                        <Input
                                            value={termsTitle}
                                            onChange={e => setTermsTitle(e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                    {renderSectionEditor('terms', termsSections)}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* 隱私政策 */}
                        <TabsContent value="privacy" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">隱私政策</CardTitle>
                                        <div className="flex items-center gap-3">
                                            {privacyUpdatedAt && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {new Date(privacyUpdatedAt).toLocaleString('zh-TW')}
                                                </span>
                                            )}
                                            <Button
                                                variant="outline" size="sm"
                                                onClick={() => window.open('/privacy', '_blank')}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                                預覽
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleSave('privacy')}
                                                disabled={isSaving}
                                            >
                                                {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                                儲存
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <Label>頁面標題</Label>
                                        <Input
                                            value={privacyTitle}
                                            onChange={e => setPrivacyTitle(e.target.value)}
                                            className="mt-1"
                                        />
                                    </div>
                                    {renderSectionEditor('privacy', privacySections)}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                )}
            </motion.div>
        </div>
    )
}
