# 銀行轉帳付費系統實作指南

## 🎯 系統架構

### 核心概念
```
用戶轉帳（備註 slug） → 銀行 Email 通知 → Cloudflare Worker
→ 解析 Email → 驗證金額 → 升級租戶 → 通知用戶
```

---

## 📊 資料庫設計

### 1. 新增付款記錄表

```sql
-- 建立付款記錄表
CREATE TABLE public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug TEXT NOT NULL,

    -- 付款資訊
    amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
    payment_status TEXT NOT NULL DEFAULT 'pending',

    -- 轉帳資訊
    transfer_date TIMESTAMPTZ,
    transfer_account_last4 TEXT,  -- 轉出帳號後四碼
    bank_reference TEXT,  -- 銀行交易編號

    -- Email 原始資料
    email_raw_data JSONB,
    email_received_at TIMESTAMPTZ,

    -- 審核資訊
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    verification_note TEXT,

    -- 訂閱資訊
    subscription_type TEXT CHECK (subscription_type IN ('monthly', 'yearly')),
    subscription_starts_at TIMESTAMPTZ,
    subscription_ends_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_payment_transactions_tenant_id
ON public.payment_transactions(tenant_id);

CREATE INDEX idx_payment_transactions_slug
ON public.payment_transactions(tenant_slug);

CREATE INDEX idx_payment_transactions_status
ON public.payment_transactions(payment_status);

-- RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- 租戶只能看到自己的付款記錄
CREATE POLICY "Tenants can view own payments"
ON public.payment_transactions
FOR SELECT
TO authenticated
USING (
    tenant_id IN (
        SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
);

-- 超管可以看所有記錄
CREATE POLICY "Super admins can view all payments"
ON public.payment_transactions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM super_admins
        WHERE user_id = auth.uid() AND is_active = true
    )
);

COMMENT ON TABLE public.payment_transactions IS '付款交易記錄表：記錄所有付款（轉帳/金流）';
```

### 2. tenants 表新增欄位

```sql
-- 新增訂閱相關欄位
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_auto_renew BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

COMMENT ON COLUMN tenants.subscription_starts_at IS '當前訂閱開始時間';
COMMENT ON COLUMN tenants.subscription_auto_renew IS '是否自動續約（目前都是 false，需手動轉帳）';
COMMENT ON COLUMN tenants.next_billing_date IS '下次繳費日期（用於提醒）';
```

---

## 🔧 RPC 函數

### 1. 自動升級函數（Worker 呼叫）

```sql
CREATE OR REPLACE FUNCTION process_bank_transfer_payment(
    p_tenant_slug TEXT,
    p_amount INTEGER,
    p_transfer_date TIMESTAMPTZ,
    p_bank_reference TEXT,
    p_email_raw_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tenant_id UUID;
    v_expected_amount INTEGER;
    v_subscription_type TEXT;
    v_ends_at TIMESTAMPTZ;
    v_transaction_id UUID;
BEGIN
    -- 1. 查詢租戶
    SELECT id INTO v_tenant_id
    FROM tenants
    WHERE slug = p_tenant_slug;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'tenant_not_found',
            'message', '找不到租戶：' || p_tenant_slug
        );
    END IF;

    -- 2. 驗證金額
    -- 月費：599，年費：5990
    IF p_amount = 599 THEN
        v_subscription_type := 'monthly';
        v_expected_amount := 599;
        v_ends_at := NOW() + INTERVAL '1 month';
    ELSIF p_amount = 5990 THEN
        v_subscription_type := 'yearly';
        v_expected_amount := 5990;
        v_ends_at := NOW() + INTERVAL '1 year';
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '金額錯誤：' || p_amount || '，應為 599（月費）或 5990（年費）'
        );
    END IF;

    -- 3. 檢查是否重複（同一天同金額）
    IF EXISTS (
        SELECT 1 FROM payment_transactions
        WHERE tenant_id = v_tenant_id
          AND payment_status = 'completed'
          AND amount = p_amount
          AND transfer_date::DATE = p_transfer_date::DATE
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'duplicate_payment',
            'message', '今日已有相同金額的付款記錄'
        );
    END IF;

    -- 4. 建立付款記錄
    INSERT INTO payment_transactions (
        tenant_id,
        tenant_slug,
        amount,
        payment_method,
        payment_status,
        transfer_date,
        bank_reference,
        email_raw_data,
        email_received_at,
        subscription_type,
        subscription_starts_at,
        subscription_ends_at,
        verified_at
    ) VALUES (
        v_tenant_id,
        p_tenant_slug,
        p_amount,
        'bank_transfer',
        'completed',
        p_transfer_date,
        p_bank_reference,
        p_email_raw_data,
        NOW(),
        v_subscription_type,
        NOW(),
        v_ends_at,
        NOW()
    )
    RETURNING id INTO v_transaction_id;

    -- 5. 升級租戶
    UPDATE tenants
    SET
        plan = 'pro',
        plan_expires_at = v_ends_at,
        subscription_starts_at = NOW(),
        next_billing_date = v_ends_at,
        updated_at = NOW()
    WHERE id = v_tenant_id;

    -- 6. 記錄審計日誌（如果是超管操作）
    -- 這裡省略，因為是系統自動操作

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'tenant_slug', p_tenant_slug,
        'subscription_type', v_subscription_type,
        'expires_at', v_ends_at
    );
END;
$$;

COMMENT ON FUNCTION process_bank_transfer_payment IS '處理銀行轉帳付款：驗證金額並升級租戶（由 Cloudflare Worker 呼叫）';
```

