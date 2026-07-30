-- 2026-07-31 賣貨便未取貨退回：在結帳單留「客人未取」持久標記 + 每客戶累計未取次數
-- 背景：process_myship_cancelled_email（退貨/退款/退回信）原本把結帳單重置為 pending、
--       清空賣場欄位，導致「客人未取退回」在後台看不出痕跡（只像一筆新的待處理）。
-- 作法：
--   1) process_myship_cancelled_email：重置 pending 的同時，在 shipping_details 併入
--      {not_picked_up:true, not_picked_up_at:now}（仍保留 pending 讓插件可重新開賣場）。
--   2) list_checkouts_v1：新增 member_not_picked_up_count（此客戶跨此租戶累計未取退回次數）。
-- 前端：結帳單狀態欄顯示「⚠️ 客人未取」badge；客戶名旁顯示「未取 N 次」。
-- 已套正式 DB 並以 DO+RAISE 自動 rollback 測試：呼叫後 status=pending、not_picked_up=true。
--
-- ⚠️ 依賴：需賣貨便「未取退回」信被 worker 分類為 order_cancelled（含 取消/退貨/退款）才會觸發。
--    若實際退回信主旨/內文未被歸到此類，要調整 workers/myship-email 的分類（待用戶提供真實信確認）。

create or replace function public.process_myship_cancelled_email(p_myship_order_no text, p_recipient_email text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_checkout RECORD;
    v_tenant_id uuid;
BEGIN
    IF p_myship_order_no IS NULL OR p_myship_order_no = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_order_no');
    END IF;

    IF p_recipient_email IS NOT NULL THEN
        SELECT id INTO v_tenant_id FROM tenants WHERE myship_notify_email = p_recipient_email LIMIT 1;
    END IF;

    IF v_tenant_id IS NOT NULL THEN
        SELECT id, tenant_id, checkout_no, shipping_status INTO v_checkout
        FROM checkouts
        WHERE tenant_id = v_tenant_id AND myship_order_no = p_myship_order_no
          AND shipping_status IN ('ordered', 'shipped', 'url_sent')
        ORDER BY created_at DESC LIMIT 1;
    ELSE
        SELECT id, tenant_id, checkout_no, shipping_status INTO v_checkout
        FROM checkouts
        WHERE myship_order_no = p_myship_order_no
          AND shipping_status IN ('ordered', 'shipped', 'url_sent')
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'checkout_not_found', 'myship_order_no', p_myship_order_no);
    END IF;

    UPDATE checkouts
    SET shipping_status     = 'pending',
        myship_order_no     = NULL,
        store_url           = NULL,
        myship_store_name   = NULL,
        myship_account_name = NULL,
        shipped_at          = NULL,
        is_notified         = false,
        shipping_details    = COALESCE(shipping_details, '{}'::jsonb)
                              || jsonb_build_object('not_picked_up', true, 'not_picked_up_at', NOW()),
        updated_at          = NOW()
    WHERE id = v_checkout.id;

    RETURN jsonb_build_object('success', true, 'checkout_id', v_checkout.id,
        'checkout_no', v_checkout.checkout_no, 'tenant_id', v_checkout.tenant_id,
        'old_status', v_checkout.shipping_status, 'shipping_status', 'pending',
        'not_picked_up', true, 'myship_order_no', p_myship_order_no);
END;
$function$;

-- list_checkouts_v1：row_data 新增 member_not_picked_up_count（其餘不變）
-- 完整定義見 DB；此處僅記錄新增欄位：
--   'member_not_picked_up_count', COALESCE((
--     SELECT count(*) FROM checkouts c2
--     WHERE c.member_id IS NOT NULL AND c2.tenant_id = c.tenant_id
--       AND c2.member_id = c.member_id AND (c2.shipping_details->>'not_picked_up') = 'true'), 0)
