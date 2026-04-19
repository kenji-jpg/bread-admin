-- ============================================
-- 商城管理員採買清單 RPC
-- 目的：彙總所有未到貨的 order_items（含手動單、不限 show_in_shop）
-- 供商城（網頁）管理員模式採買時使用
-- ============================================

-- 1. 彙總採買清單（按商品 + 手動單獨列）
CREATE OR REPLACE FUNCTION public.get_pending_purchase_summary_v1(
  p_tenant_id UUID,
  p_line_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_staff BOOLEAN := FALSE;
  v_products JSONB;
  v_manuals JSONB;
BEGIN
  -- 驗證 staff（viewer 不算）
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE tenant_id = p_tenant_id
      AND line_user_id = p_line_user_id
      AND COALESCE(is_suspended, false) = false
      AND role IN ('owner', 'admin', 'staff')
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_staff');
  END IF;

  -- 有 product_id 的訂單：按商品彙總
  WITH product_orders AS (
    SELECT
      oi.id AS order_item_id,
      oi.product_id,
      oi.member_id,
      oi.quantity,
      COALESCE(oi.arrived_qty, 0) AS arrived_qty,
      oi.status,
      oi.variant_name,
      oi.created_at,
      oi.checkout_id,
      COALESCE(m.nickname, m.display_name, oi.customer_name, '客人') AS member_name,
      m.picture_url AS member_picture
    FROM order_items oi
    LEFT JOIN members m ON m.id = oi.member_id
    WHERE oi.tenant_id = p_tenant_id
      AND oi.product_id IS NOT NULL
      AND oi.cancelled_at IS NULL
      AND COALESCE(oi.status, '') <> 'cancelled'
      AND COALESCE(oi.arrived_qty, 0) < oi.quantity
  ),
  product_agg AS (
    SELECT
      po.product_id,
      p.name AS product_name,
      p.image_url,
      p.image_urls,
      p.price,
      SUM(po.quantity)::INT AS total_qty,
      SUM(po.arrived_qty)::INT AS total_arrived,
      SUM(po.quantity - po.arrived_qty)::INT AS pending_qty,
      jsonb_agg(
        jsonb_build_object(
          'order_item_id', po.order_item_id,
          'member_id', po.member_id,
          'member_name', po.member_name,
          'member_picture', po.member_picture,
          'variant_name', po.variant_name,
          'quantity', po.quantity,
          'arrived_qty', po.arrived_qty,
          'pending_qty', po.quantity - po.arrived_qty,
          'status', po.status,
          'has_checkout', po.checkout_id IS NOT NULL,
          'created_at', po.created_at
        )
        ORDER BY po.created_at ASC
      ) AS orders
    FROM product_orders po
    LEFT JOIN products p ON p.id = po.product_id
    GROUP BY po.product_id, p.name, p.image_url, p.image_urls, p.price
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'name', product_name,
      'image_url', COALESCE(image_url, (image_urls->>0)),
      'price', price,
      'total_qty', total_qty,
      'arrived_qty', total_arrived,
      'pending_qty', pending_qty,
      'orders', orders
    )
    ORDER BY pending_qty DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM product_agg;

  -- 無 product_id 的訂單：逐筆列出（手動 / 競標訂單認領後）
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_item_id', oi.id,
      'item_name', COALESCE(oi.item_name, '(無名稱)'),
      'member_id', oi.member_id,
      'member_name', COALESCE(m.nickname, m.display_name, oi.customer_name, '客人'),
      'member_picture', m.picture_url,
      'quantity', oi.quantity,
      'arrived_qty', COALESCE(oi.arrived_qty, 0),
      'pending_qty', oi.quantity - COALESCE(oi.arrived_qty, 0),
      'unit_price', oi.unit_price,
      'note', oi.note,
      'has_checkout', oi.checkout_id IS NOT NULL,
      'created_at', oi.created_at
    )
    ORDER BY oi.created_at ASC
  ), '[]'::jsonb)
  INTO v_manuals
  FROM order_items oi
  LEFT JOIN members m ON m.id = oi.member_id
  WHERE oi.tenant_id = p_tenant_id
    AND oi.product_id IS NULL
    AND oi.cancelled_at IS NULL
    AND COALESCE(oi.status, '') <> 'cancelled'
    AND COALESCE(oi.arrived_qty, 0) < oi.quantity;

  RETURN jsonb_build_object(
    'success', true,
    'products', v_products,
    'manual_items', v_manuals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_purchase_summary_v1(UUID, TEXT) TO anon, authenticated;

-- 2. 標記單筆 order_item 已到貨（用於手動單 / 單點操作）
CREATE OR REPLACE FUNCTION public.mark_order_item_arrived_v1(
  p_tenant_id UUID,
  p_line_user_id TEXT,
  p_order_item_id UUID,
  p_qty INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_staff BOOLEAN := FALSE;
  v_item RECORD;
  v_new_arrived INT;
  v_new_status TEXT;
  v_new_is_arrived BOOLEAN;
BEGIN
  -- 驗證 staff
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE tenant_id = p_tenant_id
      AND line_user_id = p_line_user_id
      AND COALESCE(is_suspended, false) = false
      AND role IN ('owner', 'admin', 'staff')
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_staff');
  END IF;

  SELECT id, quantity, COALESCE(arrived_qty, 0) AS arrived_qty
  INTO v_item
  FROM order_items
  WHERE id = p_order_item_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  -- 預設補足全部
  v_new_arrived := LEAST(v_item.arrived_qty + COALESCE(p_qty, v_item.quantity - v_item.arrived_qty), v_item.quantity);
  v_new_is_arrived := v_new_arrived >= v_item.quantity;
  v_new_status := CASE
    WHEN v_new_arrived >= v_item.quantity THEN 'allocated'
    WHEN v_new_arrived > 0 THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE order_items
  SET arrived_qty = v_new_arrived,
      is_arrived = v_new_is_arrived,
      status = v_new_status,
      updated_at = NOW()
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'arrived_qty', v_new_arrived,
    'is_arrived', v_new_is_arrived,
    'status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_item_arrived_v1(UUID, TEXT, UUID, INT) TO anon, authenticated;
