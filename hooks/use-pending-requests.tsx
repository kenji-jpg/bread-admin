'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { directRpc } from '@/lib/supabase/direct-rpc'

const POLL_INTERVAL = 60_000 // 60 秒輪詢

interface PendingRequestCountResponse {
    success: boolean
    count: number
    error?: string
}

interface UsePendingRequestsResult {
    pendingCount: number
    isLoading: boolean
    refresh: () => void
}

/**
 * 超管專用：輪詢待審核租戶申請數量
 * 只在 isSuperAdmin 時啟用，每 60 秒輪詢一次
 */
export function usePendingRequests(): UsePendingRequestsResult {
    const { isSuperAdmin, isLoading: authLoading } = useAuth()
    const [pendingCount, setPendingCount] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchCount = useCallback(async () => {
        if (!isSuperAdmin) return

        setIsLoading(true)
        try {
            const { data, error } = await directRpc<PendingRequestCountResponse>(
                'get_pending_request_count_v1'
            )

            if (!error && data?.success) {
                setPendingCount(data.count)
            }
        } catch {
            // 靜默失敗 — badge 不顯示即可
        } finally {
            setIsLoading(false)
        }
    }, [isSuperAdmin])

    useEffect(() => {
        if (authLoading || !isSuperAdmin) {
            setPendingCount(0)
            return
        }

        // 初次載入
        fetchCount()

        // 每 60 秒輪詢
        intervalRef.current = setInterval(fetchCount, POLL_INTERVAL)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [authLoading, isSuperAdmin, fetchCount])

    return { pendingCount, isLoading, refresh: fetchCount }
}
