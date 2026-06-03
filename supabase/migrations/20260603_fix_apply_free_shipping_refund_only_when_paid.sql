-- 修正 A1:退款品項只在「客人之前有付過錢」時才加
-- 因為退款品項代表「店家欠客人 -$X」,前提是客人之前付過運費。
-- 首次結帳就達免運 → paid_amount=0 → 客人從沒付過運費 → 沒得退,不加退款品項。
-- 已付款後合併加單達免運 → paid_amount>0 → 客人之前付的含 $80/$60 運費 → 達免運後要退,加退款品項。
CREATE OR REPLACE FUNCTION public.apply_free_shipping_refund_v1(
    p_tenant_id uuid,
    p_checkout_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_checkout RECORD;
    v_threshold INTEGER;
    v_goods_subtotal INTEGER;
    v_refund_item_id UUID;
    v_refund_amount INTEGER;
    v_refund_name TEXT;
    v_base_shipping_fee INTEGER;
    v_target_shipping_fee INTEGER;
    v_should_have_refund BOOLEAN;
    v_action TEXT := 'none';
    v_new_total INTEGER;
    v_new_item_count INTEGER;
    v_new_checkout_items JSON;
BEGIN
    SELECT id, member_id, shipping_method, shipping_status, shipping_fee, payment_status, paid_amount
    INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF v_checkout IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found');
    END IF;

    IF v_checkout.shipping_status NOT IN ('pending', 'url_sent', 'ordered') THEN
        RETURN jsonb_build_object('success', true, 'action', 'skipped_locked',
            'reason', v_checkout.shipping_status);
    END IF;

    IF v_checkout.shipping_method NOT IN ('delivery', 'seven_store') THEN
        RETURN jsonb_build_object('success', true, 'action', 'skipped_method',
            'method', v_checkout.shipping_method);
    END IF;

    IF v_checkout.shipping_method = 'delivery' THEN
        v_refund_amount := -80;
        v_refund_name := '宅配運費退款';
        v_base_shipping_fee := 80;
    ELSE
        v_refund_amount := -60;
        v_refund_name := '店到店運費退款';
        v_base_shipping_fee := 60;
    END IF;

    SELECT COALESCE(free_shipping_threshold, 3500) INTO v_threshold
    FROM tenants WHERE id = p_tenant_id;

    SELECT id INTO v_refund_item_id
    FROM order_items
    WHERE checkout_id = p_checkout_id
      AND tenant_id = p_tenant_id
      AND product_id IS NULL
      AND item_name = v_refund_name
      AND unit_price < 0
    LIMIT 1;

    SELECT COALESCE(SUM(unit_price * quantity), 0)
    INTO v_goods_subtotal
    FROM order_items
    WHERE checkout_id = p_checkout_id
      AND tenant_id = p_tenant_id
      AND NOT (product_id IS NULL AND item_name = v_refund_name AND unit_price < 0);

    -- ★ 應該存在退款品項？ 達免運 且 客人之前付過錢
    v_should_have_refund := (v_goods_subtotal >= v_threshold)
                            AND (COALESCE(v_checkout.paid_amount, 0) > 0);

    IF v_should_have_refund AND v_refund_item_id IS NULL THEN
        INSERT INTO order_items (
            tenant_id, member_id, checkout_id, product_id, variant_id, item_name,
            quantity, unit_price, status, is_arrived, arrived_qty, is_completed,
            price_source, price_note,
            created_at, updated_at
        )
        VALUES (
            p_tenant_id, v_checkout.member_id, p_checkout_id, NULL, NULL, v_refund_name,
            1, v_refund_amount, 'pending', true, 1, true,
            'manual', '[auto] 達免運門檻系統退費',
            NOW(), NOW()
        )
        RETURNING id INTO v_refund_item_id;
        v_action := 'inserted';
    ELSIF NOT v_should_have_refund AND v_refund_item_id IS NOT NULL THEN
        -- 條件不成立 → 刪退款品項（含「首次達免運但已有退款」這種 edge case）
        DELETE FROM order_items WHERE id = v_refund_item_id;
        v_refund_item_id := NULL;
        v_action := 'deleted';
    END IF;

    -- shipping_fee:達免運 → 0;否則 = 基準值
    --   首次達免運（paid=0）:shipping_fee=0,total=items_sum,無退款行 → 客人付 items_sum
    --   合併達免運（paid>0）:shipping_fee=0,total=items_sum_with_refund,有退款行 → 反映「之前付過要退」
    --   未達免運:shipping_fee=base,total=items_sum + shipping
    IF v_goods_subtotal >= v_threshold THEN
        v_target_shipping_fee := 0;
    ELSE
        v_target_shipping_fee := v_base_shipping_fee;
    END IF;

    IF v_checkout.shipping_fee IS DISTINCT FROM v_target_shipping_fee THEN
        UPDATE checkouts
        SET shipping_fee = v_target_shipping_fee, updated_at = NOW()
        WHERE id = p_checkout_id;
    END IF;

    SELECT COALESCE(SUM(unit_price * quantity), 0), COUNT(*)
    INTO v_new_total, v_new_item_count
    FROM order_items
    WHERE checkout_id = p_checkout_id AND tenant_id = p_tenant_id;

    v_new_total := v_new_total + v_target_shipping_fee;

    SELECT json_agg(json_build_object(
        'order_item_id', oi.id,
        'name', COALESCE(p.name, ao.product_name, oi.item_name, oi.sku, '未命名商品'),
        'variant_name', oi.variant_name,
        'sku', COALESCE(p.sku, oi.sku),
        'unit_price', oi.unit_price,
        'qty', oi.quantity,
        'subtotal', oi.unit_price * oi.quantity
    ))
    INTO v_new_checkout_items
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN auction_orders ao ON ao.order_item_id = oi.id
    WHERE oi.checkout_id = p_checkout_id AND oi.tenant_id = p_tenant_id;

    UPDATE checkouts
    SET total_amount = v_new_total,
        item_count = v_new_item_count,
        checkout_items = COALESCE(v_new_checkout_items::text, '[]'),
        updated_at = NOW()
    WHERE id = p_checkout_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', v_action,
        'checkout_id', p_checkout_id,
        'shipping_method', v_checkout.shipping_method,
        'goods_subtotal', v_goods_subtotal,
        'threshold', v_threshold,
        'paid_amount', v_checkout.paid_amount,
        'shipping_fee', v_target_shipping_fee,
        'refund_amount', CASE WHEN v_refund_item_id IS NOT NULL THEN v_refund_amount ELSE NULL END,
        'refund_item_id', v_refund_item_id,
        'new_total', v_new_total,
        'item_count', v_new_item_count
    );
END;
$function$;
