/**
 * LINE 社群討論串「喊單」解析器
 *
 * 來源：Mac 收單工具（~/Desktop/plushub-screener）的 Swift 版本，規則一比一移植。
 * 兩邊規則必須一致；改這裡時請同步改 Swift 版（見該專案 CLAUDE.md）。
 *
 * 設計重點（都是踩過坑換來的，改之前務必讀）：
 * 1. 以「訊息」為單位解析：沒有時間戳的行 = 上一則的續行，要繼承發話者。
 * 2. 但若整段文字「完全沒有時間戳」→ 視為舊版純名單，每行各自一則（相容既有用法）。
 * 3. 金額絕不亂猜：只認價格標記（一組X／X元／$X…），沒有就留空讓人填。
 * 4. 去重身分證只由「原文」決定，不受切分結果或手動編輯影響。
 */

// ── 字串正規化 ────────────────────────────────

const ALLOWED_CORE =
  /[0-9A-Za-z一-鿿぀-ヿ０-９Ａ-Ｚａ-ｚ 　]/

/** 核心字：剝掉顏文字/符號，取最長一段英數・中日文，再去空格小寫。用於「模糊比對」的退路。 */
export function queryCore(s: string | null | undefined): string {
    let best = '', cur = ''
    for (const ch of s ?? '') {
        if (ALLOWED_CORE.test(ch)) cur += ch
        else { if (cur.length > best.length) best = cur; cur = '' }
    }
    if (cur.length > best.length) best = cur
    return best.replace(/[ 　]/g, '').toLowerCase()
}

/** 無損正規化：只轉小寫去空白，不丟字元。★身分證一律用這個，不可用 queryCore（它會截斷）。 */
export function normalizeLead(s: string | null | undefined): string {
    return (s ?? '').replace(/[ 　]/g, '').trim().toLowerCase()
}

/** 名字後面剩下的字：保留真商品，只清客套話 */
export function cleanProductText(s: string): string | null {
    let t = (s ?? '').trim()
    if (!t) return null
    const fillers = ['我也要', '我還要', '我要', '也要', '還要', '幫我留', '幫我', '請給我',
                     '請問', '麻煩', '謝謝', '先留', '留', '要']
    let changed = true
    while (changed) {
        changed = false
        for (const f of fillers) {
            if (t.startsWith(f)) { t = t.slice(f.length).trim(); changed = true; break }
        }
    }
    t = t.replace(/^[\s、，,/／+＋×*和跟與都各全也]+/, '').replace(/[\s、，,/／+＋×*和跟與都各全也]+$/, '')
    if (['一個', '一組', '一份', '一支', '個', '組', '份', '支', '一'].includes(t)) return null
    return t || null
}

/** 名字候選切法（由短到長）：「Gogi Gigo 麵包」→ [Gogi, Gogi Gigo, Gogi Gigo 麵包] */
export function nameCandidates(lead: string): string[] {
    const toks = lead.split(/[ 　\t]+/).filter(Boolean)
    if (toks.length <= 1) return [lead]
    return toks.map((_, i) => toks.slice(0, i + 1).join(' '))
}

// ── 行類型判斷 ────────────────────────────────

const TIME_HEAD = /^(上午|下午|AM|PM)?\s*(\d{1,2}:\d{2})\s+/i

/** 日期分隔線：7月16日(四) / 2026.07.18 星期六 */
export function parseDateDivider(line: string): string | null {
    let m = line.match(/^(\d{1,2})月(\d{1,2})日/)
    if (m) return String(m[1]).padStart(2, '0') + String(m[2]).padStart(2, '0')
    m = line.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
    if (m) return String(m[2]).padStart(2, '0') + String(m[3]).padStart(2, '0')
    return null
}

// ── 一則客人訊息 → 名字 + 多個(規格,數量) ────────────

export interface MessageItems {
    name: string | null
    nameSource: string | null   // 沒規格清單時，要從這段文字切名字
    items: { variant: string | null; qty: number }[]
    expanded: boolean           // 是「各1／全套」自動展開的
    wantsAll: boolean           // 有各1/全套語意但沒規格清單 → 提醒補
}

