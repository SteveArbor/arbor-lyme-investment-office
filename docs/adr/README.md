# Architecture Decision Records

This folder contains the Architecture Decision Records (ADRs) for Arbor Lyme
Capital: a sequential, permanent log of significant architectural decisions, the
context each was made in, and the alternatives considered.

## Rules

1. **ADRs are numbered sequentially** (`0001`, `0002`, ...) and never renumbered.
2. **ADRs are never edited to reverse a decision.** If a decision changes, a new
   ADR is written that supersedes the old one; the old ADR's status is updated to
   `Superseded by 00XX`, but its original content is left intact as a historical
   record of what was decided and why, at the time.
3. **Every ADR follows the same template** (below), so any future contributor —
   human or AI — can scan the folder and understand the system's architectural
   history without reading source code.
4. An ADR is written for any decision that would be expensive to reverse, affects
   multiple domains, or that a future contributor would reasonably ask "why was it
   done this way?" about. Routine implementation choices do not need an ADR.

## Template

```markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by NNNN | Deprecated

## Context

What situation/problem/constraint led to this decision being needed.

## Decision

What was decided, stated plainly.

## Consequences

What becomes easier or harder as a result. Both positive and negative.

## Alternatives Considered

What else was evaluated, and why it wasn't chosen.

## Future Review Criteria

What would cause this decision to be revisited.
```

## Index

| ADR  | Title                                                                        | Status   |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 0001 | Use Next.js App Router                                                       | Accepted |
| 0002 | Use Supabase as the Backend Platform                                         | Accepted |
| 0003 | Use PostgreSQL as the Primary Database                                       | Accepted |
| 0004 | Use Vercel for Hosting                                                       | Accepted |
| 0005 | Adopt Domain-Driven Design Folder Structure                                  | Accepted |
| 0006 | Provider Plugin Architecture for External Integrations                       | Accepted |
| 0007 | Internal Application Event System                                            | Accepted |
| 0008 | Immutable Audit Log Strategy                                                 | Accepted |
| 0009 | Database-Backed Feature Flag Framework                                       | Accepted |
| 0010 | AI Provider Abstraction                                                      | Accepted |
| 0011 | Centralised Settings Engine                                                  | Accepted |
| 0012 | Research Workspace as a Core Domain                                          | Accepted |
| 0013 | Document Repository Architecture                                             | Accepted |
| 0014 | Decision Engine as a Dedicated, Non-Executing Domain                         | Accepted |
| 0015 | Deterministic Rules Engine as a Dedicated Domain                             | Accepted |
| 0016 | Formal Data Classification Scheme                                            | Accepted |
| 0017 | Practical, Asset-Centric Threat Modelling Approach                           | Accepted |
| 0018 | Node.js 24 LTS and pnpm Toolchain Pinning                                    | Accepted |
| 0019 | Pin TypeScript to 6.0.x, Not the Newly-Released 7.0                          | Accepted |
| 0020 | Lazy (Not Eager) Environment Variable Validation                             | Accepted |
| 0021 | Database-Trigger-Based Profile/Settings Provisioning, No Service-Role Client | Accepted |
| 0022 | Baseline `'unsafe-inline'` CSP for Foundation, Not Nonce-Based               | Accepted |
