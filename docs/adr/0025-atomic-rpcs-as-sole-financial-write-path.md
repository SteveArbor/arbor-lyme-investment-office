# 0025. Atomic RPCs as the Sole Financial Write Path, with Server-Side Arithmetic

**Status:** Accepted

## Context

`supabase/migrations/20260719000014_atomic_transaction_functions.sql` (Phase 2
Architecture Review finding 4.1) made the trading ledger's three writes
(transaction insert, holding update, portfolio cash update) atomic by moving
them into `SECURITY INVOKER` Postgres functions. That migration's design
deliberately kept the resulting quantity, average cost, and realised gain as
caller-supplied parameters, computed by `TradingService`
(`domain/trading/model.ts`'s `calculateWeightedAverageCost`/
`calculateRealisedGain`) — finding 4.2's Resolution note explicitly rejected
moving that arithmetic into SQL, reasoning it would duplicate domain logic
that already lived in one place, contradicting this project's "no duplicated
logic" rule.

The Staff Engineer Review (`docs/implementation/staff-engineer-review.md`)
found this combination exploitable: `authenticated` still held direct
table-level `INSERT`/`UPDATE`/`DELETE` grants on `transactions`, `holdings`,
and `portfolios` (C1), so a client could call these tables directly and
bypass the RPCs entirely — and even through the RPCs, nothing checked that a
caller-supplied `p_new_holding_quantity`/`p_new_holding_average_cost`/
`p_realised_gain` was arithmetically consistent with the raw
quantity/price (H1). The 4.2 resolution's row-locking (`for update`) closed
part of the lost-update race (H2) but not this trust boundary, because the
values being written were never re-derived from the locked state — only the
timing of the write was protected.

## Decision

`supabase/migrations/20260719000015_transaction_integrity_hardening.sql`
makes the four `record_*_transaction` functions the **only** way
`quantity`/`average_cost` (on `holdings`) and `cash` (on `portfolios`) can
change, and the only way a row can be inserted into `transactions`:

- `authenticated`'s table-level grants are narrowed to `SELECT` everywhere,
  plus exactly the non-financial columns the UI still writes directly
  (`portfolios.name`, `portfolios` row creation with its opening `cash`,
  `holdings.target_allocation_percent`). Nothing else is grantable at the
  table level any more.
- The functions changed from `SECURITY INVOKER` to `SECURITY DEFINER`,
  because column-level revocation from `authenticated` also removes the
  invoking role's ability to perform the write — a `SECURITY INVOKER`
  function running as a column-restricted caller can't write what the
  caller itself can't write. `SECURITY DEFINER` here follows the same
  precedent already established by `handle_new_user`
  (`20260719000004_profile_creation_trigger.sql`, ADR 0021): pinned
  `search_path`, and the owner is never trusted blindly — `owner_id` is
  derived from `auth.uid()` inside the function body, not accepted as a
  parameter, so there is no `p_owner_id` argument left for a compromised
  client to lie about.
- The functions now compute `quantity`/`average_cost`/`realised_gain`/cash
  movement themselves, from a row they have just locked (`for update`),
  reversing 4.2's resolution note. `domain/trading/model.ts`'s
  `calculateWeightedAverageCost`/`calculateRealisedGain` remain as the
  domain-layer reference implementation, used by `TradingService` for
  pre-flight validation and user-facing error messages before the round
  trip — advisory only. The database is the sole source of truth for the
  final numbers.
- Each function accepts an optional `p_idempotency_key`, checked after the
  portfolio lock is acquired (so a retried call — sequential or genuinely
  concurrent — with the same key returns the already-committed transaction
  instead of re-applying the mutation), backed by a partial unique index on
  `(owner_id, idempotency_key)`.

## Consequences

**Easier:**

- The C1/H1 exploit paths are closed structurally, not by convention —
  there is no grant left that permits a direct write, and no parameter left
  that permits a fabricated resulting value.
- H2's lost-update race is closed as a side effect: the arithmetic runs
  inside the same lock scope as the read it depends on, not from a value
  captured before the lock was taken.
- Retried Server Action submissions (a lost response, a client retry) are
  safe by construction at the database layer.

**Harder:**

- The weighted-average-cost/realised-gain formula now exists in two
  places (TypeScript and SQL) rather than one, which is exactly what 4.2's
  resolution note was trying to avoid. This is a deliberate, informed
  trade-off, not an oversight: `docs/implementation/security-hardening.md`
  records the live-database evidence that both implementations agree on
  every case exercised, and the domain-layer copy's own unit tests
  (`domain/trading/model.test.ts`) continue to cover it independently.
  Anyone changing the average-cost formula must change it in both places —
  there is no way to enforce this at compile time; it is a discipline this
  ADR asks future contributors to hold, not a rule the codebase can catch on
  its own.
- `SECURITY DEFINER` functions are a documented Postgres privilege-escalation
  vector if `search_path` isn't pinned (see the migration's header comment
  and `20260719000004`'s original warning) — every new function of this kind
  must repeat that pattern deliberately, not copy-paste without
  understanding why it's there.

## Alternatives Considered

- **Leave `SECURITY INVOKER` and only fix the grants.** Rejected: as
  explained above, this is not actually possible — an invoker-rights
  function cannot write a column its caller has been denied.
- **Compute the values in SQL but still accept them as parameters, and
  `CHECK` them against a recomputed value inside the function.** Considered
  as a way to avoid `SECURITY DEFINER` entirely, but it doesn't save
  anything: the function would recompute the values anyway to check them,
  so it may as well use its own computation as the source of truth and drop
  the now-redundant parameters. Also does not solve C1 (direct table access
  bypassing the function).
- **A separate idempotency-tracking table**, claimed via `INSERT ... ON
CONFLICT DO NOTHING` before any mutation. Rejected in favour of checking
  `transactions` itself after the portfolio lock: it reuses a lock the
  function already needs to take for H2, needs no new table, and gives the
  same replay-safety guarantee for both sequential and concurrent retries
  of the same key (see `docs/implementation/security-hardening.md` §5 for
  the live-database evidence this actually holds under a true concurrent
  retry, not just a sequential one).

## Future Review Criteria

If a fifth `record_*` function or a new financial-mutation path is added,
it must follow the same shape (`SECURITY DEFINER`, pinned `search_path`,
`auth.uid()`-derived owner, lock-then-compute, no derived-value parameters)
or explain in its own migration why it doesn't. If the two-copies-of-the-
arithmetic trade-off ever causes a real drift bug, that's the signal to
revisit whether the TypeScript copy should be deleted entirely (making the
RPC call the only way to learn the resulting values, at the cost of an
extra round trip for pre-flight UX).
