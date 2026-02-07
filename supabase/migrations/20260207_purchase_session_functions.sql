-- 代購場次相關資料表和 RPC 函數

-- 1. 建立 purchase_sessions 表（如果不存在）
CREATE TABLE IF NOT EXISTS purchase_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 2. 在 products 表新增 session_id 欄位（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE products ADD COLUMN session_id UUID REFERENCES purchase_sessions(id);
  END IF;
END $$;

-- 3. 在 order_items 表新增 arrived_qty 欄位（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'arrived_qty'
  ) THEN
    ALTER TABLE order_items ADD COLUMN arrived_qty INT DEFAULT 0;
  END IF;
END $$;

-- 4. RLS 政策
ALTER TABLE purchase_sessions ENABLE ROW LEVEL SECURITY;

-- 允許租戶成員讀取
DROP POLICY IF EXISTS "Tenant members can view sessions" ON purchase_sessions;
CREATE POLICY "Tenant members can view sessions" ON purchase_sessions
FOR SELECT USING (
  tenant_id IN (SELECT get_accessible_tenant_ids())
);

-- 公開讀取（顧客查看）
DROP POLICY IF EXISTS "Public can view open sessions" ON purchase_sessions;
CREATE POLICY "Public can view open sessions" ON purchase_sessions
FOR SELECT USING (true);

-- 租戶成員可新增
DROP POLICY IF EXISTS "Tenant members can insert sessions" ON purchase_sessions;
CREATE POLICY "Tenant members can insert sessions" ON purchase_sessions
FOR INSERT WITH CHECK (
  tenant_id IN (SELECT get_accessible_tenant_ids())
);

-- 租戶成員可更新
DROP POLICY IF EXISTS "Tenant members can update sessions" ON purchase_sessions;
CREATE POLICY "Tenant members can update sessions" ON purchase_sessions
FOR UPDATE USING (
  tenant_id IN (SELECT get_accessible_tenant_ids())
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_tenant_id ON purchase_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_sessions_status ON purchase_sessions(status);
CREATE INDEX IF NOT EXISTS idx_products_session_id ON products(session_id);

-- ========================================
-- RPC 函數
-- ========================================

-- 建立場次
CREATE OR REPLACE FUNCTION create_purchase_session_v1(
  p_tenant_id UUID,
  p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  INSERT INTO purchase_sessions (tenant_id, title, status)
  VALUES (p_tenant_id, p_title, 'open')
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 取得場次詳情（管理員用）
CREATE OR REPLACE FUNCTION get_session_detail_v1(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT
    id,
    title,
    description,
    status,
    created_at,
    closed_at,
    completed_at
  INTO v_session
  FROM purchase_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '場次不存在'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'title', v_session.title,
      'description', v_session.description,
      'status', v_session.status,
      'created_at', v_session.created_at,
      'closed_at', v_session.closed_at,
      'completed_at', v_session.completed_at
    )
  );
END;
$$;

-- 取得場次商品列表（公開用）
CREATE OR REPLACE FUNCTION get_session_products_v1(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_products JSONB;
BEGIN
  -- 檢查場次是否存在
  SELECT
    ps.id,
    ps.tenant_id,
    ps.title,
    ps.description,
    ps.status,
    ps.created_at,
    ps.closed_at,
    t.name as tenant_name,
    t.slug as tenant_slug
  INTO v_session
  FROM purchase_sessions ps
  JOIN tenants t ON t.id = ps.tenant_id
  WHERE ps.id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '場次不存在'
    );
  END IF;

  -- 取得商品列表
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'price', p.price,
      'stock', p.stock,
      'sold_qty', COALESCE(p.sold_qty, 0),
      'image_url', p.image_url,
      'description', p.description,
      'end_time', p.end_time,
      'is_limited', p.is_limited,
      'limit_qty', p.limit_qty,
      'status', p.status,
      'is_expired', CASE
        WHEN p.end_time IS NOT NULL AND p.end_time < NOW() THEN true
        ELSE false
      END,
      'is_sold_out', CASE
        WHEN p.stock IS NOT NULL AND p.stock <= 0 THEN true
        ELSE false
      END,
      'created_at', p.created_at
    ) ORDER BY p.created_at
  ), '[]'::jsonb)
  INTO v_products
  FROM products p
  WHERE p.session_id = p_session_id
    AND p.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'tenant_id', v_session.tenant_id,
      'tenant_name', v_session.tenant_name,
      'tenant_slug', v_session.tenant_slug,
      'title', v_session.title,
      'description', v_session.description,
      'status', v_session.status,
      'created_at', v_session.created_at,
      'closed_at', v_session.closed_at,
      'is_open', v_session.status = 'open'
    ),
    'products', v_products
  );
