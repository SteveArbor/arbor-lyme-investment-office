# Database Design

> **Implementation status:** this document is the design-principles reference
> (naming conventions, RLS strategy, append-only strategy) — the authoritative,
> current-as-of-milestone table list and DDL live in `supabase/migrations/`, not
> here. `profiles`, `user_settings`, `audit_events` (Foundation),
> `companies`, `research_notes`, `theses`, `valuations`,
> `decision_recommendations`, `portfolios`, `holdings`, `transactions`,
> `journal_entries` (Phase 2), and `entity_versions` (Phase 2, shared version
> history) are **Implemented**; see
> `docs/implementation/foundation.md`, `docs/implementation/phase-2-architecture-review.md`,
> and `docs/implementation/phase-3-architecture-review.md` for what was
> validated and how. `documents`, `events` (the outbox table), and the
> multi-user `memberships` table remain **Planned**, per
> `development-roadmap.md`. The "Anticipated Core Entities" list below
> predates Phase 2 and is kept as historical planning context, not a current
> schema reference — several entities it describes (`accounts`, `assets`,
> `positions`) were superseded by the simpler `portfolios`/`holdings`/
> `transactions` shape Phase 2 actually built.

This document describes the design principles and conventions for the PostgreSQL
schema, hosted on Supabase. It describes _how_ the schema is designed, not a
substitute for the migrations themselves.

## Guiding Principles

1. **The database enforces its own invariants.** Constraints (`NOT NULL`, foreign
   keys, `CHECK` constraints, uniqueness) are defined at the schema level, not
   assumed to be upheld only by application code. The database is the last line of
   defense for data integrity.
2. **Ownership is modeled from day one.** Every user-scoped table has a column
   identifying who owns/can access it, even before multi-user support ships, so RLS
   policies and later multi-user extension require no schema rewrite (see
   `architecture.md`).
3. **Money is never a floating-point type.** Monetary amounts use `numeric`
   (arbitrary-precision decimal) with an explicit, documented scale — never
   `float`/`double precision`, which introduces rounding errors unacceptable in
   financial records.
4. **Every financial record is immutable once written, where practical.**
   Transactions are corrected via reversing/adjusting entries rather than
   destructive `UPDATE`/`DELETE`, preserving a truthful history — mirroring standard
   accounting practice and supporting the audit trail described in
   `security-principles.md`.
5. **Row-Level Security is enabled on every table containing user data**, with no
   exceptions "for now." A table without RLS is an explicit, reviewed decision, not
   a default.

## Anticipated Core Entities (Conceptual — Not Final Schema)

These are the entities expected to emerge in Phase 2 of the roadmap. Exact column
lists and relationships will be finalized during that phase's design work, but the
shape is outlined here so later documents (and future schema work) share a common
vocabulary.

- **`users`** — managed by Supabase Auth (`auth.users`); application tables
  reference `auth.users.id`, they do not duplicate identity data.
- **`portfolios`** — a named collection of holdings belonging to an owner (and later,
  potentially shared with other members via a membership table).
- **`memberships`** — (introduced in Phase 4) links a user to a portfolio/household
  with a role (`owner`, `editor`, `viewer`), forming the basis of multi-user
  authorization described in `architecture.md`.
- **`accounts`** — a sub-division of a portfolio representing a real-world account
  (e.g., a brokerage or bank account) holdings and transactions belong to.
- **`assets`** — a reference table of tradable/holdable instruments (ticker, name,
  asset class), shared reference data rather than duplicated per portfolio.
- **`positions`** — current or historical holding of an asset within an account
  (quantity, cost basis).
- **`transactions`** — the immutable ledger of buys, sells, deposits, withdrawals,
  dividends, fees, etc. This is the true source of truth; positions can, in
  principle, be derived from transactions.
- **`valuations`** — periodic recorded value of a position or portfolio at a point
  in time (e.g., daily/monthly snapshot), supporting historical performance
  reporting without recomputing from scratch each time.
- **`audit_log`** — append-only record of who changed what and when, built from
  Phase 1 (not deferred to multi-user, per `audit-strategy.md` and ADR 0008).
- **`settings`** — system-level configuration defaults; **`user_settings`** —
  per-user overrides. Both resolved through the layered precedence chain in
  `settings-engine.md`.
- **`feature_flags`** — system-level flag defaults; **`user_feature_flags`** —
  per-user overrides. See `feature-flags.md`; modeled as a boolean-typed sibling
  of the settings tables, following the same resolution pattern.
- **`research_notes`** — one per researched asset, owning structured thesis
  sections; **`research_review_entries`** — the curated review-history timeline
  for a note. See `research-workspace.md`.
- **`documents`** — document metadata; **`document_versions`** — version history
  per document; **`document_relationships`** — many-to-many links from a document
  to the portfolios/holdings/research notes/transactions it supports. See
  `document-management.md`.
- **`events`** — the transactional outbox table backing the durable tier of the
  internal event system (`event-system.md`): rows are inserted in the same
  transaction as the domain write that raised them, and marked processed by a
  scheduled polling job.

## Naming Conventions

- Tables: plural, `snake_case` (e.g., `transactions`, `portfolios`).
- Primary keys: `id`, using `uuid` (via `gen_random_uuid()`), consistent with
  Supabase Auth's use of UUIDs — makes joining against `auth.users.id` natural and
  avoids leaking sequential-ID information (e.g., guessable record counts).
- Foreign keys: `<referenced_table_singular>_id` (e.g., `portfolio_id`,
  `account_id`).
