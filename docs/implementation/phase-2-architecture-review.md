# Architecture Review: Phase 2 — Investment Research Platform

**Date:** 2026-07-19 (findings), remediated 2026-07-19 (same day, follow-up session)
**Scope:** Commit `8927bcf` ("Add Phase 2: Investment Research Platform") on branch `foundation`,
plus the remediation work described in §8 below.
**Reviewer stance:** self-review at implementation time, written to be honest about
what is solid and what is deferred risk — not a sign-off document. Where this
review disagrees with the confidence of the completion summary given when the
milestone was announced, this document is the more careful statement.
**Status:** Six of nine findings closed this remediation pass (4.1, 4.3, 4.4,
4.5, 4.6, 4.7) — the ones the remediation milestone was explicitly scoped to.
Three remain open by deliberate scope decision, not oversight: 4.2
(lost-update race — closing it properly needs either optimistic-concurrency
retry or moving arithmetic into SQL, both bigger changes than this pass'
brief), 4.8 (repeated Server Action boilerplate), and 4.9 (no UI component
tests). See each finding's Resolution below, and §8 for the full remediation
record.

## 1. What This Reviews

Nine domains (`company`, `research`, `thesis`, `valuation`, `decision`,
`portfolio`, `trading`, `journal`, plus the `monitoring` read-model),
10 new database tables, and 9 UI screens. Full inventory is in the commit
itself; this document does not re-list every file — it assesses whether the
architecture holds together and where it doesn't yet.

## 2. Adherence to Stated Architecture Principles

