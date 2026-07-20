# Staff Engineer Review: Arbor Lyme Investment Office

**Date:** 2026-07-19
**Scope:** Full-repository review at the state of commit `11671cf`
("Remediate Phase 2 architecture review findings") — architecture, domain
model, ADRs, database design, API design, security, performance,
scalability, technical debt, test coverage, developer experience, coding
standards. Independent of, and in addition to, the self-review already
recorded in `docs/implementation/phase-2-architecture-review.md`.
**Status:** Findings below drove the "Security and Financial Integrity
Hardening" milestone recorded in
`docs/implementation/security-hardening.md`. C1, H1, H2, H3, H4, H5 are
closed by that milestone; remaining items are tracked backlog, not
oversights — see each finding's note.

## Critical

**C1 — The atomic-transaction RPCs were advisory, not enforced.**
`supabase/migrations/20260719000012_create_transactions.sql` and
`20260719000011_create_portfolios.sql` granted `authenticated` direct
table-level `INSERT` on `transactions` and `INSERT`/`UPDATE`/`DELETE` on
`holdings`/`portfolios`, and the atomic-RPC migration
(`20260719000014_atomic_transaction_functions.sql`) never revoked them.
Since Supabase exposes every table via PostgREST, a signed-in user's own
client could call `supabase.from('transactions').insert(...)` directly —
skipping `record_buy_transaction` entirely, bypassing zod validation, and
reintroducing the exact ledger/holding/cash desync the RPC work was built
to eliminate. `transactions` also had no CHECK constraint requiring
`quantity > 0` / `price_per_unit > 0` / `amount > 0`, so a negative-quantity
row could land straight in the append-only ledger.
**Status: closed** — `docs/implementation/security-hardening.md` §1, §2.

## High

**H1 — The RPCs trusted caller-supplied derived values.**
`record_buy_transaction`/`record_sell_transaction` accepted
`p_new_holding_quantity`/`p_new_holding_average_cost`/`p_realised_gain` as
opaque parameters and wrote them verbatim, with no SQL-side check that
they were arithmetically consistent with the raw `p_quantity`/
`p_price_per_unit`. A client that reached the RPC directly (see C1) could
supply values `calculateWeightedAverageCost` would never produce.
**Status: closed** — `docs/implementation/security-hardening.md` §3.

**H2 — Holding update remained check-then-act.**
`newQuantity`/`newAverageCost` were computed in TypeScript from a prior,
unlocked read, then written back — a lost-update race under true
concurrency (two browser tabs, a retried request). Phase 2 Architecture
Review finding 4.2 identified this and left it open by deliberate scope
decision.
**Status: closed** — `docs/implementation/security-hardening.md` §4.

**H3 — Audit sanitizer had a gap in its own security guarantee.**
`domain/audit/model.ts`'s `sanitizeAuditMetadata` recursed into plain
objects but explicitly excluded arrays from the recursive branch — a
sensitive key nested inside an array element (e.g.
`{ items: [{ sessionToken: "..." }] }`) passed through unsanitized. No
caller tripped it at review time, but it was a real defect in the one
component whose entire job is this guarantee.
**Status: closed** — `docs/implementation/security-hardening.md` §6.

**H4 — Stale "Not implemented" READMEs for three shipped domains.**
`src/domain/portfolio/README.md`, `trading/README.md`, `decision/README.md`
still said "do not import from this path" despite full, tested
implementations shipped in Phase 2. `company`/`thesis`/`valuation`/
`journal` correctly deleted their equivalent READMEs on implementation —
the convention existed, it just wasn't applied to these three.
**Status: closed** — READMEs removed, `docs/implementation/foundation.md`'s
stale "uncommitted" status line corrected.

**H5 — No server-side logging on any unexpected error path.**
`src/lib/logger.ts` was well-built but used in only 4 of 124 non-test
files. All 9 Server Actions caught unexpected errors and returned a
generic "Something went wrong" with no log call — for a financial-ledger
application, a failed real trade write would have been invisible in
production logs.
**Status: closed** — `docs/implementation/security-hardening.md` §7.

## Medium

- Error taxonomy conflated validation with business-rule conflicts (only
  `ValidationError`/`NotFoundError` existed). **Status: closed** —
  `ConflictError` introduced, see `docs/implementation/security-hardening.md` §9.
