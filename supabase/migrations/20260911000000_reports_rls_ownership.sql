-- Lock down public.reports.
--
-- The original "responders can upsert reports" policy allowed ANY authenticated
-- user (including civilians, who can self-register via phone OTP) to read,
-- modify and delete every report. Because permissive policies are OR'ed, it
-- also overrode the scoped policies in lifetap-dashboard/db/policies.sql.
--
-- After this migration, access to reports is:
--   select  → dashboard's reports_select_scoped (admin: all, medic/responder: own city)
--             + reports_select_own (active personnel: reports they filed)
--   insert  → dashboard's reports_insert_in_city
--   update  → dashboard's reports_admin_write (admin)
--             + reports_update_own (active personnel: reports they filed — needed
--               so the app can re-sync a report after adding victims)
--   delete  → admin only
--
-- Requires lifetap-dashboard/db/policies.sql to be applied first (it defines
-- public.current_role() and the scoped policies this migration relies on).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'reports'
      and policyname = 'reports_insert_in_city'
  ) then
    raise exception
      'Apply lifetap-dashboard/db/policies.sql before this migration — '
      'otherwise dropping the open policy leaves reports with no insert policy.';
  end if;
end $$;

drop policy if exists "responders can upsert reports" on public.reports;

-- ── Ownership ────────────────────────────────────────────────────────────────

alter table public.reports
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists reports_created_by_idx on public.reports (created_by);

-- Backfill: reports stored responder_phone as "+639…"; auth.users stores digits only.
update public.reports r
set created_by = u.id
from auth.users u
where r.created_by is null
  and u.phone is not null
  and '+' || regexp_replace(u.phone, '\D', '', 'g') = r.responder_phone;

-- Always stamp the caller as owner on insert so a client can't file a report
-- on someone else's behalf. Service-role inserts (auth.uid() is null) keep
-- whatever value they supply.
create or replace function public.reports_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists reports_set_created_by on public.reports;
create trigger reports_set_created_by
  before insert on public.reports
  for each row execute function public.reports_set_created_by();

-- ── Policies ─────────────────────────────────────────────────────────────────

drop policy if exists "reports_select_own" on public.reports;
drop policy if exists "reports_update_own" on public.reports;

create policy "reports_select_own"
on public.reports
for select
to authenticated
using (
  created_by = auth.uid()
  and public.current_role() in ('admin', 'medic', 'responder')
);

create policy "reports_update_own"
on public.reports
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_role() in ('admin', 'medic', 'responder')
)
with check (created_by = auth.uid());
