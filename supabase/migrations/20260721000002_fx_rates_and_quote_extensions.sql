-- ADR 0032: FX Conversion and Live Quote Propagation.
--
-- Three additions:
--  1. `market_quotes.quality` widened to accept 'manual' -- a user-entered
--     mark for a security no configured provider can price at all (a
--     fund, or an exchange gated behind Twelve Data's paid tier: ASML's
--     Euronext Amsterdam line, WPP's LSE line). Reuses this table rather
--     than a parallel one specifically so a manual mark gets the same
--     persisted sourceTimestamp/age/staleness treatment a live quote does.
--  2. `market_quotes.previous_close` -- the prior session's closing price,
--     in the quote's own currency, used to compute a daily change without
--     this platform maintaining its own historical price time series
--     (out of scope for this milestone: "no historical charts").
--  3. `fx_rates` -- the FxRateRepository's persistence: the "last known
--     good" conversion rate per currency pair, upserted on refresh, never
--     deleted on a failed refresh (same "cache of current fact, not a
--     ledger" reasoning as market_quotes).

alter table public.market_quotes
  drop constraint if exists market_quotes_quality_check;

alter table public.market_quotes
  add constraint market_quotes_quality_check
  check (quality in ('real_time', 'delayed', 'previous_close', 'manual'));

alter table public.market_quotes
  add column if not exists previous_close numeric(18, 6);

comment on column public.market_quotes.previous_close is
  'Prior session close, in this quote''s own currency (ADR 0032) -- used to compute daily change. Null when the provider does not report it, or for a manual mark (no vendor "yesterday" to report).';

create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(18, 8) not null check (rate > 0),
  provider text not null,
  effective_timestamp timestamptz not null,
  retrieved_timestamp timestamptz not null,
  quality text not null check (quality in ('reference', 'stale_fallback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fx_rates_owner_pair_unique unique (owner_id, base_currency, quote_currency)
);

comment on table public.fx_rates is
  'FxRateRepository''s persistence (ADR 0032) -- the last known good conversion rate per currency pair, upserted on refresh. A failed refresh leaves the prior row in place (quality flips to stale_fallback at the application layer, the row itself is never deleted).';

alter table public.fx_rates enable row level security;

create policy "fx_rates_select_own"
  on public.fx_rates for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "fx_rates_insert_own"
  on public.fx_rates for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "fx_rates_update_own"
  on public.fx_rates for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update on public.fx_rates to authenticated;

create trigger fx_rates_set_updated_at
  before update on public.fx_rates
  for each row
  execute function public.set_updated_at();

create index if not exists fx_rates_owner_id_idx on public.fx_rates (owner_id);
