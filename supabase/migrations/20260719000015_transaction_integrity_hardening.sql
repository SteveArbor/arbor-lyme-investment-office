-- Security and Financial Integrity Hardening milestone.
-- Closes Staff Engineer Review findings C1, H1, H2 (docs/implementation/
-- staff-engineer-review.md) against the atomic transaction functions added
-- in 20260719000014_atomic_transaction_functions.sql.
--
-- ============================================================================
-- C1 (Critical): the atomic RPCs were advisory, not enforced. `authenticated`
-- still held direct table-level INSERT on `transactions` and INSERT/UPDATE/
-- DELETE on `holdings`/`portfolios`, so a client could bypass every RPC and
-- write the ledger/holding/cash directly and inconsistently. Fixed below by
-- revoking those grants and re-granting only the narrow, non-financial
-- columns/operations that legitimately don't need to go through an RPC
-- (creating a portfolio with its opening cash, renaming a portfolio, setting
-- a holding's target allocation preference). `quantity`/`average_cost` on
-- `holdings` and `cash` on `portfolios` and every row of `transactions` are
-- now writable only by the SECURITY DEFINER functions below.
--
-- H1 (High): the RPCs trusted caller-supplied `p_new_holding_quantity`/
-- `p_new_holding_average_cost`/`p_realised_gain`/`p_owner_id` verbatim.
-- Fixed by removing every derived-value and owner parameter from every
-- function signature -- the old signatures are dropped outright (not just
-- replaced: `create or replace` with a different parameter list creates a
-- new overload and leaves the old, exploitable signature both present and
-- still granted, which would silently defeat this fix). Each function now
-- derives `owner_id` from `auth.uid()` and computes quantity/average
-- cost/cash movement/realised gain itself, from a row it has just locked,
-- inside the same function invocation. The application layer
-- (TradingService) still runs the same arithmetic
-- (domain/trading/model.ts's calculateWeightedAverageCost/
-- calculateRealisedGain) for pre-flight validation and user-facing error
-- messages before the round trip -- but that copy is advisory UX only, the
-- database is now the sole source of truth, and a parity test
-- (transaction-repository.integration.test / the live validation script)
-- proves the two never disagree rather than leaving that as an unenforced
-- hope. This is a deliberate reversal of Phase 2 Architecture Review 4.2's
-- resolution note, which rejected moving the arithmetic into SQL because it
-- would duplicate domain logic -- correct as a general principle, but this
-- milestone's explicit instruction (and H1's blast radius: a client could
-- otherwise fabricate any average cost/realised gain it wanted) overrides
-- that preference here.
--
-- H2 (High): holding updates were check-then-act -- final quantity/average
-- cost were computed in TypeScript from an earlier, unlocked read. Fixed as
-- a direct consequence of the H1 fix: every function takes a `for update`
-- lock on the owning portfolio row FIRST (before any read used in a
-- calculation), which serializes every trading operation against that
-- portfolio -- a second concurrent call blocks until the first commits, then
-- reads the freshly-committed state. Because the arithmetic now runs inside
-- the same locked scope, not from a value captured before the lock was
-- taken, there is no window for a stale read to produce a wrong write. This
-- is the "row locking" option named in Phase 2 Architecture Review 4.2's
-- Resolution note as one of the two ways to close it properly.
--
-- Idempotency: each function also accepts an optional `p_idempotency_key`.
-- The portfolio lock is taken before the idempotency check, so a retried
-- call with the same key -- whether sequential (the common case: a lost
-- response causes a client retry) or genuinely concurrent -- blocks on the
-- same lock, then finds the already-committed transaction and returns it
-- without re-applying the cash/holding mutation. The unique index below is
-- kept as a hard backstop in case that invariant is ever broken by a future
-- change; hitting it would surface as a clear constraint violation rather
-- than silent double-booking.
-- ============================================================================

-- ---- Schema: CHECK constraints preventing structurally invalid entries ----

alter table public.transactions add column if not exists idempotency_key uuid;

create unique index if not exists transactions_owner_idempotency_key_idx
  on public.transactions (owner_id, idempotency_key)
  where idempotency_key is not null;

-- "amount greater than zero" from the milestone brief is stated as an
-- unsigned rule, but `amount` is the ledger's signed cash effect (buy is
-- negative -- see the column comment already on this table and
-- domain/trading/model.ts). A literal `amount > 0` CHECK would reject every
-- buy. The type-aware constraint below enforces the equivalent structural
-- guarantee -- amount can never be zero, and its sign must match what the
-- transaction type means for cash -- without breaking buys.
alter table public.transactions
  add constraint transactions_quantity_positive
    check (quantity is null or quantity > 0),
  add constraint transactions_price_positive
    check (price_per_unit is null or price_per_unit > 0),
  add constraint transactions_amount_nonzero
    check (amount <> 0),
  add constraint transactions_amount_sign_matches_type
    check (
      (type = 'buy' and amount < 0)
      or (type in ('sell', 'dividend') and amount > 0)
      or (type = 'cash_adjustment')
    ),
  add constraint transactions_realised_gain_only_for_sell
    check (type = 'sell' or realised_gain is null);

