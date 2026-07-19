# 0008. Immutable Audit Log Strategy

**Status:** Accepted

## Context

Financial software must be able to answer who changed what and when, for every
significant record, from the start — not retrofitted once multiple users exist.
The original Phase 0 documentation treated auditing as a multi-user-phase concern,
which understated its importance for a single user managing real financial
decisions.

## Decision

Build a single, append-only `audit_log` table (immutability enforced by database
RLS/trigger denying `UPDATE`/`DELETE` for all roles, including the privileged
service role), populated via a dedicated subscriber on the internal event system
(ADR 0007), starting in Phase 1 rather than Phase 4 — detailed in
`audit-strategy.md`.

## Consequences

- Audit completeness is a consequence of the event system already being required
  for other reasons (recalculation, alerts), not a separately maintained checklist
  per call site.
- Database-enforced immutability means even a compromised or buggy application
  layer cannot alter history — a stronger guarantee than an application-level
  convention.
- Retained indefinitely by default, which is a deliberate storage-cost trade-off
  in favor of completeness, revisited only via an explicit future ADR if it
  becomes a problem.
- No dedicated query UI in early phases (direct SQL/dashboard access suffices) —
  a UI is scoped to Phase 5+ once real usage patterns are known.

## Alternatives Considered

- **Defer auditing to the multi-user phase** — the original approach; rejected on
  reflection as backwards for financial software, and as something considerably
  more expensive to retrofit than to build alongside the domain scaffolding.
- **A separate audit/logging system (e.g., a dedicated log aggregation service)**
  — rejected for this scale: Postgres `jsonb` handles structured before/after
  state well, and a second system would add operational overhead without a
  corresponding benefit yet.
- **Soft-delete/mutable audit rows with an "edited" flag** — rejected: undermines
  the core guarantee an audit trail exists to provide.

## Future Review Criteria

Revisit storage/retention approach if audit volume becomes a measurable cost or
performance concern (e.g., via table partitioning by time), or if a regulatory
requirement emerges that mandates a specific retention or export format not
currently anticipated.
