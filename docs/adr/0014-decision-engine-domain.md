# 0014. Decision Engine as a Dedicated, Non-Executing Domain

**Status:** Superseded by [0023](0023-investment-rating-vs-portfolio-action.md)
— the domain itself (this ADR's core decision) remains accepted; only the
single-enum output vocabulary described here has been replaced by the
Investment Rating / Portfolio Action split.

## Context

The system needs to synthesize deterministic rule output, portfolio/analytics
facts, and research judgement into a single, actionable recommendation — but no
existing bounded context is the right home for this. `rules` must remain purely
deterministic and testable (`rules-engine.md`); `analytics` must remain a pure
calculation layer; `research` is human-authored judgement with its own lifecycle.
Blending synthesis logic into any of those would compromise the guarantee each is
specifically designed to provide.

## Decision

Introduce `domain/decision` as a distinct bounded context (`decision-engine.md`)
that consumes — but does not compute — facts and signals from `portfolio`,
`market`, `analytics`, `rules`, and `research`, and produces a `DecisionRecommendation`
that is structurally required to be explainable (action, confidence, supporting
and contradictory evidence, risks, portfolio impact, invalidation conditions,
source timestamps, conclusion source). **This domain never places trades or
executes any action** — its output is advisory only, presented to a human.

## Consequences

- Deterministic and non-deterministic (AI-assisted) logic are cleanly separated:
  `rules` stays pure; `decision` is where weighing/synthesis, including AI input,
  is allowed to happen — with AI structurally confined to narrative synthesis over
  numbers `analytics` already computed, never to computing those numbers itself.
- Every recommendation is auditable and reviewable over time via `DecisionOutcome`
  and `DecisionReview`, supporting the accountability goals in
  `audit-strategy.md` extended to the system's own advisory output, not just user
  actions.
- Adds a moderately complex aggregate (`DecisionRecommendation` with several
  required sub-collections) — justified because "the system just tells me what to
  do with no visible reasoning" is a materially worse and less trustworthy product
  for financial decision support than the explicit structure adopted here.
- Requires every future consumer of a recommendation (UI, alerts, briefings) to
  render the full explainability contract, not just the headline action — a
  constraint intentionally hard to bypass because the contract is schema-level, not
  a rendering convention.

## Alternatives Considered

- **Fold synthesis into `rules`** — rejected: would contaminate the rules engine's
  deterministic, reproducible guarantee with AI-assisted, non-deterministic
  weighing logic.
- **Fold synthesis into `ai`** — rejected: would make `analytics`-sourced
  financial figures appear to originate from (or be recomputable by) the AI
  context, directly conflicting with the requirement that AI never be the sole
  source of financial calculations.
- **A simple "score" output instead of a structured recommendation** — rejected:
  a single number or label without evidence/risk/invalidation detail is not
  explainable and does not meet the stated requirement.
- **Allow the decision domain to place trades directly (auto-execution)** —
  explicitly rejected, out of scope for the entire system, and rejected here
  specifically because collapsing "recommend" and "execute" into one domain would
  remove the human decision point this domain exists to inform.

## Future Review Criteria

Revisit if `conclusionSource` proves insufficiently granular once a real AI
implementation exists (e.g., if partial-AI-influence needs finer-grained
disclosure than the current four-value enum) — evaluated once Phase 6
(`development-roadmap.md`) implementation is underway, not speculatively now.