-- A fully-sold-down position's average cost is meaningless and must reset
-- to zero (already the app-level behaviour in every function below); this
-- makes it structurally impossible to persist a nonzero average cost
-- against zero shares, however a holdings row gets written.
alter table public.holdings
  add constraint holdings_zero_quantity_zero_cost
    check (quantity > 0 or average_cost = 0);

-- ---- Grants: RPC is now the only path for financial-state mutation ----

revoke insert, update, delete on public.portfolios from authenticated;
grant insert (owner_id, name, cash) on public.portfolios to authenticated;
grant update (name) on public.portfolios to authenticated;

revoke insert, update, delete on public.holdings from authenticated;
grant update (target_allocation_percent) on public.holdings to authenticated;

revoke insert on public.transactions from authenticated;
-- update/delete on transactions were already revoked in
-- 20260719000012_create_transactions.sql; restated here for anyone reading
-- this migration in isolation.
revoke update, delete on public.transactions from authenticated, anon;

-- Defense in depth: even if a SECURITY DEFINER function's owning role were
-- ever RLS-exempt for a reason unrelated to this migration, every statement
-- inside the functions below already filters explicitly by an owner_id
-- derived from auth.uid() -- that filter, not RLS, is the actual enforcing
-- mechanism from here on (see the header comment). FORCE ROW LEVEL SECURITY
-- makes the RLS layer apply as a second, independent check on top of it
-- rather than being silently skipped for the table owner.
alter table public.portfolios force row level security;
alter table public.holdings force row level security;
alter table public.transactions force row level security;

-- ---- Functions: recomputed server-side, owner derived from auth.uid() ----

-- The old signatures are dropped, not replaced -- see H1 note above for why
-- `create or replace` alone would leave the exploitable signature reachable.
drop function if exists public.record_buy_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric
);
drop function if exists public.record_sell_transaction(
  uuid, uuid, uuid, numeric, numeric, timestamptz, text, numeric, numeric, numeric
);
drop function if exists public.record_dividend_transaction(
  uuid, uuid, uuid, numeric, timestamptz, text
);
drop function if exists public.record_cash_adjustment_transaction(
  uuid, uuid, numeric, timestamptz, text
);

