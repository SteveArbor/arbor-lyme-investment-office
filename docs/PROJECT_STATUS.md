# Arbor Lyme Capital

## Project Status

**Last Updated:** 2026-07-20
**Current Version:** 0.1.0
**Current Branch:** `foundation`
**Current Milestone:** Phase 2.5 — Production Readiness (complete)
**Overall Status:** Healthy. Live infrastructure provisioned and validated
end to end. Paused at a deliberate decision boundary awaiting approval to
begin Phase 3.

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
all; see ADR 0025 and `docs/database-design.md`.

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
proven (`SettingsChanged` → audit, `src/infrastructure/events/`); the
durable/outbox tier for cross-request delivery is designed
(`docs/event-system.md`) but not built — nothing yet needs it.

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
| PostgreSQL     | Implemented | 16 migrations applied to the live project; RLS + atomic RPCs throughout.                                                                                    |
| Authentication | Implemented | Supabase Auth, admin-provisioned users only, trigger-based profile creation.                                                                                |
| Hosting        | Planned     | No Vercel project exists yet; `docs/vercel-preparation.md` is prep-only.                                                                                    |
| CI/CD          | Partial     | GitHub Actions runs format/lint/typecheck/unit tests/audit/build; no e2e in CI; no deploy pipeline (no host to deploy to yet).                              |
| Testing        | Partial     | 170 unit tests, 7/8 e2e (1 skipped, needs live creds — now available), live DB integration validation both throwaway and real. No component-level UI tests. |
| Logging        | Implemented | Structured logger (`src/lib/logger.ts`), used in Server Action catch blocks and the RPC error mapper.                                                       |
| Monitoring     | Planned     | No APM/observability platform beyond application logs; no alerting.                                                                                         |

---

# Production Readiness

**Security:** RLS + hardened, `SECURITY DEFINER` atomic RPCs live-validated
on real infrastructure (Phase 2.5), including a live-triggered
`ConflictError` rejection. **Financial integrity:** the trading ledger's
atomicity, server-side computation, and concurrency safety were proven
against a throwaway instance (two real concurrent sessions) and then
live-verified with a real trade against the production-shaped project.
**Testing:** 170 unit tests, 7 runnable e2e tests, 32/32 live database
integration checks (permissions, constraints, concurrency, replay safety).
**Browser validation:** a complete manual click-through against the live
project — sign-in, dashboard, company creation, research editing,
valuation review, portfolio, trading, decision journal open/close,
monitoring dashboard — all confirmed working, several cross-checked
directly against the database. **Performance:** a code-level review found
and fixed the N+1/missing-loading-state issues most likely to matter at
this app's scale; no load testing has been done (not yet meaningful at
single-user scale). **Operational readiness:** no hosting, no monitoring/
alerting, no deployment pipeline — the application has only ever run
locally against the live database.

**Remaining production risks:** no click-level (only DB-level) idempotency
against a literal double-submit; no Vercel project or staging deployment;
per-field validation error messages are collapsed to one generic banner;
Server Action boilerplate duplication across ~10 files; two independent
implementations of the weighted-average-cost formula (TS pre-flight, SQL
authoritative — a deliberate ADR 0025 trade-off, not an oversight).

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
- **No pagination on list queries** (transactions, journal entries,
  companies). _Deferred:_ not yet a real problem at this app's data
  volume. _Target:_ before a real-sized transaction history/watchlist.
- **Server Action auth/service boilerplate duplicated** across ~10 action
  files. _Deferred:_ explicitly out of scope in the hardening pass; this
  project's own convention is to extract after a third near-identical
  copy, already exceeded. _Target:_ next UI-touching milestone.
- **CI does not run e2e tests.** _Deferred:_ not blocking, but the one
  place e2e coverage would catch a real regression runs on the honor
  system. _Target:_ near-term CI improvement, low effort.
