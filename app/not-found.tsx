import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

            <div className="relative text-center space-y-6">
                <div className="flex justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/50 border border-border/50">
                        <FileQuestion className="h-10 w-10 text-muted-foreground" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-6xl font-bold gradient-text">404</h1>
                    <p className="text-lg text-muted-foreground">找不到頁面</p>
                    <p className="text-sm text-muted-foreground/70">
                        您要找的頁面不存在或已被移除
                    </p>
                </div>

                <Link href="/login">
                    <Button className="gradient-primary rounded-xl">
                        返回首頁
                    </Button>
                </Link>
            </div>
        </div>
    )
}