export function parseCustomerMessage(text: string, variants: string[]): MessageItems | null {
    // 有沒有「下單訊號」——沒有就不是喊單（避免把閒聊當訂單）
    const hasSignal = /[+＋*×xX]\s*\d/.test(text)
        || /[各都]\s*[+＋]?\s*要?\s*\d/.test(text)
        || /(全套|全部)/.test(text)
        || /全\s*[+＋*×]?\s*\d/.test(text)
    if (!hasSignal) return null

    const num = (re: RegExp): number | null => {
        const m = text.match(re)
        if (!m) return null
        const d = m[0].replace(/\D/g, '')
        return d ? parseInt(d, 10) : null
    }
    const loc = (re: RegExp): number | null => {
        const m = text.match(re)
        return m && m.index !== undefined ? m.index : null
    }

    const globalQty = num(/[各都]\s*[+＋]?\s*要?\s*(\d+)/) ?? num(/[+＋*×xX]\s*(\d+)/) ?? 1

    // 掃出所有規格出現位置（含重複、含「麵包超人」內含「麵包」）
    const hits: { loc: number; len: number; name: string }[] = []
    for (const v of variants) {
        const vt = v.trim()
        if (!vt) continue
        let from = 0
        for (;;) {
            const i = text.toLowerCase().indexOf(vt.toLowerCase(), from)
            if (i < 0) break
            hits.push({ loc: i, len: vt.length, name: vt })
            from = i + vt.length
        }
    }
    hits.sort((a, b) => (a.loc === b.loc ? b.len - a.len : a.loc - b.loc))
    const uniq: typeof hits = []
    for (const h of hits) {
        const last = uniq[uniq.length - 1]
        if (last && h.loc < last.loc + last.len) continue    // 重疊只留第一個
        uniq.push(h)
    }

    const allLoc = loc(/(全套|全部)/) ?? loc(/全\s*[+＋*×]?\s*\d/)
    const eachLoc = loc(/[各都]\s*[+＋]?\s*要?\s*\d/)
    const qtyLoc = loc(/[+＋*×xX]\s*\d/)

    // 名字＝第一個「規格／全套／各／數量」之前的字
    const cutCands = [uniq[0]?.loc, allLoc, eachLoc, qtyLoc].filter((n): n is number => n != null)
    const cut = cutCands.length ? Math.min(...cutCands) : text.length
    let name: string | null = null
    if (cut > 0) {
        const n = text.slice(0, cut)
            .replace(/^[\s、，,/／和跟與都各全]+/, '').replace(/[\s、，,/／和跟與都各全]+$/, '')
            .trim()
        if (n) name = n
    }

    // 每個規格自己的數量（緊接其後有 +N 就用它，否則用全域數量）
    const qtyAfter = (end: number): number | null => {
        const m = text.slice(end).match(/^[\s、，,]*[+＋*×xX]\s*(\d+)/)
        return m ? parseInt(m[1], 10) : null
    }

    if (uniq.length) {
        const items = uniq.map(h => ({ variant: h.name, qty: qtyAfter(h.loc + h.len) ?? globalQty }))
        return { name, nameSource: null, items, expanded: items.length > 1, wantsAll: false }
    }
    if ((allLoc != null || eachLoc != null) && variants.length) {
        return {
            name, nameSource: null,
            items: variants.map(v => ({ variant: v, qty: globalQty })),
            expanded: true, wantsAll: false,
        }
    }
    const wantsAll = allLoc != null || eachLoc != null

    // 沒命中規格清單 → 用數量標記把訊息切段，每段一樣商品
    // 支援「麵包車+1 細菌車+1」「麵包車+1細菌車+1火車+1」「麵包、細菌都+1」
    const markers = [...text.matchAll(/[+＋*×xX]\s*\d+/g)]
    if (markers.length) {
        const items: { variant: string | null; qty: number }[] = []
        let nameSource: string | null = null
        let cursor = 0
        for (let i = 0; i < markers.length; i++) {
            const m = markers[i]
            const seg = text.slice(cursor, m.index)
            const q = parseInt(m[0].replace(/\D/g, ''), 10) || globalQty
            let parts = seg.split(/[、，,/／]/).map(x => x.trim()).filter(Boolean)
            if (!parts.length) parts = [seg.trim()]
            parts.forEach((p, j) => {
                if (i === 0 && j === 0) { nameSource = p; items.push({ variant: null, qty: q }) }
                else items.push({ variant: cleanProductText(p), qty: q })
            })
            cursor = (m.index ?? 0) + m[0].length
        }
        if (items.length) return { name: null, nameSource, items, expanded: items.length > 1, wantsAll }
    }
    return { name, nameSource: null, items: [{ variant: null, qty: globalQty }], expanded: false, wantsAll }
}