- Timestamps: every table has `created_at` and `updated_at` (`timestamptz`,
  defaulting to `now()`), maintained consistently across the schema.
- Ownership columns: `owner_id` (referencing `auth.users.id`) on any directly-owned
  table; membership-based access for shared entities goes through the
  `memberships` table rather than a list column.

## Migrations

- Schema changes are made exclusively through versioned migration files (Supabase
  CLI migrations), never through ad hoc changes in the Supabase dashboard for
  anything beyond local exploration — the migration history is the schema's source
  of truth and is checked into the repository.
- Migrations are additive and reversible where possible; destructive migrations
  (dropping a column/table) require a deliberate, reviewed step, particularly once
  real financial data exists.
- Migrations are applied identically across development, staging, and production
  environments (see `deployment-strategy.md`) — no environment is allowed to drift
  from what the migration history describes.

## Row-Level Security Strategy

- **Phase 2 (single user):** policies check `owner_id = auth.uid()` — simple,
  direct ownership.
- **Phase 4 (multi user):** policies are extended to check membership via the
  `memberships` table (e.g., "does a row exist in `memberships` linking
  `auth.uid()` to this record's `portfolio_id`, with a role permitting the
  requested operation"). This is a policy change, not a table redesign, because
  ownership was modeled explicitly from the start.
- Policies are written per-operation (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
  rather than one broad policy, so that (for example) a `viewer` role can be
  granted `SELECT` without incidentally granting write access.
- Every new table's RLS policy is written and tested (including a negative test —
  confirming an unauthorized user _cannot_ access it) before the table is
  considered complete.

## Append-Only Tables

`audit_log`, and `transactions` in practice (per the "immutable once written"
principle above), are treated as append-only at the database level, not merely by
convention: `UPDATE`/`DELETE` are explicitly denied via RLS policy and a
supporting trigger for all roles, including the privileged service role, for
`audit_log` specifically — see `audit-strategy.md` for the full reasoning. This
guarantee is what makes the audit trail trustworthy even against a bug or
compromise in the application layer, and it is verified as part of that table's
implementation, not assumed.

## Atomic Multi-Table Writes and Optimistic Concurrency

Some operations must change more than one table together, with no window
where a caller could observe (or a crash could leave) a partial result —
the trading ledger's buy/sell/dividend/cash-adjustment writes are the
current example (`transactions`, `holdings`, `portfolios.cash` together).
Because this project's Server Actions each make independent
`supabase-js` round trips (there is no live connection to hold a single
transaction open across a read, application-layer computation, and a
later write — see `architecture.md`'s serverless/PostgREST model), this is
handled with a Postgres function (`SECURITY INVOKER`, never `DEFINER` — RLS
and the caller's own grants remain the enforcing authority, consistent
with ADR 0021's "no service-role client" principle), called once via
`.rpc()`, that performs every write inside its own single implicit
transaction. See `supabase/migrations/20260719000014_atomic_transaction_functions.sql`
and ADR-worthy reasoning in `docs/implementation/phase-2-architecture-review.md`
section 4.1.

Where a write also depends on a value the caller read earlier (not just
"change this row," but "blend this new value into whatever the row
currently holds," which cannot be expressed as a single relational delta),
atomicity alone is not enough — a concurrent write between the read and
this write can still silently overwrite the other's effect. The holdings
table's quantity/average-cost columns are the current example. This is
closed with optimistic concurrency control: the function takes the value
the caller read as an additional parameter and only applies the write if
the row still matches it, raising a distinct errcode otherwise so the
caller can re-read and retry. See
`supabase/migrations/20260720000001_optimistic_concurrency_for_holdings.sql`
and ADR 0025 for the full reasoning, alternatives considered, and live
concurrent-session evidence that it works.

**Convention for future migrations needing either pattern:** custom
`errcode` values use a project-specific, non-reserved prefix (`ALC0x`),
never Postgres's reserved `P000x` range — `P0004` specifically collides
with the built-in `ASSERT_FAILURE` condition, which `exception when
others` does not catch, a mistake made and caught live during this
project's own validation (ADR 0025, `docs/implementation/phase-3-architecture-review.md`).

## Indexing & Performance

- Foreign key columns are indexed by default.
- Query patterns anticipated from the dashboard/reporting views (Phase 2–3) —
  e.g., "all transactions for a portfolio within a date range" — inform composite
  indexes once those queries are implemented, rather than speculatively indexing
  every column up front.

## Historical Integrity

- Reference data that can change over time (e.g., an asset's name) is not assumed
  static; where historical accuracy matters (e.g., what an asset was called at the
  time of a transaction), the relevant value is captured on the transaction/record
  itself rather than only joined live from current reference data.

## Backup & Recovery

The database's backup strategy, recovery objectives (RTO/RPO), restore testing
approach, and provider-loss scenarios are specified in full in
`deployment-strategy.md`'s "Backups & Disaster Recovery" section — not repeated
here to avoid the two documents drifting apart. The schema-relevant point worth
stating here: because every migration is version-controlled
(see "Migrations" above), the _schema_ is always reconstructable from source
control independent of any database backup — only the _data_ depends on backup
recovery, which narrows what a worst-case recovery scenario actually depends on.

## Out of Scope for This Document

Actual `CREATE TABLE` statements, final column lists, and specific RLS policy SQL
are Phase 2 deliverables (per `development-roadmap.md`), produced and reviewed at
that time — not part of this planning documentation.
