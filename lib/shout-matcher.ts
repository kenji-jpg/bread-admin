/**
 * 喊單 → 會員 比對（與 Mac 工具的 Swift 版規則一致）
 *
 * 比對優先序（踩過坑，別改順序）：
 * 1. 原文精準（保留 emoji，只忽略大小寫/空格）— 剪貼簿文字 100% 正確，
 *    `Momo☺️` 和 `momo` 是兩個不同的客人，剝掉 emoji 會把他們混成一個。
 * 2. 核心字比對（queryCore）— 給 OCR/裝飾字留退路。
 * 3. 社群暱稱(nickname) 優先於 LINE 名稱(display_name)。
 */

import { queryCore, nameCandidates, cleanProductText, type ParsedShout } from './shout-parser'

export type BindingStatus = 'bound' | 'noNick' | 'suspect' | 'multi' | 'unbound'

export interface MatchDTO {
    id: string
    nickname: string | null
    display_name: string | null
    orders: number | null
    spent: number | null
    exact: boolean | null
}

export interface ResultDTO {
    query: string
    exact_count: number
    fuzzy_count: number
    matches: MatchDTO[]
}

export interface Binding {
    status: BindingStatus
    member: MatchDTO | null
    candidates: MatchDTO[]
}

const norm = (s: string | null | undefined) =>
    (s ?? '').replace(/[ 　]/g, '').trim().toLowerCase()

/** 原文精準命中唯一一位（保留 emoji） */
export function exactNickMatch(dto: ResultDTO | undefined, raw: string): MatchDTO | null {
    if (!dto) return null
    const target = norm(raw)
    if (!target) return null
    const hits = dto.matches.filter(m => norm(m.nickname) === target)
    return hits.length === 1 ? hits[0] : null
}

/** 核心字比對：社群暱稱優先，其次 LINE 名稱 */
export function resolveBinding(core: string, dto: ResultDTO | undefined): Binding {
    if (!dto) return { status: 'unbound', member: null, candidates: [] }
    const nickM = dto.matches.filter(m => queryCore(m.nickname) === core && core !== '')
    const dispM = dto.matches.filter(
        m => queryCore(m.display_name) === core && queryCore(m.nickname) !== core && core !== '')

    if (nickM.length === 1) return { status: 'bound', member: nickM[0], candidates: nickM }
    if (nickM.length > 1) return { status: 'multi', member: null, candidates: nickM }
    if (dispM.length === 1) {
        const m = dispM[0]
        const hasNick = !!(m.nickname ?? '').trim()
        return { status: hasNick ? 'suspect' : 'noNick', member: m, candidates: dispM }
    }
    if (dispM.length > 1) return { status: 'multi', member: null, candidates: dispM }

    // 退回舊的粗略分類
    if (dto.exact_count === 1) {
        const m = dto.matches.find(x => x.exact) ?? dto.matches[0] ?? null
        const hasNick = !!(m?.nickname ?? '').trim()
        return { status: hasNick ? 'bound' : 'noNick', member: m, candidates: dto.matches }
    }
    if (dto.exact_count > 1) return { status: 'multi', member: null, candidates: dto.matches }
    if (dto.fuzzy_count === 1) return { status: 'suspect', member: dto.matches[0] ?? null, candidates: dto.matches }
    if (dto.fuzzy_count > 1) return { status: 'multi', member: null, candidates: dto.matches }
    return { status: 'unbound', member: null, candidates: [] }
}

/** 要送去查名冊的所有字串（原文 + 核心字，含各種切法） */
export function buildQueries(shouts: ParsedShout[]): string[] {
    const set = new Set<string>()
    for (const s of shouts) {
        const base = s.name ?? s.nameSource ?? s.lead
        for (const c of nameCandidates(base)) {
            set.add(c)
            const k = queryCore(c)
            if (k) set.add(k)
        }
    }
    return [...set]
}

export interface ResolvedRow {
    name: string
    variant: string | null
    qty: number
    binding: Binding
    lead: string
    time: string
    date: string | null
    expanded: boolean
}

/**
 * 決定每筆的名字/商品/綁定。
 * 名字對不到人時，用名冊反查逐段切分（處理「Dean 我要一個+1」「Gogi Gigo 麵包+1」）。
 */
export function resolveShouts(
    shouts: ParsedShout[],
    dtoMap: Record<string, ResultDTO>,
    variants: string[],
): ResolvedRow[] {
    const bindingFor = (n: string): Binding => {
        const m = exactNickMatch(dtoMap[n], n)
        if (m) return { status: 'bound', member: m, candidates: [m] }
        return resolveBinding(queryCore(n), dtoMap[queryCore(n)])
    }

    return shouts.map(s => {
        const base = s.name ?? s.nameSource ?? s.lead
        let chosen = base
        let prod = s.variant
        let binding = bindingFor(base)

        if (binding.status !== 'bound') {
            let bestCore: string | null = null
            for (const cand of nameCandidates(base)) {
                const core = queryCore(cand)
                const b = bindingFor(cand)
                if (b.status === 'bound' && (bestCore === null || bestCore !== core)) {
                    chosen = cand
                    if (prod == null) {
                        const rest = base.slice(cand.length).trim()
                        const hit = variants.find(v => rest.toLowerCase().includes(v.toLowerCase()))
                        prod = hit ?? cleanProductText(rest)
                    }
                    binding = b
                    bestCore = core
                }
            }
        }
        return {
            name: chosen, variant: prod, qty: s.qty, binding,
            lead: s.lead, time: s.time, date: s.date, expanded: s.expanded,
        }
    })
}

export const STATUS_LABEL: Record<BindingStatus, string> = {
    bound: '已綁定', noNick: '未設暱稱', suspect: '疑似相符', multi: '需選擇', unbound: '未加入',
}