// ── 賣家公告：商品 / 金額 / 規格 ────────────────

export function parseStandardHeader(lines: string[]) {
    let product: string | null = null
    let price: number | null = null
    let variants: string[] = []
    for (const line of lines) {
        const rm = line.match(/^\s*規格\s*[：:]\s*(.+)$/)
        if (rm) {
            variants = rm[1].split(/[/／、,，|｜]/).map(x => x.trim()).filter(Boolean)
            continue
        }
        if (price == null) {
            for (const re of [/[$＄]\s*(\d{2,6})/, /(\d{2,6})\s*元/]) {
                const m = line.match(re)
                if (m) {
                    price = parseInt(m[1], 10)
                    const name = line.replace(m[0], '').trim()
                    if (name) product = name.slice(0, 40)
                    break
                }
            }
        }
    }
    return { product, price, variants }
}

/** 金額：只認價格標記。★沒有標記就回 null 讓使用者填——金額錯＝收錯錢，絕不亂猜。 */
export function guessPrice(text: string): number | null {
    for (const re of [/一組\s*(\d{2,6})/, /一個\s*(\d{2,6})/, /一件\s*(\d{2,6})/, /一份\s*(\d{2,6})/,
                      /售價\s*(\d{2,6})/, /特價\s*(\d{2,6})/, /[$＄]\s*(\d{2,6})/, /(\d{2,6})\s*元/]) {
        const m = text.match(re)
        if (m) return parseInt(m[1], 10)
    }
    return null
}

export function guessProduct(text: string, price: number | null): string {
    const lines = text.split('\n')
    let cand = lines[0] ?? ''
    if (price != null) {
        const hit = lines.find(l => l.includes(String(price)))
        if (hit) cand = hit
    }
    for (const re of [/一組.*$/, /一個.*$/, /一件.*$/, /售價.*$/, /[$＄]\s*\d+.*$/, /\d{2,6}\s*元.*$/]) {
        cand = cand.replace(re, '')
    }
    for (const f of ['有少量現貨', '少量現貨', '有現貨', '現貨', '熱賣款', '開賣', '補貨', '預購', '到貨']) {
        cand = cand.split(f).join('')
    }
    cand = cand.trim()
    if (!cand) cand = (lines[0] ?? '').trim()
    return cand.slice(0, 30)
}

// ── 整串解析 ──────────────────────────────────

export interface ParsedShout {
    lead: string            // 原文（身分證用它）
    name: string | null
    nameSource: string | null
    variant: string | null
    qty: number
    time: string
    date: string | null
    expanded: boolean
    lineAmount: number | null   // 手動錄單「一行自帶金額」用；null = 吃上面的統一金額
}

export interface ParsedThread {
    threadTime: string | null   // 賣家貼文時間＝這串的指紋
    threadDate: string | null
    announcement: string
    productGuess: string
    priceGuess: number | null
    variants: string[]
    usedStandard: boolean
    needsVariants: boolean
    shouts: ParsedShout[]
}

