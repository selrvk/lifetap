-- Data Privacy Act consent records + responder undertaking + a guard on
-- personnel self-updates.

-- ── users: consent ───────────────────────────────────────────────────────────
-- consent_given_at / consent_version / consent_withdrawn_at are the columns in
-- lifetap-dashboard/db/consent.sql (repeated here with IF NOT EXISTS so this
-- migration works whether or not that file was applied). consent_details holds
-- the individual choices: { smsAlerts, cloudBackup, cloudBackupAt,
-- contactsConfirmed, guardian: { name, relationship } | null, updatedAt }.

alter table public.users
  add column if not exists consent_given_at     timestamptz,
  add column if not exists consent_version      text,
  add column if not exists consent_withdrawn_at timestamptz,
  add column if not exists consent_details      jsonb;

comment on column public.users.consent_details is
  'Per-purpose consent choices recorded by the app (SMS alerts, cloud backup, guardian, contacts confirmation).';

-- ── personnel: confidentiality undertaking ──────────────────────────────────

alter table public.personnel
  add column if not exists undertaking_accepted_at timestamptz,
  add column if not exists undertaking_version     text;

-- ── personnel: guard self-updates ───────────────────────────────────────────
-- lifetap-dashboard/db/policies.sql has "personnel_update_self", which lets a
-- personnel account UPDATE its own row with no column restriction — so any
-- responder could set role = 'admin' (full access to every civilian profile),
-- and a deactivated responder could set is_active = true.
--
-- This trigger lets non-admin JWT callers change only an allowlist of
-- harmless columns. Admins, and the dashboard's service-role API routes
-- (auth.uid() is null), are unaffected.

create or replace function public.personnel_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  self_editable constant text[] := array[
    'last_login',
    'undertaking_accepted_at',
    'undertaking_version'
  ];
begin
  if auth.uid() is null or public.current_role() = 'admin' then
    return new;
  end if;

  if (to_jsonb(new) - self_editable) is distinct from (to_jsonb(old) - self_editable) then
    raise exception 'Only an administrator can change personnel details'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists personnel_guard_self_update on public.personnel;
create trigger personnel_guard_self_update
  before update on public.personnel
  for each row execute function public.personnel_guard_self_update();
