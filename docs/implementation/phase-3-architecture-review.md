# Architecture Review: Phase 3 Branch — Hardening Milestone

**Date:** 2026-07-20
**Scope:** Commit `11671cf` ("Remediate Phase 2 architecture review findings") through the
tip of the `phase-3` branch at the time of this review.
**Relationship to the roadmap:** this is **not** `docs/development-roadmap.md`'s Phase 3
(Document Repository) — see the note inserted into that document, restated here: the
`phase-3` git branch name is a coincidence of timing, not a redefinition of the roadmap's
phase numbering. This milestone closes the remaining findings from
`docs/implementation/phase-2-architecture-review.md` and extends the same review
discipline across the rest of the codebase, per explicit instruction, before any
roadmap-numbered Phase 3 work begins.
**Reviewer stance:** same as the Phase 2 review this one follows on from — honest about
what's closed, what's improved-but-not-perfect, and what's still open. Findings are
reported however this milestone actually left them, not smoothed over.

## 1. Outcome: All Nine Phase 2 Findings Now Closed

| Finding                                      | Status at end of Phase 2 remediation | Status now                                                                                                |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 4.1 Trading atomicity (Critical)             | Closed                               | Unchanged, still closed                                                                                   |
| 4.2 Holding lost-update race (High)          | Open, deliberately deferred          | **Closed — see §2**                                                                                       |
| 4.3 RLS unvalidated (High)                   | Closed                               | Unchanged, still closed; re-validated this milestone (§5)                                                 |
| 4.4 Monitoring ADR (Medium)                  | Closed                               | Unchanged, still closed                                                                                   |
| 4.5 Dashboard N+1 (Medium)                   | Closed                               | Unchanged, still closed; a **second, previously-unnoticed N+1** was found and fixed this milestone (§4.1) |
| 4.6 Single-portfolio UI (Medium)             | Closed                               | Unchanged, still closed                                                                                   |
| 4.7 No cross-company Journal view (Low)      | Closed                               | Unchanged, still closed                                                                                   |
| 4.8 Repeated Server Action boilerplate (Low) | Open, deliberately deferred          | **Closed — see §3**                                                                                       |
| 4.9 No UI component tests (Low)              | Open, deliberately deferred          | **Substantially closed — see §6** (representative coverage, not exhaustive; honest caveat below)          |

This milestone's own new findings (§4) are tracked the same way in §8.

## 2. Finding 4.2: Optimistic Concurrency for Holding Writes

Full reasoning in **ADR 0025** (`docs/adr/0025-optimistic-concurrency-for-holdings.md`);
summarized here with the verification evidence.

**What changed:** `record_buy_transaction`/`record_sell_transaction`
(`supabase/migrations/20260720000001_optimistic_concurrency_for_holdings.sql`) now take
the holding's quantity/average cost as the caller read it, and only apply the write if the
row still matches — a compare-and-swap on the one value that couldn't be expressed as a
safe relational delta (unlike cash, which was never actually at risk — see ADR 0025's
Context section for why). On a rejected write, `TradingService.recordBuy`/`recordSell`
re-read and retry, up to 3 attempts.

**Why this approach over the alternatives:** ADR 0025's Alternatives section covers this
in full; the short version is that moving the averaging arithmetic into SQL was rejected
as a direct violation of "business rules live in the Domain" (the same reasoning ADR 0023
already established), and pessimistic locking was rejected because this project's
serverless/PostgREST request model cannot hold a transaction open across the read and a
later write — each `.rpc()` call is its own round trip.

**Verification — this is the part worth being precise about, because it's easy to claim
"fixed" without actually proving it under real concurrency:**

- 7 new unit tests (`domain/trading/service.test.ts`) prove the retry loop re-reads and
  recomputes from fresh data (not just "retries at all") — including a test that
  deliberately mutates the underlying holding mid-call to simulate a genuine race, and
  asserts the retry's result reflects the concurrent write, not the original stale read.
  Also covers: retry exhaustion surfacing the conflict, zero retries when uncontested, a
  non-concurrency error never being retried, and `recordSell`'s sufficiency check running
  fresh on each attempt (a concurrent sell draining the holding is caught as a real
  business-rule violation on retry, not silently retried against data that would fail
  anyway).
