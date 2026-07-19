# Development Roadmap

This roadmap is organized into phases, not sprints or dates. Each phase produces a
working, deployable increment that the next phase builds on. No phase depends on
work being redone from a prior phase. Application code, package installation, and
database schema work begin only once each phase is explicitly approved.

This is the second revision of this roadmap. The first (Phase 0.5) expanded scope
to include research, documents, AI, and alerts as first-class domains. This
revision adopts the explicit 14-phase delivery sequence below, separating market
data, analytics, rules, and decision support into their own distinct phases —
reflecting that a rules engine and a decision engine are architecturally
significant enough (`rules-engine.md`, `decision-engine.md`) to warrant dedicated
delivery phases rather than being folded into "analytics" or "AI" generally.

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

## Phase 2 — Portfolio, Holdings, Accounts and Transaction Ledger

**Goal:** the minimum viable system of record.

- Implement `portfolio` and `trading` bounded contexts.
- RLS-scoped portfolios, accounts, holdings, and the immutable transaction ledger.
- `TransactionCreated`/`HoldingUpdated` events wired to audit (recalculation
  arrives in Phase 4, once `analytics` exists).
- Primary CRUD screens: Portfolio List/Detail, Holding Detail, Transactions List,
  Add/Edit Transaction.

**Exit criteria:** the principal can fully replace their spreadsheet workflow for
recording holdings and transactions, with every change auditable.

## Phase 3 — Market Data Provider Integration and Caching

**Goal:** trusted, current (or honestly-stale-labelled) pricing.

- Implement `market` context and a first real `MarketDataProvider` implementation.
- Price caching/refresh strategy (`data-flow.md` §4) with `sourceTimestamp`
  tracked on every stored price.
- Watchlist and Asset Detail screens.

**Exit criteria:** holdings display current market value with a visible,
accurate data-freshness indicator — never presented as more current than it is.

## Phase 4 — Portfolio Analytics and Performance Calculations

**Goal:** deterministic, tested, authoritative financial calculations — the
figures every later phase (rules, decisions, AI) treats as ground truth.

- Implement `analytics`: valuation, allocation, time-weighted/money-weighted
  performance.
- `PortfolioCalculated` event wiring, recalculation triggered by
  `TransactionCreated`/`HoldingUpdated`/`PriceUpdated`.
- Performance & Analytics screen; historical charting.
- Highest unit-test coverage bar in the codebase applies here
  (`engineering-standards.md`) — this is the domain every later phase's trust
  depends on.

**Exit criteria:** the principal can answer "how has this portfolio performed"
and "how is it allocated," with figures that are reproducible and independently
verifiable.

## Phase 5 — Rules Engine

**Goal:** deterministic investment discipline, independent of AI
(`rules-engine.md`).

- Implement `rules`: `RuleDefinition`, versioned conditions, pure-function
  evaluation against a snapshot of Phase 2–4 data.
- The seven example rules from `rules-engine.md` (allocation limits, buy zones,
  stop levels, cash thresholds, trim targets, stale data, earnings proximity)
  implemented and unit-tested without any infrastructure dependency.
- Rule results feed `alerts`-shaped events; no UI surface required yet beyond
  what's needed to observe rule output for verification.

**Exit criteria:** every example rule fires correctly and reproducibly against
known test fixtures, with inputs recorded on every evaluation.

## Phase 6 — Decision Engine

**Goal:** explainable, synthesized recommendations (`decision-engine.md`) — the
first phase where AI may be consulted, and strictly as synthesis over Phase 4/5's
already-finalized figures and signals.

- Implement `decision`: `DecisionContext` assembly, `DecisionRecommendation`
  with the full explainability contract (evidence, risks, invalidation
  conditions, source timestamps, conclusion source).
- First real `AIProvider` implementation, used only for narrative synthesis —
  never for computing a figure `analytics` already owns.
- `conclusionSource` correctly distinguishes deterministic-only from
  AI-assisted recommendations.

