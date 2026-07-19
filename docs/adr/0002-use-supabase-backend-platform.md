# 0002. Use Supabase as the Backend Platform

**Status:** Accepted

## Context

The application needs authentication, a relational database, authorization, and
file storage, operated by a small team without dedicated infrastructure/DevOps
capacity, while retaining real PostgreSQL underneath (not a proprietary database)
given the financial-data domain's need for relational integrity.

## Decision

Use Supabase as the managed platform providing PostgreSQL, Authentication, Row-Level
Security-based authorization, and Storage, as detailed in `technology-stack.md`.

## Consequences

- A single vendor and credential set covers database, auth, and storage, minimizing
  operational surface area.
- Row-Level Security becomes the system's core authorization mechanism
  (`security-principles.md`), enforced at the database layer rather than solely in
  application code.
- Introduces a dependency on Supabase's availability and pricing model; mitigated
  by the fact that the underlying data (Postgres) is portable — migrating off
  Supabase's managed layer (while keeping Postgres) is a realistic, if nontrivial,
  escape hatch.
- `AuthenticationProvider` and `StorageProvider` interfaces (`provider-architecture.md`)
  are still defined despite this being a firm choice, primarily for testability,
  not because a near-term vendor switch is expected.

## Alternatives Considered

- **Firebase** — rejected: NoSQL-first, a poor fit for inherently relational
  financial records requiring transactional integrity.
- **Self-hosted Postgres + custom auth (e.g., on Railway/Fly.io)** — rejected for
  this phase: more operational burden (patching, backups, auth security) than a
  small team should take on without a specific need Supabase doesn't meet.
- **AWS (RDS + Cognito + S3)** — rejected: significantly higher setup/operational
  complexity for equivalent capability at this project's current scale.

## Future Review Criteria

Revisit if Supabase's pricing becomes prohibitive at scale, if RLS performance
becomes a bottleneck at data volumes not currently anticipated, or if a specific
feature (e.g., advanced auth requirements for an enterprise/commercial tier, per
`feature-flags.md`'s "Commercial Features") outgrows Supabase Auth's capabilities.
