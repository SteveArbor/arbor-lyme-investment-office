-- Phase 2: portfolios, holdings
-- Portfolio holds positions and cash (docs/development-roadmap.md Phase 2,
-- item 6). Current value, unrealised gain/loss, allocation, fair value and
-- conviction are deliberately NOT stored here -- they are computed from
-- this data plus a current price and the latest decision_recommendations/
-- valuations rows (see src/domain/portfolio/model.ts). Delete is
-- permitted here (unlike companies) because a portfolio/holding carries no
-- history other domains reference by id.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cash numeric(18, 2) not null default 0 check (cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

create policy "portfolios_select_own"
  on public.portfolios for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "portfolios_insert_own"
  on public.portfolios for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "portfolios_update_own"
  on public.portfolios for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "portfolios_delete_own"
  on public.portfolios for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.portfolios to authenticated;

create trigger portfolios_set_updated_at
  before update on public.portfolios
  for each row
  execute function public.set_updated_at();

create index if not exists portfolios_owner_id_idx on public.portfolios (owner_id);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  quantity numeric(18, 6) not null default 0 check (quantity >= 0),
  average_cost numeric(18, 6) not null default 0 check (average_cost >= 0),
  target_allocation_percent numeric(5, 4) not null default 0
    check (target_allocation_percent between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_portfolio_company_unique unique (portfolio_id, company_id)
);

comment on table public.holdings is
  'Materialized position state. The Trading domain (Phase 2, item 7) is '
  'the intended writer of quantity/average_cost on every transaction -- '
  'Portfolio stores the result, it does not derive it.';

alter table public.holdings enable row level security;

create policy "holdings_select_own"
  on public.holdings for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "holdings_insert_own"
  on public.holdings for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "holdings_update_own"
  on public.holdings for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "holdings_delete_own"
  on public.holdings for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.holdings to authenticated;

create trigger holdings_set_updated_at
  before update on public.holdings
  for each row
  execute function public.set_updated_at();

create index if not exists holdings_portfolio_id_idx on public.holdings (owner_id, portfolio_id);
create index if not exists holdings_company_id_idx on public.holdings (owner_id, company_id);
