create table if not exists public.reports (
  id            text        primary key,
  name          text        not null,
  date          text        not null,
  location      text        not null,
  responder_name  text      not null,
  responder_phone text      not null,
  city          text,
  entries       jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null
);

alter table public.reports enable row level security;

-- Allow authenticated responders to insert/update their own reports
create policy "responders can upsert reports"
  on public.reports
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
