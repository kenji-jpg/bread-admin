-- 記一筆收款：把任意金額累加進 checkouts.paid_amount，再重算付款狀態
-- 取代「用負項商品當收據」的舊 hack（負項會污染 order_items 商品總額與免運判斷）
-- p_amount 可正可負（負值用來修正多記）；paid_amount 不會低於 0

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
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    IF p_amount IS NULL OR p_amount = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '金額不可為 0');
    END IF;

    SELECT id, paid_amount, total_amount INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '結帳單不存在');
    END IF;

    v_new_paid := GREATEST(0, COALESCE(v_checkout.paid_amount, 0) + p_amount);
    UPDATE checkouts SET paid_amount = v_new_paid, updated_at = NOW()
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    -- 依新的 paid_amount vs total_amount 重算 pending/partial/paid（shipped/completed 會被跳過）
    PERFORM recalc_checkout_payment_status_v1(p_tenant_id, p_checkout_id);

    SELECT paid_amount, total_amount, payment_status INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id;

    RETURN jsonb_build_object(
        'success', true,
        'paid_amount', v_checkout.paid_amount,
        'total_amount', v_checkout.total_amount,
        'payment_status', v_checkout.payment_status,
        'still_owed', GREATEST(0, v_checkout.total_amount - v_checkout.paid_amount));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_checkout_payment_v1(uuid, uuid, integer) TO authenticated;
