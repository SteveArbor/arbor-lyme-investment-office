# Arbor Lyme Capital

## Project Status

**Last Updated:** 2026-07-20
**Current Version:** 0.1.0
**Current Branch:** `foundation`
**Current Milestone:** Milestone 2.7 — Portfolio Completion & User
Experience Polish (complete)
**Overall Status:** Healthy. The Portfolio module — cash management,
holdings, transactions, and performance — is production ready and
live-verified end to end, including a real bug (an undeployed migration)
caught and fixed during that verification. Paused at a deliberate decision
boundary awaiting approval to begin Phase 3.

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
Commit pending, 2026-07-20. Two-part milestone completing the Portfolio
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
| PostgreSQL     | Implemented | 17 migrations applied to the live project (confirmed via `supabase migration list` after Milestone 2.7 caught one that had been validated locally but not deployed); RLS + atomic RPCs throughout. |
| Authentication | Implemented | Supabase Auth, admin-provisioned users only, trigger-based profile creation.                                                                                |
| Hosting        | Planned     | No Vercel project exists yet; `docs/vercel-preparation.md` is prep-only.                                                                                    |
| CI/CD          | Partial     | GitHub Actions runs format/lint/typecheck/unit tests/audit/build; no e2e in CI; no deploy pipeline (no host to deploy to yet).                              |
| Testing        | Partial     | 204 unit tests, 7/8 e2e (1 skipped, needs live creds — now available), live DB integration validation both throwaway and real, plus a full manual browser pass against live infrastructure in Milestone 2.7. No component-level UI tests. |
| Logging        | Implemented | Structured logger (`src/lib/logger.ts`), used in Server Action catch blocks and the RPC error mapper.                                                       |
| Monitoring     | Planned     | No APM/observability platform beyond application logs; no alerting.                                                                                         |

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

---

# Outstanding Roadmap

**Phase 3 — Document Repository.** Managed source material — upload,
metadata, tagging, version history — attachable to companies, research
notes, and journal entries, via a `StorageProvider` abstraction. Ships with
a `NullDocumentProvider` (no OCR/extraction yet).

**Phase 4 — AI Analysis and Daily Briefing.** The first real `AIProvider`
implementation and the `ai` bounded context: brief generation, research AI
summaries, opportunity narratives — strictly synthesis over data already
computed and verified by earlier phases, never a source of a figure.

**Phase 5 — Alerts and Notifications.** Rule/decision/portfolio-action
triggered alerts with deduplication, plus a `NotificationProvider`
(in-app first, email second) and an Alerts Center screen.

**Phase 6 — Reporting, Benchmarking and Review Workflows.** Exportable
period reports, benchmark comparison overlays, and a matured
`DecisionReview`/research-thesis review-history workflow.

**Phase 7 — Broker Import and Read-Only Integrations.** Read-only
statement/CSV or API-based broker data import behind a feature flag,
reviewed before commit to the ledger — explicitly never order placement.

**Phase 8 — Additional Arbor Lyme Capital Modules.** The deferred modules
named in `docs/feature-flags.md` (Property, Family Office, Tax Planning,
Portfolio Sharing, Commercial Features), each scoped individually when its
turn comes — intentionally a placeholder, not a committed backlog.

---

# Open ADRs

All 29 ADRs are `Accepted` except **ADR 0014** (Decision Engine as a
Dedicated, Non-Executing Domain), which is `Superseded by 0023`
(Investment Rating / Portfolio Action split), and **ADR 0026** (Portfolio
Accounting Principles), whose fee/interest/tax section is superseded by
**ADR 0028** while every other principle it states remains authoritative —
both supersessions are recorded, not silently reversed, per this project's
own ADR convention.

No ADR is currently `Proposed`/under active review. The five most
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

---

# Recent Milestones

1. **2026-07-20 — Milestone 2.7 Portfolio Completion & UX Polish.**
   Ledger-based Cash Management with a live balance preview; fee/interest/
   tax as first-class transaction types (ADR 0028); filtered/sorted/
   paginated Transactions with a detail + audit-history view; Portfolio
   Performance (market value, gains, XIRR, allocation) via a live
   client-side price-marking panel; Dashboard rebuilt as a daily workspace;
   full company tab set; shared table primitives; branding/nav polish.
   Live browser testing caught and fixed an undeployed migration and a
   missing audit-event publish. Commit pending.
2. **2026-07-20 — Phase 2.5 Production Readiness.** Live Supabase project
   provisioned, migrations pushed, demo data seeded and verified, full
   manual click-through against live infrastructure, four UX/perf fixes.
   `3e307e9`.
3. **2026-07-20 — Security and Financial Integrity Hardening.** Closed the
   critical RPC-bypass gap; atomic, server-computed, concurrency-safe
   trading writes; `ConflictError`; live-tested including real
   concurrency. `b731220`.
4. **2026-07-19 — Phase 2 Remediation.** Fixed 6 of 9 Architecture Review
   findings from the Phase 2 build (atomicity, RLS validation, N+1
   dashboard, multi-portfolio UI, cross-company Journal view, ADR 0024).
   `11671cf`.
5. **2026-07-19 — Phase 2: Investment Research Platform.** The full
   consolidated milestone — 8 new domains, 10 tables, 9 UI screens.
   `8927bcf`.
6. **2026-07-19 — Foundation completion.** CI, Dependabot, developer
   documentation, closing out the Foundation milestone's auth/settings/
   audit/UI work. `3584da2` (and the preceding Foundation commits
   `2b69446`…`15284ef`).

---

# Next Recommended Milestone

**Phase 3 — Document Repository**

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

**Current state:** Milestone 2.7 is complete but not yet committed. The
Portfolio module (cash management, transactions, performance) is
production ready, live-verified against the real Supabase project
including submitting a real transaction and reading it back through the
Audit history view. `pnpm check`/`pnpm build`/`vitest run` (204 tests) are
all clean, and the live database schema is confirmed in sync with local
migrations (`supabase migration list` shows all 17 applied). The project
is at a genuine decision boundary — nothing is broken or blocking, but the
next step is a real choice, not mechanical continuation.

**What should happen next:** Commit approval for Milestone 2.7, then
awaiting explicit approval to begin Phase 3 (Document Repository) — per
`CLAUDE.md`, Phase 3 does not start automatically. The user may instead
prefer to close out one or more Technical Debt items first (the
click-level idempotency gap and a Vercel staging deployment are the two
most consequential ones still open).

**Requiring user input:**

- Commit approval for Milestone 2.7.
- Approval to begin Phase 3 after that, or a different priority instead.
- If Vercel deployment is wanted next: creating that account/project is
  the same category of action Supabase project creation was — this
  project's own docs (`docs/vercel-preparation.md`) already establish it
  as the user's call, not something to do unilaterally.
- A Supabase Personal Access Token was used again this session (to
  diagnose and push the migration Milestone 2.7's live testing found
  undeployed) — recommended to revoke it from
  [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
  now that it's no longer needed; the app itself never needs it.

**Known blockers:** None for Phase 3 (self-contained, no external
dependency beyond what already exists). Vercel deployment is blocked on
the same kind of account-creation step Supabase was, whenever that becomes
the priority.
