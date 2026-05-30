-- C3: 讓 mark_ordered / mark_paid / mark_completed 同步把 paid_amount 拉到 total_amount
-- 也就是「店家按已收款」=「客人付了當下總額」。配合 C2 的 recalc 函式產生正確 payment_status。
-- 'already_paid' 檢查改成只擋 paid（partial 仍可走 mark_paid 進補款收款流程）。
CREATE OR REPLACE FUNCTION public.update_checkout_status_v1(p_tenant_id uuid, p_checkout_id uuid, p_action text, p_store_url text DEFAULT NULL::text, p_myship_order_no text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_error TEXT;
    v_checkout RECORD;
    v_old_status TEXT;
    v_new_status TEXT;
    v_payment_status TEXT;
    v_shipping_method TEXT;
BEGIN
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    IF NOT verify_tenant_admin(p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '無權限操作此租戶的結帳單');
    END IF;

    SELECT * INTO v_checkout FROM checkouts WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
    IF v_checkout IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found', 'message', '找不到結帳單或無權限存取');
    END IF;

    v_old_status := v_checkout.shipping_status;
    v_payment_status := v_checkout.payment_status;
    v_shipping_method := COALESCE(v_checkout.shipping_method, 'myship');

    CASE p_action
        WHEN 'set_url' THEN
            IF p_store_url IS NULL OR p_store_url = '' THEN
                RETURN jsonb_build_object('success', false, 'error', 'missing_url', 'message', '請提供賣貨便連結');
            END IF;
            IF p_store_url NOT LIKE 'https://myship.7-11.com.tw/%' THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_url', 'message', '賣貨便連結格式不正確');
            END IF;
            v_new_status := 'url_sent';
            UPDATE checkouts SET store_url = p_store_url, shipping_status = v_new_status,
                shipping_method = 'myship', payment_method = 'cod', note = COALESCE(p_note, note), updated_at = NOW()
            WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

        WHEN 'mark_ordered' THEN
            IF v_old_status NOT IN ('pending', 'url_sent') THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_status_transition',
                    'message', '目前狀態無法標記為已下單，目前狀態：' || v_old_status);
            END IF;
            v_new_status := 'ordered';
            IF v_shipping_method IN ('delivery', 'pickup', 'seven_store') THEN
                v_payment_status := 'paid';
                UPDATE checkouts SET shipping_status = v_new_status, payment_status = 'paid',
                    payment_method = COALESCE(p_payment_method, payment_method, 'transfer'),
                    paid_at = COALESCE(paid_at, NOW()),
                    paid_amount = total_amount,  -- ★ C3
                    myship_order_no = COALESCE(p_myship_order_no, myship_order_no),
                    note = COALESCE(p_note, note), updated_at = NOW()
                WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
            ELSE
                UPDATE checkouts SET shipping_status = v_new_status,
                    myship_order_no = COALESCE(p_myship_order_no, myship_order_no),
                    note = COALESCE(p_note, note), updated_at = NOW()
                WHERE id = p_checkout_id AND tenant_id = p_tenant_id;
            END IF;

        WHEN 'mark_paid' THEN
            IF v_shipping_method = 'myship' THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_action_for_myship',
                    'message', '賣貨便訂單為取貨付款，收款會在完成時自動標記，請使用 mark_completed');
            END IF;
            IF v_old_status NOT IN ('pending', 'url_sent', 'ordered') THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_status_transition',
                    'message', '目前狀態無法標記為已收款，目前狀態：' || v_old_status);
            END IF;
            IF v_checkout.payment_status = 'paid' THEN
                RETURN jsonb_build_object('success', false, 'error', 'already_paid', 'message', '此結帳單已收款');
            END IF;
            v_new_status := CASE WHEN v_old_status IN ('pending', 'url_sent') THEN 'ordered' ELSE v_old_status END;
            v_payment_status := 'paid';
            UPDATE checkouts SET shipping_status = v_new_status, payment_status = 'paid',
                payment_method = COALESCE(p_payment_method, payment_method, 'transfer'),
                paid_at = NOW(),
                paid_amount = total_amount,  -- ★ C3 補款收款
                note = COALESCE(p_note, note), updated_at = NOW()
            WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

        WHEN 'mark_shipped' THEN
            IF v_old_status NOT IN ('pending', 'url_sent', 'ordered') THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_status_transition',
                    'message', '目前狀態無法標記為已寄出，目前狀態：' || v_old_status);
            END IF;
            v_new_status := 'shipped';
            UPDATE checkouts SET shipping_status = v_new_status, shipped_at = NOW(),
                note = COALESCE(p_note, note), updated_at = NOW()
            WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

        WHEN 'mark_completed' THEN
            IF v_old_status NOT IN ('ordered', 'shipped') THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_status_transition',
                    'message', '目前狀態無法標記為已完成，目前狀態：' || v_old_status);
            END IF;
            v_new_status := 'completed';
            v_payment_status := 'paid';
            UPDATE checkouts SET shipping_status = v_new_status, payment_status = 'paid',
                paid_at = COALESCE(paid_at, NOW()),
                paid_amount = total_amount,  -- ★ C3
                completed_at = NOW(), note = COALESCE(p_note, note), updated_at = NOW()
            WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

            UPDATE order_items SET is_completed = true, updated_at = NOW()
            WHERE checkout_id = p_checkout_id AND tenant_id = p_tenant_id;

        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'invalid_action',
                'message', '無效的動作：' || p_action);
    END CASE;

    RETURN jsonb_build_object('success', true, 'checkout_id', p_checkout_id, 'checkout_no', v_checkout.checkout_no,
        'old_status', v_old_status, 'new_status', v_new_status, 'payment_status', v_payment_status,
        'shipping_method', v_shipping_method, 'action', p_action,
        'message', CASE p_action
            WHEN 'set_url' THEN '已設定賣貨便連結'
            WHEN 'mark_ordered' THEN CASE WHEN v_shipping_method IN ('delivery', 'pickup', 'seven_store')
                THEN '已標記下單並確認收款' ELSE '已標記客人下單' END
            WHEN 'mark_paid' THEN '已確認收款'
            WHEN 'mark_shipped' THEN '已標記寄出'
            WHEN 'mark_completed' THEN '已標記完成'
        END);
END;
$function$;
