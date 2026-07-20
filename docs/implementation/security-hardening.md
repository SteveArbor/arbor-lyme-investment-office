# Implementation Record: Phase 2 Security and Financial Integrity Hardening

**Date:** 2026-07-20
**Branch:** `foundation`
**Scope:** Closes C1, H1, H2, H3, H4, H5 from
`docs/implementation/staff-engineer-review.md`, plus objectives 2, 5, and 9
from the milestone brief (CHECK constraints, comprehensive test coverage,
`ConflictError`). Does not begin Phase 3. No live Supabase project was
connected — validated entirely against a throwaway local PostgreSQL 16
instance and the existing test suite, same methodology as
`docs/implementation/phase-2-architecture-review.md` §8.

## 1. Permissions changed (C1)

`supabase/migrations/20260719000015_transaction_integrity_hardening.sql`
narrows `authenticated`'s grants on the three financial tables from broad
table-level access to exactly what a non-ledger operation legitimately
needs:

| Table          | Before                           | After                                                                            |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `transactions` | `SELECT, INSERT`                 | `SELECT` only                                                                    |
| `holdings`     | `SELECT, INSERT, UPDATE, DELETE` | `SELECT`; `UPDATE` limited to the `target_allocation_percent` column             |
| `portfolios`   | `SELECT, INSERT, UPDATE, DELETE` | `SELECT`; `INSERT` limited to `owner_id, name, cash`; `UPDATE` limited to `name` |

`quantity`/`average_cost`/`cash` and every row of `transactions` are now
writable only by the four `record_*_transaction` functions. `FORCE ROW
LEVEL SECURITY` was also added to all three tables as a second, independent
layer — inert in production today (Supabase's function-owning role has
`BYPASSRLS`, confirmed against a role configuration matching production
during validation — see §8), but it costs nothing and would matter if that
role's privileges ever changed. The real enforcement is each function's
explicit `WHERE owner_id = v_owner_id` filter, not RLS — see §3.

Dead code that depended on direct holding writes was removed rather than
left to fail confusingly once the grants changed: `HoldingRepository
.upsertPosition`/`.delete` and `PortfolioService.recordPosition` (unreachable
from any Server Action already; the table comment in
`20260719000011_create_portfolios.sql` already documented Trading as the
intended sole writer).

## 2. Constraints added (Objective 2)

On `transactions`: `quantity > 0` (when present), `price_per_unit > 0` (when
present), `amount <> 0`, a sign-matches-type constraint (buy negative,
sell/dividend positive — `amount` is the ledger's signed cash effect, so a
literal unsigned `amount > 0` would reject every buy; see the migration's
header comment for why), and `realised_gain` only permitted on `sell` rows.
On `holdings`: `quantity > 0 or average_cost = 0`, making a fully-sold
position's meaningless nonzero average cost structurally impossible to
persist. All six were validated by attempting to insert a violating row
directly, bypassing the RPC layer entirely (§8, test group 2).

## 3. RPC trust boundary changes (H1)

The old signatures (`p_owner_id`, `p_new_holding_quantity`,
`p_new_holding_average_cost`, `p_realised_gain`) are dropped, not replaced —
`CREATE OR REPLACE` with a different parameter list creates a new overload
and leaves the old, exploitable signature both present and still granted.
The new functions:

- Derive `owner_id` from `auth.uid()` inside the function body — there is
  no owner parameter left for a client to lie about.
- Compute quantity, average cost, cash movement, and realised gain
  themselves, from a row locked earlier in the same call — never from a
  caller-supplied value.
- Changed from `SECURITY INVOKER` to `SECURITY DEFINER` (pinned
  `search_path`, following the precedent already set by
  `handle_new_user`/ADR 0021), because column-level grant restriction on
  `authenticated` means an invoker-rights function can no longer perform
  the write itself.

This reverses the Phase 2 Architecture Review's finding 4.2 resolution note,
which deliberately kept this arithmetic in TypeScript to avoid duplicating
domain logic. See ADR 0025 for the full reasoning and the trade-off this
accepts (the formula now exists in two places, cross-checked by both the
domain layer's own unit tests and the live-database parity evidence in §8,
test group 6).

