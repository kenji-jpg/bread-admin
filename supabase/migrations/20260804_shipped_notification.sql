-- ============================================================
-- 已寄出通知（2026-08-04）
-- 後台結帳單按「已寄出」時，主動推 LINE 通知客人（依出貨方式組不同訊息）。
--
-- 發訊由 edge function notify-checkout-v1 (v17) 的 kind='shipped' 路徑處理：
--   - 宅配 / 7-11 店到店 / 賣貨便 / 自取 各自訊息
--   - 有 shipping_details.tracking_no 時帶出物流單號 / 寄件編號
--   - 只 append 客人訊息設定(settings.message_config)的結尾署名 footer，
--     不跑 applyMsgCfg 的「3 天」replace（避免污染「1～3 個工作天送達」字樣）
--   - 成功後把 shipped_notified_at 蓋上時間戳
--
-- 前端：app/admin/t/[slug]/checkouts/page.tsx handleMarkShipped()
--   markShipped(update_checkout_status_v1 mark_shipped) 成功後 → notifyShipped()
--   （hooks/use-checkout.tsx: notifyCheckout(id, 'shipped')）
--
-- update_checkout_status_v1 本身不變（仍只做狀態轉移 + shipped_at）。
-- 此檔僅記錄新增的欄位（實際已用 apply_migration: add_checkouts_shipped_notified_at 套用）。
-- ============================================================

ALTER TABLE public.checkouts
  ADD COLUMN IF NOT EXISTS shipped_notified_at timestamptz;

COMMENT ON COLUMN public.checkouts.shipped_notified_at IS
  '已寄出通知發送成功的時間戳（notify-checkout-v1 kind=shipped 寫入）。NULL=尚未發送已寄出通知。';