| Principle (source)                                                                                 | Verdict              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business rules live in Domain, not UI (`CLAUDE.md`)                                                | ✅ Pass              | Every scoring/threshold/allocation calculation (`calculateInvestmentRating`, `calculatePortfolioAction`, `calculateOverallThesisStatus`, `calculateWeightedAverageCost`, `calculateValuationStatus`) is a pure function in `domain/*/model.ts` or a same-domain sibling file, exercised by unit tests with no framework in the loop.                                                                                                                                         |
| Dependency inversion (`domain-driven-design.md`)                                                   | ✅ Pass              | Every domain defines a `*Repository` interface; `infrastructure/database/*-repository.ts` is the only place that imports `@supabase/supabase-js` for these tables. Services never import Supabase types.                                                                                                                                                                                                                                                                     |
| No duplicated logic                                                                                | ✅ Mostly            | `calculateUnrealisedGainLoss` lives once, in `portfolio`, and `trading` is documented as intentionally not reimplementing it. The shared `VersionHistoryRepository` (`domain/shared/versioning.ts`) is used by `research`, `thesis`, and `valuation` rather than three bespoke implementations. **Exception noted in §4.4.**                                                                                                                                                 |
| Composition root (`provider-architecture.md`)                                                      | ✅ Pass              | `compose.ts` is still the one place concrete classes are constructed; it grew from 5 to 9 services without changing shape.                                                                                                                                                                                                                                                                                                                                                   |
| RLS on every new table, with a negative-path test (`development-roadmap.md` Phase 2 exit criteria) | ✅ Pass (remediated) | Validated live against a throwaway Homebrew PostgreSQL 16 instance (same approach as Foundation, no Docker) — see §8.2 for the full evidence log. All 10 Phase 2 tables plus the 4 new atomic RPC functions passed: cross-user SELECT/UPDATE/DELETE correctly blocked, append-only tables reject UPDATE/DELETE outright (no grant), `anon` has zero access, and RLS (not the RPC's `p_owner_id` parameter) is what actually enforces ownership on the transaction functions. |
| No mock data / no invented figures                                                                 | ✅ Pass              | `market` (price data) was deliberately not built; every current-price input (`buildCompanyMonitoringSnapshot`'s `currentPrice`, the Portfolio Engine's `currentPositionValue`) is a caller-supplied parameter, never a hardcoded or randomly generated number.                                                                                                                                                                                                               |

## 3. The Central Design Decision: ADR 0023 Threaded Correctly

The Investment Rating / Portfolio Action split (ADR 0023) was the one
instruction given with explicit architectural weight, so it gets the most
scrutiny here. Checked end-to-end:

- `decisionInputsSchema` and `DecisionRecommendation` (domain/decision) contain
  no `portfolioId`, no holding data, no cash figure — confirmed by reading the
  type definitions, not just the doc comments.
- `PortfolioActionInputs` (domain/portfolio/portfolio-engine.ts) takes
  `investmentRating` as a plain enum value, not a live call into
  `DecisionService` — the Portfolio Engine is a pure function over data the
  caller assembles, exactly as ADR 0023 specifies ("Research remains
  independent of portfolio implementation").
- The only place the two are joined is `PortfolioService.determineAction`,
  which is explicitly documented as taking pre-assembled inputs rather than
  reaching into `decision` itself.

This held up under review. It is the one part of this milestone I'd call
genuinely solid rather than provisionally solid.

## 4. Findings

Ordered by severity. "Severity" here means blast radius if left unaddressed
before real money/data flows through the system — not effort to fix.

### 4.1 Critical — Multi-write operations are not transactional — ✅ CLOSED

`TradingService.recordBuy` (and `recordSell`, `recordDividend`,
`recordCashAdjustment`) each perform three sequential, independently-awaited
writes: insert the transaction row, upsert the holding, update portfolio cash.
None of this is wrapped in a database transaction — `supabase-js` does not
provide one without an RPC/stored procedure, and none was written.

If the process crashes or the connection drops between the first write and the
second, the append-only ledger (source of truth) and the materialized holding
(read model) diverge silently — a recorded buy with no corresponding quantity
change, or vice versa. For a financial ledger this is the kind of bug that
doesn't surface until someone reconciles by hand and finds a discrepancy.

**Recommendation before this path handles real transactions:** move the
three writes into a single Postgres function (`SECURITY INVOKER`, called via
`.rpc()`), the same pattern already used elsewhere in this codebase for
privileged operations (the profile-provisioning trigger, ADR 0021), or add a
reconciliation job that recomputes holdings from the transaction ledger
(the ledger is append-only and complete, so holdings are always
re-derivable — this is a real advantage of the design worth using).

**Resolution:** Implemented exactly the recommended fix.
`supabase/migrations/20260719000014_atomic_transaction_functions.sql` adds
`record_buy_transaction`, `record_sell_transaction`,
`record_dividend_transaction`, and `record_cash_adjustment_transaction` —
each performs its ledger insert, holding update, and portfolio cash update
inside one `SECURITY INVOKER` Postgres function call, so an unhandled
exception at any point rolls back everything earlier in the same call.
`TradingService` (domain/trading/service.ts) now calls exactly one
repository method per operation instead of three; `TransactionRepository`'s
old generic `create()` method and `CreateTransactionData` type were removed
entirely rather than left as dead code. Verified two ways: (1) four new
unit tests in `domain/trading/service.test.ts` prove TradingService itself
has no code path that could apply a partial write (a fake repository that
fails before mutating anything); (2) live against real Postgres — see §8.2,
test 5b — a trigger was used to force a failure on the _third_ statement in
`record_buy_transaction`, after the cash debit and holding update had
already executed, and both were confirmed rolled back alongside the failure.
That second test is the strongest form of evidence for this finding: not
"it fails before writing," but "a late failure undoes earlier writes in the
same call."

### 4.2 High — Holding update is check-then-act, not atomic — ⚠️ NOT CLOSED (deliberately out of scope)

Within the same methods, `newQuantity`/`newAverageCost` are computed in
application code from a prior `getByCompanyId` read, then written back.
Two concurrent buys against the same holding (two browser tabs, a retried
request) can race: both read the same starting quantity, both compute an
update from it, the second write clobbers the first's effect. Single-user
usage makes this low-probability today, but it's a lost-update bug sitting in
financial state, not cosmetic state. Worth a `WHERE quantity = :expected`
optimistic-concurrency check (or folding into the same RPC as 4.1) before
multi-session use.

**Resolution:** Deliberately not closed in this pass, and the 4.1 fix does
**not** incidentally close it (correcting what §6's original recommendation
predicted). The new atomic functions take row locks (`for update`) on the
portfolio and holding _before_ writing, which prevents two concurrent calls
from interleaving their commits — but the final quantity/average-cost values
are still computed in TypeScript from an earlier, unlocked read, so a stale
read can still produce a wrong (though now atomically-written) result under
true concurrency. Properly closing this needs either an optimistic-concurrency
compare-and-swap (pass the previously-read quantity/cost into the function
and have it fail if the row no longer matches, with a bounded retry loop in
`TradingService`) or moving the weighted-average arithmetic into the SQL
function itself — the latter was deliberately rejected during this session's
design work because it would duplicate `calculateWeightedAverageCost`
(domain/trading/model.ts) in two places, contradicting this project's
"business rules live in the Domain" rule. This is now explicitly documented
in the migration's header comment rather than silently absent. Left as
tracked follow-up work, not silently dropped.

### 4.3 High — RLS is unvalidated for every Phase 2 table — ✅ CLOSED

Covered in §2's table; restated here because it's a compliance gap against
the roadmap's own exit criteria, not just a nice-to-have. The SQL follows the
Foundation migrations' pattern closely (same policy shapes, same explicit
`GRANT`/`REVOKE`), which lowers risk, but "follows the same pattern" and
"tested" are different claims. Before any of these tables hold real user
data, they need the same `psql`-against-a-throwaway-instance pass Foundation
got.

**Resolution:** Got exactly that pass. Full evidence log in §8.2 — every
Phase 2 table validated for cross-user isolation, append-only enforcement,
and `anon` denial, against a real (throwaway) PostgreSQL 16 instance. Zero
RLS or grant defects were found; the migrations as originally written were
correct. One real bug _was_ found and fixed during this process, but it was
in the new atomic-function migration, not in RLS: a custom error code
(`P0004`) collided with Postgres's reserved `ASSERT_FAILURE` condition,
which silently defeated every `exception when others` handler meant to
catch it anywhere it was used. Fixed by moving to a non-reserved `ALC0x`
code range — see §8.3.

### 4.4 Medium — `monitoring` deviates from the domain pattern without an ADR — ✅ CLOSED

Every other Phase 2 deliverable is a bounded context under `domain/`.
`monitoring` was implemented instead as an application-layer composer
(`application/services/monitoring.ts`) with no storage of its own, on the
reasoning that it owns no data and would otherwise duplicate fields already
owned by `research`/`thesis`/`valuation`/`decision`. That reasoning is sound
and matches the "no duplicated logic" rule, but it's a real architectural
choice — a deviation from the pattern the roadmap implies ("Monitoring
Dashboard" listed alongside `journal` and `portfolio` as a numbered
deliverable) — and it was made unilaterally, mid-implementation, without the
ADR treatment the codebase otherwise gives decisions like this. **This
deserves ADR 0024**, both to make the reasoning reviewable and because the
next engineer who sees `domain/journal/` but no `domain/monitoring/` will
reasonably wonder if something was missed.

**Resolution:** `docs/adr/0024-monitoring-as-application-composer.md` written
and indexed in `docs/adr/README.md`. The decision was formalized (kept), not
reversed — the reasoning held up under a proper Context/Decision/
Consequences/Alternatives writeup, and reversing it would mean either a
materialized cache to keep in sync with five domains (the exact duplication
problem the current design avoids) or a pass-through repository with no
independent behavior. The ADR also documents the two-composer split that
came out of the 4.5 fix below (`buildCompanyMonitoringSnapshot` for one
company, `buildCompanyMonitoringSnapshots` batch for many) as part of the
same architectural decision.

### 4.5 Medium — Dashboard is N+1 across companies — ✅ CLOSED

`DashboardPage` calls `buildCompanyMonitoringSnapshot` once per company via
`Promise.all`, and each call issues five parallel reads (research, thesis,
valuation, latest decision, journal entries). For 10 companies that's 50
round trips per dashboard load (parallelized, but still 50 queries against
Supabase's connection/request budget). Fine at the scale this was built and
tested at; will need a batched/joined query — or a materialized view refreshed
on write — before it's used with a real-sized watchlist (30–50+ companies).

**Resolution:** Added `listByCompanyIds` (research, thesis, valuation,
journal) and `listLatestByCompanyIds` (decision) to every relevant
repository — one query per domain for the _whole_ company list, not one per
domain per company. A new `buildCompanyMonitoringSnapshots` batch composer
(`application/services/monitoring.ts`) replaces the dashboard's
`Promise.all(companies.map(buildCompanyMonitoringSnapshot))` fan-out: for N
companies this is 5 queries total, not 5×N. This also fixed a second,
related problem the original design had: `buildCompanyMonitoringSnapshot`
uses each domain's `getOrCreate*` methods, so merely _viewing_ the dashboard
was silently creating empty research/thesis/valuation rows for every
company that didn't have one yet — an unwanted write from a read-only view.
The batch path uses read-only `listByCompanyIds` instead and represents "no
row yet" as `null` in a new `CompanyMonitoringSummary` type, rendered
honestly in the UI as "No thesis yet" / "Not yet valued" rather than a
fabricated `0`/`"stable"` default — consistent with the project's "no
invented data" principle. The single-company composer
(`buildCompanyMonitoringSnapshot`, still `getOrCreate`-based) is unchanged
and remains correct for its one actual caller, the Company Overview page,
where creating the default state on first view is the intended behavior.

### 4.6 Medium — UI silently assumes a single portfolio — ✅ CLOSED

The domain model (`PortfolioService.listPortfolios`) supports many portfolios
per user, matching how a real investor might separate accounts. Every screen
that consumes it (`/portfolio`, `/portfolio/transactions`) hardcodes
`portfolios[0]`, with no portfolio switcher. This isn't wrong for a
single-portfolio user, but it means the domain generalized ahead of the UI —
worth deciding deliberately (collapse the domain to one portfolio per user, or
build the switcher) rather than leaving the mismatch to accumulate.

**Resolution:** Built the switcher, via routing rather than a UI widget —
consistent with how `/companies` already works. `/portfolio` is now a list
of every portfolio the user has (mirroring the Companies list), linking to
`/portfolio/[id]` for that portfolio's cash/holdings detail (mirroring
Company Detail) and `/portfolio/[id]/transactions` for its ledger. The old
flat `/portfolio/transactions` route is gone; nothing hardcodes
`portfolios[0]` anymore. `createPortfolioAction` now redirects to the new
portfolio's own detail page after creation, matching the pattern
`createCompanyAction` already used. Verified via `next build`: the route
table shows `/portfolio/[id]` and `/portfolio/[id]/transactions` as dynamic
routes, and the full test suite plus typecheck/lint stayed clean through the
restructuring.

### 4.7 Low — Decision Journal has no cross-company view — ✅ CLOSED

Journal entries are only reachable per-company
(`/companies/[id]/journal`); there is no `/journal` screen listing every open
position's journal entry across the whole portfolio. The roadmap's UI list
implies "Decision Journal" as a screen in its own right, not only a company
sub-tab. Small gap, easy to close in Phase 3 UI polish.

**Resolution:** Added `JournalRepository.listByOwnerId` (one query, every
entry the user owns, no company/portfolio filter) and
`JournalService.listAllEntries`, plus a new top-level `/journal` page
listing every open position first, then closed positions, each linking back
to its company's own Journal tab (where the actual open/close forms still
live — this new page is a read-only aggregate, not a duplicate of that
logic). Added to the primary nav alongside Dashboard/Companies/Portfolio.

