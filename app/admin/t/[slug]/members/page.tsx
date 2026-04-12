'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { Member, Checkout } from '@/types/database'
import { Users, Search, Star, ShoppingCart, Package, Eye, Pencil, Check, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return '-'
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '剛剛'
    if (diffMin < 60) return `${diffMin} 分鐘前`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr} 小時前`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 30) return `${diffDay} 天前`
    const diffMonth = Math.floor(diffDay / 30)
    if (diffMonth < 12) return `${diffMonth} 個月前`
    return `${Math.floor(diffMonth / 12)} 年前`
}

export default function MembersPage() {
    const { tenant, isLoading: tenantLoading } = useTenant()
    const [members, setMembers] = useState<Member[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedMember, setSelectedMember] = useState<Member | null>(null)
    const [memberOrders, setMemberOrders] = useState<Checkout[]>([])
    const [ordersLoading, setOrdersLoading] = useState(false)
    const [editingNote, setEditingNote] = useState(false)
    const [noteValue, setNoteValue] = useState('')
    const [savingNote, setSavingNote] = useState(false)
    const [togglingVip, setTogglingVip] = useState(false)
    const supabase = createClient()

    const fetchMembers = useCallback(async () => {
        if (!tenant) return
        setIsLoading(true)
        const { data } = await supabase
            .from('members')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('total_spent', { ascending: false })
        if (data) setMembers(data)
        setIsLoading(false)
    }, [tenant, supabase])

    useEffect(() => {
        if (!tenant || tenantLoading) return
        fetchMembers()
    }, [tenant, tenantLoading, fetchMembers])

    useEffect(() => {
        if (!selectedMember) {
            setMemberOrders([])
            return
        }
        const fetchOrders = async () => {
            setOrdersLoading(true)
            const { data } = await supabase
                .from('checkouts')
                .select('*')
                .eq('member_id', selectedMember.id)
                .order('created_at', { ascending: false })
            if (data) setMemberOrders(data)
            setOrdersLoading(false)
        }
        fetchOrders()
    }, [selectedMember, supabase])

    const handleToggleVip = async () => {
        if (!selectedMember || !tenant || togglingVip) return
        setTogglingVip(true)
        const newVip = !selectedMember.is_vip
        const { data, error } = await supabase.rpc('update_member_info_v1', {
            p_member_id: selectedMember.id,
            p_tenant_id: tenant.id,
            p_is_vip: newVip,
        })
        if (error || !data?.success) {
            toast.error('更新失敗')
        } else {
            const updated = { ...selectedMember, is_vip: newVip }
            setSelectedMember(updated)
            setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
            toast.success(newVip ? '已標記為 VIP' : '已取消 VIP')
        }
        setTogglingVip(false)
    }

    const handleSaveNote = async () => {
        if (!selectedMember || !tenant) return
        setSavingNote(true)
        const { data, error } = await supabase.rpc('update_member_info_v1', {
            p_member_id: selectedMember.id,
            p_tenant_id: tenant.id,
            p_note: noteValue,
        })
        if (error || !data?.success) {
            toast.error('儲存失敗')
        } else {
            const updated = { ...selectedMember, note: noteValue }
            setSelectedMember(updated)
            setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
            setEditingNote(false)
            toast.success('備註已儲存')
        }
        setSavingNote(false)
    }

    const filteredMembers = members.filter((member) =>
        searchQuery === '' ||
        member.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.nickname?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (tenantLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-[600px] rounded-2xl" />
            </div>
        )
    }

    if (!tenant) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <p className="text-muted-foreground">找不到租戶資料</p>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    <span className="gradient-text">會員管理</span>
                </h1>
                <p className="text-muted-foreground mt-1">管理店家所有會員</p>
            </div>

            {/* Search */}
            <Card className="border-border/50">
                <CardContent className="pt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="搜尋會員名稱、暱稱..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-xl"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Content */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Members List */}
                <Card className="border-border/50 lg:col-span-2">
                    <CardHeader>
                        <CardTitle>會員列表</CardTitle>
                        <CardDescription>共 {filteredMembers.length} 位會員</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Skeleton key={i} className="h-16 rounded-xl" />
                                ))}
                            </div>
                        ) : filteredMembers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground">
                                    {searchQuery ? '找不到符合條件的會員' : '尚無會員'}
                                </p>
                            </div>
                        ) : (
                            <ScrollArea className="h-[500px] pr-4">
                                <div className="space-y-2">
                                    {filteredMembers.map((member, index) => (
                                        <motion.div
                                            key={member.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            onClick={() => {
                                                setSelectedMember(member)
                                                setEditingNote(false)
                                            }}
                                            className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all ${selectedMember?.id === member.id
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10">
                                                    <AvatarImage src={member.picture_url || ''} />
                                                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm">
                                                        {(member.nickname || member.display_name || '?').charAt(0)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium">
                                                            {member.nickname || member.display_name || '未命名'}
                                                        </p>
                                                        {member.is_vip && (
                                                            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {member.last_visited_at
                                                            ? `最近 ${formatRelativeTime(member.last_visited_at)}`
                                                            : member.display_name || '-'
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-sm">
                                                    ${member.total_spent.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {member.order_count} 筆訂單
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>

                {/* Member Details */}
                <Card className="border-border/50">
                    <CardHeader>
                        <CardTitle>會員詳情</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedMember ? (
                            <Tabs defaultValue="profile" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-6">
                                    <TabsTrigger value="profile">基本資料</TabsTrigger>
                                    <TabsTrigger value="orders">歷史訂單 ({selectedMember.order_count})</TabsTrigger>
                                </TabsList>

                                <TabsContent value="profile">
                                    <motion.div
                                        key={selectedMember.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-6"
                                    >
                                        {/* Profile */}
                                        <div className="flex flex-col items-center text-center">
                                            <Avatar className="h-20 w-20 mb-3">
                                                <AvatarImage src={selectedMember.picture_url || ''} />
                                                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-2xl">
                                                    {(selectedMember.nickname || selectedMember.display_name || '?').charAt(0)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold text-lg">
                                                    {selectedMember.nickname || selectedMember.display_name || '未命名'}
                                                </h3>
                                                <button
                                                    onClick={handleToggleVip}
                                                    disabled={togglingVip}
                                                    className="transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
                                                    title={selectedMember.is_vip ? '取消 VIP' : '標記為 VIP'}
                                                >
                                                    <Star className={`h-5 w-5 ${selectedMember.is_vip ? 'fill-warning text-warning' : 'text-muted-foreground/40 hover:text-warning/60'}`} />
                                                </button>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedMember.display_name || '-'}
                                            </p>
                                        </div>

                                        {/* Stats */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-xl border border-border/50 p-3 text-center">
                                                <p className="text-2xl font-bold text-primary">
                                                    ${selectedMember.total_spent.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-muted-foreground">累計消費</p>
                                            </div>
                                            <div className="rounded-xl border border-border/50 p-3 text-center">
                                                <p className="text-2xl font-bold">{selectedMember.order_count}</p>
                                                <p className="text-xs text-muted-foreground">訂單數</p>
                                            </div>
                                            <div className="rounded-xl border border-border/50 p-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                    <p className="text-2xl font-bold">{selectedMember.visit_count || 0}</p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">來訪次數</p>
                                            </div>
                                            <div className="rounded-xl border border-border/50 p-3 text-center">
                                                <p className="text-lg font-bold">
                                                    {formatRelativeTime(selectedMember.last_visited_at)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">最近來訪</p>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between py-2 border-b border-border/50">
                                                <span className="text-sm text-muted-foreground">電話</span>
                                                <span className="text-sm">{selectedMember.phone || '-'}</span>
                                            </div>
                                            <div className="flex justify-between py-2 border-b border-border/50">
                                                <span className="text-sm text-muted-foreground">收件人</span>
                                                <span className="text-sm">{selectedMember.receiver_name || '-'}</span>
                                            </div>
                                            <div className="flex justify-between py-2 border-b border-border/50">
                                                <span className="text-sm text-muted-foreground">常用店號</span>
                                                <span className="text-sm">{selectedMember.store_id || '-'}</span>
                                            </div>
                                            <div className="flex justify-between py-2">
                                                <span className="text-sm text-muted-foreground">加入時間</span>
                                                <span className="text-sm">
                                                    {new Date(selectedMember.created_at).toLocaleDateString('zh-TW')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Note - editable */}
                                        <div className="rounded-xl bg-muted/50 p-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-xs text-muted-foreground">備註</p>
                                                {!editingNote && (
                                                    <button
                                                        onClick={() => {
                                                            setNoteValue(selectedMember.note || '')
                                                            setEditingNote(true)
                                                        }}
                                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                            {editingNote ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={noteValue}
                                                        onChange={(e) => setNoteValue(e.target.value)}
                                                        placeholder="輸入備註..."
                                                        className="min-h-[80px] text-sm resize-none"
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setEditingNote(false)}
                                                            disabled={savingNote}
                                                        >
                                                            <X className="h-3.5 w-3.5 mr-1" />
                                                            取消
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={handleSaveNote}
                                                            disabled={savingNote}
                                                        >
                                                            <Check className="h-3.5 w-3.5 mr-1" />
                                                            {savingNote ? '儲存中...' : '儲存'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm">{selectedMember.note || '無備註'}</p>
                                            )}
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="orders" className="space-y-4">
                                    <ScrollArea className="h-[500px] pr-4">
                                        {ordersLoading ? (
                                            <div className="space-y-3">
                                                {[1, 2, 3].map((i) => (
                                                    <Skeleton key={i} className="h-32 rounded-xl" />
                                                ))}
                                            </div>
                                        ) : memberOrders.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                                <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
                                                <p>尚無訂單紀錄</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {memberOrders.map((order) => (
                                                    <Card key={order.id} className="overflow-hidden border-border/50">
                                                        <div className="bg-muted/30 p-3 flex items-center justify-between border-b border-border/50">
                                                            <div className="flex items-center gap-2">
                                                                <Package className="h-4 w-4 text-primary" />
                                                                <span className="font-mono text-xs font-medium">{order.checkout_no}</span>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'} className="text-[10px] px-1.5 h-5">
                                                                    {order.payment_status === 'paid' ? '已付款' : '未付款'}
                                                                </Badge>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {new Date(order.created_at).toLocaleDateString('zh-TW')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="p-3">
                                                            {order.checkout_items ? (
                                                                <div className="space-y-1.5">
                                                                    {(() => {
                                                                        try {
                                                                            const items = typeof order.checkout_items === 'string'
                                                                                ? JSON.parse(order.checkout_items)
                                                                                : order.checkout_items
                                                                            if (Array.isArray(items)) {
                                                                                return items.map((item: { name?: string; qty?: number; unit_price?: number; subtotal?: number }, idx: number) => (
                                                                                    <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-border/30 last:border-0">
                                                                                        <span className="text-foreground">{item.name || '未知商品'}</span>
                                                                                        <div className="flex items-center gap-3 text-muted-foreground">
                                                                                            <span>x{item.qty || 1}</span>
                                                                                            <span className="w-16 text-right">${(item.subtotal || item.unit_price || 0).toLocaleString()}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))
                                                                            }
                                                                            return <p className="text-sm text-muted-foreground italic">商品明細格式錯誤</p>
                                                                        } catch {
                                                                            return <p className="text-sm text-muted-foreground italic">商品明細格式錯誤</p>
                                                                        }
                                                                    })()}
                                                                </div>
                                                            ) : (
                                                                <p className="text-sm text-muted-foreground italic">無商品明細</p>
                                                            )}
                                                            <div className="mt-3 flex justify-end items-center gap-2 border-t border-border/30 pt-2">
                                                                <span className="text-xs text-muted-foreground">總金額</span>
                                                                <span className="font-bold text-primary">${order.total_amount.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                <p className="text-sm text-muted-foreground">點選左側會員查看詳情</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    )
}
