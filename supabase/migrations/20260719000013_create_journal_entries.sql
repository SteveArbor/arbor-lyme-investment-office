-- Phase 2: journal_entries
-- The Decision Journal (docs/development-roadmap.md Phase 2, item 8).
-- Purchase-time fields are set once at insert and never edited; sale-time
-- fields (sale_date, sale_reason, lessons_learned) are the only columns
-- ever updated, exactly once, when the position is closed.

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  purchase_date timestamptz not null,
  purchase_price numeric(18, 6) not null check (purchase_price > 0),
  fair_value_at_purchase numeric(18, 6) not null,
  expected_return_at_purchase numeric(8, 4) not null,
  position_size numeric(18, 2) not null check (position_size > 0),
  conviction_at_purchase numeric(5, 4) not null check (conviction_at_purchase between 0 and 1),
  thesis_summary text not null,
  risks text not null default '',
  invalidation_conditions text not null default '',
  sale_date timestamptz,
  sale_reason text,
  lessons_learned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.journal_entries is
  'The decision-time snapshot (purchase_date through invalidation_conditions) '
  'is immutable in practice -- application code never re-sends those columns '
  'on update, only the sale_* / lessons_learned columns when closing an entry.';

alter table public.journal_entries enable row level security;

create policy "journal_entries_select_own"
  on public.journal_entries for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "journal_entries_insert_own"
  on public.journal_entries for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "journal_entries_update_own"
  on public.journal_entries for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.journal_entries to authenticated;

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row
  execute function public.set_updated_at();

create index if not exists journal_entries_company_id_idx
  on public.journal_entries (owner_id, company_id);
create index if not exists journal_entries_portfolio_id_idx
  on public.journal_entries (owner_id, portfolio_id);
