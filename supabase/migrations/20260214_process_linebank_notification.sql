-- =====================================================
-- LINE Bank 通知解析與驗證函數
-- =====================================================

CREATE OR REPLACE FUNCTION public.process_linebank_notification(
    p_notification_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount INTEGER;
    v_tenant_slug TEXT;
    v_transfer_date TIMESTAMPTZ;
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_subscription_type TEXT;
    v_subscription_months INTEGER;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_payment_id UUID;
BEGIN
    -- 檢查是否為超級管理員
    IF NOT EXISTS (
        SELECT 1 FROM super_admins
        WHERE user_id = auth.uid() AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'not_authorized',
            'message', '您沒有權限執行此操作'
        );
    END IF;

    -- 1. 解析金額（支援多種格式）
    -- "NT$599" or "NT$ 599" or "599" or "5,990"
    v_amount := (
        regexp_replace(
            regexp_replace(p_notification_text, 'NT\$?\s*', '', 'gi'),
            '[^0-9]', '', 'g'
        )::INTEGER
    );

    -- 驗證金額
    IF v_amount IS NULL OR (v_amount <> 599 AND v_amount <> 5990) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '金額必須為 NT$ 599（月繳）或 NT$ 5,990（年繳）',
            'parsed_amount', v_amount
        );
    END IF;

    -- 2. 解析備註（tenant slug）
    -- 支援 "備註：xxx" 或 "備註: xxx" 或 "memo: xxx"
    v_tenant_slug := (
        SELECT TRIM(
            regexp_replace(
                substring(p_notification_text from '(?:備註|memo)[：:]\s*([a-zA-Z0-9_-]+)'),
                '[^a-zA-Z0-9_-]', '', 'gi'
            )
        )
    );

    -- 驗證 slug
    IF v_tenant_slug IS NULL OR v_tenant_slug = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'missing_slug',
            'message', '找不到備註中的租戶 slug，請確認格式：「備註：tenant-slug」'
        );
    END IF;

    -- 3. 查詢租戶
    SELECT id, name INTO v_tenant_id, v_tenant_name
    FROM tenants
    WHERE slug = v_tenant_slug;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'tenant_not_found',
            'message', format('找不到 slug 為「%s」的租戶', v_tenant_slug),
            'tenant_slug', v_tenant_slug
        );
    END IF;

    -- 4. 解析轉帳時間（選填，如果沒有就用現在時間）
    -- 支援 "時間：2024/02/14 15:30" 或 "2024-02-14"
    v_transfer_date := COALESCE(
        (
            SELECT TO_TIMESTAMP(
                regexp_replace(
                    substring(p_notification_text from '(?:時間|time)[：:]\s*([0-9\/\-:\s]+)'),
                    '[^0-9\/\-:\s]', '', 'gi'
                ),
                'YYYY/MM/DD HH24:MI'
            )
        ),
        NOW()
    );

    -- 5. 判斷訂閱類型
    IF v_amount = 599 THEN
        v_subscription_type := 'monthly';
        v_subscription_months := 1;
    ELSIF v_amount = 5990 THEN
        v_subscription_type := 'yearly';
        v_subscription_months := 12;
    END IF;

    -- 6. 計算訂閱期限
    v_starts_at := NOW();
    v_ends_at := v_starts_at + (v_subscription_months || ' months')::INTERVAL;

    -- 7. 建立付款記錄
    INSERT INTO payment_transactions (
        tenant_id,
        tenant_slug,
        amount,
        payment_method,
        payment_status,
        transfer_date,
        subscription_type,
        subscription_starts_at,
        subscription_ends_at,
        verified_by,
        verified_at,
        verification_note,
        email_raw_data
    ) VALUES (
        v_tenant_id,
        v_tenant_slug,
        v_amount,
        'bank_transfer',
        'completed',
        v_transfer_date,
        v_subscription_type,
        v_starts_at,
        v_ends_at,
        auth.uid(),
        NOW(),
        'LINE Bank 通知自動驗證',
        jsonb_build_object(
            'notification_text', p_notification_text,
            'parsed_at', NOW()
        )
    )
    RETURNING id INTO v_payment_id;

    -- 8. 升級租戶為 Pro
    UPDATE tenants
    SET
        plan = 'pro',
        plan_expires_at = v_ends_at,
        subscription_starts_at = v_starts_at,
        next_billing_date = v_ends_at,
        updated_at = NOW()
    WHERE id = v_tenant_id;

    -- 9. 返回成功結果
    RETURN jsonb_build_object(
        'success', true,
        'message', format('已成功升級「%s」為 Pro 方案', v_tenant_name),
        'tenant_id', v_tenant_id,
        'tenant_name', v_tenant_name,
        'tenant_slug', v_tenant_slug,
        'amount', v_amount,
        'subscription_type', v_subscription_type,
        'subscription_starts_at', v_starts_at,
        'subscription_ends_at', v_ends_at,
        'payment_id', v_payment_id,
        'transfer_date', v_transfer_date
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'internal_error',
            'message', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;

COMMENT ON FUNCTION public.process_linebank_notification IS 'LINE Bank 通知解析與驗證：自動辨識金額、slug、時間，建立付款記錄並升級租戶';
