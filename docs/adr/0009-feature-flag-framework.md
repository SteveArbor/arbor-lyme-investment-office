# 0009. Database-Backed Feature Flag Framework

**Status:** Accepted

## Context

New modules (AI Briefing, Research Workspace, Document Repository, Broker
Integration, Property Module, Family Office, Tax Planning, Portfolio Sharing,
Commercial Features) will merge to `main` at different stages of completeness
under the project's continuous-deployment model (`deployment-strategy.md`). Deploy
and release need to be decoupled so incomplete work never becomes visible or
usable prematurely.

## Decision

Implement feature flags as a simple database-backed registry (`feature_flags` /
`user_feature_flags` tables) resolved through the same layered-precedence model as
`settings-engine.md`, wrapped behind a `FeatureFlagProvider` interface consistent
with `provider-architecture.md` — detailed in `feature-flags.md`. No third-party
flag service is adopted.

## Consequences

- Flags can be toggled without a deploy (useful for killing a problematic feature
  quickly), while requiring no new external vendor or cost.
- Flag evaluation reuses infrastructure (Postgres, the settings resolution
  pattern) already built for other reasons, minimizing new operational surface.
- Places a maintenance obligation on the team to graduate and delete flags once a
  feature is stable — without this discipline, flags accumulate as dead
  conditionals; this is called out explicitly as part of the Definition of Done
  (`engineering-standards.md`).
- Does not support sophisticated rollout strategies (percentage-based, gradual
  rollout across large cohorts) — acceptable given the small, known user base this
  system serves.

## Alternatives Considered

- **LaunchDarkly / Split / a managed flag service** — rejected: solves problems
  (large-scale experimentation, statistical rollout analysis) this project does
  not have, at a cost and integration overhead not justified at this scale.
- **Environment-variable-based flags** — rejected: cannot be toggled per-user or
  without a redeploy, which defeats a key purpose (killing a feature instantly,
  testing with a single user before wider rollout).

## Future Review Criteria

Revisit if the user base grows enough that percentage-based or cohort-based
rollout genuinely becomes necessary — at that point, the existing
`FeatureFlagProvider` interface allows swapping in a managed service without
touching call sites.
