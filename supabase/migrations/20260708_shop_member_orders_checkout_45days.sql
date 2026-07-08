-- get_shop_member_orders_v1：客人端「我的訂單」的「已進入結帳流程」顯示時效 30 天 → 45 天
-- 其餘不變：等待配貨/確定購入永久顯示、配貨失敗(cancelled)30 天、已完成(completed)仍即時消失、負項不顯示
CREATE OR REPLACE FUNCTION public.get_shop_member_orders_v1(p_tenant_slug text, p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id UUID;
  v_member_id UUID;
  v_orders JSONB;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'orders', '[]'::jsonb);
  END IF;

  SELECT id INTO v_member_id FROM members
  WHERE tenant_id = v_tenant_id AND line_user_id = p_line_user_id;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'orders', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name', COALESCE(
        p.name,
        NULLIF(ao.product_name, ''),
        CASE
          WHEN ao.winner_nickname IS NOT NULL
               AND oi.item_name LIKE (COALESCE(ao.auction_date,'') || ao.winner_nickname || '%')
          THEN NULLIF(btrim(substring(oi.item_name FROM (length(COALESCE(ao.auction_date,'') || ao.winner_nickname) + 1))), '')
          ELSE NULLIF(oi.item_name, '')
        END,
        '手動訂單'
      ),
      'product_image', p.image_url,
      'quantity', oi.quantity,
      'arrived_qty', COALESCE(oi.arrived_qty, 0),
      'unit_price', oi.unit_price,
      'subtotal', oi.quantity * oi.unit_price,
      'status', oi.status,
      'can_modify', oi.status = 'pending',
      'is_arrived', COALESCE(oi.is_arrived, false),
      'checkout_id', oi.checkout_id,
      'variant_name', oi.variant_name,
      'cancelled_at', oi.cancelled_at,
      'created_at', oi.created_at
    ) ORDER BY oi.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN LATERAL (
    SELECT a.winner_nickname, a.auction_date, a.product_name
    FROM auction_orders a WHERE a.order_item_id = oi.id LIMIT 1
  ) ao ON true
  LEFT JOIN checkouts c ON c.id = oi.checkout_id
  WHERE oi.member_id = v_member_id
    AND oi.tenant_id = v_tenant_id
    AND COALESCE(oi.unit_price, 0) >= 0
    AND (
      (oi.checkout_id IS NULL AND (
        oi.status IN ('pending', 'partial', 'allocated')
        OR (oi.status = 'cancelled' AND oi.cancelled_at > NOW() - INTERVAL '30 days')
      ))
      OR (oi.checkout_id IS NOT NULL
          AND oi.created_at > NOW() - INTERVAL '45 days'
          AND COALESCE(c.shipping_status, '') <> 'completed')
    );

  RETURN jsonb_build_object('success', true, 'orders', v_orders);
END;
$function$;
