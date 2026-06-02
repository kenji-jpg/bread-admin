-- C2: 依 paid_amount vs total_amount 推導 payment_status 三態
--   - paid_amount <= 0           → pending
--   - 0 < paid_amount < total    → partial
--   - paid_amount >= total       → paid
-- idempotent，鎖住 shipped/completed。
CREATE OR REPLACE FUNCTION public.recalc_checkout_payment_status_v1(
    p_tenant_id uuid,
    p_checkout_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_checkout RECORD;
    v_new_status TEXT;
BEGIN
    SELECT id, paid_amount, total_amount, payment_status, shipping_status
    INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF v_checkout IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found');
    END IF;

    IF v_checkout.shipping_status IN ('shipped', 'completed') THEN
        RETURN jsonb_build_object('success', true, 'action', 'skipped_locked');
    END IF;

    v_new_status := CASE
        WHEN v_checkout.paid_amount <= 0 THEN 'pending'
        WHEN v_checkout.paid_amount >= v_checkout.total_amount THEN 'paid'
        ELSE 'partial'
    END;

    IF v_new_status IS DISTINCT FROM v_checkout.payment_status THEN
        UPDATE checkouts
        SET payment_status = v_new_status, updated_at = NOW()
        WHERE id = p_checkout_id;
        RETURN jsonb_build_object(
            'success', true,
            'action', 'changed',
            'old_status', v_checkout.payment_status,
            'new_status', v_new_status,
            'paid_amount', v_checkout.paid_amount,
            'total_amount', v_checkout.total_amount
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'unchanged',
        'status', v_new_status,
        'paid_amount', v_checkout.paid_amount,
        'total_amount', v_checkout.total_amount
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalc_checkout_payment_status_v1(uuid, uuid) TO authenticated, service_role;

-- 注意：3 個入口 RPC（merge / link / remove）的修改（在 PERFORM apply_free_shipping_refund_v1
-- 之後 PERFORM recalc_checkout_payment_status_v1）見 hook_recalc_payment_status_into_rpcs 那支
-- migration（同日，已套用）。
