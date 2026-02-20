'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Unhandled error:', error)
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-destructive/5" />

            <div className="relative text-center space-y-6">
                <div className="flex justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
                        <AlertTriangle className="h-10 w-10 text-destructive" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">出了點問題</h1>
                    <p className="text-sm text-muted-foreground/70">
                        發生了預期之外的錯誤，請重試或返回首頁
                    </p>
                </div>

                <div className="flex items-center justify-center gap-3">
                    <Button
                        onClick={reset}
                        variant="outline"
                        className="rounded-xl"
                    >
                        重試
                    </Button>
                    <Link href="/login">
                        <Button className="gradient-primary rounded-xl">
                            返回首頁
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}
