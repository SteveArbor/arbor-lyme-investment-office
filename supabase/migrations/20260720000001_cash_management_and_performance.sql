-- Milestone 2.7 — Portfolio Completion & UX Polish, Part 1.
--
-- Cash Management: replaces "cash_adjustment with a signed amount and no
-- further structure" with eight named adjustment types (deposit,
-- withdrawal, dividend, interest, fee, tax, correction, other), matching
-- how a real cash ledger is categorised. Three of the eight already had a
-- dedicated `transactions.type` (dividend already existed; buy/sell are
-- unrelated to cash management) — this migration adds `fee` and `interest`
-- as first-class types alongside a `category` column that distinguishes
-- deposit/withdrawal/correction/other within `cash_adjustment`, rather
-- than inventing eight separate top-level types for what are really two
-- different classification axes (what kind of ledger entry vs. what kind
-- of adjustment). See ADR 0026 (Portfolio Accounting Principles), which
-- named fee/interest/tax tracking as an explicit, previously-acknowledged
-- gap this migration closes.
--
-- Every new/changed RPC follows the exact shape ADR 0025 established:
-- SECURITY DEFINER, owner derived from auth.uid() (never a parameter),
-- portfolio row locked before any read a computation depends on,
-- idempotency-key checked after that lock, CHECK constraints as the
-- backstop behind each function's own explicit validation. Old function
-- signatures are dropped, not replaced, for the same reason ADR 0025's
-- migration dropped them: `create or replace` with a different parameter
-- list creates a new overload and leaves the old signature both present
-- and still granted.

-- ---- Schema: new columns ----

alter table public.transactions
  add column if not exists category text,
  add column if not exists reference text;

comment on column public.transactions.category is
  'Only meaningful for type = ''cash_adjustment'': deposit, withdrawal, '
  'correction, or other. Null for every other type, and for '
  'cash_adjustment rows recorded before this column existed.';

comment on column public.transactions.reference is
  'Optional external reference (e.g. a bank transfer ID or broker '
  'confirmation number) the user supplied. Never used for any '
  'application logic -- display and audit only.';

-- ---- Schema: widen the type enum ----

alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('buy', 'sell', 'dividend', 'fee', 'interest', 'tax', 'cash_adjustment'));

-- ---- Schema: category is valid only where it means something ----

alter table public.transactions
  add constraint transactions_category_only_for_cash_adjustment
    check (category is null or type = 'cash_adjustment'),
  add constraint transactions_category_valid_values
    check (category is null or category in ('deposit', 'withdrawal', 'correction', 'other'));

-- ---- Schema: company_id required unless the type is inherently portfolio-level ----
-- fee/interest/tax are account-level cash events (a platform fee, account
-- interest, a tax withholding not tied to one holding) the same way
-- cash_adjustment already was -- widen the existing rule rather than
-- special-case each one.

alter table public.transactions drop constraint transactions_company_required_unless_cash_adjustment;
alter table public.transactions add constraint transactions_company_required_unless_portfolio_level
  check (type in ('cash_adjustment', 'fee', 'interest', 'tax') or company_id is not null);

-- ---- Schema: amount sign must match type (and category, for cash_adjustment) ----
-- Deposits/interest/dividends increase cash; withdrawals/fees/tax decrease
-- it. correction/other keep the old either-sign behaviour, and category
-- IS NULL is accepted so cash_adjustment rows recorded before this
-- migration (which have no category) remain valid -- this constraint is
-- enforced going forward by the RPCs always supplying one, not by
-- rewriting history.

alter table public.transactions drop constraint transactions_amount_sign_matches_type;
alter table public.transactions add constraint transactions_amount_sign_matches_type
  check (
    (type = 'buy' and amount < 0)
    or (type in ('sell', 'dividend', 'interest') and amount > 0)
    or (type in ('fee', 'tax') and amount < 0)
    or (
      type = 'cash_adjustment' and (
        category is null
        or (category = 'deposit' and amount > 0)
        or (category = 'withdrawal' and amount < 0)
        or (category in ('correction', 'other'))
      )
    )
  );

create index if not exists transactions_type_idx
  on public.transactions (owner_id, portfolio_id, type, occurred_at desc);

-- ---- Functions: record_fee_transaction (new) ----

