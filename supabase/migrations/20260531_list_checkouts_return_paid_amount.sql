-- C6 配套：list_checkouts_v1 回傳值加入 paid_amount，讓前端能算「需補款 $X」
CREATE OR REPLACE FUNCTION public.list_checkouts_v1(p_tenant_id uuid, p_shipping_status text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_shipping_method text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_amount_min integer DEFAULT NULL::integer, p_amount_max integer DEFAULT NULL::integer, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_checkouts JSONB; v_total INTEGER; v_search TEXT;
BEGIN
  IF p_shipping_method IS NOT NULL AND p_shipping_method NOT IN ('myship', 'myship_free', 'delivery', 'pickup', 'seven_store') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_shipping_method');
  END IF;
  v_search := LOWER(TRIM(COALESCE(p_search, '')));

  SELECT COUNT(*) INTO v_total
  FROM checkouts c LEFT JOIN members m ON c.member_id = m.id
  WHERE c.tenant_id = p_tenant_id
    AND (p_shipping_status IS NULL OR c.shipping_status = p_shipping_status)
    AND (p_payment_status IS NULL OR c.payment_status = p_payment_status)
    AND (p_shipping_method IS NULL OR c.shipping_method = p_shipping_method)
    AND (p_amount_min IS NULL OR c.total_amount >= p_amount_min)
    AND (p_amount_max IS NULL OR c.total_amount <= p_amount_max)
    AND (p_date_from IS NULL OR c.created_at >= p_date_from)
    AND (p_date_to IS NULL OR c.created_at <= p_date_to)
    AND (v_search = '' OR (
      LOWER(c.checkout_no) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(c.customer_name, '')) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(m.display_name, '')) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(m.nickname, '')) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(c.checkout_items, '')) LIKE '%' || v_search || '%'
    ));

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb) INTO v_checkouts
  FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'checkout_no', c.checkout_no, 'customer_name', c.customer_name,
      'total_amount', c.total_amount,
      'paid_amount', COALESCE(c.paid_amount, 0),  -- ★ C6 配套
      'shipping_fee', COALESCE(c.shipping_fee, 0),
      'item_count', c.item_count, 'checkout_items', c.checkout_items,
      'shipping_status', c.shipping_status, 'payment_status', c.payment_status,
      'shipping_method', COALESCE(c.shipping_method, 'myship'), 'shipping_details', c.shipping_details,
      'is_notified', COALESCE(c.is_notified, false), 'store_url', c.store_url,
      'receiver_name', c.receiver_name, 'receiver_phone', c.receiver_phone, 'receiver_store_id', c.receiver_store_id,
      'created_at', c.created_at, 'shipped_at', c.shipped_at, 'completed_at', c.completed_at,
      'member_display_name', m.display_name, 'member_nickname', m.nickname, 'member_line_user_id', m.line_user_id
    ) as row_data, c.created_at
    FROM checkouts c LEFT JOIN members m ON c.member_id = m.id
    WHERE c.tenant_id = p_tenant_id
      AND (p_shipping_status IS NULL OR c.shipping_status = p_shipping_status)
      AND (p_payment_status IS NULL OR c.payment_status = p_payment_status)
      AND (p_shipping_method IS NULL OR c.shipping_method = p_shipping_method)
      AND (p_amount_min IS NULL OR c.total_amount >= p_amount_min)
      AND (p_amount_max IS NULL OR c.total_amount <= p_amount_max)
      AND (p_date_from IS NULL OR c.created_at >= p_date_from)
      AND (p_date_to IS NULL OR c.created_at <= p_date_to)
      AND (v_search = '' OR (
        LOWER(c.checkout_no) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(c.customer_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(m.display_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(m.nickname, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(c.checkout_items, '')) LIKE '%' || v_search || '%'
      ))
    ORDER BY c.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'limit', p_limit, 'offset', p_offset, 'checkouts', v_checkouts);
END;
$function$;
