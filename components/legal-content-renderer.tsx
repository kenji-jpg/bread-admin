/**
 * 法律條款內容渲染器
 *
 * 將 JSON sections 陣列渲染為結構化的法律文件 HTML
 *
 * Section 格式：
 * - body only: { title, body, items: null }
 * - items (string[]): { title, body?, items: ["...", "..."] }
 * - items (labeled[]): { title, body?, items: [{ label, text }, ...] }
 */

interface LabeledItem {
    label: string
    text: string
}

export interface ContentSection {
    title: string
    body: string | null
    items: string[] | LabeledItem[] | null
}

function isLabeledItems(items: string[] | LabeledItem[]): items is LabeledItem[] {
    return items.length > 0 && typeof items[0] === 'object' && 'text' in items[0]
}

function renderEmail(text: string) {
    // 將 email 地址轉為 mailto 連結
    return text.replace(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
        '<a href="mailto:$1" class="text-primary hover:underline">$1</a>'
    )
}

export function LegalContentRenderer({ sections }: { sections: ContentSection[] }) {
    return (
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            {sections.map((section, i) => (
                <section key={i}>
                    <h2 className="text-lg font-semibold mt-8 mb-3">{section.title}</h2>

                    {section.body && (
                        <p dangerouslySetInnerHTML={{ __html: renderEmail(section.body) }} />
                    )}

                    {section.items && (
                        <ul className={`list-disc list-inside space-y-1${section.body ? ' mt-2' : ''}`}>
                            {isLabeledItems(section.items)
                                ? section.items.map((item, j) => (
                                    <li key={j}>
                                        {item.label && <strong>{item.label}</strong>}
                                        <span dangerouslySetInnerHTML={{ __html: renderEmail(item.text) }} />
                                    </li>
                                ))
                                : section.items.map((item, j) => (
                                    <li key={j} dangerouslySetInnerHTML={{ __html: renderEmail(item) }} />
                                ))
                            }
                        </ul>
                    )}
                </section>
            ))}
        </div>
    )
}
