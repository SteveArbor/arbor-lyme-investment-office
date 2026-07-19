# 0025. Optimistic Concurrency Control for Holding Writes

**Status:** Accepted

## Context

Phase 2 Architecture Review finding 4.2 (`docs/implementation/phase-2-architecture-review.md`):
`TradingService.recordBuy`/`recordSell` read a holding's quantity/average
cost, compute the new values in TypeScript
(`calculateWeightedAverageCost`/`calculateRealisedGain`), and pass the
computed result to an atomic Postgres function
(`record_buy_transaction`/`record_sell_transaction`, ADR-worthy in its own
right — see the finding 4.1 fix). That function guarantees the ledger
insert, holding write, and cash update commit together or not at all, but
it does not guarantee the holding write is based on _current_ data: two
concurrent buys against the same holding can both read the same starting
state, both compute an update from it, and the second write silently
clobbers the first's effect — a classic lost update.

Cash was never subject to this: `cash = cash - v_cost` is a delta
expressed inside the `UPDATE` statement itself, evaluated atomically
against whatever value is current when Postgres grants the row lock. Only
the holding's quantity/average cost — a weighted average that depends on
reading the _previous_ quantity and cost together in application code — is
at risk, because there is no way to express "blend this new purchase into
whatever the average cost currently is" as a single relational delta the
way `cash - v_cost` can be.

This project's serverless/PostgREST architecture (`docs/architecture.md`)
rules out the naive fix: a Server Action cannot hold a single Postgres
transaction open across the read and the later write, because each
`.from()`/`.rpc()` call from `supabase-js` is its own independent
round-trip/transaction — there is no live connection to keep a `BEGIN ...
SELECT FOR UPDATE ... <application code> ... COMMIT` sequence open across.

## Decision

**Optimistic concurrency control (compare-and-swap) with a bounded,
immediate retry — implemented entirely in the domain layer, with Postgres
only enforcing the guard mechanically.**

`record_buy_transaction`/`record_sell_transaction` (see
`supabase/migrations/20260720000001_optimistic_concurrency_for_holdings.sql`)
now take the holding's quantity/average cost as the caller read it
(`p_expected_holding_quantity`/`p_expected_holding_average_cost`) alongside
the values to write. The write is expressed as:

```sql
insert into holdings (...) values (...)
on conflict (portfolio_id, company_id) do update
  set quantity = excluded.quantity, average_cost = excluded.average_cost
  where holdings.quantity = p_expected_holding_quantity
    and holdings.average_cost = p_expected_holding_average_cost;
```

If the row no longer matches — another write committed first — zero rows
are affected and the function raises a distinct errcode (`ALC04`), which
`infrastructure/database/transaction-repository.ts` translates into
`ConcurrentModificationError` (`domain/shared/errors.ts`), a
framework-agnostic domain error type. `TradingService.recordBuy`/
`recordSell` catch it and retry — re-reading the holding, recomputing from
the now-current state, and trying again — up to
`MAX_CONCURRENT_WRITE_ATTEMPTS` (3) times before giving up and letting the
error surface.

The arithmetic (`calculateWeightedAverageCost`, `calculateRealisedGain`)
stays exactly where it was: in `domain/trading/model.ts`, computed in
TypeScript. The Postgres function's job remains purely mechanical — apply
this exact write if and only if the row still matches — never a second
copy of the averaging formula.

## Consequences

- The lost-update race is closed: verified against a live PostgreSQL 16
  instance with two genuinely concurrent sessions racing the same holding
  (not simulated in a single-threaded test). Session B (uncontested)
  succeeded immediately; Session A, whose write was based on a read that
  went stale while it slept, was rejected with the expected `ALC04`; a
  simulated retry with a fresh read then succeeded. The final holding
  state (23 shares, blended average cost) and transaction ledger (2 rows,
  one per session) exactly matched what both purchases should have
  produced — no corruption, no silently dropped write. Full transcript in
  `docs/implementation/phase-3-architecture-review.md`.
- Business arithmetic never moved into SQL — `domain/trading/model.ts`
  remains the single, tested source of truth for the weighted-average and
  realised-gain formulas, consistent with this project's "business rules
  live in the Domain" rule (`CLAUDE.md`, restated in ADR 0023's reasoning).
- A genuinely contended holding (many concurrent buys/sells against the
  same company in the same portfolio) now costs extra round trips under
  load — each conflict is a full read-compute-write retry, not a queued
  wait. Acceptable at this project's scale (personal/small-group use,
  `docs/architecture.md`'s stated scale target); would need revisiting
  before supporting many concurrent traders against one shared portfolio.
- No backoff between retry attempts. Deliberate: contention is expected to
  be rare and transient here, and each attempt is already a fresh
  read+recompute, so an immediate retry either resolves the conflict or
  reveals sustained contention that backoff wouldn't meaningfully help
  with at this scale. Worth adding if real usage ever shows otherwise (see
  Future Review Criteria).
- `recordSell`'s sufficiency check ("insufficient holding to sell") now
  runs fresh on every retry attempt, not once up front — a concurrent sell
  that drains the holding below what this call wants to sell is correctly
  caught as a real business-rule violation on retry, not silently retried
  against data that would fail anyway.

## Alternatives Considered

- **Move the averaging arithmetic into the SQL function, computed under
  the row lock** — would fully prevent the race (the read and write happen
  in the same locked statement) but duplicates
  `calculateWeightedAverageCost` in two languages that must be kept in
  sync by hand, with no test harness that checks them against each other
  on every change. Rejected as a direct violation of "business rules live
  in the Domain," a rule this project has held to consistently elsewhere
  (ADR 0023).
- **Pessimistic locking via a Postgres advisory lock, acquired before the
  TypeScript-side read** — would work, but requires either (a) a separate
  round trip to acquire the lock before the read, then another to release
  it after the write (two more round trips per operation, and a lock that
  must be correctly released even when the request errors or the
  serverless function is killed mid-flight — a real failure mode this
  project's stateless request model makes easy to get wrong), or (b) the
  same "hold a transaction open across a network round trip" problem this
  ADR's Context section already ruled out. Optimistic concurrency needs no
  held lock and degrades safely if a request simply never completes.
- **Do nothing (accept the race)** — the status quo the Phase 2 review
  flagged. Rejected: this is financial position data; a silently dropped
  purchase or sale is exactly the class of bug that goes unnoticed until
  someone reconciles by hand.
- **Unbounded retry with exponential backoff** — over-engineered for the
  actual contention level expected at this project's scale (a queueing
  strategy sized for high-throughput multi-writer systems, not a
  single-user or small-group investment tracker). A bounded, immediate
  retry is simpler and sufficient; revisit if real usage proves otherwise.

## Future Review Criteria

Revisit if: (a) real usage shows retries exhausting the 3-attempt budget
under normal (non-pathological) use, which would indicate either higher
contention than expected or a need for backoff; (b) the platform ever
needs to support many concurrent traders against a single shared
portfolio, which would favor revisiting pessimistic locking despite its
costs; or (c) `RecordSellData`/`RecordBuyData`'s `expectedHolding*` fields
prove awkward for a future caller that doesn't already hold a fresh read
(evaluated against a real use case, not speculatively now).