## 4. Concurrency approach (H2)

Every function takes a `for update` lock on the owning portfolio row
**before** any read that feeds a calculation, and (for buy/sell) a second
lock on the holding row. This serializes every trading operation against a
given portfolio: a second concurrent call blocks until the first commits,
then reads the freshly-committed state — not a value captured before the
first call's lock was taken. This is the "row locking" option finding 4.2
named as one of two ways to close it properly.

Idempotency uses the same lock: the replay-key check happens **after** the
portfolio lock is acquired, so a retried call with the same key — sequential
or genuinely concurrent — blocks on the same lock, then finds the
already-committed transaction and returns it without re-applying the
mutation. A partial unique index on `(owner_id, idempotency_key)` is a hard
backstop, not the primary mechanism.

`TradingService` no longer computes or forwards derived values; it retains
a pre-flight cash/holding check purely for fast, friendly error messages,
now throwing `ConflictError` (§6) — the database re-validates authoritatively
regardless of what that check decided.

## 5. Errors changed (Objective 9)

`domain/shared/errors.ts` gained `ConflictError` (a `UserFacingError`
sibling of `ValidationError`, both exposing `.fieldErrors`), for operations
that fail against already-persisted state rather than malformed input:
insufficient cash, insufficient holding, a duplicate company ticker, an
already-closed journal entry. All 9 Server Action files were updated to
check `instanceof UserFacingError` instead of `instanceof ValidationError`
so `ConflictError` surfaces its message the same safe way. The database's
own `ALC02`/`ALC03` rejections are mapped to the same `ConflictError` by a
new `infrastructure/database/transaction-error-mapper.ts`, so a caller never
needs to know whether a pre-flight check or the database's authoritative
re-check caught the conflict.

## 6. Logging added (H5)

Every Server Action's catch block now logs unexpected (non-`UserFacingError`,
non-`NotFoundError`) failures via `src/lib/logger.ts` before returning a
generic message — action name, relevant IDs, the underlying error message,
never raw values shown to the user. `transaction-error-mapper.ts` does the
same for any RPC errcode outside the known `ALC0x` range. No sensitive
values (form input, stack traces) are included in any log call.

## 7. Audit sanitizer fix (H3)

`sanitizeAuditMetadata` now recurses into arrays, not just plain objects —
`sanitizeValue` is applied to every array element, so a sensitive key nested
inside an array (`{ items: [{ sessionToken: "..." }] }`) is stripped the
same as one nested inside a plain object. Four new regression tests in
`domain/audit/model.test.ts` cover this, including arrays nested inside
arrays and arrays of primitives (which must remain untouched).

## 8. Tests added

**Unit (Vitest, 170/170 passing, up from 164):**

- `domain/trading/service.test.ts` rewritten: the fake transaction
  repository now computes quantity/average cost/realised gain itself, from
  its own locked state, mirroring the SQL function's shape rather than
  accepting pre-computed values — there is no longer a way for a test (or
  `TradingService`) to hand it a value to blindly persist. New cases:
  `ConflictError` (not `ValidationError`) on insufficient cash/holding, and
  idempotency-key replay (same key → same transaction, cash debited once;
  different key → two independent transactions).
- `domain/company/service.test.ts`, `domain/journal/service.test.ts`:
  updated to expect `ConflictError` for duplicate ticker / already-closed
  entry.
- `domain/audit/model.test.ts`: array-recursion regression tests (§7).
- `domain/portfolio/service.test.ts`: replaced the removed
  `recordPosition` test with a target-allocation test plus a structural
  check that no direct quantity/average-cost write path remains on the
  service.

**Live database (throwaway PostgreSQL 16, hand-stubbed `auth.uid()`/
`auth.users`, non-superuser roles configured to match Supabase's actual
role privileges — `supabase_admin` has `BYPASSRLS` like real Supabase's
`postgres` role, `authenticated`/`anon` do not — torn down after the run;
nothing persists except the migration file itself): **32/32 checks
passing**, covering every category the milestone brief asked for:

