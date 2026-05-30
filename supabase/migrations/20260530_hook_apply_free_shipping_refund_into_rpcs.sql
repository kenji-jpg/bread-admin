-- 把 apply_free_shipping_refund_v1 接到 3 個入口 RPC：
--   merge_checkouts_v1 / link_order_items_to_checkout_v1 / remove_checkout_item_v1
-- 每支在 RPC 結尾、return 之前 PERFORM 一次 A1，
-- A1 對 delivery/seven_store 做對稱重算（+/- 退款品項），對其他出貨方式 no-op。
-- update_order_item_v1 不需改：它拒絕「已結帳訂單」，所以 item.checkout_id 永遠是 NULL。

-- ======== 1. merge_checkouts_v1 ========
CREATE OR REPLACE FUNCTION public.merge_checkouts_v1(p_tenant_id uuid, p_checkout_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text; v_member_id uuid; v_shipping_method text;
  v_primary_id uuid; v_primary_no text; v_count int;
  v_raw_total numeric; v_new_total numeric; v_new_shipping_fee integer := 0;
  v_item_count int; v_checkout_items json; v_auto_free boolean := false; v_threshold integer;
  v_all_paid boolean; v_any_paid boolean;
BEGIN
  SELECT role INTO v_role FROM tenant_users WHERE user_id = v_user_id AND tenant_id = p_tenant_id;
  IF v_role IS NULL THEN RETURN json_build_object('success', false, 'error', '無權限操作'); END IF;

  SELECT COALESCE(free_shipping_threshold, 3500) INTO v_threshold FROM tenants WHERE id = p_tenant_id;

  IF array_length(p_checkout_ids, 1) < 2 THEN
    RETURN json_build_object('success', false, 'error', '請選取至少 2 張結帳單');
  END IF;

  SELECT COUNT(*) INTO v_count FROM checkouts WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id;
  IF v_count != array_length(p_checkout_ids, 1) THEN
    RETURN json_build_object('success', false, 'error', '部分結帳單不存在');
  END IF;

  IF EXISTS (
    SELECT 1 FROM checkouts
    WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id
      AND NOT (
        shipping_status IN ('pending', 'url_sent')
        OR (shipping_status = 'ordered' AND shipping_method IN ('delivery','seven_store'))
      )
  ) THEN
    RETURN json_build_object('success', false, 'error', '只能合併待處理/待下單的結帳單，或待出貨的宅配/店到店單');
  END IF;

  SELECT COUNT(DISTINCT member_id) INTO v_count
  FROM checkouts WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id;
  IF v_count > 1 THEN
    RETURN json_build_object('success', false, 'error', '只能合併同一位會員的結帳單');
  END IF;

  SELECT bool_and(payment_status = 'paid'), bool_or(payment_status = 'paid')
  INTO v_all_paid, v_any_paid
  FROM checkouts WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id;
  IF v_any_paid AND NOT v_all_paid THEN
    RETURN json_build_object('success', false, 'error', '不可合併「付款狀態不一致」的結帳單（請確認都已付款或都未付款）');
  END IF;

  SELECT member_id, shipping_method INTO v_member_id, v_shipping_method
  FROM checkouts WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id LIMIT 1;

  SELECT id, checkout_no INTO v_primary_id, v_primary_no
  FROM checkouts WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id
  ORDER BY created_at ASC LIMIT 1;

  UPDATE order_items SET checkout_id = v_primary_id, updated_at = NOW()
  WHERE checkout_id = ANY(p_checkout_ids) AND checkout_id != v_primary_id AND tenant_id = p_tenant_id;

  DELETE FROM checkouts WHERE id = ANY(p_checkout_ids) AND id != v_primary_id AND tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(unit_price * quantity), 0), COUNT(*) INTO v_raw_total, v_item_count
  FROM order_items WHERE checkout_id = v_primary_id AND tenant_id = p_tenant_id;

  IF v_shipping_method = 'myship' AND v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN
    v_shipping_method := 'myship_free'; v_auto_free := true;
  END IF;

  IF v_shipping_method = 'myship_free' THEN
    v_new_shipping_fee := 0; v_new_total := v_raw_total - 38;
  ELSIF v_shipping_method = 'delivery' THEN
    v_new_shipping_fee := CASE WHEN v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN 0 ELSE 80 END;
    v_new_total := v_raw_total + v_new_shipping_fee;
  ELSIF v_shipping_method = 'seven_store' THEN
    v_new_shipping_fee := CASE WHEN v_threshold IS NOT NULL AND v_raw_total >= v_threshold THEN 0 ELSE 60 END;
    v_new_total := v_raw_total + v_new_shipping_fee;
  ELSE
    v_new_shipping_fee := 0; v_new_total := v_raw_total;
  END IF;

  SELECT json_agg(json_build_object(
    'order_item_id', oi.id, 'name', COALESCE(p.name, ao.product_name, oi.item_name, oi.sku, '未命名商品'),
    'variant_name', oi.variant_name, 'sku', COALESCE(p.sku, oi.sku),
    'unit_price', oi.unit_price, 'qty', oi.quantity, 'subtotal', oi.unit_price * oi.quantity
  )) INTO v_checkout_items
  FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN auction_orders ao ON ao.order_item_id = oi.id
  WHERE oi.checkout_id = v_primary_id AND oi.tenant_id = p_tenant_id;

  UPDATE checkouts
  SET shipping_method = v_shipping_method, shipping_fee = v_new_shipping_fee, total_amount = v_new_total,
      item_count = v_item_count, checkout_items = COALESCE(v_checkout_items::text, '[]'),
      payment_status = CASE WHEN v_all_paid THEN 'paid' ELSE payment_status END, updated_at = NOW()
  WHERE id = v_primary_id;

  -- ★ 對 delivery/seven_store 自動加/移除免運退款品項；對其他出貨方式 no-op
  PERFORM apply_free_shipping_refund_v1(p_tenant_id, v_primary_id);

  -- 重抓 total 給 return 值（A1 可能改過）
  SELECT total_amount INTO v_new_total FROM checkouts WHERE id = v_primary_id;

  RETURN json_build_object('success', true, 'merged_checkout_id', v_primary_id, 'checkout_no', v_primary_no,
    'new_total', v_new_total, 'item_count', v_item_count, 'auto_free_shipping', v_auto_free, 'all_paid', v_all_paid);
