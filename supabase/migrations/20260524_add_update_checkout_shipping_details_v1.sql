-- 後台手動填寫/編輯結帳單寄件資訊（merge 進 shipping_details，保留既有 key）
-- 用於：客人私訊提供姓名/電話/7-11店名/地址後，店家在後台一次填入並永久保存於該結帳單
CREATE OR REPLACE FUNCTION public.update_checkout_shipping_details_v1(
    p_tenant_id uuid,
    p_checkout_id uuid,
    p_receiver_name text DEFAULT NULL,
    p_receiver_phone text DEFAULT NULL,
    p_shipping_address text DEFAULT NULL,
    p_seven_store_name text DEFAULT NULL,
    p_seven_store_id text DEFAULT NULL,
    p_tracking_no text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_error TEXT;
    v_checkout RECORD;
    v_details JSONB;
BEGIN
    -- 權限與停權檢查
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    IF NOT verify_tenant_admin(p_tenant_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'unauthorized',
            'message', '無權限操作此租戶的結帳單'
        );
    END IF;

    -- 查詢結帳單（租戶隔離）
    SELECT * INTO v_checkout
    FROM checkouts
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    IF v_checkout IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'checkout_not_found',
            'message', '找不到結帳單或無權限存取'
        );
    END IF;

    -- 以既有 shipping_details 為基底，僅覆寫有傳入（非 NULL）的欄位
    v_details := COALESCE(v_checkout.shipping_details, '{}'::jsonb);

    IF p_receiver_name    IS NOT NULL THEN v_details := jsonb_set(v_details, '{receiver_name}',    to_jsonb(p_receiver_name)); END IF;
    IF p_receiver_phone   IS NOT NULL THEN v_details := jsonb_set(v_details, '{receiver_phone}',   to_jsonb(p_receiver_phone)); END IF;
    IF p_shipping_address IS NOT NULL THEN v_details := jsonb_set(v_details, '{shipping_address}', to_jsonb(p_shipping_address)); END IF;
    IF p_seven_store_name IS NOT NULL THEN v_details := jsonb_set(v_details, '{seven_store_name}', to_jsonb(p_seven_store_name)); END IF;
    IF p_seven_store_id   IS NOT NULL THEN v_details := jsonb_set(v_details, '{seven_store_id}',   to_jsonb(p_seven_store_id)); END IF;
    IF p_tracking_no      IS NOT NULL THEN v_details := jsonb_set(v_details, '{tracking_no}',      to_jsonb(p_tracking_no)); END IF;

    UPDATE checkouts
    SET shipping_details = v_details,
        updated_at = NOW()
    WHERE id = p_checkout_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'checkout_id', p_checkout_id,
        'checkout_no', v_checkout.checkout_no,
        'shipping_details', v_details,
        'message', '已更新寄件資訊'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_checkout_shipping_details_v1(uuid, uuid, text, text, text, text, text, text) TO authenticated;
