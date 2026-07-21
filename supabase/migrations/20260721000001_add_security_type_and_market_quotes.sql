-- ADR 0030 / ADR 0031: Price Engine, Stage 1 (exchange-traded securities).
--
-- Two additions:
--  1. `companies.security_type` -- the routing key the Price Engine's
--     SecurityPriceProviderMap dispatches on (equity/etf/investment_trust/
--     fund). Defaults to 'equity' since every company created before this
--     column existed already is one; the nine known UK OEIC/unit trust
--     holdings are explicitly corrected to 'fund' below, by ticker (they
--     were recorded with their SEDOL code as `ticker`, per the HL Stocks &
--     Shares ISA import).
--  2. `market_quotes` -- the QuoteRepository's persistence: the "last
--     known good" price per security, upserted by a refresh (manual or,
--     from a later milestone, scheduled), never appended to -- this is a
--     cache of current market fact, not a ledger. A provider failure
--     leaves the prior row in place rather than deleting it (docs/data-flow.md
--     §4), so a caller always has *some* quote, with `source_timestamp`
--     making its staleness visible rather than hidden.

alter table public.companies
  add column if not exists security_type text not null default 'equity'
    check (security_type in ('equity', 'etf', 'investment_trust', 'fund'));

comment on column public.companies.security_type is
  'Routes Price Engine requests to the correct provider (ADR 0030/0031). '
  'Exchange-traded types (equity/etf/investment_trust) are priced by '
  'ticker+exchange; fund (UK OEIC/unit trust) has no ticker/exchange at '
  'all and is priced by SEDOL/ISIN -- see domain/market.';

-- Data fixup: the nine UK OEIC/unit trust holdings imported from the HL
-- Stocks & Shares ISA opening position, identified by their SEDOL code
-- (stored as `ticker` at import time, since this column didn't exist yet).
update public.companies
  set security_type = 'fund'
  where ticker in (
    'BJMD6R8', 'BJS8SJ3', 'B3D4SX8', 'B8N45T8', 'BKGR3F0',
    'BLRZQC8', 'BN13X43', 'B8XYYQ8', 'BDFB5M5'
  );

create index if not exists companies_security_type_idx
  on public.companies (owner_id, security_type);

create table if not exists public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  security_type text not null check (security_type in ('equity', 'etf', 'investment_trust', 'fund')),
  ticker text,
  exchange text,
  sedol text,
  isin text,
  -- Deterministic string built by the repository implementation from
  -- whichever of ticker/exchange or sedol/isin this identifier actually
  -- has (e.g. "equity:NVDA:NASDAQ" or "fund:BJMD6R8") -- the real
  -- dedup/upsert key. A generated/composite unique constraint over
  -- nullable ticker/exchange/sedol/isin columns directly would treat two
  -- NULLs as distinct, defeating the upsert; this column sidesteps that.
  identifier_key text not null,
  price numeric(18, 6) not null check (price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  quality text not null check (quality in ('real_time', 'delayed', 'previous_close')),
  source_timestamp timestamptz not null,
  -- Retained for audit/debugging only (docs/data-flow.md §4: "every stored
  -- price retains sourceTimestamp and provider identity") -- domain/market's
  -- own interfaces never expose this to a caller; nothing in domain/portfolio
  -- or any UI should ever branch on it.
  provider text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_quotes_owner_identifier_unique unique (owner_id, identifier_key)
);

comment on table public.market_quotes is
  'QuoteRepository''s persistence (ADR 0030) -- the last known good price '
  'per security, upserted on refresh. Not append-only: a fresher quote '
  'overwrites the prior row for the same identifier_key, since this is a '
  'cache of current fact, not a ledger.';

alter table public.market_quotes enable row level security;

create policy "market_quotes_select_own"
  on public.market_quotes for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "market_quotes_insert_own"
  on public.market_quotes for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "market_quotes_update_own"
  on public.market_quotes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.market_quotes to authenticated;

create trigger market_quotes_set_updated_at
  before update on public.market_quotes
  for each row
  execute function public.set_updated_at();

create index if not exists market_quotes_owner_id_idx on public.market_quotes (owner_id);