1. Direct table writes rejected — INSERT on `transactions`, INSERT/UPDATE/
   DELETE on `holdings`, UPDATE of `portfolios.cash` — all denied at the
   grant level; renaming a portfolio and setting target allocation still
   work; `anon` denied on all three tables.
2. Invalid values rejected — zero/negative quantity, negative price,
   zero amount, wrong-signed amount, `realised_gain` on a non-sell row, a
   zero-quantity/nonzero-cost holding — all six via a direct INSERT as the
   table owner, bypassing the RPC layer, proving the CHECK constraints
   themselves reject these, not just the function's own pre-check.
3. The old 9-argument signature no longer resolves (`function does not
exist`) — proof the exploitable signature isn't just unused but gone.
4. Insufficient cash (`ALC03`) and insufficient holding (`ALC02`) raised
   correctly.
5. Cross-user isolation — user B calling against user A's portfolio ID gets
   `ALC01` (not found); A's cash is unchanged. There is no owner parameter
   left to spoof.
6. Correct server-side computation — two buys blend to the expected
   weighted average cost and debit cash correctly; a sell computes the
   expected realised gain — the parity evidence for ADR 0025's trade-off.
7. Idempotency — a replayed call with the same key returns the same
   transaction id without a second cash debit or ledger row; a different
   key produces a genuinely independent transaction.
8. Atomicity — a trigger-forced failure on the final INSERT (after the cash
   debit and holding upsert already executed within the same call) leaves
   cash and the holding completely unchanged, confirming the earlier writes
   rolled back with the later failure (re-validates 4.1's guarantee still
   holds after the rewrite).
9. **Concurrent buys** — two real, separate `psql` sessions, staggered
   0.5s apart, session A holding the portfolio lock for 2s before writing:
   session B's wall time (~1.5s) confirms it genuinely blocked rather than
   interleaving; final quantity/cash reflect both operations, not a lost
   update.
10. **Concurrent sells** — same pattern, two sells of 10 shares each from a
    holding of 20: final quantity is exactly 0 (both applied), average cost
    correctly reset to 0, and both produced their own ledger row.

Full transcript: `validation_output_final.log` (session-local, not
committed — regenerate by rerunning the harness described here against a
fresh throwaway instance).

## 9. Validation run

`pnpm check` (format, lint, typecheck, 170/170 unit tests) — clean.
`pnpm build` — clean, route table unchanged. `pnpm test:e2e` — 7/7 runnable
tests passing (1 skipped, pre-existing limitation, unchanged from
Foundation: needs real Supabase credentials). Live database validation —
32/32 checks passing (§8).

## 10. Remaining release risks

- **Two copies of the average-cost/realised-gain formula** (TypeScript and
  SQL) — an accepted trade-off (ADR 0025), not fully eliminated. A future
  change to the formula must be made in both places; nothing catches a
  drift automatically beyond the parity evidence gathered here and each
  side's own unit tests.
- **Idempotency is DB-level, not click-level.** The replay-safety mechanism
  is proven to work when the same key is presented twice, but no Server
  Action currently generates a _stable_ key across a literal double-click —
  `correlationId` (reused as the idempotency key) is freshly generated on
  every action invocation today. A genuinely double-clicked submit button
  still produces two distinct keys and two real transactions. Closing this
  needs a client-side stable key (e.g. a hidden form field set once per
  form mount) — a UI-layer change out of scope here since there is no live
  environment to click-test it against.
- **No live Supabase project exists.** Everything above is validated
  against a throwaway local instance and the app's own test suite, per
  the explicit instruction not to connect live data this pass. The first
  real click-through against a hosted project remains outstanding, as it
  has since Foundation.
- Items explicitly out of scope for this pass, per the Staff Engineer
  Review's own medium/low list (Server Action boilerplate duplication, no
  pagination on list queries, `proxy.ts`'s route matcher, CI not running
  e2e, the company-search PostgREST filter, no component tests) remain
  unchanged — tracked backlog, not overlooked.