create function public.record_fee_transaction(
  p_portfolio_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_reference text default null,
  p_company_id uuid default null,
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'fee amount must be greater than zero' using errcode = 'ALC06';
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

  if p_amount > v_cash then
    raise exception 'insufficient cash to record this fee' using errcode = 'ALC03';
  end if;

  update public.portfolios set cash = cash - p_amount
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, amount, occurred_at, notes, reference, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'fee', -p_amount, p_occurred_at, p_notes, p_reference, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_fee_transaction is
  'Atomically records a fee and debits portfolio cash, locking the '
  'portfolio first. See this migration''s header comment and ADR 0025/0026.';

grant execute on function public.record_fee_transaction(
  uuid, numeric, timestamptz, text, text, uuid, uuid
) to authenticated;

-- ---- Functions: record_interest_transaction (new) ----

create function public.record_interest_transaction(
  p_portfolio_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_reference text default null,
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
    raise exception 'interest amount must be greater than zero' using errcode = 'ALC06';
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
    owner_id, portfolio_id, company_id, type, amount, occurred_at, notes, reference, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, null, 'interest', p_amount, p_occurred_at, p_notes, p_reference, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_interest_transaction is
  'Atomically records interest received and credits portfolio cash, '
  'locking the portfolio first. See this migration''s header comment and '
  'ADR 0025/0026.';

grant execute on function public.record_interest_transaction(
  uuid, numeric, timestamptz, text, text, uuid
) to authenticated;

-- ---- Functions: record_tax_transaction (new) ----

create function public.record_tax_transaction(
  p_portfolio_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_reference text default null,
  p_company_id uuid default null,
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'tax amount must be greater than zero' using errcode = 'ALC06';
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

  if p_amount > v_cash then
    raise exception 'insufficient cash to record this tax payment' using errcode = 'ALC03';
  end if;

  update public.portfolios set cash = cash - p_amount
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, amount, occurred_at, notes, reference, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'tax', -p_amount, p_occurred_at, p_notes, p_reference, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_tax_transaction is
  'Atomically records a tax payment and debits portfolio cash, locking '
  'the portfolio first. See this migration''s header comment and ADR '
  '0025/0026.';

grant execute on function public.record_tax_transaction(
  uuid, numeric, timestamptz, text, text, uuid, uuid
) to authenticated;

-- ---- Functions: record_cash_adjustment_transaction (replaced -- category + reference) ----

drop function if exists public.record_cash_adjustment_transaction(
  uuid, numeric, timestamptz, text, uuid
);

create function public.record_cash_adjustment_transaction(
  p_portfolio_id uuid,
  p_category text,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_reference text default null,
  p_idempotency_key uuid default null
) returns public.transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_cash numeric;
  v_signed_amount numeric;
  v_transaction public.transactions;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = 'ALC05';
  end if;
  if p_category is null or p_category not in ('deposit', 'withdrawal', 'correction', 'other') then
    raise exception 'invalid cash adjustment category' using errcode = 'ALC06';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'amount cannot be zero' using errcode = 'ALC06';
  end if;

  -- deposit/withdrawal always take a positive "how much" from the caller
  -- and the category determines the sign that lands in the ledger;
  -- correction/other pass the caller's own signed amount through, matching
  -- the original cash_adjustment behaviour for those two categories.
  if p_category in ('deposit', 'withdrawal') and p_amount < 0 then
    raise exception 'amount must be positive for deposit/withdrawal -- the category already implies direction' using errcode = 'ALC06';
  end if;
  v_signed_amount := case
    when p_category = 'deposit' then p_amount
    when p_category = 'withdrawal' then -p_amount
    else p_amount
  end;

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

  if v_cash + v_signed_amount < 0 then
    raise exception 'this adjustment would make the portfolio balance negative' using errcode = 'ALC03';
  end if;

  update public.portfolios set cash = cash + v_signed_amount
    where id = p_portfolio_id and owner_id = v_owner_id;

  insert into public.transactions (
    owner_id, portfolio_id, company_id, type, category, amount, occurred_at, notes, reference, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, null, 'cash_adjustment', p_category, v_signed_amount, p_occurred_at, p_notes, p_reference, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_cash_adjustment_transaction is
  'Atomically records a categorised cash adjustment (deposit/withdrawal/'
  'correction/other) and updates portfolio cash, locking the portfolio '
  'first and verifying the resulting balance from the locked read. See '
  'this migration''s header comment and ADR 0025/0026.';

grant execute on function public.record_cash_adjustment_transaction(
  uuid, text, numeric, timestamptz, text, text, uuid
) to authenticated;

-- ---- Functions: record_dividend_transaction (replaced -- reference only, same shape otherwise) ----

drop function if exists public.record_dividend_transaction(
  uuid, uuid, numeric, timestamptz, text, uuid
);

create function public.record_dividend_transaction(
  p_portfolio_id uuid,
  p_company_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_notes text,
  p_reference text default null,
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
    owner_id, portfolio_id, company_id, type, amount, occurred_at, notes, reference, idempotency_key
  ) values (
    v_owner_id, p_portfolio_id, p_company_id, 'dividend', p_amount, p_occurred_at, p_notes, p_reference, p_idempotency_key
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.record_dividend_transaction is
  'Atomically records a dividend and credits portfolio cash, locking the '
  'portfolio first. See this migration''s header comment and ADR 0025/0026.';

grant execute on function public.record_dividend_transaction(
  uuid, uuid, numeric, timestamptz, text, text, uuid
) to authenticated;