**Exit criteria:** a recommendation can be produced from rules alone (AI
unavailable) and, separately, with AI synthesis added — both fully explainable
and auditable, and never placing a trade.

## Phase 7 — Investment Dashboard

**Goal:** bring Phases 2–6 together into the primary daily-use screen.

- Full Dashboard screen (`product-specification.md`) — real portfolio summary,
  allocation, recent transactions, active rule signals, and (if a recommendation
  exists) a decision summary — replacing the Foundation-phase placeholder
  widgets with real, verified data for the first time.

**Exit criteria:** the Dashboard is the principal's genuine daily reference,
built entirely on deterministic and explainable data.

## Phase 8 — Research Workspace

**Goal:** durable investment reasoning (`research-workspace.md`).

- Implement `research`: `ResearchNote`, structured sections, review history.
- Research Workspace and Research Note Detail screens.
- AI Summary section deferred until Phase 10 unless Phase 6's `AIProvider`
  implementation is reused early — a decision made when this phase begins, not
  pre-committed now.

**Exit criteria:** the principal can attach and retrieve structured thesis
reasoning against a holding, with review history intact.

## Phase 9 — Document Repository

**Goal:** managed source material (`document-management.md`).

- Implement `documents`: upload, metadata, tagging, version history, entity
  relationships, `StorageProvider` integration.
- Document Repository and Document Detail screens.
- `DocumentProvider` ships as a `NullDocumentProvider` (no OCR/extraction yet).

**Exit criteria:** the principal can attach source documents to a holding/
research note and retrieve them with full version history.

## Phase 10 — AI Analysis and Daily Briefing

**Goal:** proactive AI-assisted synthesis across the now-complete deterministic
base (Phases 2–9).

- Full `ai` context: brief generation (`BriefGenerated`), Research Note AI
  Summary, opportunity narrative generation.
- AI Briefing screen.
- Every AI output labelled with provider/model/timestamp; every AI output
  traceable to the verified data it was built from (`data-flow.md` §7).

**Exit criteria:** the principal receives a meaningful daily briefing built
entirely from verified, already-computed data — with AI's contribution limited
to synthesis and narrative, never calculation.

## Phase 11 — Alerts and Notifications

**Goal:** timely, non-spammy notification of what matters.

- Full `alerts` context: rule/decision-triggered alerts, dismissal, deduplication.
- `NotificationProvider` implementation(s) (in-app first, email second).
- Alerts Center screen.

**Exit criteria:** the principal is notified of a rule match or new
recommendation without needing to check the dashboard proactively.

## Phase 12 — Reporting, Benchmarking and Review Workflows

**Goal:** retrospective and comparative insight.

- Exportable period reports; benchmark comparison overlays on performance charts.
- `DecisionReview` and research review-history surfaces matured into a genuine
  review workflow.

**Exit criteria:** the principal can review past performance against a benchmark
and past recommendations against outcomes.

## Phase 13 — Broker Import and Read-Only Integrations (Where Supported)

**Goal:** reduce manual data entry, without ever taking on trade execution.

- Read-only broker data import (statement/CSV-based first; API-based only where
  a broker supports it) behind the `broker_integration` feature flag.
- Explicitly read-only — no order placement capability is introduced at this or
  any phase (`vision.md`, `decision-engine.md`'s "never places a trade").

**Exit criteria:** at least one supported broker's holdings/transactions can be
imported without manual re-entry, reviewed before being committed to the ledger.

## Phase 14 — Additional Arbor Lyme Capital Modules

**Goal:** the deferred modules named in `feature-flags.md`, built only once the
core platform (Phases 1–13) is solid: Property Module, Family Office, Tax
Planning, Portfolio Sharing (external), Commercial Features. Each is scoped and
sequenced individually when its turn comes — this phase is intentionally a
placeholder for future planning, not a committed backlog.

## How Phases Are Reviewed

At the end of each phase, work pauses for explicit review and approval before the
next phase begins. This keeps scope changes deliberate and keeps the principal in
control of pace and direction throughout a long-running project.