- Trading service bypassed `PortfolioService`, injecting raw repositories
  and re-implementing its not-found checks. Not addressed this pass —
  tracked backlog; low severity given the domain boundary (repository
  interfaces) already prevents cross-domain data corruption, this is a
  duplication/maintenance concern, not a correctness one.
- Unsanitized search input interpolated into a PostgREST filter string
  (`company-repository.ts`). Not addressed this pass — currently
  unreachable (no search UI wired), tracked backlog.
- No pagination on list queries (transactions, journal entries,
  companies). Not addressed this pass — tracked backlog, revisit before a
  real-sized ledger/watchlist.
- `proxy.ts` route matcher stale relative to the actual protected surface
  (only guards `/dashboard`/`/settings`). Not addressed this pass — masked
  by the layout's own server-side redirect (real defense-in-depth);
  tracked backlog.
- CI never runs e2e. Not addressed this pass — tracked backlog.
- Test fakes (`FakeVersionHistoryRepository`,
  `FakePortfolioRepository`/`FakeHoldingRepository`) copy-pasted across
  multiple domain test files instead of a shared test-utils module. Not
  addressed this pass — tracked backlog.
- Money/quantity math used positional same-typed `number` arguments with
  no branded types. Partially addressed as a side effect of the H1 fix:
  the weighted-average-cost and realised-gain arithmetic that used to flow
  through TypeScript-computed parameters now happens inside the database
  from locked reads, which removes the one call site (`TradingService`)
  where a transposed argument could have silently produced a wrong
  write. `calculateWeightedAverageCost`/`calculateRealisedGain` remain in
  `domain/trading/model.ts` as the reference implementation the database
  formula mirrors, still with positional arguments — tracked backlog if a
  new call site is ever added.
- Company ticker uniqueness is check-then-act with no DB-error translation
  on the race path. Not addressed this pass — tracked backlog; reclassified
  to `ConflictError` as part of the objective-9 error-taxonomy work, but
  the underlying race itself is unchanged.

## Nice to have

- No shared `ActionResult`/form-state type across Server Actions (each
  `actions.ts` redeclares an identical local interface). Not addressed —
  explicitly out of scope for this milestone (Phase 2 Architecture Review
  finding 4.8), consistent with that finding's own deferral.
- `company`/`research` lack a dedicated `model.test.ts`. Not addressed.
- Bleeding-edge dependency stack (Next 16.2, React 19.2, TypeScript 6.0.3,
  Tailwind 4) with no production deployments to date. Not addressed — a
  deployment-readiness concern, not a code change.
- `docs/local-supabase-strategy.md` documents only Foundation's 4 tables,
  not Phase 2's additional 10. Not addressed.

## What's genuinely solid

RLS was correct and efficiently written (`(select auth.uid())` initPlan
pattern) on every table; no service-role key anywhere; no floats for
money at the DB layer; no raw string-built SQL outside the one filter
issue noted above; zero `any`/`@ts-ignore`/TODO in `src/`; domain-level
test quality was genuinely good — real edge cases, not restated happy
paths; no circular domain imports; the append-only ledger design and
version-history write-ordering both held up under review as deliberate,
understood patterns rather than accidents.

## What would be redesigned if starting today

1. "The RPC is the only write path" should have been the rule from the
   first transactional table, enforced by revoking direct grants in the
   same migration that introduced the RPC — not retrofitted after the
   fact (C1 was a retrofit failure, not a design failure).
2. Fixed-point/decimal arithmetic in the domain layer, not native JS
   numbers, given DB columns are already `numeric`.
3. A three-tier error hierarchy (`ValidationError | ConflictError |
NotFoundError`) from day one, so Server Actions — and any future
   non-UI API — can map failures without string-sniffing.
4. Server Actions as the entire API surface is reasonable for a UI-only
   single-user app today, but Phase 7 (broker import) will need a real
   programmatic entry point; a thin route-handler layer behind the domain
   from the start would avoid a later retrofit.
5. A shared `requireUserAndServices()` + `ActionResult<T>` used by the
   first Server Action, not discovered midway and left unretrofitted.