- **Unsanitized search input** interpolated into a PostgREST filter string
  in `company-repository.ts`. _Deferred:_ currently unreachable, no search
  UI is wired yet. _Target:_ before any company search UI ships.
- **Validation errors collapse to one generic, unlabeled banner** on
  multi-field forms. _Deferred:_ fixing well means touching the shared
  error-mapping pattern across ~10 files. _Target:_ if/when this has more
  than one real user.

**Low**

- **No component-level tests** for ~30+ UI files (domain/service layer is
  well covered; UI is verified by type-check + build + the Phase 2.5
  manual click-through only). _Target:_ ongoing, opportunistic.
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

All 25 ADRs are `Accepted` except **ADR 0014** (Decision Engine as a
Dedicated, Non-Executing Domain), which is `Superseded by 0023`
(Investment Rating / Portfolio Action split) — the supersession is
recorded, not silently reversed, per this project's own ADR convention.

No ADR is currently `Proposed`/under active review. The two most consequential
recent decisions, worth a future contributor's attention if anything in
this area needs revisiting:

- **ADR 0023** — the Investment Rating / Portfolio Action split. The
  architectural spine Phase 2 was built around; changing it would touch
  `decision`, `portfolio`, and every UI surface that reads either.
- **ADR 0025** — atomic RPCs as the sole financial write path, with
  server-side arithmetic. A deliberate reversal of an earlier stated
  preference (Phase 2 Architecture Review 4.2) to close a critical
  security gap; carries the "two copies of the formula" trade-off listed
  in Technical Debt above.

---

# Recent Milestones

1. **2026-07-20 — Phase 2.5 Production Readiness.** Live Supabase project
   provisioned, migrations pushed, demo data seeded and verified, full
   manual click-through against live infrastructure, four UX/perf fixes.
   `3e307e9`.
2. **2026-07-20 — Security and Financial Integrity Hardening.** Closed the
   critical RPC-bypass gap; atomic, server-computed, concurrency-safe
   trading writes; `ConflictError`; live-tested including real
   concurrency. `b731220`.
3. **2026-07-19 — Phase 2 Remediation.** Fixed 6 of 9 Architecture Review
   findings from the Phase 2 build (atomicity, RLS validation, N+1
   dashboard, multi-portfolio UI, cross-company Journal view, ADR 0024).
   `11671cf`.
4. **2026-07-19 — Phase 2: Investment Research Platform.** The full
   consolidated milestone — 8 new domains, 10 tables, 9 UI screens.
   `8927bcf`.
5. **2026-07-19 — Foundation completion.** CI, Dependabot, developer
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

**Current state:** Phase 2.5 is complete and committed (`3e307e9`). A real
Supabase project is live, migrations are pushed, demo data is seeded and
verified, and the full application has been manually exercised against
live infrastructure with no defects found beyond the four already fixed.
`pnpm check`/`pnpm build` are clean. The project is at a genuine decision
boundary — nothing is broken or blocking, but the next step is a real
choice, not mechanical continuation.

**What should happen next:** Awaiting explicit approval to begin Phase 3
(Document Repository) — per `CLAUDE.md`, Phase 3 does not start
automatically. The user may instead prefer to close out one or more
Technical Debt items first (the click-level idempotency gap and a Vercel
staging deployment are the two most consequential ones still open).

**Requiring user input:**

- Approval to begin Phase 3, or a different priority instead.
- If Vercel deployment is wanted next: creating that account/project is
  the same category of action Supabase project creation was — this
  project's own docs (`docs/vercel-preparation.md`) already establish it
  as the user's call, not something to do unilaterally.
- The Supabase Personal Access Token used to provision the live project in
  Phase 2.5 is still active — recommended to revoke it from
  [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
  now that provisioning is done; the app itself never needs it.

**Known blockers:** None for Phase 3 (self-contained, no external
dependency beyond what already exists). Vercel deployment is blocked on
the same kind of account-creation step Supabase was, whenever that becomes
the priority.
