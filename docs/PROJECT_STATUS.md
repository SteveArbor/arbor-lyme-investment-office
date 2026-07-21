# Arbor Lyme Capital

## Project Status

**Last Updated:** 2026-07-21
**Current Version:** 0.1.0
**Current Branch:** `phase-4-investment-intelligence` (branched from `foundation` at `0f62681`)
**Current Milestone:** Phase 4 — Investment Intelligence (ADR 0033,
implementation complete and **browser-validated**, not yet committed)
**Overall Status:** Healthy. Phase 3.2 (FX Conversion and Live Quote
Propagation, ADR 0032) is complete and committed (`0f62681`, on
`foundation`). Phase 4 transforms the Dashboard from a portfolio-management
screen into an executive investment briefing: a deterministic, explainable
Portfolio Health score; Risk Overview (sector/country/currency exposure,
concentration warnings); an Opportunities panel (heuristic ranking,
explicitly not a valuation model); rule-based Portfolio Insights; an
Allocation Analysis table with a recommended action per holding; Recent
Activity and Upcoming Events (placeholder); Investment Journal
completeness tracking; and enhanced Company pages (position summary
across every portfolio, research completeness, journal entries, Documents
and Upcoming Events placeholders). Everything is built from data this
platform already owns — no AI, no new vendor, no invented figures.