### 4.8 Low — Repeated auth/service boilerplate in Server Actions — not addressed this pass

Every action file repeats the same four lines (`createSupabaseServerClient`,
`getUser()`, null-check, `composeAppServices`). `portfolio/transactions/actions.ts`
factored this into a local `requireUserAndServices()` helper; the other ~9
action files did not follow suit. Not a correctness issue, but worth
extracting to `application/services` once a third near-identical copy would
otherwise be written, per this project's own YAGNI-but-not-past-three-copies
convention already used elsewhere (`docs/engineering-standards.md`).

**Resolution:** Not in scope for this remediation pass (the explicit
instruction list did not include it) and the new route files added during
4.6/4.7's fixes (`/portfolio/[id]/transactions/actions.ts`, `/journal`'s
page) follow the existing convention rather than introduce a new one — so
the count of near-identical copies grew slightly rather than shrinking.
Genuinely low-severity and still reasonable to defer to normal Phase 3
backlog grooming.

### 4.9 Low — No component tests for the ~30 new UI files — not addressed this pass

Foundation shipped 2 component tests (`empty-state-card`,
`sign-in-form`) alongside its e2e coverage. Phase 2 added roughly 30 new
Server/Client Components and zero component-level tests — coverage here is
entirely at the domain/service layer (157 tests) plus a full-suite production
build. The domain layer is genuinely well covered; the UI layer is verified
only by "it type-checks and builds," which catches wiring errors but not
behavioral ones (e.g., a form that submits the wrong field name).