export function parseThread(
    text: string,
    variantsOverride: string[] = [],
    sellerNames: string[] = [],
): ParsedThread {
    const normalized = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const rawLines = normalized.split('\n')

    // 整段完全沒有時間戳 → 舊版純名單模式（每行各自一則），維持既有用法可用
    const hasAnyTime = rawLines.some(l => TIME_HEAD.test(l.trim()))

    type Msg = { date: string | null; time: string; isSeller: boolean; text: string }
    const msgs: Msg[] = []
    let curDate: string | null = null
    let threadDate: string | null = null
    let threadTime: string | null = null
    const sellers = [...sellerNames].sort((a, b) => b.length - a.length)

    for (const raw of rawLines) {
        let line = raw.trim()
        if (!line) continue
        const d = parseDateDivider(line)
        if (d) { curDate = d; if (!threadDate) threadDate = d; continue }

        let isNew = false
        let t = ''
        const tm = line.match(TIME_HEAD)
        if (tm) {
            const hm = tm[0].match(/\d{1,2}:\d{2}/)
            if (hm) t = hm[0]
            line = line.slice(tm[0].length)
            isNew = true
        }
        line = line.replace(/\s+(上午|下午|AM|PM)?\s*\d{1,2}:\d{2}$/i, '').trim()
        if (!line) continue

        if (isNew || !hasAnyTime) {
            let isSeller = false
            const noSpace = line.replace(/[ 　]/g, '')
            const hit = sellers.find(s =>
                line.startsWith(s) || noSpace.startsWith(s.replace(/[ 　]/g, '')))
            if (hit) {
                isSeller = true
                const idx = line.indexOf(hit)
                line = (idx >= 0 ? line.slice(idx + hit.length) : line).trim()
                if (!threadTime && t) threadTime = t
            }
            msgs.push({ date: curDate, time: t, isSeller, text: line })
        } else if (msgs.length) {
            msgs[msgs.length - 1].text += '\n' + line       // 續行併入同一則
        }
    }

    const announceLines = msgs.filter(m => m.isSeller).flatMap(m => m.text.split('\n'))
    const announcement = announceLines.join('\n')
    const std = parseStandardHeader(announceLines)
    const price = std.price ?? guessPrice(announcement)
    const product = std.product ?? guessProduct(announcement, price)
    const usedStandard = std.price != null && std.product != null
    const list = variantsOverride.length ? variantsOverride : std.variants

    const shouts: ParsedShout[] = []
    let needsVariants = false
    for (const m of msgs) {
        if (m.isSeller) continue
        const lead = m.text.replace(/\n/g, ' ').trim()
        if (!lead) continue
        const r = parseCustomerMessage(m.text, list)
        if (!r) {
            // 舊版純名單模式（整段沒有時間戳）：一行就是一筆，沒寫數量當 1。
            // ★討論串模式不可比照，否則閒聊會變成訂單。
            if (!hasAnyTime) {
                shouts.push({
                    lead, name: null, nameSource: lead, variant: null, qty: 1,
                    time: m.time, date: m.date ?? threadDate, expanded: false,
                    lineAmount: null,
                })
            }
            continue
        }
        if (!list.length && r.wantsAll) needsVariants = true
        for (const it of r.items) {
            shouts.push({
                lead, name: r.name, nameSource: r.nameSource,
                variant: it.variant, qty: it.qty,
                time: m.time, date: m.date ?? threadDate, expanded: r.expanded,
                lineAmount: null,
            })
        }
    }

    return {
        threadTime, threadDate, announcement,
        productGuess: product, priceGuess: price,
        variants: list, usedStandard, needsVariants, shouts,
    }
}

/**
 * 喊單身分證（冪等去重的鑰匙）
 *
 * ★鑰匙的每個元素都必須「不受複製範圍影響」，否則同一則喊單會算出不同身分證 → 重複入單。
 *
 * - **不可放日期**：日期來自「複製範圍裡的第一條分隔線」，多框一行日期就變了。
 *   （踩過：Mac 貼的沒帶到 07.16 分隔線算成 0717、網頁貼的帶到了算成 0716 → 整串重複入單）
 * - **不可用今天**：隔天補掃同一串就變了。
 * - 指紋用**賣家貼文時間**，不用商品名（商品名是猜的、複製範圍不同會變）。
 *   ⚠️ 因此**必須複製到賣家自己那則貼文**；沒有的話只能退回用商品名（會飄），
 *      UI 會警告使用者。從碎片無法識別是哪一串，這個限制無解，只能提醒。
 * - 用**原文 lead**，不用切分後的名字（切分邏輯會隨解析器改進而變，也不受手動編輯影響）。
 */