END;
$function$;

-- ======== 2. link_order_items_to_checkout_v1 ========
CREATE OR REPLACE FUNCTION public.link_order_items_to_checkout_v1(p_tenant_id uuid, p_checkout_id uuid, p_order_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_auth_error TEXT; v_checkout RECORD; v_linked_count INT; v_already_linked INT;
    v_raw_total INT; v_was_url_sent BOOLEAN := false;
    v_threshold INT; v_new_shipping_method TEXT; v_new_shipping_fee INT; v_new_total INT;
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_auth_error); END IF;

    SELECT id, checkout_no, shipping_status, shipping_method, shipping_fee, total_amount INTO v_checkout
    FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', '結帳單不存在'); END IF;
    IF v_checkout.shipping_status NOT IN ('pending', 'url_sent') THEN
        RETURN jsonb_build_object('success', false, 'error', '結帳單已進入流程，無法新增訂單項目');
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
        is_notified = CASE WHEN v_was_url_sent THEN false ELSE c.is_notified END,
        checkout_items = (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', oi.id, 'name', COALESCE(p.name, ao.product_name, oi.item_name, oi.sku, '未命名商品'),
            'variant_name', oi.variant_name, 'sku', oi.sku,
            'unit_price', oi.unit_price, 'qty', oi.quantity, 'subtotal', oi.quantity * oi.unit_price
        )), '[]'::jsonb)::TEXT
        FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN auction_orders ao ON ao.order_item_id = oi.id
        WHERE oi.checkout_id = p_checkout_id),
        updated_at = NOW()
    WHERE c.id = p_checkout_id AND c.tenant_id = p_tenant_id;

    -- ★ 對 delivery/seven_store 自動加/移除免運退款品項
    PERFORM apply_free_shipping_refund_v1(p_tenant_id, p_checkout_id);

    -- 重抓 total 給 return 值（A1 可能改過）
    SELECT total_amount INTO v_new_total FROM checkouts WHERE id = p_checkout_id;

    RETURN jsonb_build_object('success', true, 'checkout_id', p_checkout_id, 'checkout_no', v_checkout.checkout_no,
        'linked_count', v_linked_count, 'skipped_count', v_already_linked, 'was_url_sent_reset', v_was_url_sent,
        'shipping_method', v_new_shipping_method, 'shipping_fee', v_new_shipping_fee, 'new_total', v_new_total, 'old_total', v_checkout.total_amount);