**Resolution:** Not addressed — same reasoning as 4.8. The domain-layer test
count grew to 164 (four new atomicity/rollback tests, seven new/updated
monitoring batch tests) during this remediation, but no component-level
tests were added for `/portfolio/[id]`, `/journal`, or any other UI file.
Remains an honest gap.

## 5. What's Genuinely Solid

Worth stating plainly, not just for balance — these are real strengths, not
consolation notes:

- **The append-only ledger design** (`transactions`, `decision_recommendations`)
  means Trading's atomicity gap (4.1) is _recoverable_, not fatal: holdings can
  always be recomputed from the transaction history since nothing is ever
  overwritten. That recoverability is a direct payoff of the append-only
  pattern established in Foundation and reused deliberately here.
- **Version history's write-order** (`research`/`thesis`/`valuation` services
  all call `versionHistory.recordVersion()` _before_ applying the update) is
  safe under interruption in a way Trading's writes are not: a crash between
  the two calls produces at worst a redundant snapshot, never data loss. This
  wasn't accidental — it's the same ordering across all three domains that use
  it, which suggests the pattern was actually understood, not copy-pasted
  blind.
- **The decision-time snapshot in `journal`** (purchase price, fair value,
  conviction, thesis frozen at open) genuinely cannot drift, because the
  service only ever adds sale-time fields on close and the schema gives it no
  path to touch the purchase-time fields again.
