-- 加 p_delete_items 參數讓兩支刪除 RPC 支援「連同訂單品項一起刪除」
--   - false（預設，向後相容）→ 軟刪：order_items.checkout_id = NULL，items 回訂單管理
--   - true → 硬刪：DELETE order_items + 恢復 products.stock / product_variants.stock

-- ======== delete_checkout_v1 ========
CREATE OR REPLACE FUNCTION public.delete_checkout_v1(
    p_tenant_id uuid,
    p_checkout_id uuid,
    p_delete_items boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_checkout RECORD;
    v_affected_items INT;
    v_auth_error TEXT;
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    SELECT id, checkout_no, shipping_status, customer_name, member_id, total_amount
    INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '結帳單不存在');
    END IF;

    IF v_checkout.shipping_status NOT IN ('pending', 'url_sent', 'ordered') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '結帳單已出貨或已完成，無法刪除（目前狀態：' || v_checkout.shipping_status || '）'
        );
    END IF;

    IF p_delete_items THEN
        -- 硬刪：先恢復庫存,再刪 order_items
        UPDATE products p
        SET stock = COALESCE(p.stock, 0) + sub.qty_sum, updated_at = NOW()
        FROM (
            SELECT product_id, SUM(quantity) AS qty_sum
            FROM order_items
            WHERE checkout_id = p_checkout_id AND tenant_id = p_tenant_id AND product_id IS NOT NULL
            GROUP BY product_id
        ) sub
        WHERE p.id = sub.product_id;

        UPDATE product_variants v
        SET stock = COALESCE(v.stock, 0) + sub.qty_sum, updated_at = NOW()
        FROM (
            SELECT variant_id, SUM(quantity) AS qty_sum
            FROM order_items
            WHERE checkout_id = p_checkout_id AND tenant_id = p_tenant_id AND variant_id IS NOT NULL
            GROUP BY variant_id
        ) sub
        WHERE v.id = sub.variant_id;

        DELETE FROM order_items WHERE checkout_id = p_checkout_id AND tenant_id = p_tenant_id;
        GET DIAGNOSTICS v_affected_items = ROW_COUNT;
    ELSE
        UPDATE order_items
        SET checkout_id = NULL, updated_at = NOW()
        WHERE checkout_id = p_checkout_id;
        GET DIAGNOSTICS v_affected_items = ROW_COUNT;
    END IF;

    IF v_checkout.member_id IS NOT NULL AND v_checkout.total_amount > 0 THEN
        UPDATE members
        SET total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_checkout.total_amount),
            updated_at = NOW()
        WHERE id = v_checkout.member_id AND tenant_id = p_tenant_id;
    END IF;

    DELETE FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_checkout_id,
        'checkout_no', v_checkout.checkout_no,
        'customer_name', v_checkout.customer_name,
        'items_deleted', p_delete_items,
        'affected_items', v_affected_items
    );
END;
$function$;

-- ======== batch_delete_checkouts_v1 ========
CREATE OR REPLACE FUNCTION public.batch_delete_checkouts_v1(
    p_tenant_id uuid,
    p_checkout_ids uuid[],
    p_delete_items boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_error TEXT;
    v_checkout RECORD;
    v_deleted_ids UUID[] := '{}';
    v_skipped JSONB[] := '{}';
    v_total_affected_items INT := 0;
    v_affected_items INT;
BEGIN
    v_error := verify_tenant_user_active(p_tenant_id);
    IF v_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_error);
    END IF;

    IF p_checkout_ids IS NULL OR array_length(p_checkout_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '請提供要刪除的結帳單');
    END IF;

    IF array_length(p_checkout_ids, 1) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', '一次最多刪除 100 筆');
    END IF;

    FOR v_checkout IN
        SELECT id, checkout_no, shipping_status, customer_name, member_id, total_amount
        FROM checkouts
        WHERE id = ANY(p_checkout_ids) AND tenant_id = p_tenant_id
    LOOP
        IF v_checkout.shipping_status NOT IN ('pending', 'url_sent', 'ordered') THEN
            v_skipped := array_append(v_skipped, jsonb_build_object(
                'id', v_checkout.id,
                'checkout_no', v_checkout.checkout_no,
                'reason', '已出貨/已取貨（' || v_checkout.shipping_status || '）'
            ));
            CONTINUE;
        END IF;

        IF p_delete_items THEN
            UPDATE products p
            SET stock = COALESCE(p.stock, 0) + sub.qty_sum, updated_at = NOW()
            FROM (
                SELECT product_id, SUM(quantity) AS qty_sum
                FROM order_items
                WHERE checkout_id = v_checkout.id AND tenant_id = p_tenant_id AND product_id IS NOT NULL
                GROUP BY product_id
            ) sub
            WHERE p.id = sub.product_id;

            UPDATE product_variants v
            SET stock = COALESCE(v.stock, 0) + sub.qty_sum, updated_at = NOW()
            FROM (
                SELECT variant_id, SUM(quantity) AS qty_sum
                FROM order_items
                WHERE checkout_id = v_checkout.id AND tenant_id = p_tenant_id AND variant_id IS NOT NULL
                GROUP BY variant_id
            ) sub
            WHERE v.id = sub.variant_id;

            DELETE FROM order_items WHERE checkout_id = v_checkout.id AND tenant_id = p_tenant_id;
            GET DIAGNOSTICS v_affected_items = ROW_COUNT;
        ELSE
            UPDATE order_items
            SET checkout_id = NULL, updated_at = NOW()
            WHERE checkout_id = v_checkout.id;
            GET DIAGNOSTICS v_affected_items = ROW_COUNT;
        END IF;

        v_total_affected_items := v_total_affected_items + v_affected_items;

        IF v_checkout.member_id IS NOT NULL AND v_checkout.total_amount > 0 THEN
            UPDATE members
            SET total_spent = GREATEST(0, COALESCE(total_spent, 0) - v_checkout.total_amount),
                updated_at = NOW()
            WHERE id = v_checkout.member_id AND tenant_id = p_tenant_id;
        END IF;

        DELETE FROM checkouts WHERE id = v_checkout.id AND tenant_id = p_tenant_id;
        v_deleted_ids := array_append(v_deleted_ids, v_checkout.id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
        'deleted_ids', v_deleted_ids,
        'skipped_count', COALESCE(array_length(v_skipped, 1), 0),
        'skipped', v_skipped,
        'items_deleted', p_delete_items,
        'affected_items', v_total_affected_items
    );
END;
$function$;
