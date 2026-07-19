# Audit Strategy

> **Implementation status: Implemented** for the Foundation-scope actions
> (Login, Logout, Settings Changed) — `src/domain/audit/`, the append-only
> `audit_events` table, and the fail-open-but-logged behaviour described
> below are all built and tested. The Login/Logout capture limitation
> described in this document is real and current, not hypothetical — see
> `docs/implementation/foundation.md` for specifics. Audit coverage for
> every other action listed in this document (Transaction Added, AI Brief
> Generated, etc.) is **Planned**, arriving alongside the domain that
> produces it.

## Why This Cannot Be an Afterthought

The Phase 0 `security-principles.md` treated auditing as a Phase 4 (multi-user)
concern — reasonable when the only actor was a single trusted user, less
reasonable now that the system also includes AI-generated content, editable
financial records, and future shared access. Financial software must be able to
answer, at any point, "what changed, who changed it, and what did it look like
before" — for every user, from day one, not retrofitted once a second user
arrives. This document supersedes that earlier framing: the audit log is built in
Phase 1, alongside the domain scaffolding, not deferred.

## What Gets Audited

Every significant state-changing action produces an audit record. "Significant"
means: creates, updates, or deletes a financial record; changes configuration;
changes authorization; or represents an authentication event. Read-only actions
(viewing a dashboard) are not audited here — that is what application/access logs
are for, a different concern from the audit trail.

| Action                 | Domain    |
| ---------------------- | --------- |
| Holding Created        | portfolio |
| Holding Updated        | portfolio |
| Transaction Added      | trading   |
| Transaction Edited     | trading   |
| Transaction Deleted    | trading   |
| Portfolio Recalculated | analytics |
| AI Brief Generated     | ai        |
| AI Prompt Updated      | ai        |
| Alert Dismissed        | alerts    |
| Document Uploaded      | documents |
| Settings Changed       | settings  |
| Login                  | auth      |
| Logout                 | auth      |

This list grows as new domains ship (e.g., "Research Note Updated" when
`research-workspace.md` is implemented) — the mechanism below is generic across
all of them, so adding a new audited action is a matter of subscribing a new
handler, not extending a bespoke system per domain.

## How Records Are Captured

The audit log is a subscriber on the internal event system (`event-system.md`),
not a function every call site remembers to invoke. A single `AuditEventHandler`
subscribes to the relevant event types (`TransactionCreated`, `SettingsChanged`,
etc.) and writes one audit record per event, in the outbox tier for
non-time-critical writes or the in-request tier where the record must exist before
the response returns. This guarantees completeness: as long as an action correctly
raises its domain event (already required by the architecture for other reasons —
recalculation, alerts), auditing happens automatically, rather than depending on
every developer remembering a separate "and also write an audit row" step.

`Login`/`Logout` are the exception — they originate from Supabase Auth rather than
a domain service, so they are captured via a dedicated listener on Supabase Auth's
session events, mapped into the same `audit_log` shape as everything else.

## Record Shape

```ts
interface AuditRecord {
  id: string; // uuid
  occurredAt: string; // timestamptz
  actorId: string | null; // auth.users.id; null for system-initiated actions
  action: string; // e.g. "transaction.deleted"
  entityType: string; // e.g. "transaction"
  entityId: string;
  before: unknown | null; // prior state (jsonb), null for creates
  after: unknown | null; // new state (jsonb), null for deletes
  correlationId: string; // ties back to the originating request/event chain
  metadata: Record<string, unknown>; // e.g. { ipAddress, userAgent } for auth events
}
```

`before`/`after` store the relevant entity state as JSON, not a generic diff
string — this keeps the record self-contained and queryable (e.g., "show me every
transaction edit that changed `quantity`") without reconstructing state from
surrounding rows.

## Storage

- A single `audit_log` table in the same PostgreSQL database (see
  `database-design.md`), not a separate system — at this scale, a second storage
  system for audit data would be operational overhead without a matching benefit,
  and Postgres's `jsonb` support handles the `before`/`after` payloads well.
- **The table is append-only, enforced by the database, not just by convention.**
  RLS policies and a database trigger explicitly deny `UPDATE` and `DELETE` on
  `audit_log` for all roles, including the application's normal service role — the
  only way a row is added is `INSERT`. This is what makes the log actually
  immutable rather than immutable-by-agreement; a compromised application layer
  cannot alter history.
- The service-role key used elsewhere for privileged operations (per
  `security-principles.md`) is deliberately _not_ granted delete/update rights on
  this table, even though it bypasses RLS for other purposes — immutability holds
  regardless of which credential is used.

## Retention

- Audit records are retained indefinitely by default. Financial record-keeping
  norms and the possibility of future regulatory/compliance obligations both argue
  against time-boxed deletion; storage cost for append-only JSON rows at this
  system's scale is not a meaningful constraint.
- If retention limits are ever introduced (e.g., for a specific low-sensitivity
  action type), that is a deliberate, documented policy change (a new ADR, per
  `docs/adr/`) — not a default background job quietly deleting history.

## Querying

- **Phase 1–3:** queried directly via SQL/Supabase dashboard when needed (e.g.,
  investigating a discrepancy) — no dedicated UI yet, consistent with not
  building tooling ahead of actual need.
- **Phase 5+ (per `development-roadmap.md`):** a read-only Audit Log screen (see
  `product-specification.md`) lets the principal (and, later, an "owner" role
  user) filter by entity, actor, action type, and date range — surfacing the same
  `audit_log` table, not a separate reporting pipeline.
- Indexes on `entityType, entityId`, `actorId`, and `occurredAt` support the
  expected query patterns (an entity's full history; a user's activity; a time
  window) without needing to design indexing further ahead of actual usage
  patterns.

## Relationship to Other Documents

- **`event-system.md`** — the delivery mechanism audit records ride on.
- **`security-principles.md`** — the broader security posture this supports;
  auditability is one control among several (authentication, authorization,
  encryption), not a replacement for any of them.
- **`database-design.md`** — the concrete (conceptual, pre-implementation) shape
  of the `audit_log` table.