- **Domain isolation held up under a cross-domain feature.** `monitoring`
  needed data from five domains and didn't cause any of them to import each
  other — everything stayed reachable only through each domain's own public
  service interface, Pick<>-narrowed at the point of use.

## 6. Recommendations Before Phase 3 (original) — Outcome

1. ~~Run the Foundation-style live RLS validation pass against all 10 Phase 2
   tables (closes 4.3).~~ **Done — §8.2.**
2. ~~Write a Postgres RPC for `recordBuy`/`recordSell`/`recordDividend`/
   `recordCashAdjustment` so the three-write sequence becomes one
   transaction (closes 4.1 and, as a side effect, most of 4.2).~~ **Done for
   4.1. Correction: it does NOT close 4.2 as a side effect — see 4.2's
   Resolution for why that original prediction was wrong.**
3. ~~Write ADR 0024 for the `monitoring`-as-composer decision, or reverse
   it~~ **Done — ADR 0024, decision kept.**
4. ~~Decide the single-vs-multi-portfolio question deliberately (closes
   4.6).~~ **Done — multi-portfolio routing built.**
5. Everything else in §4 (4.2, 4.8, 4.9) remains deferred to normal Phase 3
   backlog grooming, as originally recommended — plus 4.7, which turned out
   to be worth closing now rather than deferring (a cross-company Journal
   view was cheap once the batch-query infrastructure for 4.5 already
   existed).

### New recommendations before Phase 3, from this remediation pass

1. Closing 4.2 for real (optimistic-concurrency retry, most likely) before
   any multi-session/multi-device usage of Trading.
2. The N+1 fix's pattern (`listByCompanyIds` batch reads) should be the
   default for any future multi-entity view — don't repeat the
   `Promise.all(ids.map(getOne))` shape that caused 4.5.
3. Decide whether `/portfolio` needs a "default portfolio" concept once a
   user has several (e.g., for the Company Overview page's future holding
   display) — not needed yet since that page doesn't show holdings, but
   worth having an opinion on before it does.

## 7. Compliance Checklist Against Phase 2 Exit Criteria

From `docs/development-roadmap.md`'s Phase 2 exit criteria:

- [x] Track a company from first research through thesis, valuation, an
      explainable Investment Rating, a portfolio-aware Portfolio Action, an
      actual position with transactions, and a decision journal entry.
- [x] Full version history (research, thesis, valuation).
- [x] No invented data anywhere in the chain.
- [x] `pnpm check` clean.
- [x] Unit and integration tests passing (164/164 after remediation — see §8).
- [x] RLS proven correct on every new table with a negative-path test —
      **done in the remediation pass; see §8.2 for the full evidence log.**

## 8. Remediation Record

Everything in this section happened in a follow-up session, same day, in
response to explicit instructions to address the findings above. Recorded
here rather than in a separate document because a review whose findings are
fixed but not reflected in the review itself becomes actively misleading to
the next reader.

### 8.1 Trading atomicity (4.1)

- New migration: `supabase/migrations/20260719000014_atomic_transaction_functions.sql`
  — four `SECURITY INVOKER` Postgres functions, one per transaction type.
- `domain/trading/repository.ts`: `TransactionRepository` interface
  redesigned around `recordBuy`/`recordSell`/`recordDividend`/
  `recordCashAdjustment`, each taking the final computed values and
  returning the resulting ledger row. The old generic `create()` and
  `CreateTransactionData` were deleted, not deprecated.
