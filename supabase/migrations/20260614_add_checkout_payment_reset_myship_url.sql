-- 記收款後：賣貨便結帳單若賣場已開(url_sent)且仍有尚欠 → 清掉 store_url/賣場名、退回 pending
-- 目的：客人先匯款一部分、之後再把後續到貨商品併入同一張，最後只開「一次」賣貨便收尾款
--       （避免拆兩個賣場 = 客人付兩次運費）。退回 pending 後，插件下次會重新開賣場。
CREATE OR REPLACE FUNCTION public.add_checkout_payment_v1(
    p_tenant_id uuid,
    p_checkout_id uuid,
    p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_error TEXT;
    v_checkout RECORD;
    v_new_paid INT;
    v_myship_reset BOOLEAN := false;
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    IF p_amount IS NULL OR p_amount = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '金額不可為 0');
    END IF;

    SELECT id, paid_amount, total_amount, shipping_method, shipping_status, store_url
    INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '結帳單不存在');
    END IF;

    v_new_paid := GREATEST(0, COALESCE(v_checkout.paid_amount, 0) + p_amount);
    UPDATE checkouts SET paid_amount = v_new_paid, updated_at = NOW()
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    -- 只要賣貨便賣場已開(url_sent)就重置（不論付清或部分）
    IF v_checkout.shipping_method IN ('myship','myship_free')
       AND v_checkout.shipping_status = 'url_sent' THEN
        UPDATE checkouts
        SET store_url = NULL, myship_store_name = NULL,
            shipping_status = 'pending', is_notified = false, updated_at = NOW()
        WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
        v_myship_reset := true;
    END IF;

    PERFORM recalc_checkout_payment_status_v1(p_tenant_id, p_checkout_id);

    SELECT paid_amount, total_amount, payment_status INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id;

    RETURN jsonb_build_object(
        'success', true,
        'paid_amount', v_checkout.paid_amount,
        'total_amount', v_checkout.total_amount,
        'payment_status', v_checkout.payment_status,
        'still_owed', GREATEST(0, v_checkout.total_amount - v_checkout.paid_amount),
        'myship_url_reset', v_myship_reset);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_checkout_payment_v1(uuid, uuid, integer) TO authenticated;
