create table if not exists public.domestic_checklist (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists domestic_checklist_created_at_idx
  on public.domestic_checklist (created_at);
