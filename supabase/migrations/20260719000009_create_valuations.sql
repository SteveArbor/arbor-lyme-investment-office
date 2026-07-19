-- Phase 2: valuations
-- Independent of research (docs/development-roadmap.md Phase 2, item 4).
-- Generic across any company -- no company-specific defaults or logic
-- anywhere in this table or the application code that writes to it.
-- fair-value fields are always server-computed
-- (src/domain/valuation/service.ts) and simply stored here verbatim.

create table if not exists public.valuations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  projection_years integer not null default 5 check (projection_years between 1 and 30),
  required_return numeric(6, 4) not null check (required_return between 0 and 1),
  margin_of_safety numeric(6, 4) not null check (margin_of_safety between 0 and 1),
  -- Each scenario stored as jsonb: { epsAssumption, growthRateAssumption,
  -- terminalMultiple, discountRate, probability, fairValue }. Kept as a
  -- single jsonb object per scenario rather than five separate numeric
  -- columns x 3 scenarios (15 columns) -- the whole scenario is always
  -- read/written atomically together, so this doesn't sacrifice any real
  -- query pattern this system needs.
  bear jsonb not null,
  base jsonb not null,
  bull jsonb not null,
  blended_fair_value numeric(14, 4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valuations_owner_company_unique unique (owner_id, company_id)
);

comment on table public.valuations is
  'Base/bear/bull scenario valuation, independent of research. Generic '
  'across any company (docs/development-roadmap.md Phase 2, item 4).';

alter table public.valuations enable row level security;

create policy "valuations_select_own"
  on public.valuations for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "valuations_insert_own"
  on public.valuations for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "valuations_update_own"
  on public.valuations for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.valuations to authenticated;

create trigger valuations_set_updated_at
  before update on public.valuations
  for each row
  execute function public.set_updated_at();

create index if not exists valuations_company_id_idx on public.valuations (company_id);
