# Development Roadmap

This roadmap is organized into phases, not sprints or dates. Each phase produces a
working, deployable increment that the next phase builds on. No phase depends on
work being redone from a prior phase. Application code, package installation, and
database schema work begin only once each phase is explicitly approved.

This is the third revision of this roadmap. The first (Phase 0.5) expanded scope
to include research, documents, AI, and alerts as first-class domains. The second
adopted a 14-phase sequence separating market data, analytics, rules, and decision
support into distinct phases. This revision consolidates what was Phases 2, 3, 4,
5, 6, and part of 12 into a single large Phase 2 — "Investment Research Platform"
— at the explicit direction of the project owner, who wants complete milestones
rather than many small phase approvals. Subsequent phases are renumbered
accordingly. See ADR 0023 for the architectural decision (Investment Rating vs.
Portfolio Action) this consolidated phase is built around.

**A standing principle across every phase from here on: AI consumes verified
data and never performs authoritative financial calculations.** Every phase that
touches AI (10 and later) is built strictly on top of deterministic output already
produced by `analytics` and `rules` in earlier phases — this ordering is not
incidental, it is what makes the constraint enforceable: AI cannot be given
authority over a calculation that was already finalized by a domain service two
phases earlier.

## Phase 0 — Foundation Documentation (complete)

Established project direction and the core documentation set. See `vision.md`,
`architecture.md`, `technology-stack.md`.

## Phase 0.5 — Extended Architecture (complete)

Domain-Driven Design structure, provider abstraction, event system, feature
flags, settings engine, audit strategy, research/document domain design, product
specification, and the initial ADR set (0001–0013).

## Phase 0.6 — Decision Support Architecture (complete)

Decision domain and rules domain design (`decision-engine.md`,
`rules-engine.md`), data flow documentation (`data-flow.md`), data classification
(`data-classification.md`), threat model (`threat-model.md`), backup/recovery
strategy, and this roadmap revision. ADRs 0014–0017.

## Phase 1 — Foundation: Authentication, Settings Framework, Audit Foundation

**Goal:** a deployable, secure, empty application — the architectural skeleton,
proven end to end, with no domain functionality beyond identity, configuration,
and accountability.

- Next.js + TypeScript scaffolding; `domain/`/`infrastructure`/`app` skeleton per
  `domain-driven-design.md`.
- Supabase Auth integration: sign in, sign out, protected routes, no public
  sign-up.
- `settings` and `audit` bounded contexts, built first because every later
  domain's writes depend on both.
- Internal event system (in-request tier + outbox skeleton).
- Feature flag registry.
- `profiles`, `user_settings`, `audit_events` tables with RLS.
- Foundation UI shell (sign-in, dashboard placeholder, settings, error states).
- Security headers, structured logging, health endpoint, CI pipeline.

**Exit criteria:** the principal can log in, change a setting, and see it
correctly audited — on a deployed, tested, documented application containing no
invented financial data. _(This is the current milestone — see
`docs/implementation/foundation.md`.)_

## Phase 2 — Investment Research Platform

**Goal:** the complete Research and Portfolio domain — a single large
milestone (not six small phases) at the explicit direction of the
project owner. This phase bundles what earlier revisions of this roadmap
sequenced as separate phases (portfolio, market data, analytics, rules,
decision engine, research, reporting/review) into one coherent build,
plus several concepts not previously scoped at all (Company as the
anchor entity, Valuation as an independent domain, the Thesis Engine,
Decision Journal, Monitoring Dashboard, Version History). See ADR 0023
for the Investment Rating / Portfolio Action split this phase is built
around, and `docs/domain-driven-design.md`'s updated bounded-context
table for the full domain list.

**Sequencing within the phase** (dependency order — earlier items are
inputs to later ones, not an approval gate between them):

1. **`company`** — the Company aggregate (profile, sector, industry,
   exchange, currency, ticker, status, watchlist, notes): repository,
   domain model, DTOs, service, validation, API, UI. The anchor entity
   every later item below references by `companyId`.
2. **`research`** — structured research sections (business overview,
   thesis, moat, management, financial strength, capital allocation,
   growth drivers, risks, monitoring metrics, notes), each independently
   editable. Exists independently of valuation and portfolio, per
   `research-workspace.md`.
3. **Thesis Engine** — structured thesis statements (description,
   confidence, status: Strengthening/Stable/Weakening/Broken) with an
   automatically-calculated overall thesis status.
4. **`valuation`** — base/bear/bull scenario valuation: EPS and growth
   assumptions, terminal multiple, discount rate, required return, margin
   of safety, scenario probabilities. Generic across any company —
   no company-specific logic hardcoded anywhere in this domain.
5. **`decision`** — the Decision Engine, producing `InvestmentRating`
   (Exceptional/Strong Buy/Buy/Hold/Reduce Conviction/Sell/Avoid) from
   business quality, economic moat, financial strength, capital
   allocation, growth, risk, expected return, and margin of safety —
   plus calculated conviction and an overall investment score. Business
   rules live entirely in this domain (`decision-engine.md`, ADR 0023).
