-- Phase 2: transactions
-- The transaction ledger (docs/development-roadmap.md Phase 2, item 7):
-- buy, sell, dividend, cash_adjustment. Append-only, matching
-- decision_recommendations' immutability model -- a transaction is never
-- corrected in place, only ever followed by a new, offsetting one.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  type text not null check (type in ('buy', 'sell', 'dividend', 'cash_adjustment')),
  quantity numeric(18, 6),
  price_per_unit numeric(18, 6),
  amount numeric(18, 2) not null,
  realised_gain numeric(18, 2),
  occurred_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint transactions_company_required_unless_cash_adjustment
    check (type = 'cash_adjustment' or company_id is not null),
  constraint transactions_quantity_price_required_for_buy_sell
    check (type not in ('buy', 'sell') or (quantity is not null and price_per_unit is not null))
);

comment on table public.transactions is
  'Append-only transaction ledger. No update/delete grant -- a mistaken '
  'entry is corrected with an offsetting transaction, never edited '
  '(docs/audit-strategy.md pattern).';

alter table public.transactions enable row level security;

create policy "transactions_select_own"
  on public.transactions for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "transactions_insert_own"
  on public.transactions for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

grant select, insert on public.transactions to authenticated;

revoke update, delete on public.transactions from authenticated, anon;

create index if not exists transactions_portfolio_id_idx
  on public.transactions (owner_id, portfolio_id, occurred_at desc);
create index if not exists transactions_company_id_idx
  on public.transactions (owner_id, portfolio_id, company_id, occurred_at desc);