### 2. 手動審核函數（超管用）

```sql
CREATE OR REPLACE FUNCTION manual_verify_payment(
    p_transaction_id UUID,
    p_approve BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tenant_id UUID;
    v_amount INTEGER;
    v_subscription_type TEXT;
    v_ends_at TIMESTAMPTZ;
BEGIN
    -- 檢查超管權限
    IF NOT EXISTS (
        SELECT 1 FROM super_admins
        WHERE user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Super admin only';
    END IF;

    -- 取得交易資訊
    SELECT tenant_id, amount, subscription_type, subscription_ends_at
    INTO v_tenant_id, v_amount, v_subscription_type, v_ends_at
    FROM payment_transactions
    WHERE id = p_transaction_id;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'transaction_not_found'
        );
    END IF;

    IF p_approve THEN
        -- 批准：更新交易 + 升級租戶
        UPDATE payment_transactions
        SET
            payment_status = 'completed',
            verified_by = auth.uid(),
            verified_at = NOW(),
            verification_note = p_note
        WHERE id = p_transaction_id;

        UPDATE tenants
        SET
            plan = 'pro',
            plan_expires_at = v_ends_at,
            subscription_starts_at = NOW(),
            next_billing_date = v_ends_at
        WHERE id = v_tenant_id;
    ELSE
        -- 拒絕：標記為失敗
        UPDATE payment_transactions
        SET
            payment_status = 'failed',
            verified_by = auth.uid(),
            verified_at = NOW(),
            verification_note = p_note
        WHERE id = p_transaction_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION manual_verify_payment IS '超管手動審核付款（用於 Email 解析失敗的情況）';
```

---

## 🌐 Cloudflare Worker

### 建立新的 Worker

```bash
cd workers
mkdir bank-transfer-email
cd bank-transfer-email
npm init -y
npm install
```

### `workers/bank-transfer-email/src/index.ts`

