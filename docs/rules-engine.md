# Rules Engine

## Purpose

`domain/rules` provides deterministic, testable investment discipline —
mechanical checks against portfolio and market state that do not depend on AI and
produce the same result every time given the same inputs. This is the system's
counterweight to `decision-engine.md`'s AI-assisted synthesis: a core of
behaviour that is fully reproducible, fully testable without any external
service, and fully understandable by reading the rule definition itself.

This is a design specification only. `domain/rules` is built in Phase 5
(`development-roadmap.md`), before `decision` (Phase 6), because the decision
engine depends on rule output — signals must exist before they can be
synthesized.

## Core Concepts

### `RuleDefinition`

The declarative, versioned description of a single rule.

```ts
interface RuleDefinition {
  id: string;
  key: string; // stable identifier, e.g. "max_allocation_exceeded"
  name: string;
  description: string;
  category: "allocation" | "valuation" | "risk" | "cash" | "data_quality" | "calendar";
  condition: RuleConditionGroup;
  action: RuleAction;
  version: number;
  isActive: boolean;
  createdAt: string;
}
```

### `RuleCondition` and `RuleConditionGroup`

A rule's logic is expressed as a composable tree of conditions, not procedural
code — this is what makes rules inspectable, versionable as data, and (in a later
phase, not now) editable without a deployment.

```ts
interface RuleCondition {
  field: string; // e.g. "holding.allocationPercent"
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "stale_after";
  value: number | string;
}

interface RuleConditionGroup {
  logic: "AND" | "OR";
  conditions: (RuleCondition | RuleConditionGroup)[];
}
```

Fields reference a well-defined, versioned evaluation context (analogous to
`decision-engine.md`'s `DecisionContext`) assembled from `portfolio`, `market`,
and `analytics` — a rule never reaches into those contexts directly (respecting
the dependency rule in `domain-driven-design.md`); it evaluates against a
snapshot handed to it.

### `RuleEvaluation` and `RuleResult`

An evaluation is a single run of one rule against one snapshot of inputs. The
result is retained, not discarded, because reproducibility requires being able to
show exactly what was evaluated and when.

```ts
interface RuleEvaluation {
  id: string;
  ruleId: string;
  ruleVersion: number;
  evaluatedAt: string;
  inputSnapshot: Record<string, unknown>; // exact field values used, verbatim
  subjectType: "holding" | "portfolio" | "asset";
  subjectId: string;
}

interface RuleResult {
  id: string;
  evaluationId: string;
  matched: boolean;
  triggeredAction: RuleAction | null;
}
```

`inputSnapshot` recording the exact values a rule saw — not just a reference to
"current state" — is what makes a `RuleResult` reproducible after the fact: the
underlying holding or market data may have since changed, but what the rule
actually evaluated remains verifiable, satisfying the explicit requirement that
"every result must record the inputs used."

### `RuleAction`

What a matched rule produces. A rule never writes directly to a financial record —
it emits something for another context to act on.

```ts
interface RuleAction {
  type: "signal" | "opportunity" | "alert" | "recommendation_trigger";
  payload: Record<string, unknown>;
}
```

This directly implements "rules must not directly alter financial records. Rules
may generate signals, opportunities, alerts or recommendations" — the type enum
is closed to exactly those four outcomes, structurally preventing a rule
implementation from doing anything else (e.g., there is no `type: "write_holding"`
to even reach for).

### `RuleVersion`

Rules are versioned explicitly, not overwritten in place.

```ts
interface RuleVersion {
  ruleId: string;
  version: number;
  condition: RuleConditionGroup;
  action: RuleAction;
  effectiveFrom: string;
  changeNote: string;
}
```

A `RuleEvaluation` always records `ruleVersion` (above), so a historical result
remains interpretable even after the rule's logic has since changed — this is the
rules-engine analogue of `database-design.md`'s immutability-by-default posture
applied to logic rather than data.

## Example Rules (Illustrative, Not Exhaustive)

| Rule                                                         | Category     | Example condition                                                              |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------ |
| Holding exceeds maximum permitted allocation                 | allocation   | `holding.allocationPercent > holding.maxAllocationPercent`                     |
| Asset enters a configured buy zone                           | valuation    | `asset.price <= holding.buyZoneUpper AND asset.price >= holding.buyZoneLower`  |
| Tactical trade reaches its stop level                        | risk         | `asset.price <= holding.stopLevel`                                             |
| Cash exceeds threshold while a qualifying opportunity exists | cash         | `portfolio.cashPercent > settings.cashThreshold AND opportunity.exists = true` |
| Holding reaches a trim target                                | valuation    | `holding.unrealizedGainPercent >= holding.trimTargetPercent`                   |
| Market data is stale                                         | data_quality | `market.sourceTimestamp stale_after settings.maxDataAge`                       |
| Earnings event approaching                                   | calendar     | `asset.nextEarningsDate - now() <= settings.earningsLookaheadDays`             |

Each of these is expressed purely as a `RuleConditionGroup` over a snapshot —
none require AI, none require network access at evaluation time (the snapshot is
assembled beforehand by the calling context), which is precisely what makes them
unit-testable as pure functions.

## Requirements (Restated as Design Constraints)

- **Versioned.** Every `RuleDefinition` change produces a new `RuleVersion`; a
  rule's history is never overwritten (mirrors ADR 0008's audit-immutability
  reasoning, applied to rule logic).
