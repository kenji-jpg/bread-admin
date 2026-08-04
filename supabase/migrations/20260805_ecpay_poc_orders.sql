-- ============================================================
-- 綠界金流 PoC — 獨立 log 表（2026-08-05）
-- 用來記錄 ATM 幕後取號的結果 + 付款通知，驗證流程用。
-- 「獨立於 billing」：不碰 tenants.plan / plan_expires_at，只是 PoC 記錄。
-- 只有後端路由（service_role，繞過 RLS）能存取；不開任何 anon/authenticated policy。
-- （實際已用 apply_migration: ecpay_poc_orders 套用）
-- ============================================================

create table if not exists public.ecpay_poc_orders (
  id uuid primary key default gen_random_uuid(),
  trade_no text unique not null,          -- 我方單號 MerchantTradeNo
  ecpay_trade_no text,                    -- 綠界 TradeNo
  amount int not null,
  method text not null default 'atm',
  bank_code text,                         -- 虛擬帳號銀行代碼
  v_account text,                         -- 虛擬帳號
  expire_date text,                       -- 繳費期限
  status text not null default 'unpaid',  -- unpaid / paid / simulated_paid / failed
  payer_account text,                     -- 付款人帳號後五碼（綠界對特定銀行才回）
  paid_at timestamptz,
  raw jsonb,                              -- 取號原始回應
  notify_raw jsonb,                       -- 付款通知解密後內容
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ecpay_poc_orders enable row level security;

comment on table public.ecpay_poc_orders is 'ECPay 金流 PoC 記錄（獨立於 billing，不影響 plan_expires_at）。僅後端 service_role 存取。';
