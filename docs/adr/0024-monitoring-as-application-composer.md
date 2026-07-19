# 0024. Monitoring Dashboard as an Application-Layer Composer, Not a Domain

**Status:** Accepted

## Context

`docs/development-roadmap.md`'s Phase 2 item 9 lists "Monitoring Dashboard"
as a deliverable alongside `company`, `research`, `thesis`, `valuation`,
`decision`, `portfolio`, `trading`, and `journal` — each of which is a real
bounded context under `domain/`, with its own model, repository interface,
service, migration, and tests. When Phase 2 was implemented, Monitoring was
built differently: as `buildCompanyMonitoringSnapshot(s)` in
`application/services/monitoring.ts`, with no `domain/monitoring` folder, no
new table, and no repository interface of its own. That decision was made
during implementation, without the ADR treatment every other Phase-2-scale
architectural choice in this codebase gets (see ADR 0023 for the sibling
decision made the same phase). The Phase 2 Architecture Review
(`docs/implementation/phase-2-architecture-review.md`, finding 4.4) flagged
this as a real deviation from the established pattern that needed to be
either documented or reversed, not left implicit.

## Decision

Monitoring stays an application-layer composer, not a bounded context.
Formalized here rather than reversed, for the following reason:

**A bounded context owns data and the business rules that govern it.**
Monitoring owns neither. Every field a monitoring view needs — thesis
status, margin of safety, blended fair value, the latest Investment
Rating, risks, monitoring metrics, open journal entries — is already
computed and stored by another domain, each with its own single-write
update path (`ResearchService.updateResearch`,
`ThesisService.updateStatements`, `ValuationService.updateValuation`,
`DecisionService.generateRating`, `JournalService.openEntry`/`closeEntry`).
Giving Monitoring a table of its own would mean one of two things, both
worse than the current design:

1. **A cache/materialized copy**, which must be kept in sync with five
   other domains' writes — the exact "duplicated logic" (and duplicated
   _data_, an easier way for the same class of bug to appear) this
   project's architecture rules exist to prevent. It would also directly
   contradict the roadmap's own framing of this feature: "designed so a
   future earnings update is a single write that flows through to every
   dependent view" only holds if the view reads current data, not a copy.
2. **An empty pass-through repository** that does nothing but re-expose
   other domains' data under a `domain/monitoring` label — a bounded
   context in name only, adding an indirection layer with no independent
   reason to exist.

Two composer functions exist, matching two different consumers with
different correctness requirements:

- **`buildCompanyMonitoringSnapshot`** — one company at a time (the Company
  Overview screen). Uses each domain's `getOrCreate*` methods, which is
  correct there: a user opening a single company's page and about to edit
  its research/thesis/valuation should see (and can safely cause the
  creation of) the default empty state.
- **`buildCompanyMonitoringSnapshots`** (batch) — every company at once
  (the Dashboard). Uses batch `listByCompanyIds` reads instead, added
  specifically because `getOrCreate*` in a loop was both an N+1 query
  pattern and an unwanted write side effect from merely viewing a list
  (Architecture Review finding 4.5). It represents "no row yet" as `null`,
  never a fabricated default — a second, independent reason this can't be
  a bounded context with its own always-present row: there is no default
  monitoring state to hand out, only "not yet researched/valued/rated."

## Consequences

- No `domain/monitoring` folder, no `monitoring_snapshots` table, no
  migration. Nothing to keep in sync.
- `application/services/monitoring.ts` is allowed to import from six
  domains' public service interfaces (narrowed via `Pick<>` at each call
  site) — this is the one place in the codebase where that breadth of
  cross-domain awareness is architecturally correct, because assembling a
  cross-domain view is application-layer orchestration by definition
  (`docs/domain-driven-design.md`'s dependency rules govern `domain/*`
  importing `domain/*`; they don't forbid `application/*` reading many
  domains' services — that's what the application layer is for).
- Every domain's own update path remains the single place that field is
  written; Monitoring can never drift from it because it never stores a
  copy.
- If a future requirement needs monitoring-specific state that no other
  domain owns (a per-company dashboard note, a custom watch threshold),
  that specific piece of state would justify a real `domain/monitoring`
  bounded context at that point — this ADR governs the current, read-only,
  fully-derived shape of the feature, not a permanent ban on ever creating
  one.

## Alternatives Considered

- **Create `domain/monitoring` with a materialized snapshot table,
  refreshed on every relevant domain event** — rejected: real complexity
  (an event-driven refresh path across five domains, using the internal
  event system's outbox tier per `docs/event-system.md`) to solve a
  problem the direct-read approach doesn't have, in exchange for
  eventual-consistency risk the direct-read approach also doesn't have.
  Worth reconsidering only if read latency at real scale (hundreds of
  companies) makes the batch composer's per-request query cost
  unacceptable — not a concern at this project's scale.
- **Create `domain/monitoring` as a pure pass-through with no storage** —
  rejected: adds a layer of indirection (repository interfaces that just
  forward to other domains' repositories) with no independent behavior,
  purely to satisfy the folder-per-bounded-context pattern's letter rather
  than its purpose.
- **Leave the deviation undocumented** — the status quo this ADR replaces;
  rejected per the Architecture Review's explicit recommendation.

## Future Review Criteria

Revisit if: (a) Monitoring ever needs to persist state no other domain
owns, or (b) the batch composer's query count becomes a measured
performance problem at real usage scale — evaluated against real data, not
speculatively now.
