'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
    const [isDark, setIsDark] = useState(true)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        // Check for saved theme or default to dark
        const savedTheme = localStorage.getItem('theme')
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark)

        setIsDark(shouldBeDark)
        document.documentElement.classList.toggle('dark', shouldBeDark)
    }, [])

    const toggleTheme = () => {
        const newIsDark = !isDark
        setIsDark(newIsDark)
        document.documentElement.classList.toggle('dark', newIsDark)
        localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    }

    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted">
                <div className="h-5 w-5" />
            </Button>
        )
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-xl hover:bg-muted"
        >
            {isDark ? (
                <Sun className="h-5 w-5 text-muted-foreground transition-transform hover:rotate-45" />
            ) : (
                <Moon className="h-5 w-5 text-muted-foreground transition-transform hover:-rotate-12" />
            )}
            <span className="sr-only">切換主題</span>
        </Button>
    )
}
