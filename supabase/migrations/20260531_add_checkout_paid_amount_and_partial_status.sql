-- C1: 補款追蹤資料層
--   - checkouts.paid_amount：累計客人已匯入金額（整數）
--   - payment_status 加 'partial' 狀態（需補款）
--   - 既有 paid 單回填 paid_amount = total_amount（視為已付清當下金額）
--   - 既有 pending 單 paid_amount = 0（DEFAULT，免另外 UPDATE）

ALTER TABLE checkouts
  ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;

UPDATE checkouts
  SET paid_amount = total_amount
  WHERE payment_status = 'paid';

ALTER TABLE checkouts
  ADD CONSTRAINT checkouts_payment_status_check
  CHECK (payment_status IN ('pending', 'partial', 'paid'));

COMMENT ON COLUMN checkouts.paid_amount IS
  '客人累計已匯款金額。total_amount - paid_amount = 應補匯金額；用於推導 payment_status：0 = pending、(0, total) = partial、>= total = paid。';
