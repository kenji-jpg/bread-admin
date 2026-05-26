-- 修正：set_myship_url_v1 原本只寫頂層 deprecated 欄位（store_url/myship_store_name/
-- myship_account_name），沒同步寫進 shipping_details JSONB；list_checkouts_v1 也
-- 不回傳那些頂層欄位，導致前端永遠讀不到「賣場帳號（賣場所有者）」。
-- 修正：在原本 UPDATE 後同時 merge 進 shipping_details，null 自動跳過。
CREATE OR REPLACE FUNCTION public.set_myship_url_v1(p_tenant_id uuid, p_checkout_id uuid, p_store_url text, p_myship_store_name text DEFAULT NULL::text, p_myship_account_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_checkout RECORD; v_member RECORD; v_tenant RECORD; v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    IF v_role <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized', 'message', '此函數僅供系統內部呼叫');
    END IF;
    IF p_store_url IS NULL OR p_store_url = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_url');
    END IF;
    IF p_store_url NOT LIKE 'https://myship.7-11.com.tw/%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_url');
    END IF;

    SELECT id, checkout_no, member_id, customer_name, total_amount, shipping_status, store_url, shipping_method
    INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF v_checkout IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found');
    END IF;
    IF v_checkout.store_url IS NOT NULL AND v_checkout.store_url <> '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'url_already_set', 'existing_url', v_checkout.store_url);
    END IF;
    IF v_checkout.shipping_status NOT IN ('pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', v_checkout.shipping_status);
    END IF;

    SELECT id, line_user_id, display_name
    INTO v_member
    FROM members
    WHERE id = v_checkout.member_id AND tenant_id = p_tenant_id;

    IF v_member IS NULL OR v_member.line_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'member_no_line');
    END IF;

    SELECT id, name, line_channel_token INTO v_tenant FROM tenants WHERE id = p_tenant_id;
    IF v_tenant.line_channel_token IS NULL OR v_tenant.line_channel_token = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_token');
    END IF;

    UPDATE checkouts
    SET store_url = p_store_url,
        myship_store_name = COALESCE(p_myship_store_name, myship_store_name),
        myship_account_name = COALESCE(p_myship_account_name, myship_account_name),
        shipping_status = 'url_sent',
        payment_method = 'cod',
        -- ★ 同時 merge 進 shipping_details JSONB（前端讀取的正典位置）
        -- jsonb_strip_nulls：當參數為 NULL 時不寫入該 key，避免清掉現有值
        shipping_details = COALESCE(shipping_details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'store_url', p_store_url,
            'myship_store_name', NULLIF(COALESCE(p_myship_store_name, ''), ''),
            'myship_account_name', NULLIF(COALESCE(p_myship_account_name, ''), '')
        )),
        updated_at = NOW()
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'checkout_id', p_checkout_id,
        'checkout_no', v_checkout.checkout_no,
        'total_amount', v_checkout.total_amount,
        'customer_name', COALESCE(v_checkout.customer_name, v_member.display_name),
        'line_user_id', v_member.line_user_id,
        'line_channel_token', v_tenant.line_channel_token,
        'tenant_name', v_tenant.name
    );
END;
$function$;