6. **`portfolio`** — holdings, cash, position sizing, allocation, current
   value, unrealised gain/loss, conviction, fair value, target allocation,
   and the **Portfolio Engine** producing `PortfolioAction`
   (Initiate Position/Add/Hold/Trim/Exit) from `InvestmentRating` +
   portfolio state. Portfolio consumes research; research never depends
   on portfolio (enforced by the dependency direction in
   `domain-driven-design.md`).
7. **`trading`** — the transaction ledger (buy, sell, dividend, cash
   adjustment) with automatic average cost, current holding, realised
   and unrealised gain calculation.
8. **`journal`** — the Decision Journal: purchase date/price, fair value,
   expected return, position size, conviction, thesis, risks, and
   invalidation conditions recorded at the time of a decision; sale
   date/reason/lessons-learned recorded later.
9. **Monitoring Dashboard** — per-company tracking of thesis status,
   valuation status, margin of safety, expected return, risks, and
   monitoring metrics, designed so a future earnings update is a single
   write that flows through to every dependent view.
10. **Version History** — every update to research, valuation, thesis, or
    assumptions preserves the previous version; nothing is overwritten.
11. **UI** — Company List/Detail, Research, Thesis, Valuation, Portfolio,
    Holdings, Transactions, Decision Journal, and Dashboard screens,
    responsive, using the existing design system (`product-specification.md`
    extended for this phase's screens).

**Architecture rules for this phase** (restated from `docs/domain-driven-design.md`
and `docs/engineering-standards.md`, binding throughout): business rules
belong in the Domain; Application orchestrates; Infrastructure persists;
Presentation stays thin. No duplicated logic. No TODO placeholders. No
mock implementations unless explicitly labelled as such. RLS on every new
table, with a negative-path test.

**Exit criteria:** the principal can track a company from first research
through thesis, valuation, an explainable Investment Rating, a
portfolio-aware Portfolio Action, an actual position with transactions,
and a decision journal entry — with full version history and no invented
data anywhere in the chain. `pnpm check` clean; unit and integration
tests passing.

## Phase 3 — Document Repository

**Goal:** managed source material (`document-management.md`), attachable
to companies, research notes, and journal entries.

- Implement `documents`: upload, metadata, tagging, version history,
  entity relationships, `StorageProvider` integration.
- Document Repository and Document Detail screens.
- `DocumentProvider` ships as a `NullDocumentProvider` (no OCR/extraction
  yet).

**Exit criteria:** the principal can attach source documents to a
company/research note and retrieve them with full version history.

## Phase 4 — AI Analysis and Daily Briefing

**Goal:** proactive AI-assisted synthesis across the now-complete
deterministic base (Phase 2).

- Full `ai` context: brief generation (`BriefGenerated`), Research AI
  Summary, opportunity narrative generation.
- First real `AIProvider` implementation, used only for narrative
  synthesis — never for computing a figure `analytics`/`valuation`/
  `decision` already own.
- AI Briefing screen.
- Every AI output labelled with provider/model/timestamp; every AI output
  traceable to the verified data it was built from (`data-flow.md` §7).

**Exit criteria:** the principal receives a meaningful daily briefing
built entirely from verified, already-computed data — with AI's
contribution limited to synthesis and narrative, never calculation.

## Phase 5 — Alerts and Notifications

**Goal:** timely, non-spammy notification of what matters.

- Full `alerts` context: rule/decision/portfolio-action-triggered alerts,
  dismissal, deduplication.
- `NotificationProvider` implementation(s) (in-app first, email second).
- Alerts Center screen.

**Exit criteria:** the principal is notified of a rule match, rating
change, or portfolio action without needing to check the dashboard
proactively.

## Phase 6 — Reporting, Benchmarking and Review Workflows

**Goal:** retrospective and comparative insight.

- Exportable period reports; benchmark comparison overlays on performance
  charts.
- `DecisionReview` and research/thesis review-history surfaces matured
  into a genuine review workflow.

**Exit criteria:** the principal can review past performance against a
benchmark and past ratings/actions against outcomes.

## Phase 7 — Broker Import and Read-Only Integrations (Where Supported)

**Goal:** reduce manual data entry, without ever taking on trade
execution.

- Read-only broker data import (statement/CSV-based first; API-based only
  where a broker supports it) behind the `broker_integration` feature
  flag.
- Explicitly read-only — no order placement capability is introduced at
  this or any phase (`vision.md`, `decision-engine.md`'s "never places a
  trade").

**Exit criteria:** at least one supported broker's holdings/transactions
can be imported without manual re-entry, reviewed before being committed
to the ledger.

## Phase 8 — Additional Arbor Lyme Capital Modules

**Goal:** the deferred modules named in `feature-flags.md`, built only
once the core platform (Phases 1–7) is solid: Property Module, Family
Office, Tax Planning, Portfolio Sharing (external), Commercial Features.
Each is scoped and sequenced individually when its turn comes — this
phase is intentionally a placeholder for future planning, not a
committed backlog.

## How Phases Are Reviewed

At the end of each phase, work pauses for explicit review and approval before the
next phase begins. This keeps scope changes deliberate and keeps the principal in
control of pace and direction throughout a long-running project.