export function makeSourceKey(args: {
    threadTime: string | null
    product: string
    rawLead: string
    time: string
    variant: string | null
}): string {
    const anchor = args.threadTime ? `T${args.threadTime}` : `P${normalizeLead(args.product)}`
    const item = args.variant ? `|${normalizeLead(args.variant)}` : ''
    return `${anchor}|${args.time}|${normalizeLead(args.rawLead)}${item}`
}


// ── 手動錄單（獨立於討論串解析，一行一筆、所見即所得）────────────

/** 一行自帶金額：「暱稱 [商品] 金額」，金額(總額)寫行尾、沒有 +數量。 */
export function parseInlineAmount(text: string, variants: string[]):
    { name: string; variant: string | null; amount: number } | null {
    const t = (text ?? '').trim()
    if (/[+＋*×xX]\s*\d/.test(t)) return null          // 有 +數量 → 不是這型
    const parts = t.split(/[ 　\t]+/).filter(Boolean)
    if (parts.length < 2) return null
    const last = parts[parts.length - 1]
    if (!/^\d{1,7}$/.test(last)) return null            // 行尾必須是純數字
    const amount = parseInt(last, 10)
    let name: string, variant: string | null = null
    if (parts.length >= 3) {                             // 暱稱 商品 金額
        variant = parts[parts.length - 2]
        name = parts.slice(0, -2).join(' ')
        const hit = variants.find(v => v.toLowerCase() === variant!.toLowerCase())
        if (hit) variant = hit
    } else {                                             // 暱稱 金額
        name = parts.slice(0, -1).join(' ')
    }
    if (!name) return null
    return { name, variant, amount }
}

/**
 * 手動錄單：你自己打的名單，一行一筆、所見即所得。不做討論串解析、不排除賣家、不展開各1。
 * 支援每行：
 *   暱稱 商品 金額   （一行自帶金額）
 *   暱稱 金額
 *   暱稱 +N          （數量，吃統一金額）
 *   暱稱             （吃統一商品/金額）
 */
export function parseManualList(
    text: string,
    opts: { defaultProduct: string | null; variants: string[] },
): ParsedShout[] {
    const out: ParsedShout[] = []
    const norm = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    for (const raw of norm.split('\n')) {
        const lead = raw.trim()
        if (!lead) continue

        // 依序剝：① 行尾金額 → ② 數量(xN/+N) → ③ 剩下切 暱稱/商品
        // 這樣「暱稱 商品x2 240」能同時吃到數量與金額（不再誤判成沒金額）。
        let rest = lead
        let lineAmount: number | null = null
        let qty = 1

        // ① 行尾金額：空白 + 純數字結尾，且前面仍有內容（不是 +數量 的那個數字）
        const amtM = rest.match(/^(.*\S)\s+(\d{1,7})$/)
        if (amtM) { rest = amtM[1].trim(); lineAmount = parseInt(amtM[2], 10) }

        // ② 數量標記（剝完金額後）在結尾：xN / ×N / *N / +N，可緊貼商品或有空格
        const qtyM = rest.match(/^(.*?)\s*[+＋*×xX]\s*(\d+)\s*$/)
        if (qtyM) { rest = qtyM[1].trim(); qty = Math.max(1, parseInt(qtyM[2], 10) || 1) }

        // ③ 切暱稱 / 商品（≥2 段：最後一段當商品/規格，其餘當暱稱）
        const parts = rest.split(/[ 　\t]+/).filter(Boolean)
        let name: string
        let variant: string | null = opts.defaultProduct
        if (parts.length >= 2) {
            const v = parts[parts.length - 1]
            const hit = opts.variants.find(x => x.toLowerCase() === v.toLowerCase())
            variant = hit || v
            name = parts.slice(0, -1).join(' ')
        } else {
            name = parts.join(' ')
        }
        if (!name) continue

        out.push({ lead, name, nameSource: null, variant, qty,
                   time: '', date: null, expanded: false, lineAmount })
    }
    return out
}