- **Reproducible.** A `RuleEvaluation` is a pure function of `inputSnapshot` and
  the specific `ruleVersion` evaluated — no hidden state, no current-time lookups
  inside the evaluation itself (any time-relative comparison, e.g. `stale_after`,
  receives "now" as part of the snapshot, not by calling the clock internally).
- **Inputs recorded.** `RuleEvaluation.inputSnapshot` is retained on every
  evaluation, matched or not, so non-matches are auditable too (useful for
  answering "why didn't this rule fire").
- **Testable without infrastructure.** Rule evaluation is plain TypeScript over
  plain data — no database, no HTTP call, no Supabase client — consistent with
  `domain-driven-design.md`'s dependency rule and directly enabling the unit-test
  coverage required by `engineering-standards.md` for high-risk domain logic.
- **No direct financial record mutation.** Enforced structurally via the closed
  `RuleAction.type` enum, not merely by convention.

## Relationship to Other Domains

- **`portfolio`, `market`, `analytics`** — supply the snapshot a rule evaluates
  against; `rules` never queries them directly (per `domain-driven-design.md`),
  it receives an assembled snapshot from the calling application service.
- **`decision`** (`decision-engine.md`) — the primary consumer of `RuleResult`s,
  turning matched rules into `DecisionSignal`s.
- **`alerts`** — a rule's `RuleAction` of type `"alert"` is the direct source of
  an `AlertCreated` event (`event-system.md`).
- **`settings`** — rule thresholds (e.g., `cashThreshold`, `maxDataAge`) are
  read from `settings-engine.md`, not hardcoded, so discipline parameters are
  user-configurable without a code change.
- **`event-system.md`** — a matched rule with a non-`signal` action raises the
  corresponding event (`OpportunityGenerated`, `AlertCreated`); `audit-strategy.md`
  subscribes to record every rule evaluation that produced an action.

## Non-Goals

- Not a general-purpose rules DSL/scripting engine — the condition model is a
  fixed, closed tree of comparisons, not an embedded expression language, kept
  deliberately simple per YAGNI (`engineering-standards.md`).
- Not a replacement for `decision`'s synthesis — a rule matching is a signal, not
  a recommendation; turning signals into an actionable recommendation with
  confidence and evidence is `decision-engine.md`'s job, not this domain's.
- No user-facing rule _authoring_ UI in the phase this ships — rules are
  developer-defined initially; a configuration UI is a later, separate
  consideration once the rule catalogue and its usage patterns are proven out.