-- Errcode range 'ALC0x' (non-reserved -- see 20260719000014's header comment
-- on why 'P0004' was wrong): ALC01 not found, ALC02 insufficient holding,
-- ALC03 insufficient cash / negative balance, ALC05 not authenticated,
-- ALC06 invalid input (redundant with the CHECK constraints above and the
-- application's zod schemas, but gives a clean, catchable error instead of
-- a raw constraint-violation message if this function is ever called with
-- something those layers didn't already reject).
create function public.record_buy_transaction(
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key uuid default null
) returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_cash numeric;
  v_existing_quantity numeric := 0;
  v_existing_average_cost numeric := 0;
  v_new_quantity numeric;
  v_new_average_cost numeric;
  v_cost numeric;
  v_transaction public.transactions;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = 'ALC05';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = 'ALC06';
  end if;
  if p_price_per_unit is null or p_price_per_unit <= 0 then
    raise exception 'price per unit must be greater than zero' using errcode = 'ALC06';
  end if;

  select cash into v_cash from public.portfolios
    where id = p_portfolio_id and owner_id = v_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  if p_idempotency_key is not null then
    select * into v_transaction from public.transactions
      where owner_id = v_owner_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transaction;
    end if;
  end if;

  select quantity, average_cost into v_existing_quantity, v_existing_average_cost
    from public.holdings
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = v_owner_id
    for update;
  if not found then
    v_existing_quantity := 0;
    v_existing_average_cost := 0;
  end if;

  v_cost := p_quantity * p_price_per_unit;
  if v_cost > v_cash then
    raise exception 'insufficient cash for this purchase' using errcode = 'ALC03';
  end if;

  v_new_quantity := v_existing_quantity + p_quantity;
  v_new_average_cost :=
    (v_existing_quantity * v_existing_average_cost + p_quantity * p_price_per_unit) / v_new_quantity;

  update public.portfolios set cash = cash - v_cost
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.holdings (owner_id, portfolio_id, company_id, quantity, average_cost)
    values (v_owner_id, p_portfolio_id, p_company_id, v_new_quantity, v_new_average_cost)
    on conflict (portfolio_id, company_id)
    do update set quantity = excluded.quantity, average_cost = excluded.average_cost;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain,
    occurred_at, notes, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'buy', p_quantity, p_price_per_unit, -v_cost, null,
    p_occurred_at, p_notes, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_buy_transaction is
  'Atomically records a buy: locks the portfolio, computes the resulting '
  'holding and cash state from freshly-locked reads (never from a '
  'caller-supplied value), and writes all three rows in one call. See '
  'this migration''s header comment (C1/H1/H2) and '
  'docs/implementation/staff-engineer-review.md.';

grant execute on function public.record_buy_transaction(
  uuid, uuid, numeric, numeric, timestamptz, text, uuid
) to authenticated;

create function public.record_sell_transaction(
  p_portfolio_id uuid,
  p_company_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key uuid default null
) returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing_quantity numeric;
  v_existing_average_cost numeric;
  v_new_quantity numeric;
  v_new_average_cost numeric;
  v_realised_gain numeric;
  v_proceeds numeric;
  v_transaction public.transactions;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = 'ALC05';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = 'ALC06';
  end if;
  if p_price_per_unit is null or p_price_per_unit <= 0 then
    raise exception 'price per unit must be greater than zero' using errcode = 'ALC06';
  end if;

  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = v_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  if p_idempotency_key is not null then
    select * into v_transaction from public.transactions
      where owner_id = v_owner_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transaction;
    end if;
  end if;

  select quantity, average_cost into v_existing_quantity, v_existing_average_cost
    from public.holdings
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = v_owner_id
    for update;
  if not found or v_existing_quantity < p_quantity then
    raise exception 'insufficient holding to sell' using errcode = 'ALC02';
  end if;

  v_proceeds := p_quantity * p_price_per_unit;
  v_realised_gain := p_quantity * (p_price_per_unit - v_existing_average_cost);
  v_new_quantity := v_existing_quantity - p_quantity;
  v_new_average_cost := case when v_new_quantity > 0 then v_existing_average_cost else 0 end;

  update public.portfolios set cash = cash + v_proceeds
    where id = p_portfolio_id and owner_id = v_owner_id;

  update public.holdings
    set quantity = v_new_quantity, average_cost = v_new_average_cost
    where portfolio_id = p_portfolio_id and company_id = p_company_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain,
    occurred_at, notes, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'sell', p_quantity, p_price_per_unit, v_proceeds,
    v_realised_gain, p_occurred_at, p_notes, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_sell_transaction is
  'Atomically records a sell: locks the portfolio and holding, verifies '
  'sufficient quantity, computes realised gain and the resulting holding '
  'state from freshly-locked reads. See this migration''s header comment '
  '(C1/H1/H2) and docs/implementation/staff-engineer-review.md.';

grant execute on function public.record_sell_transaction(
  uuid, uuid, numeric, numeric, timestamptz, text, uuid
) to authenticated;

create function public.record_dividend_transaction(
  p_portfolio_id uuid,
  p_company_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key uuid default null
) returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_transaction public.transactions;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = 'ALC05';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'dividend amount must be greater than zero' using errcode = 'ALC06';
  end if;

  perform 1 from public.portfolios
    where id = p_portfolio_id and owner_id = v_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  if p_idempotency_key is not null then
    select * into v_transaction from public.transactions
      where owner_id = v_owner_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transaction;
    end if;
  end if;

  update public.portfolios set cash = cash + p_amount
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain,
    occurred_at, notes, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'dividend', null, null, p_amount, null,
    p_occurred_at, p_notes, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_dividend_transaction is
  'Atomically records a dividend and credits portfolio cash, locking the '
  'portfolio first. See this migration''s header comment (C1/H1/H2) and '
  'docs/implementation/staff-engineer-review.md.';

grant execute on function public.record_dividend_transaction(
  uuid, uuid, numeric, timestamptz, text, uuid
) to authenticated;

create function public.record_cash_adjustment_transaction(
  p_portfolio_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_idempotency_key uuid default null
) returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_cash numeric;
  v_transaction public.transactions;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = 'ALC05';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'amount cannot be zero' using errcode = 'ALC06';
  end if;

  select cash into v_cash from public.portfolios
    where id = p_portfolio_id and owner_id = v_owner_id
    for update;
  if not found then
    raise exception 'portfolio not found' using errcode = 'ALC01';
  end if;

  if p_idempotency_key is not null then
    select * into v_transaction from public.transactions
      where owner_id = v_owner_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transaction;
    end if;
  end if;

  if v_cash + p_amount < 0 then
    raise exception 'cash adjustment would make the portfolio balance negative' using errcode = 'ALC03';
  end if;

  update public.portfolios set cash = cash + p_amount
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, quantity, price_per_unit, amount, realised_gain,
    occurred_at, notes, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, null, 'cash_adjustment', null, null, p_amount, null,
    p_occurred_at, p_notes, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_cash_adjustment_transaction is
  'Atomically records a cash adjustment, locking the portfolio first and '
  'verifying the resulting balance from the locked read. See this '
  'migration''s header comment (C1/H1/H2) and '
  'docs/implementation/staff-engineer-review.md.';

grant execute on function public.record_cash_adjustment_transaction(
  uuid, numeric, timestamptz, text, uuid
) to authenticated;