```typescript
/**
 * 銀行轉帳 Email 自動化處理
 *
 * 功能：
 * 1. 接收銀行入帳通知 Email
 * 2. 解析金額 + 備註（租戶 slug）
 * 3. 驗證並自動升級租戶
 */

interface Env {
    SUPABASE_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
}

export default {
    async email(message: any, env: Env, ctx: any) {
        console.log('[Bank Transfer] 收到 Email')

        try {
            // 1. 解析 Email 內容
            const parsed = await parseEmail(message)

            if (!parsed.success) {
                console.error('[Parse Error]', parsed.error)
                return
            }

            console.log('[Parsed]', parsed)

            // 2. 呼叫 Supabase RPC
            const response = await fetch(
                `${env.SUPABASE_URL}/rest/v1/rpc/process_bank_transfer_payment`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                        p_tenant_slug: parsed.tenantSlug,
                        p_amount: parsed.amount,
                        p_transfer_date: parsed.transferDate,
                        p_bank_reference: parsed.bankReference,
                        p_email_raw_data: {
                            from: message.from,
                            subject: message.subject,
                            text: message.text || '',
                            html: message.html || '',
                        },
                    }),
                }
            )

            const result = await response.json()

            if (result.success) {
                console.log('[Success]', result)
                // TODO: 發送通知給用戶
            } else {
                console.error('[RPC Error]', result)
            }
        } catch (error) {
            console.error('[Worker Error]', error)
        }
    },
}

/**
 * 解析 Email 內容
 *
 * 需要根據你的銀行 Email 格式調整
 *
 * 範例（玉山銀行）：
 * 主旨：入帳通知
 * 內容：
 *   轉入帳號：123456789012
 *   轉入金額：599
 *   轉出帳號：987654321（陳小明）
 *   交易時間：2026/02/14 14:30
 *   備註：mrsanpanman
 */
async function parseEmail(message: any) {
    const text = message.text || ''
    const subject = message.subject || ''

    // 1. 檢查是否為入帳通知
    if (!subject.includes('入帳通知') && !subject.includes('轉帳通知')) {
        return {
            success: false,
            error: 'not_transfer_notification',
        }
    }

    // 2. 解析金額
    const amountMatch = text.match(/金額[：:]\s*([\d,]+)/)
    if (!amountMatch) {
        return { success: false, error: 'amount_not_found' }
    }
    const amount = parseInt(amountMatch[1].replace(/,/g, ''))

    // 3. 解析備註（租戶 slug）
    const noteMatch = text.match(/備註[：:]\s*([a-z0-9\-]+)/)
    if (!noteMatch) {
        return { success: false, error: 'note_not_found' }
    }
    const tenantSlug = noteMatch[1].trim()

    // 4. 解析交易時間
    const dateMatch = text.match(/時間[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/)
    const transferDate = dateMatch
        ? new Date(dateMatch[1].replace(/\//g, '-')).toISOString()
        : new Date().toISOString()

    // 5. 解析銀行交易編號（可選）
    const refMatch = text.match(/交易序號[：:]\s*([A-Z0-9]+)/)
    const bankReference = refMatch ? refMatch[1] : null

    return {
        success: true,
        amount,
        tenantSlug,
        transferDate,
        bankReference,
    }
}
```

### `workers/bank-transfer-email/wrangler.toml`

```toml
name = "bank-transfer-email-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
SUPABASE_URL = "https://kashgsxlrdyuirijocld.supabase.co"

# Secret（用 wrangler secret put 設定）
# SUPABASE_SERVICE_ROLE_KEY
```

### 部署

```bash
# 設定 Secret
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# 部署
npx wrangler deploy
```

---

## 📧 Cloudflare Email Routing 設定

### 1. 新增專用信箱

前往 Cloudflare Dashboard → Email Routing → Routes

```
payment@plushub.cc → bank-transfer-email-worker
```

### 2. 請銀行設定通知

將銀行帳號的「入帳通知」Email 設定為：
```
payment@plushub.cc
```

---

## 🖥️ 前端實作

### 升級頁面

