# 0003. Use PostgreSQL as the Primary Database

**Status:** Accepted

## Context

Financial records (transactions, holdings, valuations) are inherently relational,
require strong consistency (a transfer debiting one position and crediting another
must be atomic), and benefit from strict typing and constraints enforced by the
database itself, not only by application code.

## Decision

Use PostgreSQL, provisioned via Supabase (ADR 0002), as the sole system of record
for all application data, as detailed in `database-design.md`.

## Consequences

- Strong transactional guarantees (ACID) for financial writes.
- Native support for `jsonb` (used by the audit log, `audit-strategy.md`),
  `tsvector` full-text search (used by document search, `document-management.md`),
  and the `pgvector` extension (future semantic search) — meaning several future
  capabilities are additive on the existing database rather than requiring new
  infrastructure.
- Row-Level Security is available natively and is adopted as the authorization
  mechanism (`security-principles.md`).
- A single relational schema across all domains (portfolio, trading, research,
  documents, etc.) requires discipline in maintaining bounded-context boundaries in
  code (`domain-driven-design.md`), since the database itself does not enforce
  those boundaries — accepted as the right trade-off over the operational cost of
  separate databases per context at this scale.

## Alternatives Considered

- **MongoDB / a document database** — rejected: weaker consistency guarantees and
  a poor fit for relational financial data with strict invariants.
- **Separate databases per bounded context** — rejected for this phase as
  premature operational complexity; revisit only if a specific context's scale or
  isolation needs outgrow a shared instance.

## Future Review Criteria

Revisit if a specific bounded context's data/query patterns (e.g., very
high-volume market price history) genuinely outgrow a shared Postgres instance and
warrant a dedicated store — evaluated per-context, not as a wholesale migration.