- **Live, genuinely concurrent evidence** — not simulated in a single-threaded test:
  two separate `psql` processes were launched truly concurrently against a throwaway
  PostgreSQL 16 instance, both racing a buy against the same seeded holding (10 shares @
  20). Session B (no delay) won the race and committed 8 shares @ 30 immediately. Session
  A (artificially delayed 2 seconds before its write, simulating a read that went stale)
  was correctly rejected with the new `ALC04` errcode. A follow-up call simulating A's
  retry — re-reading the now-current state and recomputing — succeeded, producing a final
  holding of 23 shares at the correctly blended average cost, and a ledger with exactly
  two transaction rows (one per session). No corruption, no silently dropped write, no
  double-count. A separate check confirmed `anon` cannot execute the function at all (no
  `EXECUTE` grant) and a non-owning authenticated user cannot touch another owner's
  portfolio even when supplying a correctly-shaped call — RLS via `auth.uid()` is what
  actually enforces this, not the function's own parameters.
- A real bug was found and fixed during this validation, not before it: the first draft
  used Postgres's reserved `P0004` errcode for "insufficient cash," which collided with
  the built-in `ASSERT_FAILURE` condition — `exception when others` does not catch it, a
  deliberate Postgres safety behaviour. This silently defeated error handling everywhere
  that code was used. Caught because the live validation script's own error handling
  failed to catch the raised exception, surfacing the raw error instead of the expected
  pass/fail notice. Fixed by moving to a project-specific `ALC0x` errcode range,
  documented in the migration's header comment so the mistake isn't repeated.

**What this does not close:** nothing — 4.2 is now fully addressed within the scope ADR
0025 defines. The ADR's own Future Review Criteria (retry exhaustion under real usage,
many-concurrent-trader scale, awkwardness of the `expectedHolding*` fields for a future
caller) remain the honest boundary of what "closed" means here.

## 3. Finding 4.8: Server Action Boilerplate

`application/services/request-context.ts` adds `getRequestContext()` — one call replacing
the four-line
`createSupabaseServerClient()`/`auth.getUser()`/null-check/`composeAppServices()` sequence
that was repeated, with minor variations, across nine Server Action files. Returns `null`
on no session rather than imposing an error shape, so each action's own
`ActionFormState`/`CompanyFormState`/etc. return type stays under that file's control.

Applied to all nine files where the pattern existed:
`companies/actions.ts`, `companies/[id]/actions.ts`, `companies/[id]/journal/actions.ts`,
`companies/[id]/research/actions.ts`, `companies/[id]/thesis/actions.ts`,
`companies/[id]/valuation/actions.ts`, `portfolio/actions.ts`,
`portfolio/[id]/transactions/actions.ts`, `settings/actions.ts`.

**Deliberately not applied to `(auth)/actions.ts`**, documented in the helper's own
JSDoc: `signInAction` has no user yet by definition, and `signOutAction`'s not-signed-in
path is a no-op, not an error — both are genuinely different shapes than the "reject if
signed out" pattern this helper exists for. Forcing them through the same helper would
have been the wrong kind of consistency — uniform code shape at the cost of a wrong
abstraction for two genuinely different cases.

Verified with 2 new unit tests (`request-context.test.ts`, mocking `@/infrastructure/auth`
at the module boundary the same way `sign-in-form.test.tsx` already does) covering both
the no-session and has-session paths.

## 4. Findings From the Broader Codebase Review

Explicitly asked for beyond the tracked findings list — a general pass for
performance/consistency/maintainability issues. What was found and fixed:

### 4.1 A second N+1: portfolio detail page

`portfolio/[id]/page.tsx` fetched one company per holding via
`Promise.all(holdings.map(holding => companyService.getCompany(...)))` — the exact pattern
finding 4.5 already fixed for the Dashboard, just not noticed there at the time. Fixed by
adding `CompanyRepository.getByIds`/`CompanyService.getCompanies` (batch read, one query
for the whole holdings list) and using it. 2 new unit tests
(`domain/company/service.test.ts`) cover the batch read, including that it correctly
excludes a company owned by a different user.