- `domain/trading/service.ts`: `TradingService` still reads
  `HoldingRepository`/`PortfolioRepository` for validation and to compute
  `calculateWeightedAverageCost`/`calculateRealisedGain` results, but the
  write path is now one repository call per operation instead of three.
- `infrastructure/database/transaction-repository.ts`: each method is a
  single `.rpc()` call.
- `src/types/database.ts`: added a `Functions` block with typed
  `Args`/`Returns` for all four RPCs (previously `Record<string, never>`).
- Tests: `domain/trading/service.test.ts` rewritten with a
  `FakeAtomicTransactionRepository` that models the same
  all-or-nothing contract as the real functions, plus four new tests under
  "atomicity under a mid-operation failure" proving a simulated crash
  leaves cash, holdings, and the ledger completely untouched.

### 8.2 Live RLS + atomicity validation (4.3) — full evidence log

Environment: throwaway PostgreSQL 16 (Homebrew, no Docker — same approach
as Foundation, `docs/local-supabase-strategy.md`), a hand-written stub of
`auth.users`/`auth.uid()`/the `anon`/`authenticated` roles, all 14
migrations applied in order, then torn down after validation. Nothing from
this process persists except the corrected migration file itself (§8.3).

All assertions below either `RAISE NOTICE`d `PASS: ...` or `RAISE
EXCEPTION`d `FAIL: ...` (aborting the script with a nonzero exit) — nothing
was eyeballed from raw query output. Full run exited 0.

**RLS / grants (all 10 Phase 2 tables):**

- `anon` cannot `SELECT` from any of: `companies`, `entity_versions`,
  `research_notes`, `theses`, `valuations`, `decision_recommendations`,
  `portfolios`, `holdings`, `transactions`, `journal_entries` — confirmed
  via `insufficient_privilege` on every one.
- `companies`: user B cannot see, update, or delete user A's company (the
  delete attempt fails at the grant level — `permission denied for table
companies` — since no `DELETE` grant exists at all, a stronger guarantee
  than RLS row-filtering). User A can read and update their own.
- `decision_recommendations`, `entity_versions` (append-only): `UPDATE` and
  `DELETE` both rejected with `insufficient_privilege` for the owning user
  themselves — no grant exists, matching the immutability design. User B
  cannot see user A's rows.
- `portfolios`/`holdings`: user B's `UPDATE`/`DELETE` against user A's rows
  affect 0 rows.
- **`record_buy_transaction` — insufficient cash:** rejected with
  `insufficient cash for this purchase`; portfolio cash, holding quantity,
  and ledger row count confirmed byte-for-byte unchanged afterward.
- **`record_buy_transaction` — forced failure on the final statement:** a
  temporary trigger forced the ledger `INSERT` (the third and last
  statement) to fail after the cash debit and holding update (the first two
  statements) had already executed within the same function call. Cash and
  holding quantity were confirmed identical to their pre-call values
  afterward — the earlier writes were rolled back along with the later
  failure. This is the direct evidence for the atomicity claim in 4.1.
- **`record_buy_transaction` — success path:** a valid buy atomically
  produced a ledger row, an updated holding, and debited cash, all
  consistent with each other.
