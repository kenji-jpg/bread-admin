'use client'

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Product } from '@/types/database'

interface CopyButtonProps {
    product: Product
    variants?: Product[]
    lineOaId: string
    isVariant?: boolean
}

function generateOrderLink(lineOaId: string, sku: string): string {
    const oaId = lineOaId.startsWith('@') ? lineOaId : `@${lineOaId}`
    return `https://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${encodeURIComponent(sku)}+1`
}

interface GenerateMessageParams {
    product: Product
    variants?: Product[]
    lineOaId: string
}

function generateOrderMessage({ product, variants, lineOaId }: GenerateMessageParams): string {
    const lines: string[] = []

    // 標題 (Title)
    lines.push('━━━━━━━━━━━━━━━')
    lines.push(`🛍️ ${product.name}`)
    lines.push('━━━━━━━━━━━━━━━')

    // 價格 (Price)
    lines.push(`💰 售價：$${product.price}`)

    // 狀態 (Status): stock < 0 is Preorder (預購)
    // Note: This logic assumes 'stock < 0' signals pre-order, as per requirements
    // Requirements: stock < 0 -> 預購中, stock >= 0 -> 現貨
    const isPreorder = product.stock < 0
    lines.push(`📦 狀態：${isPreorder ? '預購中' : '現貨'}`)

    // 截止時間 (End Time)
    if (product.end_time) {
        const endDate = new Date(product.end_time)
        const formatted = `${endDate.getFullYear()}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}`
        lines.push(`⏰ 截止：${formatted}`)
    }

    // 限量 (Limited functionality)
    if (product.is_limited && product.limit_qty) {
        lines.push(`🔥 限量：${product.limit_qty} 件`)
    }

    lines.push('')

    // 下單連結 (Order Links)
    if (variants && variants.length > 0) {
        const activeVariants = variants.filter(v => v.status === 'active')

        if (activeVariants.length > 0) {
            lines.push('📍 點擊規格直接下單 👇')
            lines.push('')

            activeVariants.forEach(variant => {
                const variantName = variant.sku.split('_')[1] || variant.sku
                const link = generateOrderLink(lineOaId, variant.sku)
                lines.push(`▫️ ${variantName}`)
                lines.push(link)
                lines.push('')
            })
        }
        // If all variants are inactive, maybe show nothing or parent link?
        // Spec implies listing variants. If none active, likely nothing to list.
    } else {
        lines.push('👉 點擊下單')
        lines.push(generateOrderLink(lineOaId, product.sku))
    }

    lines.push('━━━━━━━━━━━━━━━')

    return lines.join('\n')
}

function generateSingleVariantMessage(variant: Product, lineOaId: string): string {
    const variantName = variant.sku.split('_')[1] || variant.sku
    const link = generateOrderLink(lineOaId, variant.sku)
    return `▫️ ${variantName}\n${link}`
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch (err) {
        console.error('複製失敗:', err)
        return false
    }
}

export function CopyOrderButton({ product, variants, lineOaId, isVariant = false }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)

    // 已下架的規格不顯示 (Don't show for inactive variants)
    if (isVariant && product.status === 'inactive') {
        return null
    }

    // 檢查 LINE OA ID
    if (!lineOaId) {
        return (
            <button
                className="p-1.5 text-gray-300 cursor-not-allowed"
                title="請先到店家設定填寫 LINE 官方帳號 ID"
                disabled
            >
                <Copy className="w-4 h-4" />
            </button>
        )
    }

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation() // 防止觸發行點擊展開 (Prevent row click expansion)

        const message = isVariant
            ? generateSingleVariantMessage(product, lineOaId)
            : generateOrderMessage({ product, variants, lineOaId })

        const success = await copyToClipboard(message)

        if (success) {
            setCopied(true)
            toast.success('已複製下單訊息！')
            setTimeout(() => setCopied(false), 2000)
        } else {
            toast.error('複製失敗，請重試')
        }
    }

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded transition-colors"
            title="複製下單訊息"
        >
            {copied ? (
                <Check className="w-4 h-4 text-green-500" />
            ) : (
                <Copy className="w-4 h-4" />
            )}
        </button>
    )
}