### 4.2 A genuine duplicate fetch: company layout + overview page

`companies/[id]/layout.tsx` (for the page title/404 check) and
`companies/[id]/page.tsx` (for the full profile) both independently fetched the same
`Company` row on every request to the Overview screen. Fixed with React's `cache()` —
`get-company-or-not-found.ts` wraps the fetch so the two calls within the same request
share one, not two. This is request-scoped memoization only (not a cross-request cache) —
the standard, documented Next.js App Router pattern for exactly this layout/page
duplication. The Overview page's own two independent fetches (company, monitoring
snapshot) were also parallelized with `Promise.all` — they don't depend on each other and
were previously sequential for no reason.

### 4.3 Naming inconsistency across batch-read service methods

Three services added during the Phase 2 N+1 fix (`ResearchService`, `ThesisService`,
`ValuationService`) named their batch method `listByCompanyIds` — mirroring the repository
method name exactly. Every other service in the codebase uses a more domain-readable name
that doesn't mirror the repository (`CompanyService.listCompanies` over `list`,
`JournalService.listEntriesForCompany` over `listByCompanyId`). Renamed for consistency:
`listResearchForCompanies`, `listThesesForCompanies`, `listValuationsForCompanies`.
Repository-level method names were left as `listByCompanyIds` — repositories are lower-level
and consistently use more mechanical names throughout this codebase already.

### 4.4 Dead code: two unused label exports

`VALUATION_STATUS_LABELS` and `PORTFOLIO_ACTION_LABELS`
(`companies/[id]/labels.ts`) were defined but never referenced anywhere — `valuationStatus`
is always `null` in current usage (no caller supplies a `currentPrice`, correctly, since no
market-data source exists yet) and the Portfolio Engine's output has no UI surface at all
(see §8.1). Removed rather than left as speculative scaffolding.

### 4.5 Duplicated navigation-link rendering

`components/layout/site-nav.tsx` and `companies/[id]/company-sub-nav.tsx` had
byte-for-byte identical `usePathname`/`aria-current`/active-class logic, differing only in
their item list and outer layout classes. Extracted to a shared `components/ui/nav-links.tsx`.
Side effect worth noting: both nav wrapper components no longer need `"use client"`
themselves (only `NavLinks` does, for `usePathname`) — a small client-bundle reduction that
fell out of doing the extraction correctly, not a goal pursued for its own sake.

## 5. Re-Validated: RLS Still Correct

