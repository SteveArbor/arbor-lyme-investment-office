-- Phase 2 Architecture Review, finding 4.1 (Critical): TradingService
-- previously performed the ledger insert, the holding upsert, and the
-- portfolio cash update as three separate, independently-awaited
-- round trips with no transactional guarantee between them -- a crash or
-- dropped connection between any two of them would silently desync the
-- append-only ledger (source of truth) from the materialized holding/cash
-- (read model).
--
-- Each function below performs all three writes inside a single Postgres
-- function invocation. Postgres wraps a function body in the calling
-- transaction: if any statement inside raises an unhandled exception,
-- every earlier statement in the same call is rolled back too -- there is
-- no path that commits a ledger row without the corresponding
-- holding/cash update, or vice versa. See
-- docs/implementation/phase-2-architecture-review.md section 4.1 for the
-- fuller writeup, and the rollback/crash-scenario evidence recorded there.
--
-- `security invoker` (not `definer`): these run as the calling
-- authenticated user, so RLS and the existing table GRANTs remain the
-- enforcing authority -- no privilege escalation, consistent with ADR
-- 0021's "no service-role client" principle. The final quantity/average
-- cost/realised-gain values are computed in TypeScript
-- (domain/trading/model.ts's calculateWeightedAverageCost/
-- calculateRealisedGain) and passed in already-computed -- these functions
-- are deliberately mechanical writers, not a second copy of the business
-- arithmetic, so "business rules live in the Domain" still holds.
--
-- Row locking (`for update`) on the portfolio (and, for buy/sell, the
-- holding) is acquired before writing, so two operations against the same
-- portfolio/holding serialize their commits rather than interleaving. This
-- does not eliminate a stale-read lost-update race between the earlier,
-- unlocked TypeScript-side read and the write (Architecture Review finding
-- 4.2, intentionally left open -- see that document for why a full fix
-- needs either optimistic-concurrency retry or moving the arithmetic into
-- SQL, both deferred as separate follow-up work rather than folded into
-- this fix).
--
-- Custom errcodes use the 'ALC0x' prefix, not Postgres's reserved 'P000x'
-- range: 'P0004' specifically collides with the built-in ASSERT_FAILURE
-- condition, which `exception when others` in a *calling* function does
-- NOT catch (a deliberate Postgres safety behaviour) -- an earlier draft
-- of this migration used P0004 for "insufficient cash" and every caller's
-- error handling silently failed to catch it. Verified against a live
-- instance; see docs/implementation/phase-2-architecture-review.md
-- section 4.1's validation evidence.

create or replace function public.record_buy_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_new_holding_quantity numeric,
  p_new_holding_average_cost numeric
) returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cost numeric := p_quantity * p_price_per_unit;
  v_transaction public.transactions;
begin
  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = p_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  perform 1 from public.holdings
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = p_owner_id
    for update;

  begin
    update public.portfolios set cash = cash - v_cost
      where id = p_portfolio_id and owner_id = p_owner_id;
  exception when check_violation then
    raise exception 'insufficient cash for this purchase' using errcode = 'ALC03';
  end;

  insert into public.holdings (owner_id, portfolio_id, company_id, quantity, average_cost)
    values (p_owner_id, p_portfolio_id, p_company_id, p_new_holding_quantity, p_new_holding_average_cost)
    on conflict (portfolio_id, company_id)
    do update set quantity = excluded.quantity, average_cost = excluded.average_cost;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, p_company_id, 'buy', p_quantity, p_price_per_unit, -v_cost, null, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_buy_transaction is
  'Atomically records a buy transaction, updates the holding, and debits '
  'portfolio cash. See migration header comment and '
  'docs/implementation/phase-2-architecture-review.md section 4.1.';

grant execute on function public.record_buy_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric
) to authenticated;

create or replace function public.record_sell_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_new_holding_quantity numeric,
  p_new_holding_average_cost numeric,
  p_realised_gain numeric
) returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proceeds numeric := p_quantity * p_price_per_unit;
  v_transaction public.transactions;
begin
  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = p_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  perform 1 from public.holdings
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = p_owner_id
    for update;
  if not found then
    raise exception 'holding not found' using errcode = 'ALC02';
  end if;

  update public.portfolios set cash = cash + v_proceeds
    where id = p_portfolio_id and owner_id = p_owner_id;

  update public.holdings
    set quantity = p_new_holding_quantity, average_cost = p_new_holding_average_cost
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = p_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, p_company_id, 'sell', p_quantity, p_price_per_unit, v_proceeds, p_realised_gain, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_sell_transaction is
  'Atomically records a sell transaction, updates the holding, and credits '
  'portfolio cash. See migration header comment and '
  'docs/implementation/phase-2-architecture-review.md section 4.1.';

grant execute on function public.record_sell_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric, numeric
) to authenticated;

create or replace function public.record_dividend_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_company_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text
) returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_rows integer;
begin
  update public.portfolios set cash = cash + p_amount
    where id = p_portfolio_id and owner_id = p_owner_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, p_company_id, 'dividend', null, null, p_amount, null, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_dividend_transaction is
  'Atomically records a dividend transaction and credits portfolio cash. '
  'See migration header comment and '
  'docs/implementation/phase-2-architecture-review.md section 4.1.';

grant execute on function public.record_dividend_transaction(
  uuid, uuid, uuid, numeric, timestamptz, text
) to authenticated;

create or replace function public.record_cash_adjustment_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text
) returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_rows integer;
begin
  begin
    update public.portfolios set cash = cash + p_amount
      where id = p_portfolio_id and owner_id = p_owner_id;
  exception when check_violation then
    raise exception 'cash adjustment would make the portfolio balance negative' using errcode = 'ALC03';
  end;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, null, 'cash_adjustment', null, null, p_amount, null, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_cash_adjustment_transaction is
  'Atomically records a cash adjustment and updates portfolio cash. See '
  'migration header comment and '
  'docs/implementation/phase-2-architecture-review.md section 4.1.';

grant execute on function public.record_cash_adjustment_transaction(
  uuid, uuid, numeric, timestamptz, text
) to authenticated;