END;
$$;

-- 列出場次（管理員用）
CREATE OR REPLACE FUNCTION list_purchase_sessions_v1(
  p_tenant_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sessions JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'title', ps.title,
      'description', ps.description,
      'status', ps.status,
      'created_at', ps.created_at,
      'closed_at', ps.closed_at,
      'completed_at', ps.completed_at,
      'product_count', (SELECT COUNT(*) FROM products WHERE session_id = ps.id),
      'total_preorders', (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE p.session_id = ps.id
      ),
      'total_allocated', (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE p.session_id = ps.id
          AND oi.status = 'allocated'
      )
    ) ORDER BY ps.created_at DESC
  ), '[]'::jsonb)
  INTO v_sessions
  FROM purchase_sessions ps
  WHERE ps.tenant_id = p_tenant_id
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions
  );
END;
$$;

-- 關閉收單
CREATE OR REPLACE FUNCTION close_purchase_session_v1(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE purchase_sessions
  SET
    status = 'closed',
    closed_at = NOW()
  WHERE id = p_session_id
    AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '場次不存在或已關閉'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 結算場次
CREATE OR REPLACE FUNCTION complete_purchase_session_v1(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelled_count INT;
BEGIN
  -- 取消所有未分配的訂單
  WITH cancelled AS (
    UPDATE order_items oi
    SET status = 'cancelled'
    FROM products p
    WHERE oi.product_id = p.id
      AND p.session_id = p_session_id
      AND oi.status = 'pending'
    RETURNING oi.id
  )
  SELECT COUNT(*) INTO v_cancelled_count FROM cancelled;

  -- 更新場次狀態
  UPDATE purchase_sessions
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_session_id
    AND status = 'closed';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '場次不存在或狀態不正確'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cancelled_count', v_cancelled_count
  );
END;
$$;

-- 會員查詢自己的預購
CREATE OR REPLACE FUNCTION get_member_preorders_v1(
  p_session_id UUID,
  p_line_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orders JSONB;
  v_member_id UUID;
BEGIN
  -- 找會員
  SELECT id INTO v_member_id
  FROM members
  WHERE line_user_id = p_line_user_id;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'orders', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name', p.name,
      'product_image', p.image_url,
      'quantity', oi.quantity,
      'arrived_qty', COALESCE(oi.arrived_qty, 0),
      'unit_price', oi.unit_price,
      'subtotal', oi.quantity * oi.unit_price,
      'status', oi.status,
      'can_modify', oi.status = 'pending'
    ) ORDER BY oi.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE p.session_id = p_session_id
    AND oi.member_id = v_member_id;

  RETURN jsonb_build_object(
    'success', true,
    'orders', v_orders
  );
END;
$$;

-- 建立預購訂單
CREATE OR REPLACE FUNCTION create_preorder_v1(
  p_tenant_id UUID,
  p_product_id UUID,
  p_line_user_id TEXT,
  p_quantity INT,
  p_display_name TEXT DEFAULT NULL,
  p_picture_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id UUID;
  v_product RECORD;
  v_order_id UUID;
BEGIN
  -- 找或建立會員
  SELECT id INTO v_member_id
  FROM members
  WHERE tenant_id = p_tenant_id
    AND line_user_id = p_line_user_id;

  IF v_member_id IS NULL THEN
    INSERT INTO members (tenant_id, line_user_id, display_name, picture_url)
    VALUES (p_tenant_id, p_line_user_id, p_display_name, p_picture_url)
    RETURNING id INTO v_member_id;
  ELSE
    -- 更新會員資料
    UPDATE members
    SET
      display_name = COALESCE(p_display_name, display_name),
      picture_url = COALESCE(p_picture_url, picture_url)
    WHERE id = v_member_id;
  END IF;

  -- 取得商品資料
  SELECT id, name, price, stock, end_time, is_limited, limit_qty, session_id
  INTO v_product
  FROM products
  WHERE id = p_product_id
    AND tenant_id = p_tenant_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '商品不存在'
    );
  END IF;

  -- 檢查是否已截止
  IF v_product.end_time IS NOT NULL AND v_product.end_time < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '已超過截止時間'
    );
  END IF;

  -- 檢查限購
  IF v_product.is_limited AND v_product.limit_qty IS NOT NULL THEN
    DECLARE
      v_existing_qty INT;
    BEGIN
      SELECT COALESCE(SUM(quantity), 0) INTO v_existing_qty
      FROM order_items
      WHERE member_id = v_member_id
        AND product_id = p_product_id
        AND status != 'cancelled';

      IF v_existing_qty + p_quantity > v_product.limit_qty THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', '超過限購數量'
        );
      END IF;
    END;
  END IF;

  -- 建立訂單
  INSERT INTO order_items (
    tenant_id,
    member_id,
    product_id,
    quantity,
    unit_price,
    status
  )
  VALUES (
    p_tenant_id,
    v_member_id,
    p_product_id,
    p_quantity,
    v_product.price,
    'pending'
  )
  RETURNING id INTO v_order_id;

  -- 更新商品已售數量（stock 維持，sold_qty 增加）
  UPDATE products
  SET
    sold_qty = COALESCE(sold_qty, 0) + p_quantity,
    stock = COALESCE(stock, 0) - p_quantity
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 取消預購
CREATE OR REPLACE FUNCTION cancel_preorder_v1(
  p_order_item_id UUID,
  p_line_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id UUID;
  v_product_id UUID;
  v_quantity INT;
BEGIN
  -- 找會員
  SELECT id INTO v_member_id
  FROM members
  WHERE line_user_id = p_line_user_id;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '會員不存在'
    );
  END IF;

  -- 檢查並取消訂單
  UPDATE order_items
  SET status = 'cancelled'
  WHERE id = p_order_item_id
    AND member_id = v_member_id
    AND status = 'pending'
  RETURNING product_id, quantity INTO v_product_id, v_quantity;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '訂單不存在或無法取消'
    );
  END IF;

  -- 回補庫存
  UPDATE products
  SET
    stock = COALESCE(stock, 0) + v_quantity,
    sold_qty = COALESCE(sold_qty, 0) - v_quantity
  WHERE id = v_product_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 補貨（分配訂單）- 用於 session 商品
