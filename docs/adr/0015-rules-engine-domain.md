# 0015. Deterministic Rules Engine as a Dedicated Domain

**Status:** Accepted

## Context

Investment discipline (allocation limits, stop levels, trim targets, stale-data
detection) needs to be enforced mechanically and consistently, independent of and
prior to any AI involvement — both so the system has a trustworthy deterministic
core, and so `decision-engine.md`'s synthesis has reliable, reproducible signals
to work from rather than needing to re-derive them itself.

## Decision

Introduce `domain/rules` as a distinct bounded context (`rules-engine.md`):
versioned `RuleDefinition`s expressed as a composable `RuleConditionGroup` tree,
evaluated as pure functions against an explicit input snapshot, producing
`RuleResult`s that record exactly what was evaluated. Rule actions are limited by
a closed enum (`signal`, `opportunity`, `alert`, `recommendation_trigger`) —
rules can never write directly to a financial record.

## Consequences

- Rule logic is fully unit-testable without a database, HTTP call, or AI
  provider — the highest bar for reliability this codebase applies to any domain,
  appropriate given rules encode investment discipline the user is meant to trust
  mechanically.
- Every evaluation (matched or not) is reproducible after the fact via the
  recorded `inputSnapshot` and `ruleVersion`, supporting both debugging ("why
  didn't this fire") and audit requirements.
- The closed `RuleAction.type` enum structurally prevents rules from mutating
  financial records directly, removing an entire class of potential bug (a rule
  silently changing a holding) by construction rather than by review discipline
  alone.
- Rule thresholds are sourced from `settings-engine.md`, meaning discipline
  parameters (e.g., cash threshold) are configurable without a deploy — at the
  cost of validating those settings carefully, since a misconfigured threshold
  could produce misleading signals.
- No rule-authoring UI ships with this domain initially — rules are
  developer-defined data, deployed via normal application changes; a UI is
  deferred until real usage justifies the investment.

## Alternatives Considered

- **Encode rules as arbitrary TypeScript predicates instead of data** — rejected:
  loses versionability, reproducibility, and the ability to record exactly which
  inputs were evaluated in a structured, queryable way; also harder to eventually
  expose to a configuration UI without embedding a script engine.
- **A general-purpose rules DSL / embedded scripting language** — rejected as
  over-engineering for the known example set; the closed condition-tree model
  covers every example given and is far simpler to test and reason about.
- **Let rules write directly to holdings/portfolio state (e.g., auto-trim)** —
  explicitly rejected: collapses "detect a condition" and "act on it" into one
  step, removing the human decision point and conflicting directly with the
  requirement that rules must not directly alter financial records.

## Future Review Criteria

Revisit the condition-tree model's expressiveness once real rule authoring
experience (Phase 5) surfaces a genuine need the closed operator set can't
express — extend the operator/field vocabulary deliberately at that point, rather
than generalizing pre-emptively now.