The Phase 2 remediation's live RLS validation (all 10 Phase 2 tables, append-only
enforcement, `anon` denial) was not re-run in full this milestone because no RLS policy
changed — only new functions were added, and those were validated directly (§2). The one
new database object with its own access-control surface (`record_buy_transaction`/
`record_sell_transaction`'s new signature) was checked explicitly: `anon` cannot execute
either function (no grant), and RLS — not the function's own parameters — is what blocks a
non-owning authenticated user, confirmed live.

## 6. UI Component Testing — Honest Scope

4 new test files, 25 new tests, chosen for the UI patterns that actually have logic worth
verifying rather than mechanically covering all ~30 UI files in the codebase:

- **`nav-links.test.tsx`** — the newly-extracted shared component (§4.5); covers both
  `SiteNav` and `CompanySubNav`'s active-link behaviour in one place now that they share
  an implementation.
- **`thesis-form.test.tsx`** — the most stateful UI in the codebase: dynamic add/remove of
  statement rows, and the hidden-input JSON serialization the form submission depends on.
  Verified the serialized value tracks live edits, not just the initial render.
- **`transaction-forms.test.tsx`** — tab-switching between buy/sell/dividend/cash
  adjustment, and the conditional "add a company first" messaging that depends on both the
  active tab and whether any companies exist.
- **`company-form.test.tsx`** — the baseline simple-form pattern (labelled required
  fields, defaults, disabled-until-interacted state) that `research-form`,
  `valuation-form`, `create-portfolio-form`, and `generate-rating-form` all share. Testing
  it once establishes the pattern is verified without duplicating near-identical
  assertions across four more files that would fail or pass together.

**What this does not cover:** the remaining ~25 UI files (most of the simple field-list
forms, all the read-only page components) have no dedicated component test — verified only
by `tsc`/`eslint`/`next build`, which catch wiring errors, not behavioural ones. This is a
smaller gap than before (zero coverage → coverage of every distinct interactive pattern in
the codebase) but not exhaustive, and shouldn't be described as such.

## 7. Documentation Updated

- **`docs/database-design.md`** — the implementation-status banner was badly stale (still
  said only `profiles`/`user_settings`/`audit_events` were implemented, despite Phase 2
  having shipped 10 more tables). Corrected, with pointers to the authoritative
  implementation records rather than duplicating the table list. Added a new section
  documenting the atomic-multi-table-write and optimistic-concurrency patterns (§2, §4.1
  of the Phase 2 review) as conventions future migrations should follow, including the
  `ALC0x`-not-`P000x` errcode lesson.
- **`docs/development-roadmap.md`** — added a note distinguishing this milestone (built on
  the `phase-3` git branch) from the roadmap's actual Phase 3 (Document Repository), which
  remains unbuilt and is still the next roadmap phase.
- **`docs/adr/0025-optimistic-concurrency-for-holdings.md`** — new, per §2.
- **`docs/adr/README.md`** — indexed.
- This document.

## 8. New Findings for Future Work

Not fixed this milestone — either genuinely out of scope (feature work, not
hardening/remediation) or low-severity enough to defer deliberately, same discipline as
the Phase 2 review's §4.8/4.9 were originally deferred.

### 8.1 The Portfolio Engine has no UI surface

`PortfolioService.determineAction`/`calculatePortfolioAction` — the `PortfolioAction`
output ADR 0023 specifically split out as its own concept — is fully implemented and
tested at the domain level but is never called from any page or Server Action. A user can
see an `InvestmentRating` (Company Overview) but never a computed `PortfolioAction`
anywhere in the UI. This is feature work (assembling `PortfolioActionInputs` from a real
holding + portfolio state + a `currentPrice` input, which itself doesn't exist yet since
no market-data source has been built), not something this hardening milestone's scope
covered — flagged here so it isn't mistaken for an oversight later.

### 8.2 `database-design.md`'s "Anticipated Core Entities" section is still partly stale

The banner was corrected (§7) but the entity list itself still describes a superseded
shape (`accounts`, `assets`, `positions`) that Phase 2 replaced with the simpler
`portfolios`/`holdings`/`transactions` design actually built. Left as historical planning
context per the banner's own note, but a full rewrite of that section — reflecting what
Phase 2 actually shipped — is worth doing before it misleads someone skimming only that
section.

### 8.3 Retry budget untested under sustained contention

`MAX_CONCURRENT_WRITE_ATTEMPTS` (3, ADR 0025) is verified correct under the concurrency
level this milestone could reasonably simulate (two racing sessions). Real behaviour under
sustained, high-frequency contention on a single holding is unverified — acceptable at
this project's current scale per ADR 0025's own reasoning, and its Future Review Criteria
already name this as the trigger for revisiting.

## 9. Final Validation

- `pnpm check` (format, lint, typecheck, test): clean. **195/195 tests passing** (up from
  164 at the start of this milestone — 31 new tests: 7 concurrency-retry, 2
  request-context, 2 company batch-read, plus 20 across the 4 new UI component test
  files).
- `next build`: succeeds, full route table unchanged from the Phase 2 remediation
  milestone (no routes added or removed this session).
- Playwright e2e smoke subset (the tests that don't require a live Supabase project — see
  `docs/implementation/foundation.md` for why that limitation exists and is unchanged):
  7/7 passing.
- Live database validation: all 15 migrations apply cleanly in sequence; the new
  optimistic-concurrency functions verified under genuine two-session concurrency (§2);
  `anon`/cross-owner access denial re-confirmed for the new function signature (§5).
- **What this does not cover**, stated plainly as the Phase 2 review did: the UI has not
  been clicked through in a browser against real data, because no live Supabase project is
  linked (unchanged limitation from Foundation, not introduced by this work).
