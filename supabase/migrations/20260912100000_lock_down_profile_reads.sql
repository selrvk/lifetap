-- Close two openings in the profile tables.
--
-- 1. public.users had "Personnel can read users" — SELECT, to authenticated,
--    USING (true). Despite the name it applied to EVERY signed-in account, so
--    any civilian who signed in could read every profile in the table,
--    medical fields included. Personnel reads are meant to be city-scoped.
-- 2. public.personnel had "allow_phone_lookup_for_login" — SELECT, to public,
--    USING (true): every responder's name, number, role and city was readable
--    by anyone holding the anon key, which ships inside every copy of the app.
--
-- Also tightened while here:
--   - "public_users_readable_by_anyone" exposed whole profiles (allergies,
--     conditions, medications, next-of-kin numbers) of is_public users to
--     anonymous callers. Nothing reads profiles unauthenticated today; if the
--     QR fallback is built, give it a view with only the fields it needs.
--   - "anyone_can_insert_own_record" let an unauthenticated caller insert
--     profile rows. Replaced with an owner-scoped, authenticated-only policy.
--
-- Policies are OR'ed, so one permissive policy overrides every careful one.
-- After this migration each table's reads are: your own row, or personnel
-- reading their own city (admins everything).

-- The scoped policies rely on the dashboard's helpers (db/policies.sql), which
-- re-prefix the JWT phone claim with "+" to match personnel.phone. The older
-- get_personnel_role() / get_personnel_city() read the claim raw, so they
-- silently match nothing; don't build on them.
do $$
begin
  if to_regprocedure('public.current_role()') is null
     or to_regprocedure('public.current_city()') is null then
    raise exception
      'public.current_role()/current_city() are missing — run the dashboard''s db/policies.sql first, otherwise this migration leaves the dashboard with no read access to users.';
  end if;
end $$;

-- ── users ───────────────────────────────────────────────────────────────────

drop policy if exists "Personnel can read users" on public.users;
drop policy if exists "public_users_readable_by_anyone" on public.users;

-- Personnel reads, scoped by city (admins see everything). Matches
-- db/policies.sql; created here because the users table never got it.
drop policy if exists "users_select_scoped" on public.users;
create policy "users_select_scoped"
on public.users
for select
to authenticated
using (
  public.current_role() = 'admin'
  or (
    public.current_role() in ('medic', 'responder')
    and public.current_city() is not null
    and cty ilike public.current_city() || '%'
  )
);

-- Civilians keep full access to their own row: owner_can_read_own_record and
-- owner_can_update_own_record already cover select/update, and every users
-- query the mobile app makes is scoped to the signed-in owner's own row.
drop policy if exists "anyone_can_insert_own_record" on public.users;
create policy "users_insert_own"
on public.users
for insert
to authenticated
with check (owner_id = auth.uid());

-- ── personnel ───────────────────────────────────────────────────────────────

-- Login no longer needs an open lookup: the app and the dashboard both check
-- the personnel table only after the OTP is verified, and personnel_select_scoped
-- lets an account read its own row (phone = public.current_phone()).
drop policy if exists "allow_phone_lookup_for_login" on public.personnel;
