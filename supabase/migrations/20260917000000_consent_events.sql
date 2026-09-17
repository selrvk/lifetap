-- Consent history: an append-only record of each consent a person gives,
-- renews, changes or withdraws — evidence for the Data Privacy Act's
-- accountability principle (RA 10173 Sec. 21) that consent was actually asked.
--
-- Written by the app for profiles with cloud backup on (events are also kept
-- on the phone for everyone), and by the delete-account Edge Function for
-- withdrawals and account deletions.
--
-- Deliberately no foreign key to auth.users: the record of a withdrawal has to
-- outlive the account it withdraws. Rows hold choices and dates, never profile
-- or medical data, and are deleted with the rest of the pilot data.

do $$
begin
  if to_regprocedure('public.current_role()') is null then
    raise exception
      'public.current_role() is missing — run the dashboard''s db/policies.sql first.';
  end if;
end $$;

create table if not exists public.consent_events (
  id              text        primary key,  -- generated on the phone, so retried uploads don't duplicate
  owner_id        uuid        not null,
  profile_id      text,
  event           text        not null check (event in (
                    'given', 'renewed', 'changed', 'cloud_backup_given',
                    'withdrawn', 'account_deleted'
                  )),
  notice_version  text        not null,
  choices         jsonb       not null default '{}'::jsonb
                    check (pg_column_size(choices) < 4096),
  occurred_at     timestamptz not null,     -- phone clock (may have been offline)
  recorded_at     timestamptz not null default now()  -- server clock, see trigger
);

create index if not exists consent_events_owner_idx
  on public.consent_events (owner_id, occurred_at desc);

-- recorded_at is always the server's time; a client can't backdate it.
create or replace function public.consent_events_stamp()
returns trigger
language plpgsql
as $$
begin
  new.recorded_at := now();
  return new;
end;
$$;

drop trigger if exists consent_events_stamp on public.consent_events;
create trigger consent_events_stamp
  before insert on public.consent_events
  for each row execute function public.consent_events_stamp();

alter table public.consent_events enable row level security;

drop policy if exists "consent_events_insert_own" on public.consent_events;
drop policy if exists "consent_events_select_own" on public.consent_events;
drop policy if exists "consent_events_select_admin" on public.consent_events;

-- The app records its own events. Withdrawals and account deletions come only
-- from the delete-account function (service role), so a client can't fake one.
create policy "consent_events_insert_own"
on public.consent_events
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and event in ('given', 'renewed', 'changed', 'cloud_backup_given')
);

create policy "consent_events_select_own"
on public.consent_events
for select
to authenticated
using (owner_id = auth.uid());

create policy "consent_events_select_admin"
on public.consent_events
for select
to authenticated
using (public.current_role() = 'admin');

-- Append-only: no update or delete policies, and no table privileges either.
revoke update, delete on public.consent_events from anon, authenticated;