CREATE OR REPLACE FUNCTION restock_session_product_v1(
  p_product_id UUID,
  p_actual_qty INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INT := p_actual_qty;
  v_order RECORD;
  v_allocated_count INT := 0;
  v_allocated_qty INT;
BEGIN
  -- 按時間順序分配給待處理的訂單
  FOR v_order IN
    SELECT id, quantity
    FROM order_items
    WHERE product_id = p_product_id
      AND status = 'pending'
    ORDER BY created_at ASC
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    v_allocated_qty := LEAST(v_remaining, v_order.quantity);

    IF v_allocated_qty >= v_order.quantity THEN
      -- 完全分配
      UPDATE order_items
      SET
        status = 'allocated',
        arrived_qty = v_order.quantity
      WHERE id = v_order.id;
    ELSE
      -- 部分分配
      UPDATE order_items
      SET
        status = 'partial',
        arrived_qty = v_allocated_qty
      WHERE id = v_order.id;
    END IF;

    v_remaining := v_remaining - v_allocated_qty;
    v_allocated_count := v_allocated_count + 1;
  END LOOP;

  -- 更新庫存
  UPDATE products
  SET stock = COALESCE(stock, 0) + p_actual_qty
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'allocated_count', v_allocated_count,
    'remaining_qty', v_remaining
  );
END;
$$;
