'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Building2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import type { Tenant } from '@/types/database'

export function TenantSwitcher() {
    const [open, setOpen] = useState(false)
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { tenant: currentTenant } = useTenant()
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        const fetchTenants = async () => {
            setIsLoading(true)
            const { data, error } = await supabase.rpc('get_user_tenants_v1') as {
                data: { success: boolean; tenants?: Tenant[]; error?: string } | null
                error: Error | null
            }

            if (error) {
                console.error('Error fetching tenants:', error)
                setIsLoading(false)
                return
            }

            if (data?.success && data.tenants) {
                setTenants(data.tenants)
            }
            setIsLoading(false)
        }

        fetchTenants()
    }, [supabase])

    const handleSelect = (tenant: Tenant) => {
        setOpen(false)
        router.push(`/admin/t/${tenant.slug}`)
    }

    const handleViewAll = () => {
        setOpen(false)
        router.push('/admin')
    }

    const handleNewTenant = () => {
        setOpen(false)
        router.push('/admin/tenants/new')
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[240px] justify-between rounded-xl border-border/50 bg-background/50 hover:bg-muted"
                >
                    <div className="flex items-center gap-2 truncate">
                        {currentTenant ? (
                            <>
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                                    <span className="text-xs font-bold text-primary-foreground">
                                        {currentTenant.name.charAt(0)}
                                    </span>
                                </div>
                                <span className="truncate">{currentTenant.name}</span>
                            </>
                        ) : (
                            <>
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">選擇租戶</span>
                            </>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0 glass-strong" align="start">
                <Command>
                    <CommandInput placeholder="搜尋租戶..." className="h-10" />
                    <CommandList>
                        <CommandEmpty>
                            {isLoading ? '載入中...' : '找不到租戶'}
                        </CommandEmpty>
                        <CommandGroup heading="租戶列表">
                            {tenants.map((tenant) => (
                                <CommandItem
                                    key={tenant.id}
                                    value={tenant.name}
                                    onSelect={() => handleSelect(tenant)}
                                    className="cursor-pointer"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-accent/80">
                                            <span className="text-xs font-bold text-primary-foreground">
                                                {tenant.name.charAt(0)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm">{tenant.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {tenant.slug}
                                            </span>
                                        </div>
                                    </div>
                                    <Check
                                        className={cn(
                                            'ml-auto h-4 w-4',
                                            currentTenant?.id === tenant.id
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem
                                onSelect={handleViewAll}
                                className="cursor-pointer"
                            >
                                <Building2 className="mr-2 h-4 w-4" />
                                查看全部租戶
                            </CommandItem>
                            <CommandItem
                                onSelect={handleNewTenant}
                                className="cursor-pointer"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                新增租戶
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