END;
$function$;

-- ======== 3. remove_checkout_item_v1 ========
CREATE OR REPLACE FUNCTION public.remove_checkout_item_v1(p_tenant_id uuid, p_checkout_id uuid, p_order_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_checkout RECORD;
    v_new_total INT;
    v_new_count INT;
    v_new_items JSONB;
    v_removed_name TEXT;
BEGIN
    IF p_tenant_id IS NULL OR p_checkout_id IS NULL OR p_order_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_params');
    END IF;

    SELECT id, shipping_status, shipping_method
    INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found');
    END IF;

    IF v_checkout.shipping_status IN ('shipped', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_editable');
    END IF;

    SELECT COALESCE(p.name, oi.item_name, oi.sku, '品項') INTO v_removed_name
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.id = p_order_item_id;

    UPDATE order_items
    SET checkout_id = NULL, updated_at = NOW()
    WHERE id = p_order_item_id AND tenant_id = p_tenant_id;

    SELECT COUNT(*), COALESCE(SUM(unit_price * quantity), 0)
    INTO v_new_count, v_new_total
    FROM order_items
    WHERE checkout_id = p_checkout_id;

    IF v_checkout.shipping_method = 'myship_free' AND v_new_count > 0 THEN
        v_new_total := v_new_total - 38;
    END IF;

    IF v_new_count = 0 THEN
        DELETE FROM checkouts WHERE id = p_checkout_id;
        RETURN jsonb_build_object(
            'success', true,
            'action', 'checkout_deleted',
            'checkout_id', p_checkout_id,
            'removed_item', v_removed_name
        );
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'order_item_id', oi.id,
            'name', COALESCE(p.name, ao.product_name, oi.item_name, oi.sku, '未命名商品'),
            'variant_name', oi.variant_name,
            'sku', oi.sku,
            'unit_price', oi.unit_price,
            'qty', oi.quantity,
            'subtotal', oi.quantity * oi.unit_price
        )
    ), '[]'::jsonb)
    INTO v_new_items
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN auction_orders ao ON ao.order_item_id = oi.id
    WHERE oi.checkout_id = p_checkout_id;

    UPDATE checkouts
    SET checkout_items = v_new_items::text,
        total_amount = v_new_total,
        item_count = v_new_count,
        updated_at = NOW()
    WHERE id = p_checkout_id;

    -- ★ 對 delivery/seven_store：若移除商品後 total 降回門檻以下，會自動刪除退款品項
    PERFORM apply_free_shipping_refund_v1(p_tenant_id, p_checkout_id);

    -- 重抓 total 給 return 值（A1 可能改過）
    SELECT total_amount, item_count INTO v_new_total, v_new_count FROM checkouts WHERE id = p_checkout_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'item_removed',
        'checkout_id', p_checkout_id,
        'removed_item', v_removed_name,
        'new_item_count', v_new_count,
        'new_total_amount', v_new_total
    );
END;
$function$;