Phase 3.2 (for reference, already committed): the FX-conversion gap Price
Engine Stage 1's live validation surfaced (a refreshed USD/EUR quote being
summed into portfolio totals as if it were GBP) was closed with a real
`FxRateProvider` (the European Central Bank's free daily reference-rate
feed), and currency conversion is built into the domain calculation layer
(`domain/portfolio/performance.ts`) as a single, structural choke point
rather than policed by convention. Persisted quotes and FX rates propagate
consistently across the Dashboard, Portfolio, and Company pages — none of
them ever call a vendor directly during ordinary rendering; every vendor
call happens exclusively inside the explicit "Refresh prices" action.
Manual price entry (for funds, and for ASML/WPP while Twelve Data's free
tier doesn't cover their exchanges) is genuinely persisted with a real
effective date/age, not ephemeral typing. Live-validated against the real
HL Stocks & Shares ISA: NVIDIA/Broadcom/AMD/TSMC/e.l.f. Beauty all convert
USD→GBP correctly at a single consistent rate; ASML/WPP remain correctly,
clearly manually priced.

Phase 4 is paused at a deliberate decision boundary: commit approval for
this milestone, on its own feature branch.

---

# Vision

Arbor Lyme Capital is a private, single-principal Investment Research
Operating System — a decision-support platform, not a trading platform.
Its purpose is to make every investment decision explainable and
reviewable: track a company from first research through a structured
thesis, an independent valuation, a deterministic and auditable Investment
Rating, a portfolio-aware position action, an actual transaction ledger,
and a Decision Journal that preserves the reasoning behind the decision at
the moment it was made. Research comes first; portfolio and transaction
management are downstream of it. AI (planned, not yet built) will
synthesize and narrate over this verified data — it will never compute a
figure a domain service already owns, and it will never place a trade. The
long-term goal is a durable, multi-year tool built to be trusted, not a
minimum-viable trading app.

The intended long-term evolution (`CLAUDE.md`'s "Long Term Vision"):
Foundation → Investment Research Platform → Production Readiness → AI
Research Assistant → Market Intelligence → Professional Reporting →
Automation → Institutional / Family Office capabilities. The first three
stages are complete (see below); everything from "AI Research Assistant"
onward maps onto the Outstanding Roadmap phases further down this
document, not a separate plan.

---

# Completed Milestones

**Phase 0 / 0.5 / 0.6 — Foundation Documentation & Extended Architecture**
_Complete, pre-implementation._ Vision, architecture, DDD structure,
provider/event/audit/settings design, decision/rules engine design, threat
model, data classification, the 14→8-phase roadmap, and ADRs 0001–0017.

**Phase 1 — Foundation** (auth, settings, audit)
Commits `2b69446`…`3584da2`, 2026-07-19. Next.js scaffolding; Supabase Auth
(no self-service sign-up); `settings`/`audit` bounded contexts; in-request
event bus; feature flags; `profiles`/`user_settings`/`audit_events` tables
with RLS (live-validated against a throwaway Postgres instance); sign-in,
dashboard, settings UI; security headers; CI; Dependabot.

**Phase 2 — Investment Research Platform**
Commits `8927bcf` (build), `11671cf` (remediation), 2026-07-19. The full
consolidated milestone: `company`, `research`, `thesis`, `valuation`,
`decision`, `portfolio`, `trading`, `journal` domains, plus `monitoring`
(ADR 0024, application-layer composer). 10 new tables, atomic
transaction RPCs for the trading ledger, multi-portfolio UI, cross-company
Journal view. ADR 0023 (Investment Rating vs. Portfolio Action split).

**Security and Financial Integrity Hardening** (unplanned, critical)
Commit `b731220`, 2026-07-20. Closed a critical gap the Phase 2 remediation
left open: direct table grants let a client bypass the atomic RPCs
entirely. Made the RPCs the sole write path for the ledger (`SECURITY
DEFINER`, owner derived from `auth.uid()`, no caller-supplied derived
values), added CHECK constraints, closed the holding-update race via
row-locked server-side computation, added `ConflictError`, idempotency-key
replay safety, recursive audit-metadata sanitization, and Server Action
error logging. ADR 0025. Live-tested against a throwaway Postgres instance
including real two-session concurrency.

**Phase 2.5 — Production Readiness**
Commit `3e307e9`, 2026-07-20. Provisioned a real Supabase project
(`arbor-lyme-capital-dev`), pushed all 16 migrations to it, seeded a
representative 7-company demo portfolio with every figure computed via the
app's own formulas, and exercised the complete application through a real
browser against that live project — including a live-verified atomic-RPC
trade and a live-verified `ConflictError` rejection. Fixed four UX/code
issues found along the way (fabricated "$0.00" valuation display, an N+1
query, missing loading states, a nav-destroying error boundary).

**ADR 0026 — Portfolio Accounting Principles**
Commit `9f8dc36`, 2026-07-20. Documentation-only ADR formalizing decisions
already embedded in `trading`/`portfolio`: cash is ledger-based only,
holdings are immutable through transactions, average-cost basis, cash-basis
dividends, and — at the time — no fee/tax tracking and no corporate-action
support (both later revisited; see Milestone 2.7 and ADR 0028 below).

**Milestone 2.7 — Portfolio Completion & User Experience Polish**
Commit `445a547`, 2026-07-20. Two-part milestone completing the Portfolio
module and substantially improving the application's usability, built on
the existing architecture with no new bounded contexts.

_Part 1 — Portfolio Completion:_ Ledger-based Cash Management (deposit/
withdrawal/correction/other, with a client-side balance preview before
submission and database-authoritative enforcement); `fee`/`interest`/`tax`
promoted to first-class `transactions.type` values alongside the existing
four (ADR 0028, supersedes ADR 0026's "fees not modeled" section);
`category`/`reference` columns added to `transactions`; a filtered, sorted,
paginated Transactions history with a per-transaction detail view; a new
Audit history for every transaction, closing a gap where `TransactionRecorded`
events were never actually published to the event bus; Portfolio
Performance domain calculations (`domain/portfolio/performance.ts`) —
market value, cost basis, unrealised/realised/total gain, XIRR
money-weighted return (ADR 0027), allocation vs. target, largest position/
gain/loss — assembled by a new `application/services/portfolio-performance.ts`
composer (ADR 0024's pattern) and rendered as a live, client-side
price-marking panel (no price is fetched, cached, or invented — "no
invented data" holds even here). 34 new tests (170 → 204), covering
fee/interest/tax recording, cash-adjustment categories, running-balance
computation, XIRR, portfolio/holding performance aggregation, input
validation, and the trading→audit event wiring.

_Part 2 — UX Polish:_ Dashboard rebuilt as a cross-portfolio daily
workspace (cash/holdings/return summary cards, a derived "High priority
actions" feed); Company navigation expanded to the full planned tab set
(Overview/Research/Financials/Valuation/Thesis/Journal/Documents/
Transactions/AI Analysis), with the four not-yet-built tabs as honest
`EmptyStateCard` placeholders and Transactions genuinely functional;
shared table primitives (`components/ui/table.tsx`) replacing ~5 copies of
the same hand-rolled table markup, with fully clickable rows and
`scope="col"` headers; the header logo enlarged ~33–50% and linked to
`/dashboard`; search/filter added to the Companies list; active-nav-state
matching fixed for sub-routes.

_Fixed along the way:_ the migration this milestone's own database work
depended on had been validated locally but never deployed to the live
Supabase project — caught during live browser testing (a `record_cash_adjustment_transaction`
call failing with "Could not find the function..."), diagnosed by calling
the RPC directly, and fixed with `supabase db push`. A second, independent
gap — trading Server Actions never published their domain event, so no
transaction was ever audited — was found by inspection while wiring the
new Audit history view and fixed alongside it. A pre-existing unsanitized
search-string interpolation in `company-repository.ts` (previously
dormant, no search UI called it) was fixed rather than left dormant now
that a Companies search UI exists.

**HL Stocks & Shares ISA Import**
Commit `c11b665`, 2026-07-21. Real portfolio data import, run via
authenticated throwaway scripts calling the same atomic RPCs the UI uses
(never a direct table write), reconciled exactly to source figures with
zero discrepancy. A new "HL Stocks & Shares ISA" portfolio (kept fully
separate from the existing Core Growth Portfolio demo data, per explicit
instruction) received: ten fund/OEIC holdings plus WPP as an opening
position and opening cash balance dated 20 July 2026; then six individual
buy transactions (NVIDIA, Broadcom, AMD, Taiwan Semiconductor ADR, ASML
Euronext Amsterdam ordinary shares, e.l.f. Beauty) sourced from a real
contract-note-style export, each with its own dealing fee/FX/tax recorded
explicitly and cash deducted at the exact net settlement figure. A new
`ASML.AS` company (Euronext, EUR) was created distinct from the
pre-existing NASDAQ/USD `ASML` demo company to preserve venue and currency
distinctions. The Dashboard/Portfolio UI gained a portfolio selector so the
two portfolios can be switched between; consolidated cross-portfolio
reporting is deferred to a future milestone. No historical transactions
were fabricated to reconcile Core Growth Portfolio's pre-existing demo
data — it was left untouched, exactly as instructed.

**ADR 0029 — Portfolio Rounding Policy**
Commit `c11b665`, 2026-07-21. Documentation-only ADR: round exactly once,
at the database column boundary or `src/lib/format.ts`'s formatters, never
in `domain/*`/`application/services/*`. Written after the HL import
surfaced an expected 1p gap between the platform's sum-then-round total and
the source spreadsheet's sum-of-already-rounded total. Identified (but,
per the ADR's own scope, did not fix) five UI files still calling raw
`.toFixed()` — see Technical Debt.

**Market Data Provider Evaluation**
Documentation-only, 2026-07-21 (folded into the ADR 0030 commit). Compared
Twelve Data, Financial Modeling Prep, and others against coverage,
reliability, cost, API limits, UK/US/EU support, mutual-fund support, and
future scalability. Recommended Twelve Data over the user's initial
instinct (FMP), with the key finding that no mainstream, affordably-priced
vendor covers UK OEIC/unit trust fund NAVs by SEDOL — that gap directly
shaped the Price Engine's staged design below.

**ADR 0030 — Price Engine Architecture**
Commit `aeb49a7`, 2026-07-21. Provider-neutral, security-type-routed
pricing architecture (interfaces only at this commit):
`PriceEngine`/`SecurityPriceProvider`/`FxRateProvider`/`QuoteRepository` in
`src/domain/market/`, refining (not reversing) ADR 0006's flat
`MarketDataProvider`. Staged: Stage 1 (exchange-traded securities, Twelve
Data) and Stage 2 (UK funds, backed by the existing manual-marking
workflow rather than a real vendor, since none is realistically priced).

**Price Engine Stage 1 Implementation**
Commit pending, 2026-07-21. Concrete implementation of ADR 0030's Stage 1,
documented in new **ADR 0031**: `TwelveDataPriceProvider` and
`TwelveDataMarketStatusProvider` (`src/infrastructure/market-data/`), a
shared Twelve Data HTTP client normalizing rate-limit/auth/unavailable
failures into domain errors, `RoutingPriceEngine`, a Postgres-backed
`QuoteRepository` (new `market_quotes` table, RLS, owner-scoped), a new
`companies.security_type` column (equity/etf/investment_trust/fund,
backfilled for the nine known fund holdings), price-quality metadata
(`real_time`/`delayed`/`previous_close`, inferred from market-open state —
Twelve Data doesn't expose the distinction per call), a pure
`calculateQuoteAge` function (age computed at render time from a persisted
timestamp, never frozen at fetch time), and a manual "Refresh prices"
button on the Portfolio Performance panel wired through a new Server
Action. Funds are explicitly excluded from this refresh path (Stage 2
scope). Scheduled/overnight refresh was explicitly not built this pass —
deferred to the next milestone per the instruction this work was scoped
under.

**Live validation (2026-07-21), against the real Twelve Data API and the
real Supabase project:** migration `20260721000001_add_security_type_and_market_quotes.sql`
pushed successfully (confirmed via `supabase migration list`, 18/18
applied). Manual refresh exercised against all six Stage 1 holdings in the
HL Stocks & Shares ISA plus WPP. Found and fixed three real defects:

1. **`getServerEnv()` never read `process.env`** — it parsed a hardcoded
   `{}`, so `TWELVE_DATA_API_KEY` was always `undefined` regardless of what
   `.env.local` held (every other var in this file follows the correct
   `env.public.ts` pattern; this one was written without ever being
   wired up). Every refresh failed identically with "Twelve Data rejected
   the configured credentials" until this was found and fixed.
2. **Twelve Data's error client discarded the vendor's real error message
   for any non-2xx HTTP status.** Twelve Data mixes two failure
   conventions — HTTP 200 with `{status:"error"}` in the body (the
   documented case) and, for plan-tier restrictions, a genuine non-2xx
   status *with the same informative body attached* — but the client only
   parsed the body on the 200 path, surfacing a bare "HTTP 404" instead of
   the vendor's actual "this symbol needs the Grow/Venture plan" message.
   Fixed by reading the body first regardless of status, before falling
   back to a bare status code.
3. **ASML's stored ticker/exchange (`ASML.AS` / "Euronext Amsterdam") — a
   deliberate suffix this schema's own `companies_owner_ticker_unique`
   constraint required, since the pre-existing Core Growth demo `ASML`
   already owns the bare "ASML" ticker for this owner — didn't match
   Twelve Data's own vocabulary** (bare `ASML` symbol + `exchange=Euronext`,
   confirmed via Twelve Data's `/symbol_search`). Fixed with a small,
   documented vendor-specific translation inside `TwelveDataPriceProvider`
   (strips the disambiguating suffix and aliases the exchange name only
   for the outbound Twelve Data request); the stored company record and
   every other layer of the platform are untouched.

**Result after fixes:** NVIDIA, Broadcom, AMD, Taiwan Semiconductor, and
e.l.f. Beauty all refreshed successfully — correct symbol, correct
exchange, live price, `previous_close` quality (US markets were closed at
test time), fresh quote timestamp, "just now" age, and a persisted
`market_quotes` row confirmed via direct query (native currency correctly
stored as USD throughout — the persistence layer never corrupted this).
ASML and WPP both correctly resolve to Twelve Data's real, informative
403-equivalent response: their listings require Twelve Data's paid
Grow/Venture plan, not a code defect. One refresh's application-code
latency was ~1.9s for 7 securities in parallel.

**Significant limitation found, not fixed this pass:** the Portfolio
Performance panel has never handled multi-currency holdings — it treats
every holding's price as being in the portfolio's base currency (GBP) with
no conversion step. This was latent but harmless while prices were
manually typed (a user naturally typed a GBP-equivalent figure); a live
USD quote from Twelve Data now flows into that same unconverted slot,
so the portfolio's headline "Market value"/"Unrealised gain"/"Total
portfolio value" are currently **numerically wrong** (inflated) for every
refreshed US-listed holding, e.g. NVIDIA's real $203.28 close is being
summed as if it were £203.28. ADR 0030 already designed the fix (a
separate, explicit `FxRateProvider` + conversion step) but it was
deliberately deferred, not built. This is the clear top priority for the
next milestone, and the feature should not be relied on for actual
portfolio monitoring involving non-GBP holdings until it's addressed. See
ADR 0031 (updated) and Technical Debt below.

221/221 unit tests passing before live validation; 231/231 after the three
fixes above (10 more new tests covering the client's error-mapping and the
Twelve Data symbol-translation logic). Lint/typecheck/build all clean
throughout.

**Phase 3.2 — FX Conversion and Live Quote Propagation**
Commit pending, 2026-07-21. Closes the currency-conversion gap this
milestone's own live validation found (above), and propagates persisted
quotes consistently across the whole application rather than one panel.

_Part 1 — FX Conversion (ADR 0032):_ `EcbFxRateProvider`
(`infrastructure/market-data/`) — the European Central Bank's free daily
reference-rate feed, chosen over Twelve Data's own paid-tier-gated FX
endpoints and over Bank of England data (documented provider evaluation)
because a once-daily official reference rate is the right shape of data
for a decision-support platform, not a trading system. One HTTP call
answers every currency pair needed; USD→GBP is computed as a cross-rate
through EUR. New `fx_rates` table (`SupabaseFxRateRepository`,
owner-scoped, "last known good," never deleted on a failed refresh, same
pattern as `market_quotes`). `domain/portfolio/performance.ts` extended
so every holding carries its own `currency`/`fxRateToBase`/
`currentPriceBase`, converting exactly once per holding before any
aggregation — GBP→GBP is a true identity conversion, and a holding whose
FX rate is genuinely unavailable is shown at cost (never at an
unconverted or guessed price) rather than risk summing two different
currencies. Cost basis confirmed (against the real HL ledger, not
assumed) to already be stored in GBP at each trade's historical rate — no
historical transaction was altered. Daily gain/percentage added at both
holding and portfolio level, sourced from Twelve Data's own
`previous_close` field (no new historical-price storage built).

_Part 2 — Live Quote Propagation:_ a new shared composer,
`application/services/portfolio-valuation.ts`, joins ledger data +
persisted quotes + persisted FX rates into one converted, render-ready
view — used identically by the Portfolio Performance panel, the
Dashboard, and (for a single company) the Company overview page, so none
of them can ever disagree about how a holding was converted. **No page
calls Twelve Data or ECB directly during ordinary rendering** — every
vendor call happens exclusively inside the "Refresh prices" action
(`refreshMarketDataAction`, which now refreshes quotes *and* FX rates
together, with the same per-item resilience as before: one failure never
blocks the rest, and a failed refresh never erases a valid prior value).
Manual price entry (funds, plus ASML/WPP while ungated Twelve Data
coverage doesn't exist) is now genuinely persisted — a new `manual`
`PriceQuality` value and `saveManualPrice` service write straight to
`QuoteRepository` (never through `PriceEngine`) with a real effective
timestamp, replacing Milestone 2.7's explicitly ephemeral "prices you
edit are not saved" typing.

**Live-validated** against the real HL Stocks & Shares ISA: NVIDIA,
Broadcom, TSMC, AMD, and e.l.f. Beauty all converted USD→GBP correctly at
one consistent rate (~0.7429, cross-checked by hand against the ECB
feed); ASML and WPP correctly remained manually priced (EUR and GBP
respectively) with a working save flow, live-tested end to end
(including the manual EUR price itself being correctly converted to GBP
using the same in-effect rate). Dashboard and Portfolio page agreed
exactly on every total. 37 test files / 268 tests passing (36 new since
Stage 1); lint/typecheck/build all clean.

**Known, disclosed limitations (see ADR 0032 and Technical Debt):** daily
change is computed using *today's* FX rate applied to yesterday's price
(no FX rate history is maintained — out of scope this milestone); the
Dashboard's "largest daily gainer/loser" can mislabel the smallest gain as
a "loser" when every holding moved the same direction on the day — the
same pre-existing convention `largestGain`/`largestLoss` (unrealised)
already used, kept for consistency rather than fixed in isolation.

**Phase 4 — Investment Intelligence**
Commit pending, 2026-07-21, on branch `phase-4-investment-intelligence`.
Turns the Dashboard from a portfolio-management screen into an executive
investment briefing (ADR 0033) — every panel built from data this
platform already owns, combined with deterministic rules; no AI, no new
vendor dependency, nothing fabricated.

_New domain logic (`domain/portfolio/`):_ `health.ts` (Portfolio Health —
8 weighted, independently-explainable factors: diversification, cash
allocation, sector/country/single-position concentration, liquidity,
drift, missing research — combined into a 0–10 score, the same
deterministic-and-explainable philosophy ADR 0023's Investment Rating
already established); `risk.ts` (sector/country/currency exposure
aggregation, concentration warnings against documented threshold
guidelines); `opportunities.ts` (heuristic ranking — highest-conviction
underweight, largest absolute/relative underweight, most attractive
recent performer, cash available for deployment — explicitly a
placeholder until a real valuation model exists, per the brief's own
instruction); `insights.ts` (rule-based plain-English observations,
reusing `risk.ts`'s warnings rather than re-deriving thresholds);
`allocation.ts` (a deterministic increase/reduce/hold/watch recommendation
per holding, with a `watch` override for a broken thesis or a sell/avoid
rating regardless of drift). `domain/company/model.ts` gained
`deriveCountryFromExchange` (a documented heuristic — NASDAQ/NYSE→United
States, LSE→United Kingdom, Euronext Amsterdam→Netherlands — avoiding a
new company data field for country exposure). `domain/journal/model.ts`
gained `calculateJournalCompleteness` (six fields created atomically
together by the existing journal-entry schema, so completeness is really
"does an entry exist" for those six; `reviewDate` has no backing column
and is always honestly reported absent — a disclosed gap, not an invented
value).

_New application composer:_ `application/services/portfolio-intelligence.ts`'s
`buildPortfolioIntelligence` assembles Health/Risk/Opportunities/Insights/
Allocation from `buildPortfolioValuation` (ADR 0032) output plus company
monitoring snapshots (ADR 0024) — accepts one or more portfolios so the
Dashboard's existing "All portfolios" view gets the same intelligence a
single portfolio does. **Known, disclosed limitation:** holdings are not
deduplicated by company across portfolios when combined — the same
company held in two portfolios (this platform's own real accounts do
this) produces two rows and slightly undercounts "largest single
position"/drift; sector/country/currency totals are unaffected. Selecting
a single portfolio never hits this. See ADR 0033.

_UI:_ Dashboard rebuilt (`dashboard/page.tsx` + new
`dashboard/intelligence-panels.tsx`) with Top Summary (10 figures
including Today's/Total Gain in £ and %, Cash Allocation %), Portfolio
Health card, Allocation Analysis table, Opportunities panel, Risk
Overview (sector/country/currency bars + concentration warnings),
Portfolio Insights, Recent Activity (real transactions), Investment
Journal completeness list, and an honest Upcoming Events placeholder (no
fabricated dates). Company pages enhanced with a Position Summary table
(market value/allocation/return per portfolio, correctly recomputed
against each portfolio's own total — not reused from a different
portfolio's percentage), a real Research Completeness checklist (research
notes/thesis/valuation/rating/journal — computed from actual domain data,
not a placeholder), a Journal Entries summary, and honest Documents
(Phase 3, not started) / Upcoming Events (Phase 5) placeholders. No
charting library added — allocation/exposure bars are plain CSS.

Live-validated in the browser: Portfolio Health scored and explained
correctly for both a single portfolio and "All portfolios" combined; Risk
Overview correctly flagged real concentration (GBP 63.3%, Fixed Income
38.8%, Technology 32.2%, each above its guideline) against the live HL
portfolio; Allocation Analysis and Opportunities correctly reflected that
every HL holding currently has a 0% target allocation (a real, pre-
existing data gap — no target allocations were ever set for the real
import — not a code defect); Company page Position Summary correctly
showed NVIDIA's two different allocation percentages in Core Growth
Portfolio (14.8%) vs HL Stocks & Shares ISA (8.0%), each against its own
portfolio total. One real bug found and fixed during validation: a
React duplicate-key warning in the Allocation Analysis table, caused by
the disclosed cross-portfolio non-deduplication above — fixed by keying
each row on `companyId` plus its array index. 44 test files / 314 tests
passing (46 new since Phase 3.2); lint/typecheck/build all clean.

---

# Current Architecture

**Domain-Driven Design.** Each bounded context under `src/domain/*`
(`company`, `research`, `thesis`, `valuation`, `decision`, `portfolio`,
`trading`, `journal`, `settings`, `audit`) owns its own model, service, and
repository interface, with zero framework imports — see
`docs/domain-driven-design.md`. `monitoring` is deliberately not a bounded
context; it's an application-layer composer over the six domains it reads
(ADR 0024).

**Clean Architecture boundaries.** Dependencies point one way:
`app/` (composition, no business logic) → `domain/` (business rules,
framework-free) ← `infrastructure/` (implements domain-defined repository
interfaces). `application/services/compose.ts` is the single composition
root. See `docs/domain-driven-design.md`.

**Database architecture.** Single PostgreSQL database (Supabase-hosted),
13 tables, RLS on every table, append-only ledgers where correction should
never overwrite history (`transactions`, `decision_recommendations`,
`entity_versions`, `audit_events`). The trading ledger's three-way write
(transaction/holding/cash) is atomic and server-computed via `SECURITY
DEFINER` Postgres functions — the only path able to touch that state at
all; see ADR 0025 and `docs/database-design.md`. Extended in Milestone 2.7
with three more atomic functions (`record_fee_transaction`/
`record_interest_transaction`/`record_tax_transaction`) following the same
pattern, plus `category`/`reference` columns on `transactions` (ADR 0028).

**Security model.** RLS plus explicit `owner_id = auth.uid()` filtering
inside every privileged function (not reliant on RLS alone — ADR 0025);
column-level grants restricting `authenticated` to exactly the
non-financial fields the UI writes directly; no service-role client
anywhere in application code (ADR 0021); baseline (not nonce-based) CSP
(ADR 0022, accepted trade-off); `ConflictError`/`ValidationError`/
`NotFoundError` taxonomy for safe, specific error surfacing. Full history
in `docs/threat-model.md`.

**Authentication.** Supabase Auth, no public sign-up route — every user is
created via the Auth Admin API or dashboard (ADR 0021, database-trigger
profile provisioning, live-verified on real Supabase Auth during Phase
2.5).

**Event architecture.** In-process publish/subscribe is implemented and
proven (`SettingsChanged` and, since Milestone 2.7, `TransactionRecorded`
→ audit, `src/infrastructure/events/`); the durable/outbox tier for
cross-request delivery is designed (`docs/event-system.md`) but not
built — nothing yet needs it.

**Decision Engine.** Deterministic, explainable scoring
(`calculateQualityScore`/`calculateValuationScore`/`calculateOverallScore`
→ `InvestmentRating`), never portfolio-aware — portfolio-awareness is a
separate downstream step (`PortfolioAction`, ADR 0023). No AI in this
path, by design.

**AI architecture.** Planned (Phase 4), not built. The `AIProvider`
interface and dependency-inversion pattern are designed
(`docs/provider-architecture.md`, ADR 0010); no implementation exists yet.
The standing rule for when it does: AI consumes verified output from
`analytics`/`decision`/`valuation`, never computes a figure those domains
already own.

---

# Infrastructure

| Component      | Status      | Notes                                                                                                                                                       |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js        | Implemented | 16.2.10, App Router, Server Actions as the entire API surface today.                                                                                        |
| Supabase       | Implemented | Live dev project `arbor-lyme-capital-dev` (us-east-1), provisioned Phase 2.5.                                                                               |
| PostgreSQL     | Implemented | 19 migrations applied to the live project, confirmed via `supabase migration list` (`fx_rates` table + `market_quotes` extensions pushed and live-verified this milestone). RLS + atomic RPCs throughout. |
| Authentication | Implemented | Supabase Auth, admin-provisioned users only, trigger-based profile creation.                                                                                |
| Hosting        | Planned     | No Vercel project exists yet; `docs/vercel-preparation.md` is prep-only.                                                                                    |
| CI/CD          | Partial     | GitHub Actions runs format/lint/typecheck/unit tests/audit/build; no e2e in CI; no deploy pipeline (no host to deploy to yet).                              |
| Testing        | Partial     | 314 unit tests, 7/8 e2e (1 skipped, needs live creds — now available), live DB integration validation both throwaway and real, plus full manual browser passes against live infrastructure. No component-level UI tests. |
| Logging        | Implemented | Structured logger (`src/lib/logger.ts`), used in Server Action catch blocks and the RPC error mapper.                                                       |
| Monitoring     | Planned     | No APM/observability platform beyond application logs; no alerting.                                                                                         |
| Market data    | Implemented, live-verified | Price Engine Stage 1 (Twelve Data, exchange-traded securities) + FX conversion (ECB daily reference rates, ADR 0032) both live-verified against the real HL Stocks & Shares ISA: NVIDIA/Broadcom/AMD/TSMC/e.l.f. Beauty refresh and convert to GBP correctly; ASML/WPP correctly, persistently manually priced (Twelve Data's free tier doesn't cover their exchanges). Dashboard/Portfolio/Company pages all read persisted data only — no vendor call outside the explicit refresh action. Stage 2 (fund NAVs) and scheduled refresh both still deferred. |

---

# Production Readiness

**Security:** RLS + hardened, `SECURITY DEFINER` atomic RPCs live-validated
on real infrastructure (Phase 2.5), including a live-triggered
`ConflictError` rejection. **Financial integrity:** the trading ledger's
atomicity, server-side computation, and concurrency safety were proven
against a throwaway instance (two real concurrent sessions) and then
live-verified with a real trade against the production-shaped project;
Milestone 2.7 extended this to fee/interest/tax/categorised cash
adjustments with the same pattern, and closed a gap where financial writes
were never actually audited (trading Server Actions weren't publishing
their domain event to the event bus — fixed and live-verified). **Testing:**
204 unit tests, 7 runnable e2e tests, 32/32 live database integration
checks (permissions, constraints, concurrency, replay safety). **Browser
validation:** a complete manual click-through against the live project in
Phase 2.5, and a second full pass in Milestone 2.7 covering Cash
Management, the Portfolio Performance panel's live price-marking
recalculation, the Transactions history/detail/audit-history views, and
the Companies search/filter — which is what caught the undeployed
migration (see Milestone 2.7 above). **Performance:** a code-level review
found and fixed the N+1/missing-loading-state issues most likely to matter
at this app's scale; no load testing has been done (not yet meaningful at
single-user scale). **Operational readiness:** no hosting, no monitoring/
alerting, no deployment pipeline — the application has only ever run
locally against the live database.

**Remaining production risks:** no click-level (only DB-level) idempotency
against a literal double-submit; no Vercel project or staging deployment;
per-field validation error messages are collapsed to one generic banner;
Server Action boilerplate duplication across ~13 files; two independent
implementations of the weighted-average-cost formula (TS pre-flight, SQL
authoritative — a deliberate ADR 0025 trade-off, not an oversight); no
automated check that every local migration has actually been pushed to the
live project (the exact gap Milestone 2.7's browser testing caught by
hand — `supabase migration list` is the manual check until this is
automated).

---

# Technical Debt

**High**

- **Click-level idempotency gap.** DB-level replay safety is proven; no
  Server Action yet generates a _stable_ key across a literal double
  submit. _Deferred:_ needs client-side UI work with no live environment
  to test the click path against at the time it was found. _Target:_
  before any multi-user or higher-stakes trading use.

**Medium**

- **Two copies of the average-cost/realised-gain formula** (TypeScript
  pre-flight, SQL authoritative). _Deferred:_ deliberate ADR 0025
  trade-off to close a critical security gap; cannot be enforced at
  compile time. _Target:_ revisit only if a real drift bug ever occurs.
- **`TradingService` bypasses `PortfolioService`**, injecting raw
  repositories and duplicating its not-found checks. _Deferred:_ low
  severity, duplication risk not a correctness issue. _Target:_ Phase 3
  backlog grooming.
- **Transactions still has no pagination on the two remaining unfiltered
  reads** (`listTransactions`/`listTransactionsForCompany`, used for the
  running-balance computation and the company-scoped Transactions tab) —
  the main Transactions history itself gained filtering/sorting/pagination
  in Milestone 2.7 (`listTransactionsFiltered`); journal entries and the
  companies list remain unpaginated too. _Deferred:_ not yet a real
  problem at this app's data volume. _Target:_ before a real-sized
  transaction history/watchlist.
- **Server Action auth/service boilerplate duplicated** across ~13 action
  files (was ~10; Milestone 2.7 added three more record-transaction
  actions following the same pattern rather than extracting it, since
  extracting mid-milestone would have touched every existing trading
  action too). _Deferred:_ this project's own convention is to extract
  after a third near-identical copy, well exceeded. _Target:_ next
  UI-touching milestone.
- **CI does not run e2e tests.** _Deferred:_ not blocking, but the one
  place e2e coverage would catch a real regression runs on the honor
  system. _Target:_ near-term CI improvement, low effort.
- **No automated check that a local migration has been pushed to the live
  project.** Milestone 2.7's own migration
  (`20260720000001_cash_management_and_performance.sql`) was validated
  against a throwaway Postgres instance but not deployed to the live
  Supabase project until live browser testing caught the resulting RPC
  failure by hand. _Deferred:_ found and fixed reactively this milestone;
  no CI/deploy-check mechanism exists yet to catch it proactively.
  _Target:_ before the next milestone that adds a migration, ideally as a
  CI step running `supabase migration list` against the live project.
- **Validation errors collapse to one generic, unlabeled banner** on
  multi-field forms. _Deferred:_ fixing well means touching the shared
  error-mapping pattern across ~13 files. _Target:_ if/when this has more
  than one real user.
- **A fee/tax transaction has no link back to the trade it relates to**
  (ADR 0028) — recording a commission alongside a buy is two separate
  ledger rows with no foreign key association between them. _Deferred:_
  no current workflow needs that association surfaced; deliberately not
  built speculatively (ADR 0028's own "Alternatives Considered"). _Target:_
  if a reporting view ever needs a trade's all-in cost including its fee.
- **Daily change uses today's FX rate applied to yesterday's price, not
  yesterday's actual FX rate** (ADR 0032) — this platform maintains no FX
  rate history, so a holding's "daily change in GBP" slightly misstates
  the FX-driven portion of a move on days GBP itself moves materially
  against that holding's currency. _Deferred:_ building FX rate history is
  explicitly out of this milestone's scope (no historical charts).
  _Target:_ revisit only if this proves materially wrong in practice.
- **Dashboard/Portfolio "largest daily gainer/loser" can mislabel the
  smallest gain as a "loser"** when every live-priced holding moved the
  same direction on the day (ADR 0032) — the same pre-existing convention
  `largestGain`/`largestLoss` (unrealised, Milestone 2.7) already uses,
  kept for consistency rather than fixed in isolation. _Deferred:_ fixing
  properly means revisiting both the new daily fields and the pre-existing
  unrealised ones together. _Target:_ a future UI-polish pass.

**Low**

- **No component-level tests** for ~40+ UI files (domain/service layer is
  well covered; UI is verified by type-check + build + a manual
  click-through — Phase 2.5's and, now, Milestone 2.7's — only). _Target:_
  ongoing, opportunistic.
- **`settings-form.tsx`** doesn't use the shared `form-styles.ts` tokens
  every other form does. _Target:_ opportunistic cleanup.
- **No focus management/`aria-live`** announcement after a Server Action
  succeeds. _Target:_ a future accessibility pass.
- **`proxy.ts`'s route matcher** only lists `/dashboard`/`/settings`,
  relying on `(protected)/layout.tsx`'s own redirect as the real guard.
  _Deferred:_ real defense-in-depth already covers it. _Target:_
  opportunistic, low risk.
- **No inline "cancel" affordance** on `companies/new` or the transaction
  forms beyond the persistent top nav. _Target:_ a future UI polish pass.
- **No tax-lot or tax-treatment tracking** (ADR 0026) — single
  average-cost basis only, no FIFO/specific-identification, no short/long
  gain classification. _Deferred:_ deliberate scope boundary, not a bug —
  this is exactly what Phase 8's Tax Planning module exists to eventually
  own. _Target:_ if/when tax-filing use becomes an actual goal.
- **No corporate-action support** (splits, mergers, spin-offs — ADR 0026).
  _Deferred:_ no held company has needed it yet; the right transaction
  shape isn't obvious without a real case to design against. _Target:_ the
  first time a held company actually undergoes one.
- **Five UI files still call raw `.toFixed()` instead of the shared
  `src/lib/format.ts` formatters** (ADR 0029): `dashboard/page.tsx` and
  `companies/[id]/page.tsx` (`blendedFairValue.toFixed(2)`),
  `portfolio/page.tsx` (`cash.toFixed(2)`),
  `companies/[id]/valuation/page.tsx` and `valuation-form.tsx`
  (`fairValue.toFixed(2)`) — plus inconsistent percentage precision (0dp
  in the journal views, 0dp and 1dp on the same company overview page).
  Not a rounding-correctness bug (`.toFixed()` rounds the same way as
  `Intl.NumberFormat` for these values) but a real, visible display
  inconsistency ADR 0029's "consistent display throughout the platform"
  goal doesn't yet fully cover. _Deferred:_ pre-dates `src/lib/format.ts`;
  fixing was explicitly out of scope when ADR 0029 was written.
  _Target:_ the next time any of these five files is touched for an
  unrelated reason.
- **Price Engine Stage 1 accepted approximations** (ADR 0031): quote
  quality is inferred from market-open state, not a real per-call vendor
  signal; `TwelveDataPriceProvider.getPrices` calls the single-quote
  endpoint once per identifier rather than a true vendor batch call;
  `MarketStatusProvider` is implemented and composed but not yet wired
  into any visible UI; a refreshed quote's on-screen age freezes until the
  next page reload rather than ticking upward live. _Deferred:_ all
  documented as deliberate, low-severity trade-offs in ADR 0031's own
  Future Review Criteria, not defects. _Target:_ revisit `getPrices`
  batching if holding count grows; revisit quality inference if a Twelve
  Data tier ever exposes it directly; wire `MarketStatusProvider` into the
  UI the first time a milestone actually wants a live open/closed badge.

---

# Outstanding Roadmap

**Renumbered 2026-07-21:** the phase sequence below reflects actual
direction taken (Market Data Foundation and FX Conversion were built and
labelled "Phase 3.1/3.2"; Investment Intelligence as "Phase 4") — the
phases originally sketched here as 3/4 (Document Repository, AI Analysis)
are renumbered forward to keep this document matching reality rather than
a superseded plan. No scope changed, only the numbers.

**Phase 5 — Document Repository.** Managed source material — upload,
metadata, tagging, version history — attachable to companies, research
notes, and journal entries, via a `StorageProvider` abstraction. Ships with
a `NullDocumentProvider` (no OCR/extraction yet). This is the natural next
milestone: Phase 4's Company page already has honest "Documents — Planned"
placeholders waiting for it.

**Phase 6 — AI Analysis and Daily Briefing.** The first real `AIProvider`
implementation and the `ai` bounded context: brief generation, research AI
summaries, opportunity narratives — strictly synthesis over data already
computed and verified by earlier phases, never a source of a figure.

**Phase 7 — Alerts and Notifications.** Rule/decision/portfolio-action
triggered alerts with deduplication, plus a `NotificationProvider`
(in-app first, email second) and an Alerts Center screen.

**Phase 8 — Reporting, Benchmarking and Review Workflows.** Exportable
period reports, benchmark comparison overlays, and a matured
`DecisionReview`/research-thesis review-history workflow.

**Phase 9 — Broker Import and Read-Only Integrations.** Read-only
statement/CSV or API-based broker data import behind a feature flag,
reviewed before commit to the ledger — explicitly never order placement.

**Phase 10 — Additional Arbor Lyme Capital Modules.** The deferred modules
named in `docs/feature-flags.md` (Property, Family Office, Tax Planning,
Portfolio Sharing, Commercial Features), each scoped individually when its
turn comes — intentionally a placeholder, not a committed backlog.

**Also outstanding, smaller in scope:** Price Engine Stage 2 (fund NAV
live pricing) and scheduled/overnight refresh — both explicitly deferred
across ADR 0030/0031/0032; a `reviewDate` column for journal entries (ADR
0033); cross-portfolio holding deduplication for the Dashboard's combined
view (ADR 0033).

---

# Open ADRs

All 33 ADRs are `Accepted` except **ADR 0014** (Decision Engine as a
Dedicated, Non-Executing Domain), which is `Superseded by 0023`
(Investment Rating / Portfolio Action split), and **ADR 0026** (Portfolio
Accounting Principles), whose fee/interest/tax section is superseded by
**ADR 0028** while every other principle it states remains authoritative —
both supersessions are recorded, not silently reversed, per this project's
own ADR convention. **ADR 0006**'s `MarketDataProvider` interface is
similarly refined (not reversed) by ADR 0030.

No ADR is currently `Proposed`/under active review. The six most
consequential recent decisions, worth a future contributor's attention if
anything in this area needs revisiting:

- **ADR 0023** — the Investment Rating / Portfolio Action split. The
  architectural spine Phase 2 was built around; changing it would touch
  `decision`, `portfolio`, and every UI surface that reads either.
- **ADR 0025** — atomic RPCs as the sole financial write path, with
  server-side arithmetic. A deliberate reversal of an earlier stated
  preference (Phase 2 Architecture Review 4.2) to close a critical
  security gap; carries the "two copies of the formula" trade-off listed
  in Technical Debt above.
- **ADR 0026** — Portfolio Accounting Principles. Documentation-only,
  formalizing decisions already embedded in the trading/portfolio domains
  (average-cost basis, cash-basis dividends, ledger-only cash/holdings).
  Still names two open gaps worth a future contributor's attention: tax
  treatment is explicitly out of scope, and corporate actions (splits,
  mergers) have no representation in the transaction model yet. Its
  fee-tracking gap was closed by ADR 0028.
- **ADR 0028** — Fee, Interest, and Tax as First-Class Transaction Types.
  Extends ADR 0025's atomic-RPC pattern to three more event types and
  closes the fee-tracking gap ADR 0026 had named as a deliberate,
  acknowledged omission; a fee/tax row still has no link back to the trade
  it relates to (see Technical Debt).
- **ADR 0029** — Portfolio Rounding Policy. Documentation-only, formalizing
  a rule already true throughout `domain/*`/`application/services/*`:
  round exactly once, at the database column boundary or at
  `src/lib/format.ts`'s formatters, never in between. Written after a
  live HL Stocks & Shares ISA import surfaced a 1p gap between the
  platform's summed-then-rounded total and a source spreadsheet's
  sum-of-already-rounded total — an expected, accepted consequence of the
  policy, not a defect. Names five UI files that still call raw
  `.toFixed()` instead of the shared formatters as a known deviation (see
  Technical Debt).
- **ADR 0030** — Price Engine architecture. Interfaces only
  (`src/domain/market/`: `PriceEngine`, `SecurityPriceProvider`,
  `FxRateProvider`, `QuoteRepository`) — no concrete provider, HTTP client,
  or scheduled job exists yet. Routes by `SecurityType` (equity/ETF/
  investment trust/fund) to a configurable provider per type, so the
  domain never knows which vendor answered. Staged: Stage 1
  (exchange-traded securities, Twelve Data per
  `docs/market-data-provider-evaluation.md`) and Stage 2 (UK OEIC/unit
  trust funds, deliberately backed by the existing manual-marking
  workflow rather than a real vendor, since no realistically-priced fund
  data vendor exists). Implementation of either stage requires separate
  approval.
- **ADR 0031** — Price Engine Stage 1 Implementation. Records what Stage 1
  actually built: `TwelveDataPriceProvider`/`TwelveDataMarketStatusProvider`,
  `RoutingPriceEngine` (routing map changed to `Partial<Record<...>>` from
  ADR 0030's original full-`Record` description, since Stage 1 has no
  `fund` provider yet), the `market_quotes` table and `companies.security_type`
  column, price-quality inference (approximated from market-open state,
  not a real per-call vendor signal), and manual-refresh-only wiring —
  scheduled refresh is explicitly deferred. Names several accepted
  approximations worth a future contributor's attention: quote quality is
  inferred not measured, `getPrices` is not a true vendor batch call, and
  `MarketStatusProvider` is implemented but not yet surfaced in any UI.
- **ADR 0032** — FX Conversion and Live Quote Propagation. Closes the
  currency-conversion gap ADR 0031's own live validation found.
  `EcbFxRateProvider` (European Central Bank daily reference rates, chosen
  over Twelve Data's paid-tier-gated FX and Bank of England data — a daily
  reference rate is the right shape of data for decision support, not
  trade execution); conversion built into `domain/portfolio/performance.ts`
  as one structural choke point (`currentPriceBase = currentPrice *
  fxRateToBase`); cost basis confirmed to already be GBP-denominated at
  each trade's historical rate, no historical transaction altered; a new
  shared `buildPortfolioValuation` composer used identically by the
  Dashboard, Portfolio, and Company pages so persisted quotes propagate
  without any page calling a vendor directly; manual price entry now
  genuinely persisted (`PriceQuality: "manual"`) rather than ephemeral.
  Live-validated against the real HL Stocks & Shares ISA. Names two
  disclosed limitations worth a future contributor's attention: daily
  change uses today's FX rate (no FX history maintained), and "largest
  daily gainer/loser" can mislabel a small gain as a loss when nothing
  actually lost value that day (see Technical Debt).
- **ADR 0033** — Investment Intelligence. Portfolio Health (8 weighted,
  explainable factors → a 0–10 score, same philosophy as ADR 0023's
  rating), Risk Overview (sector/country/currency exposure derived from
  `deriveCountryFromExchange`, a documented exchange→country heuristic —
  no new company data field), Opportunities (heuristic ranking,
  explicitly a placeholder until a real valuation model exists),
  Portfolio Insights (rule-based, zero AI), and a deterministic per-
  holding Allocation Action. Names two disclosed limitations worth a
  future contributor's attention: combining more than one portfolio
  doesn't deduplicate holdings by company (undercounts position
  concentration for a company held in two portfolios; sector/country/
  currency totals are unaffected), and `reviewDate` is named as a
  required journal field but has no backing column yet — always reported
  absent, not fabricated.

---

# Recent Milestones

1. **2026-07-21 — Phase 4: Investment Intelligence.** Portfolio Health
   score, Risk Overview, Opportunities panel, rule-based Portfolio
   Insights, Allocation Analysis with recommended actions, Investment
   Journal completeness, enhanced Company pages (position summary,
   research completeness, journal entries). ADR 0033. Zero AI — every
   panel deterministic, built from data already owned. Browser-validated.
   On branch `phase-4-investment-intelligence`. Commit pending.
2. **2026-07-21 — Phase 3.2: FX Conversion and Live Quote Propagation.**
   `EcbFxRateProvider` (ECB daily reference rates), currency conversion
   built into `domain/portfolio/performance.ts`, a shared
   `buildPortfolioValuation` composer used by Dashboard/Portfolio/Company
   pages alike, genuinely persisted manual pricing. ADR 0032. Closes the
   FX gap Stage 1's own live validation found. Live-validated against the
   real HL Stocks & Shares ISA. `0f62681`.
3. **2026-07-21 — Price Engine Stage 1 Implementation.** Twelve Data-backed
   `SecurityPriceProvider`/`MarketStatusProvider`, `RoutingPriceEngine`,
   Postgres `QuoteRepository`, `companies.security_type`, price-quality/
   quote-age metadata, manual "Refresh prices" UI. ADR 0031. Scheduled
   refresh deferred. `0f62681`.
4. **2026-07-21 — ADR 0030 Price Engine Architecture + provider evaluation.**
   Provider-neutral, security-type-routed pricing interfaces; market-data
   vendor evaluation recommending Twelve Data. `aeb49a7`.
5. **2026-07-21 — HL Stocks & Shares ISA Import + ADR 0029.** Real portfolio
   data (opening positions/cash, six individually recorded purchases)
   imported into a new, separate portfolio via authenticated scripts
   calling the existing atomic RPCs; reconciled exactly to source figures;
   portfolio selector added; Rounding Policy ADR. `c11b665`.
6. **2026-07-20 — Milestone 2.7 Portfolio Completion & UX Polish.**
   Ledger-based Cash Management with a live balance preview; fee/interest/
   tax as first-class transaction types (ADR 0028); filtered/sorted/
   paginated Transactions with a detail + audit-history view; Portfolio
   Performance (market value, gains, XIRR, allocation) via a live
   client-side price-marking panel; Dashboard rebuilt as a daily workspace;
   full company tab set; shared table primitives; branding/nav polish.
   Live browser testing caught and fixed an undeployed migration and a
   missing audit-event publish. `445a547`.
7. **2026-07-20 — Phase 2.5 Production Readiness.** Live Supabase project
   provisioned, migrations pushed, demo data seeded and verified, full
   manual click-through against live infrastructure, four UX/perf fixes.
   `3e307e9`.
8. **2026-07-20 — Security and Financial Integrity Hardening.** Closed the
   critical RPC-bypass gap; atomic, server-computed, concurrency-safe
   trading writes; `ConflictError`; live-tested including real
   concurrency. `b731220`.
9. **2026-07-19 — Phase 2 Remediation.** Fixed 6 of 9 Architecture Review
   findings from the Phase 2 build (atomicity, RLS validation, N+1
   dashboard, multi-portfolio UI, cross-company Journal view, ADR 0024).
   `11671cf`.
10. **2026-07-19 — Phase 2: Investment Research Platform.** The full
    consolidated milestone — 8 new domains, 10 tables, 9 UI screens.
    `8927bcf`.
11. **2026-07-19 — Foundation completion.** CI, Dependabot, developer
    documentation, closing out the Foundation milestone's auth/settings/
    audit/UI work. `3584da2` (and the preceding Foundation commits
    `2b69446`…`15284ef`).

---

# Next Recommended Milestone

**Phase 5 — Document Repository**

**Purpose:** Give research, journal entries, and companies a place to
attach and retrieve the actual source material a thesis is built on —
filings, transcripts, notes — closing a real gap in the "explainable
decision" goal this whole platform exists for.

**Scope:** The `documents` bounded context (metadata, tagging, version
history, entity relationships), a `StorageProvider` interface with a
`NullDocumentProvider` implementation (no OCR/extraction this phase),
Document Repository and Document Detail screens, and attachment points on
Company/Research/Journal.

**Success criteria:** a document can be uploaded, tagged, attached to a
company/research note/journal entry, retrieved with full version history,
and the whole path is RLS-tested (including a negative-path test) the same
way every prior phase's tables were.

**Estimated complexity:** Medium — one new bounded context and table set,
no new architectural pattern (follows the same domain/repository/service
shape as `research`/`thesis`), but real storage-provider integration is
new ground this codebase hasn't covered yet.

---

# Session Handover

**Current state:** Phase 3.2 (FX Conversion and Live Quote Propagation,
ADR 0032) is complete, live-validated, and **committed** (`0f62681`, on
`foundation`). Phase 4 (Investment Intelligence, ADR 0033) is built on top
of it, on its own branch `phase-4-investment-intelligence`, and is
**browser-validated** but **not yet committed**. `pnpm exec tsc --noEmit`,
`pnpm exec eslint src --max-warnings=0`, `pnpm exec vitest run` (314/314),
and `pnpm build` are all clean.

Phase 4 turns the Dashboard from a portfolio-management screen into an
executive investment briefing: Portfolio Health score, Risk Overview,
Opportunities panel, rule-based Portfolio Insights, Allocation Analysis
with a recommended action per holding, Recent Activity, an honest
Upcoming Events placeholder, Investment Journal completeness, and
enhanced Company pages (position summary across every portfolio,
research completeness, journal entries, Documents/Upcoming Events
placeholders). Every panel is deterministic — no AI, no new vendor
dependency — built from data already owned (holdings, quotes, FX,
thesis, valuation, decision, journal). Browser-validated against the real
HL Stocks & Shares ISA and Core Growth Portfolio, in both single-
portfolio and combined "All portfolios" views; one real bug (a React
duplicate-key warning caused by the disclosed cross-portfolio
non-deduplication limitation) was found and fixed during validation.

**What should happen next:**

1. Request commit approval for Phase 4.
2. After committing, merge `phase-4-investment-intelligence` back into
   `foundation` (or open a PR) per the user's normal workflow — not done
   automatically.
3. Revoke the Twelve Data API key and Supabase Personal Access Token used
   across this and the prior session, if no longer needed on an ongoing
   basis.
4. Decide the next milestone: Phase 5 (Document Repository, next in the
   renumbered roadmap), Price Engine Stage 2 (fund NAV live pricing),
   scheduled refresh, a Twelve Data plan upgrade (to unlock live ASML/WPP
   pricing), or one of Phase 4's own named follow-ups (a `reviewDate`
   column for journal entries; cross-portfolio holding deduplication).

**Requiring user input:**

- Commit approval for Phase 4.
- Branch merge strategy (merge to `foundation`, or open a PR first).
- Priority for the next milestone — see the options above.
- If Vercel deployment is wanted at some point: creating that account/
  project is the same category of action Supabase project creation was —
  `docs/vercel-preparation.md` already establishes it as the user's call.

**Known blockers:** None — browser validation is complete and every
completion criterion for this milestone is met.
