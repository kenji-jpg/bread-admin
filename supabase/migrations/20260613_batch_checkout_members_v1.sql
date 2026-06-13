-- 批次結帳：一次處理多位客人（開新單 / 併入舊單），單一交易、單一往返
-- 設計：
--   * 權限只檢查一次（verify_tenant_user_active）
--   * 逐人包 BEGIN...EXCEPTION → 某人失敗不中斷其他人（部分成功）
--   * 開新單直接呼叫 create_checkout_v2_original（繞過 create_checkout_v2 的 rate limit）
--   * 併入舊單沿用 link_order_items_to_checkout_v1（含運費/免運/付款狀態重算）
--   * 回傳 { created, merged:[{name,checkoutNo,oldTotal,newTotal}], failed:[{name,reason}] }
--
-- p_plans 結構（前端逐人偵測後組出）：
--   [{ "line_user_id": "...", "member_name": "...", "choice": "new" | "<checkout_uuid>",
--      "shipping_method": "myship|myship_free|delivery|seven_store|pickup",
--      "order_item_ids": ["uuid", ...] }, ...]

CREATE OR REPLACE FUNCTION public.batch_checkout_members_v1(
    p_tenant_id uuid,
    p_plans jsonb,
    p_new_shipping_method text DEFAULT 'myship'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_auth_error TEXT;
    v_plan JSONB;
    v_choice TEXT;
    v_line_user_id TEXT;
    v_member_name TEXT;
    v_method TEXT;
    v_order_item_ids UUID[];
    v_res JSONB;
    v_created INT := 0;
    v_merged JSONB := '[]'::jsonb;
    v_failed JSONB := '[]'::jsonb;
BEGIN
    -- 權限只檢查一次
    v_auth_error := verify_tenant_user_active(p_tenant_id);
    IF v_auth_error IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_error);
    END IF;

    IF p_plans IS NULL OR jsonb_typeof(p_plans) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_plans 必須是陣列');
    END IF;

    FOR v_plan IN SELECT * FROM jsonb_array_elements(p_plans)
    LOOP
        v_choice := v_plan->>'choice';
        v_line_user_id := v_plan->>'line_user_id';
        v_member_name := COALESCE(v_plan->>'member_name', '未知');
        v_method := COALESCE(v_plan->>'shipping_method', p_new_shipping_method, 'myship');

        BEGIN
            IF v_choice = 'new' OR v_choice IS NULL THEN
                -- A. 開新結帳單（自動納入該會員所有 is_arrived 且未結帳的品項）
                IF v_line_user_id IS NULL OR v_line_user_id = '' THEN
                    v_failed := v_failed || jsonb_build_array(
                        jsonb_build_object('name', v_member_name, 'reason', '會員未綁定 LINE'));
                    CONTINUE;
                END IF;

                v_res := create_checkout_v2_original(
                    p_tenant_id, v_line_user_id, v_method, v_member_name, NULL, NULL);

                IF COALESCE((v_res->>'success')::boolean, false) THEN
                    v_created := v_created + 1;
                ELSE
                    v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                        'name', v_member_name,
                        'reason', '建單：' || COALESCE(v_res->>'message', v_res->>'error', '失敗')));
                END IF;
            ELSE
                -- B. 併入指定的現有結帳單
                SELECT array_agg(value::uuid)
                INTO v_order_item_ids
                FROM jsonb_array_elements_text(COALESCE(v_plan->'order_item_ids', '[]'::jsonb));

                IF v_order_item_ids IS NULL OR array_length(v_order_item_ids, 1) IS NULL THEN
                    v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                        'name', v_member_name, 'reason', '合併：缺少訂單品項'));
                    CONTINUE;
                END IF;

                v_res := link_order_items_to_checkout_v1(
                    p_tenant_id, v_choice::uuid, v_order_item_ids);

                IF COALESCE((v_res->>'success')::boolean, false) THEN
                    v_merged := v_merged || jsonb_build_array(jsonb_build_object(
                        'name', v_member_name,
                        'checkoutNo', v_res->>'checkout_no',
                        'oldTotal', COALESCE((v_res->>'old_total')::int, 0),
                        'newTotal', COALESCE((v_res->>'new_total')::int, 0)));
                ELSE
                    v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                        'name', v_member_name,
                        'reason', '合併：' || COALESCE(v_res->>'message', v_res->>'error', '失敗')));
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- 此人失敗，回滾本次迭代（savepoint），其餘照常
            v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                'name', v_member_name, 'reason', '例外：' || SQLERRM));
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'created', v_created,
        'merged', v_merged,
        'failed', v_failed);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.batch_checkout_members_v1(uuid, jsonb, text) TO authenticated;
