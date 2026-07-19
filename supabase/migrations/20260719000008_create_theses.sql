-- Phase 2: theses
-- The Thesis Engine. One row per company; `statements` is a jsonb array
-- replaced atomically on every update (src/domain/thesis/service.ts),
-- since editing a thesis is "here is the current full set of pillars",
-- not independent per-statement CRUD. `overall_status` is always
-- server-computed (calculateOverallThesisStatus) -- never trust a
-- client-supplied value for it.

create table if not exists public.theses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  statements jsonb not null default '[]'::jsonb,
  overall_status text not null default 'stable'
    check (overall_status in ('strengthening', 'stable', 'weakening', 'broken')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint theses_owner_company_unique unique (owner_id, company_id)
);

comment on table public.theses is
  'The Thesis Engine (docs/development-roadmap.md Phase 2, item 3). '
  'overall_status is calculated application-side from statements and '
  'written verbatim here -- never derived by a database trigger, so the '
  'single calculateOverallThesisStatus function (tested in isolation) '
  'remains the one source of truth for the algorithm.';

alter table public.theses enable row level security;

create policy "theses_select_own"
  on public.theses for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "theses_insert_own"
  on public.theses for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "theses_update_own"
  on public.theses for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.theses to authenticated;

create trigger theses_set_updated_at
  before update on public.theses
  for each row
  execute function public.set_updated_at();

create index if not exists theses_company_id_idx on public.theses (company_id);
