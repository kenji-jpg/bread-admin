-- 解除編輯訂單時 unit_price <= 0 的限制
-- 理由：手動建立訂單已允許負數（用於客人預匯款的對沖），編輯也應該一致
-- 允許任何整數（含 0、負數），交給呼叫端決定語意
CREATE OR REPLACE FUNCTION public.update_order_item_v1(p_tenant_id uuid, p_order_item_id uuid, p_new_quantity integer DEFAULT NULL::integer, p_new_note text DEFAULT NULL::text, p_new_unit_price integer DEFAULT NULL::integer, p_price_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_error TEXT;
    v_order RECORD;
    v_product RECORD;
    v_old_qty INTEGER;
    v_qty_diff INTEGER;
    v_old_stock INTEGER;
    v_new_stock INTEGER;
    v_old_arrived_qty INTEGER;
    v_new_arrived_qty INTEGER;
    v_new_is_arrived BOOLEAN;
    v_available INTEGER;
    v_pending_order RECORD;
    v_need_qty INTEGER;
    v_allocate_qty INTEGER;
    v_reallocated_count INTEGER := 0;
    v_reallocated_qty INTEGER := 0;
    v_old_unit_price INTEGER;
    v_price_changed BOOLEAN := false;
    v_quantity_changed BOOLEAN := false;
BEGIN
    -- ★ 權限與停權檢查
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    -- 1. 查詢訂單（加入 tenant_id 驗證）
    SELECT * INTO v_order
    FROM order_items
    WHERE id = p_order_item_id
      AND tenant_id = p_tenant_id;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'order_not_found',
            'message', '找不到訂單項目或無權限存取');
    END IF;

    -- 2. 不能編輯已結帳訂單
    IF v_order.checkout_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_checked_out',
            'message', '此訂單已結帳，無法編輯');
    END IF;

    v_old_qty := v_order.quantity;
    v_old_arrived_qty := COALESCE(v_order.arrived_qty, 0);
    v_old_unit_price := v_order.unit_price;

    IF p_new_quantity IS NULL THEN
        p_new_quantity := v_old_qty;
    END IF;

    v_qty_diff := p_new_quantity - v_old_qty;
    v_quantity_changed := (v_qty_diff != 0);
    v_price_changed := (p_new_unit_price IS NOT NULL AND p_new_unit_price != v_old_unit_price);

    -- 3. 價格：允許任何整數（含 0 與負數），用於預匯款對沖等情境
    --    （原本擋 <= 0，與「新增手動訂單」不一致；已解除）

    -- 4. 數量驗證
    IF p_new_quantity < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_quantity',
            'message', '數量必須大於 0');
    END IF;

    -- 5. 處理庫存
    IF v_quantity_changed AND v_order.product_id IS NOT NULL THEN
        SELECT * INTO v_product FROM products WHERE id = v_order.product_id;

        IF v_product.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'product_not_found',
                'message', '找不到關聯商品');
        END IF;

        v_old_stock := COALESCE(v_product.stock, 0);

        UPDATE products
        SET stock = stock - v_qty_diff, updated_at = NOW()
        WHERE id = v_order.product_id
        RETURNING stock INTO v_new_stock;

        IF v_qty_diff > 0 THEN
            IF v_new_stock >= 0 THEN
                v_new_arrived_qty := LEAST(v_old_arrived_qty + v_qty_diff, p_new_quantity);
            ELSE
                v_new_arrived_qty := LEAST(v_old_arrived_qty + GREATEST(v_old_stock, 0), p_new_quantity);
            END IF;
        ELSE
            v_new_arrived_qty := LEAST(v_old_arrived_qty, p_new_quantity);

            IF v_old_arrived_qty > p_new_quantity THEN
                v_available := v_old_arrived_qty - p_new_quantity;

                FOR v_pending_order IN
                    SELECT id, quantity, arrived_qty
                    FROM order_items
                    WHERE tenant_id = p_tenant_id
                      AND product_id = v_order.product_id
                      AND checkout_id IS NULL
                      AND arrived_qty < quantity
                      AND id != p_order_item_id
                    ORDER BY created_at ASC
                LOOP
                    v_need_qty := v_pending_order.quantity - v_pending_order.arrived_qty;
                    v_allocate_qty := LEAST(v_need_qty, v_available);

                    IF v_allocate_qty > 0 THEN
                        UPDATE order_items
                        SET arrived_qty = arrived_qty + v_allocate_qty,
                            is_arrived = (arrived_qty + v_allocate_qty >= quantity),
                            updated_at = NOW()
                        WHERE id = v_pending_order.id;

                        v_available := v_available - v_allocate_qty;
                        v_reallocated_qty := v_reallocated_qty + v_allocate_qty;
                        v_reallocated_count := v_reallocated_count + 1;
                    END IF;

                    EXIT WHEN v_available <= 0;
                END LOOP;
            END IF;
        END IF;

        v_new_is_arrived := (v_new_arrived_qty >= p_new_quantity);
    ELSE
        v_new_arrived_qty := v_old_arrived_qty;
        v_new_is_arrived := v_order.is_arrived;
        v_new_stock := NULL;
        v_old_stock := NULL;
    END IF;

    -- 6. 更新訂單項目
    UPDATE order_items
    SET
        quantity = p_new_quantity,
        arrived_qty = v_new_arrived_qty,
        is_arrived = v_new_is_arrived,
        note = COALESCE(p_new_note, note),
        unit_price = COALESCE(p_new_unit_price, unit_price),
        price_source = CASE
            WHEN p_new_unit_price IS NOT NULL THEN 'manual'
            ELSE price_source
        END,
        price_note = CASE
            WHEN p_new_unit_price IS NOT NULL THEN COALESCE(p_price_note, price_note)
            ELSE price_note
        END,
        updated_at = NOW()
    WHERE id = p_order_item_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'old_quantity', v_old_qty,
        'new_quantity', p_new_quantity,
        'qty_diff', v_qty_diff,
        'quantity_changed', v_quantity_changed,
        'old_arrived_qty', v_old_arrived_qty,
        'new_arrived_qty', v_new_arrived_qty,
        'is_arrived', v_new_is_arrived,
        'product_id', v_order.product_id,
        'old_stock', v_old_stock,
        'new_stock', v_new_stock,
        'stock_adjusted', (v_quantity_changed AND v_order.product_id IS NOT NULL),
        'reallocated_count', v_reallocated_count,
        'reallocated_qty', v_reallocated_qty,
        'old_unit_price', v_old_unit_price,
        'new_unit_price', COALESCE(p_new_unit_price, v_old_unit_price),
        'price_changed', v_price_changed,
        'original_price', v_order.original_price,
        'message',
            CASE
                WHEN v_quantity_changed AND v_price_changed THEN
                    '訂單已更新：數量 ' || v_old_qty || ' → ' || p_new_quantity ||
                    '，價格 ' || v_old_unit_price || ' → ' || p_new_unit_price
                WHEN v_quantity_changed THEN
                    '數量已更新：' || v_old_qty || ' → ' || p_new_quantity ||
                    CASE WHEN v_old_stock IS NOT NULL THEN '，庫存: ' || v_old_stock || ' → ' || v_new_stock ELSE '' END ||
                    CASE WHEN v_reallocated_qty > 0 THEN '，已重新分配 ' || v_reallocated_qty || ' 個到貨量' ELSE '' END
                WHEN v_price_changed THEN
                    '價格已更新：' || v_old_unit_price || ' → ' || p_new_unit_price
                ELSE
                    '訂單已更新（備註變更）'
            END
    );
END;
$function$;
