-- C4: link_order_items_to_checkout_v1 對 delivery/seven_store/pickup 放寬至 ordered
-- myship/myship_free 維持 pending/url_sent（賣貨便那邊賣場已成立，不能加品項）
-- shipped/completed 仍鎖
CREATE OR REPLACE FUNCTION public.link_order_items_to_checkout_v1(p_tenant_id uuid, p_checkout_id uuid, p_order_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_auth_error TEXT; v_checkout RECORD; v_linked_count INT; v_already_linked INT;
    v_raw_total INT; v_was_url_sent BOOLEAN := false; v_allowed BOOLEAN;
    v_threshold INT; v_new_shipping_method TEXT; v_new_shipping_fee INT; v_new_total INT;
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_auth_error); END IF;

    SELECT id, checkout_no, shipping_status, shipping_method, shipping_fee, total_amount INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', '結帳單不存在'); END IF;

    -- ★ 放寬：pending/url_sent 任何方式都可；ordered 限 delivery/seven_store/pickup
    v_allowed := v_checkout.shipping_status IN ('pending', 'url_sent')
              OR (v_checkout.shipping_status = 'ordered'
                  AND v_checkout.shipping_method IN ('delivery','seven_store','pickup'));
    IF NOT v_allowed THEN
        RETURN jsonb_build_object('success', false, 'error',
            CASE
                WHEN v_checkout.shipping_status IN ('shipped','completed') THEN '結帳單已寄出/完成，無法新增'
                WHEN v_checkout.shipping_status = 'ordered' AND v_checkout.shipping_method IN ('myship','myship_free')
                    THEN '賣貨便已下單，無法再加品項'
                ELSE '結帳單目前狀態無法新增品項'
            END);
    END IF;
    IF v_checkout.shipping_status = 'url_sent' THEN v_was_url_sent := true; END IF;

    SELECT COUNT(*) INTO v_already_linked FROM order_items
    WHERE id = ANY(p_order_item_ids) AND tenant_id = p_tenant_id AND checkout_id IS NOT NULL AND checkout_id != p_checkout_id;

    UPDATE order_items SET checkout_id = p_checkout_id, updated_at = NOW()
    WHERE id = ANY(p_order_item_ids) AND tenant_id = p_tenant_id AND (checkout_id IS NULL OR checkout_id = p_checkout_id);
    GET DIAGNOSTICS v_linked_count = ROW_COUNT;

    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_raw_total FROM order_items WHERE checkout_id = p_checkout_id;
    SELECT free_shipping_threshold INTO v_threshold FROM tenants WHERE id = p_tenant_id;

    IF v_checkout.shipping_method = 'myship' AND v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN
        v_new_shipping_method := 'myship_free'; v_new_shipping_fee := 0;
    ELSIF v_checkout.shipping_method = 'delivery' AND v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN
        v_new_shipping_method := 'delivery'; v_new_shipping_fee := 0;
    ELSIF v_checkout.shipping_method = 'delivery' THEN
        v_new_shipping_method := 'delivery'; v_new_shipping_fee := 80;
    ELSIF v_checkout.shipping_method = 'seven_store' AND v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN
        v_new_shipping_method := 'seven_store'; v_new_shipping_fee := 0;
    ELSIF v_checkout.shipping_method = 'seven_store' THEN
        v_new_shipping_method := 'seven_store'; v_new_shipping_fee := 60;
    ELSIF v_checkout.shipping_method = 'myship' THEN
        v_new_shipping_method := 'myship'; v_new_shipping_fee := 0;
    ELSE
        v_new_shipping_method := v_checkout.shipping_method; v_new_shipping_fee := 0;
    END IF;

    v_new_total := CASE
        WHEN v_new_shipping_method = 'myship_free' THEN v_raw_total - 38
        WHEN v_new_shipping_method IN ('delivery','seven_store') THEN v_raw_total + v_new_shipping_fee
        ELSE v_raw_total
    END;

    UPDATE checkouts c SET shipping_method = v_new_shipping_method, shipping_fee = v_new_shipping_fee,
        total_amount = v_new_total,
        item_count = COALESCE((SELECT COUNT(*) FROM order_items WHERE checkout_id = c.id), 0),
        shipping_status = CASE WHEN v_was_url_sent THEN 'pending' ELSE c.shipping_status END,
        store_url = CASE WHEN v_was_url_sent THEN NULL ELSE c.store_url END,
        myship_store_name = CASE WHEN v_was_url_sent THEN NULL ELSE c.myship_store_name END,
        is_notified = false,
        checkout_items = (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', oi.id, 'name', COALESCE(p.name, ao.product_name, oi.item_name, oi.sku, '未命名商品'),
            'variant_name', oi.variant_name, 'sku', oi.sku,
            'unit_price', oi.unit_price, 'qty', oi.quantity, 'subtotal', oi.quantity * oi.unit_price
        )), '[]'::jsonb)::TEXT
        FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN auction_orders ao ON ao.order_item_id = oi.id
        WHERE oi.checkout_id = p_checkout_id),
        updated_at = NOW()
    WHERE c.id = p_checkout_id AND c.tenant_id = p_tenant_id;

    PERFORM apply_free_shipping_refund_v1(p_tenant_id, p_checkout_id);
    PERFORM recalc_checkout_payment_status_v1(p_tenant_id, p_checkout_id);

    SELECT total_amount INTO v_new_total FROM checkouts WHERE id = p_checkout_id;

    RETURN jsonb_build_object('success', true, 'checkout_id', p_checkout_id, 'checkout_no', v_checkout.checkout_no,
        'linked_count', v_linked_count, 'skipped_count', v_already_linked, 'was_url_sent_reset', v_was_url_sent,
        'shipping_method', v_new_shipping_method, 'shipping_fee', v_new_shipping_fee, 'new_total', v_new_total, 'old_total', v_checkout.total_amount);
END;
$function$;
