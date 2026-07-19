-- Phase 2 Architecture Review finding 4.2 (deferred), closed here per ADR
-- 0025: record_buy_transaction and record_sell_transaction previously
-- computed the holding's new quantity/average_cost in TypeScript from an
-- earlier, unlocked read, then wrote that value unconditionally. Two
-- concurrent operations against the same holding could both read the same
-- starting state, both compute an update from it, and the second write
-- would silently clobber the first's effect (a classic lost update).
--
-- Fixed here with optimistic concurrency control: each function now also
-- takes the quantity/average_cost the caller read before computing the new
-- values, and only applies the write if the row still matches that exact
-- state. If it doesn't (another operation committed first), the write is
-- rejected with errcode 'ALC04' and TradingService (domain/trading/service.ts)
-- retries with a fresh read — see ADR 0025 for why this was chosen over
-- pessimistic locking or moving the averaging arithmetic into SQL.
--
-- Cash was never subject to this bug: `cash = cash - v_cost` is a delta
-- expressed inside the UPDATE statement itself, evaluated atomically
-- against whatever value is current when Postgres grants the row lock —
-- there is no earlier, unlocked read of cash for a concurrent write to make
-- stale. Only the holding's quantity/average_cost — a weighted average that
-- depends on reading the *previous* quantity and cost together in
-- application code — needed this guard.
--
-- Both functions are dropped and recreated (not `create or replace`)
-- because the parameter list changes shape, which Postgres does not allow
-- via replace.

drop function if exists public.record_buy_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric
);

create function public.record_buy_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_expected_holding_quantity numeric,
  p_expected_holding_average_cost numeric,
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
  v_rows integer;
begin
  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = p_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  begin
    update public.portfolios set cash = cash - v_cost
      where id = p_portfolio_id and owner_id = p_owner_id;
  exception when check_violation then
    raise exception 'insufficient cash for this purchase' using errcode = 'ALC03';
  end;

  -- Compare-and-swap: the DO UPDATE branch only fires if the row still
  -- matches what the caller read. Postgres locks the conflicting row while
  -- evaluating this, so two concurrent buys against the same holding
  -- serialize correctly — the second one's WHERE clause is evaluated
  -- against the FIRST one's already-committed result, not stale data.
  insert into public.holdings (owner_id, portfolio_id, company_id, quantity, average_cost)
    values (p_owner_id, p_portfolio_id, p_company_id, p_new_holding_quantity, p_new_holding_average_cost)
    on conflict (portfolio_id, company_id) do update
      set quantity = excluded.quantity, average_cost = excluded.average_cost
      where public.holdings.quantity = p_expected_holding_quantity
        and public.holdings.average_cost = p_expected_holding_average_cost;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'concurrent modification: holding changed since it was read, retry' using errcode = 'ALC04';
  end if;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, p_company_id, 'buy', p_quantity, p_price_per_unit, -v_cost, null, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_buy_transaction is
  'Atomically records a buy transaction, updates the holding (guarded by '
  'optimistic concurrency), and debits portfolio cash. See ADR 0025 and '
  'docs/implementation/phase-3-architecture-review.md.';

grant execute on function public.record_buy_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric, numeric, numeric
) to authenticated;

drop function if exists public.record_sell_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric, numeric
);

create function public.record_sell_transaction(
  p_owner_id uuid,
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_expected_holding_quantity numeric,
  p_expected_holding_average_cost numeric,
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
  v_rows integer;
begin
  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = p_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  update public.portfolios set cash = cash + v_proceeds
    where id = p_portfolio_id and owner_id = p_owner_id;

  update public.holdings
    set quantity = p_new_holding_quantity, average_cost = p_new_holding_average_cost
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = p_owner_id
      and quantity = p_expected_holding_quantity
      and average_cost = p_expected_holding_average_cost;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- Ambiguous from row_count alone: either the holding doesn't exist, or
    -- it exists but was concurrently modified. Re-check to give a precise,
    -- distinguishable error rather than treating both the same way.
    perform 1 from public.holdings
      where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = p_owner_id;
    if not found then
      raise exception 'holding not found' using errcode = 'ALC02';
    else
      raise exception 'concurrent modification: holding changed since it was read, retry' using errcode = 'ALC04';
    end if;
  end if;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain, occurred_at, notes
  ) values (
    p_owner_id, p_portfolio_id, p_company_id, 'sell', p_quantity, p_price_per_unit, v_proceeds, p_realised_gain, p_occurred_at, p_notes
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_sell_transaction is
  'Atomically records a sell transaction, updates the holding (guarded by '
  'optimistic concurrency), and credits portfolio cash. See ADR 0025 and '
  'docs/implementation/phase-3-architecture-review.md.';

grant execute on function public.record_sell_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;
