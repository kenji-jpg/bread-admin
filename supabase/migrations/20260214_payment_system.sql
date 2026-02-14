-- =====================================================
-- Payment System Migration
-- 建立付款交易系統：payment_transactions 表 + 訂閱欄位
-- =====================================================

-- 1. 建立付款記錄表
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug TEXT NOT NULL,

    -- 付款資訊
    amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed')),

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
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_id
ON public.payment_transactions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_slug
ON public.payment_transactions(tenant_slug);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
ON public.payment_transactions(payment_status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at
ON public.payment_transactions(created_at DESC);

-- RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- 租戶只能看到自己的付款記錄
DROP POLICY IF EXISTS "Tenants can view own payments" ON public.payment_transactions;
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
DROP POLICY IF EXISTS "Super admins can view all payments" ON public.payment_transactions;
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

-- 超管可以插入記錄（手動升級）
DROP POLICY IF EXISTS "Super admins can insert payments" ON public.payment_transactions;
CREATE POLICY "Super admins can insert payments"
ON public.payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM super_admins
        WHERE user_id = auth.uid() AND is_active = true
    )
);

COMMENT ON TABLE public.payment_transactions IS '付款交易記錄表：記錄所有付款（轉帳/金流）';

-- 2. tenants 表新增訂閱欄位
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_auto_renew BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

COMMENT ON COLUMN public.tenants.subscription_starts_at IS '當前訂閱開始時間';
COMMENT ON COLUMN public.tenants.subscription_auto_renew IS '是否自動續約（目前都是 false，需手動轉帳）';
COMMENT ON COLUMN public.tenants.next_billing_date IS '下次扣款日期（目前等於 plan_expires_at）';

-- 3. 更新 plan_expires_at 為 NULL 的基本方案租戶
-- 確保資料一致性
UPDATE public.tenants
SET plan_expires_at = NULL
WHERE plan = 'basic' AND plan_expires_at IS NOT NULL;
