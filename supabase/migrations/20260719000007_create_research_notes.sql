-- Phase 2: research_notes
-- One per company. Sections are independently editable; every update is
-- versioned via entity_versions before being applied (see
-- src/domain/research/service.ts).

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  business_overview text,
  investment_thesis text,
  economic_moat text,
  management text,
  financial_strength text,
  capital_allocation text,
  growth_drivers text,
  risks text,
  monitoring_metrics text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_notes_owner_company_unique unique (owner_id, company_id)
);

comment on table public.research_notes is
  'One research note per company. Exists independently of valuation '
  '(docs/research-workspace.md, docs/development-roadmap.md Phase 2).';

alter table public.research_notes enable row level security;

create policy "research_notes_select_own"
  on public.research_notes for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "research_notes_insert_own"
  on public.research_notes for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "research_notes_update_own"
  on public.research_notes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.research_notes to authenticated;

create trigger research_notes_set_updated_at
  before update on public.research_notes
  for each row
  execute function public.set_updated_at();

create index if not exists research_notes_company_id_idx on public.research_notes (company_id);