- **Cross-owner spoofing attempt:** user B called
  `record_buy_transaction` against user A's portfolio while passing user
  A's real ID as `p_owner_id` (simulating a compromised client lying about
  who it is). Rejected with `portfolio not found` — confirming RLS (via the
  session's actual `auth.uid()`), not the function's `p_owner_id`
  parameter, is what enforces ownership. A compromised client cannot
  escalate by lying about the owner argument.

### 8.3 Bug found and fixed during validation

The first draft of the atomic-function migration used `errcode = 'P0004'`
for "insufficient cash" and "cash adjustment would make the balance
negative." `P0004` is Postgres's reserved SQLSTATE for `ASSERT_FAILURE`,
which `exception when others` does **not** catch, by design (Postgres
deliberately excludes assertion failures from generic handlers). This
silently defeated every error-handling path meant to catch it — caught only
because the live validation script's own `exception when others` block
failed to catch the error and the raw exception surfaced instead of the
expected `PASS`/`FAIL` notice. Fixed by moving all custom error codes to a
non-reserved `ALC0x` range (`ALC01` not-found, `ALC02` insufficient
holding, `ALC03` insufficient cash/negative balance), with a comment in the
migration explaining why, so the mistake isn't repeated in a future
migration.

### 8.4 N+1 dashboard fix (4.5)

`listByCompanyIds` added to `ResearchRepository`, `ThesisRepository`,
`ValuationRepository`, `JournalRepository`; `listLatestByCompanyIds` added
to `DecisionRepository` — one query each instead of one per company.
`application/services/monitoring.ts` gained
`buildCompanyMonitoringSnapshots` (batch) and a new
`CompanyMonitoringSummary` type with nullable fields, so "no valuation yet"
renders honestly rather than as a fabricated `0`. `DashboardPage` switched
to the batch composer. Seven new tests in `monitoring.test.ts`.

### 8.5 Multi-portfolio UI (4.6)

`/portfolio` is now a list (like `/companies`); `/portfolio/[id]` is the
per-portfolio detail (cash, holdings); `/portfolio/[id]/transactions` is
that portfolio's ledger. The old flat `/portfolio/transactions` route was
deleted. `createPortfolioAction` redirects to the new portfolio's detail
page.

### 8.6 Cross-company Journal view (4.7)

`JournalRepository.listByOwnerId` / `JournalService.listAllEntries` added.
New `/journal` page lists every open position, then every closed position,
across all companies, linking back to each company's own Journal tab for
the actual open/close actions. Added to the primary nav.

### 8.7 ADR 0024 (4.4)

`docs/adr/0024-monitoring-as-application-composer.md` — the
`monitoring`-as-composer decision formalized and kept, with the two-composer
split (single vs. batch) from §8.4 documented as part of the same decision.
Indexed in `docs/adr/README.md`.

### 8.8 Final validation

`pnpm check` (format, lint, typecheck, test) clean; 164/164 tests passing
(up from 157 — four new atomicity tests, seven new/updated monitoring
tests); `next build` succeeds with the corrected route table
(`/portfolio/[id]`, `/portfolio/[id]/transactions`, `/journal` all present,
old `/portfolio/transactions` gone). See §9 for the full command output this
claim is based on.

## 9. Final Validation — Command Output

Run after every fix above, in this order, against the final state of the
branch:

**`pnpm check`** (`format:check && lint && typecheck && test`):

```
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!

$ eslint .
(no output — clean)

$ tsc --noEmit
(no output — clean)

$ vitest run
 Test Files  26 passed (26)
      Tests  164 passed (164)
```

**`next build`** (production build, includes its own `tsc` pass and static
generation):

```
✓ Compiled successfully in 2.3s
  Running TypeScript ...
  Finished TypeScript in 2.8s ...
✓ Generating static pages using 7 workers (11/11)

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /access-denied
├ ƒ /api/health
├ ƒ /companies
├ ƒ /companies/[id]
├ ƒ /companies/[id]/journal
├ ƒ /companies/[id]/research
├ ƒ /companies/[id]/thesis
├ ƒ /companies/[id]/valuation
├ ƒ /companies/new
├ ƒ /dashboard
├ ƒ /journal
├ ƒ /portfolio
├ ƒ /portfolio/[id]
├ ƒ /portfolio/[id]/transactions
├ ƒ /settings
└ ○ /sign-in
```

**`playwright test`** (the subset that doesn't require a live Supabase
project — see docs/implementation/foundation.md's original explanation of
this limitation, unchanged since Foundation):

```
✓ redirects an unauthenticated visitor from the dashboard to sign-in
✓ redirects an unauthenticated visitor from settings to sign-in
✓ redirects the root path toward sign-in for an unauthenticated visitor
✓ shows a custom not-found page for an unknown route
✓ shows the sign-in form with accessible labels
✓ shows a generic error message on failed sign-in
✓ the submit button returns to enabled after a failed attempt

7 passed
```

**Database**: the live RLS + atomicity validation in §8.2 (throwaway
PostgreSQL 16, all 14 migrations, exit code 0) — this is the "database
checks" component of full validation; there is no separate CI-integrated
database test suite in this project (see `docs/local-supabase-strategy.md`
for why: no linked Supabase project exists yet to run one against).

**What full validation does not cover**, stated plainly rather than
implied: the actual UI has not been clicked through in a browser against
real data, because no live Supabase project is linked (unchanged limitation
from Foundation, not introduced by this work). `next build` and the
Playwright subset above confirm the application compiles, type-checks, and
serves its unauthenticated routes correctly — they do not confirm a form
submission produces the right database row when a real user is signed in.
