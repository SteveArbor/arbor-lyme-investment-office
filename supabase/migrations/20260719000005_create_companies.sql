-- Phase 2: companies
-- The Company aggregate -- the anchor entity Research, Valuation, Decision,
-- Portfolio, and Trading all reference by company_id. See
-- docs/domain-driven-design.md's Phase 2 design note for why this is
-- separate from price data (which stays in a future `prices` table owned
-- by the market context, keyed by ticker).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  ticker text not null,
  exchange text not null,
  sector text not null,
  industry text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'researching'
    check (status in ('researching', 'monitoring', 'holding', 'passed', 'archived')),
  watchlist boolean not null default false,
  notes text,
  profile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_owner_ticker_unique unique (owner_id, ticker)
);

comment on table public.companies is
  'The Company aggregate. No delete policy is defined -- deliberately: '
  'Research, Valuation, Journal, and Transaction records reference '
  'companies and must not be silently orphaned. Use status = ''archived'' '
  'instead of deletion (docs/development-roadmap.md Phase 2).';

alter table public.companies enable row level security;

create policy "companies_select_own"
  on public.companies for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "companies_insert_own"
  on public.companies for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "companies_update_own"
  on public.companies for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- No delete policy -- see table comment. No delete grant either
-- (belt-and-braces, matching the audit_events pattern in
-- docs/database-design.md).
grant select, insert, update on public.companies to authenticated;

create trigger companies_set_updated_at
  before update on public.companies
  for each row
  execute function public.set_updated_at();

create index if not exists companies_owner_id_idx on public.companies (owner_id);
create index if not exists companies_status_idx on public.companies (owner_id, status);
create index if not exists companies_watchlist_idx on public.companies (owner_id, watchlist) where watchlist = true;
