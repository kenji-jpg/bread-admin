-- 2026-07-31 修補 billing bypass：防止一般 owner/admin 用自己的 authenticated session
-- 直接改 tenants 的帳務欄位（plan / plan_expires_at / subscription_starts_at /
-- subscription_status / is_active）自行免費升級或延長到期。
--
-- 背景：tenants_update RLS 放行 owner/admin 改自己那列，且 authenticated 對這些欄位有 UPDATE 權限
--       → 任何店家在瀏覽器 console 一行就能自升 max / 延到期 / 重啟用。
-- 作法：BEFORE UPDATE trigger，只擋「直接以 authenticated/anon 身分且非超管」的更新；
--       service_role、postgres-owned SECURITY DEFINER RPC（register_tenant_with_plan /
--       update_tenant_plan_v1 等，current_user=postgres）、超管（is_super_admin()）一律放行。
--       用 SECURITY INVOKER（預設）讓 current_user 反映真實呼叫者；is distinct from 確保
--       只有帳務欄位「真的改變」時才檢查（owner 改名稱/設定等不受影響）。
-- 已套用到正式 DB（2026-07-31），並以模擬 session 驗證：一般 owner 自升→擋、超管→放行、owner 改名稱→放行。

create or replace function public.guard_tenant_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.plan is distinct from old.plan
      or new.plan_expires_at is distinct from old.plan_expires_at
      or new.subscription_starts_at is distinct from old.subscription_starts_at
      or new.subscription_status is distinct from old.subscription_status
      or new.is_active is distinct from old.is_active)
  then
    if current_user in ('authenticated', 'anon') and not public.is_super_admin() then
      raise exception '不允許直接修改帳務欄位（plan/plan_expires_at/subscription_starts_at/subscription_status/is_active）；請透過超管付款流程處理。'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_tenant_billing on public.tenants;
create trigger trg_guard_tenant_billing
  before update on public.tenants
  for each row
  execute function public.guard_tenant_billing_columns();