`app/admin/t/[slug]/settings/billing/page.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/hooks/use-tenant'
import { Copy, Check } from 'lucide-react'

export default function BillingPage() {
    const { tenant } = useTenant()
    const [copied, setCopied] = useState(false)

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="space-y-6">
            {/* 當前方案 */}
            <Card>
                <CardHeader>
                    <CardTitle>當前方案</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Badge variant={tenant.plan === 'pro' ? 'default' : 'secondary'}>
                            {tenant.plan === 'pro' ? 'Pro 專業版' : 'Basic 免費版'}
                        </Badge>
                        {tenant.plan_expires_at && (
                            <span className="text-sm text-muted-foreground">
                                到期日：{new Date(tenant.plan_expires_at).toLocaleDateString('zh-TW')}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* 升級 Pro */}
            {tenant.plan === 'basic' && (
                <Card>
                    <CardHeader>
                        <CardTitle>升級 Pro 專業版</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <h3 className="font-semibold">方案價格</h3>
                            <div className="flex gap-4">
                                <div className="border rounded-lg p-4">
                                    <div className="text-2xl font-bold">NT$ 599</div>
                                    <div className="text-sm text-muted-foreground">/ 月</div>
                                </div>
                                <div className="border rounded-lg p-4">
                                    <div className="text-2xl font-bold">NT$ 5,990</div>
                                    <div className="text-sm text-muted-foreground">/ 年（省 1,198）</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold">付款方式：銀行轉帳</h3>
                            <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">銀行</span>
                                    <span className="font-mono">玉山銀行（808）</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">帳號</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono">1234-5678-9012</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard('123456789012')}
                                        >
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">戶名</span>
                                    <span>王大明</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground font-bold">⚠️ 轉帳備註</span>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="destructive">{tenant.slug}</Badge>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(tenant.slug)}
                                        >
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                            <h4 className="font-semibold text-amber-900">重要提醒</h4>
                            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                                <li>請務必在轉帳備註填寫：<strong>{tenant.slug}</strong></li>
                                <li>金額：月費 NT$ 599 或 年費 NT$ 5,990</li>
                                <li>轉帳後約 5-10 分鐘自動開通</li>
                                <li>若超過 1 小時未開通，請聯繫客服</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 付款記錄 */}
            <Card>
                <CardHeader>
                    <CardTitle>付款記錄</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* TODO: 顯示 payment_transactions 列表 */}
                    <p className="text-sm text-muted-foreground">暫無付款記錄</p>
                </CardContent>
            </Card>
        </div>
    )
}
```

---

## 📱 通知系統（選配）

### LINE Notify（推薦）

當付款成功後，透過 LINE Notify 通知用戶：

```typescript
// supabase/functions/send-payment-notification/index.ts
Deno.serve(async (req) => {
    const { tenantSlug, subscriptionType } = await req.json()

    // 取得租戶 owner 的 LINE ID
    // 發送 LINE Notify

    return new Response('OK')
})
```

---

## 🧪 測試流程

### 1. 模擬銀行 Email

```
主旨：入帳通知

內容：
轉入帳號：123456789012
轉入金額：599
轉出帳號：987654321（測試用戶）
交易時間：2026/02/14 15:30
備註：mrsanpanman
交易序號：T20260214001
```

### 2. 發送到 Worker

```bash
curl -X POST https://bank-transfer-email-worker.youraccount.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "from": "bank@esunbank.com",
    "subject": "入帳通知",
    "text": "轉入金額：599\n備註：mrsanpanman\n交易時間：2026/02/14 15:30"
  }'
```

### 3. 驗證結果

```sql
-- 查看付款記錄
SELECT * FROM payment_transactions
WHERE tenant_slug = 'mrsanpanman'
ORDER BY created_at DESC;

-- 查看租戶狀態
SELECT slug, plan, plan_expires_at
FROM tenants
WHERE slug = 'mrsanpanman';
```

---

## 📊 超管審核頁面（備用）

當 Email 解析失敗時，超管可手動審核：

`app/admin/payments/page.tsx`

```tsx
// 顯示 payment_status = 'pending' 的交易
// 超管可查看原始 Email → 手動批准/拒絕
```

---

## 🎯 總結

### 優勢
- ✅ **零成本**：無手續費 + 無 API 費用
- ✅ **自動化**：90% 自動處理，僅少數需手動
- ✅ **彈性**：可隨時調整價格
- ✅ **經驗複用**：你已經寫過賣貨便 Email Worker

### 限制
- ⚠️ 無自動續約（需每月提醒）
- ⚠️ 有時間差（轉帳後 5-10 分鐘開通）

### 未來升級路徑
- Phase 1：銀行轉帳（現在）
- Phase 2：加入綠界（提供信用卡選項）
- Phase 3：Stripe（國際化）

---

需要我幫你實作任何部分嗎？😊
