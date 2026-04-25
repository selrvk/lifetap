-- Enforce one profile per Supabase account.
-- Without this, clearing local data + re-onboarding + syncing creates orphaned duplicate rows.
alter table public.users
  add constraint users_owner_id_unique unique (owner_id);
