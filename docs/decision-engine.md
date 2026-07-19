# Decision Engine

## Purpose

`domain/decision` combines trusted information from `portfolio`, `market`,
`analytics`, `rules`, and `research` into structured, explainable decision
support output for the user. It is the point where deterministic calculation,
rule evaluation, research judgement, and (later) AI-assisted synthesis converge
into a single recommendation the user can act on — or reject, with full visibility
into why it was made.

**The decision domain never places a trade.** It produces recommendations for a
human to consider. Trade execution is explicitly out of scope for this system
entirely (`vision.md`, `product-specification.md`'s deferred screens) — nothing in
`decision` changes that; this is stated here again because it is the single most
important constraint on this domain's behaviour, and worth being unambiguous about
at the point where it would be easiest to accidentally scope-creep into.

This is a design specification only. `domain/decision` is built in Phase 6
(`development-roadmap.md`) — no implementation exists yet.

## Why a Separate Domain from `rules` and `analytics`

`analytics` calculates facts (current value, allocation, performance).
`rules` (`rules-engine.md`) evaluates deterministic conditions against those facts
and produces signals. Neither, on its own, answers "so what should I do about
this holding, and how sure are we." `decision` is the synthesis layer — it
consumes signals, facts, and research, and produces a single, structured,
explainable recommendation. Keeping it separate from `rules` matters because rule
evaluation must stay pure and deterministic (a testable yes/no against defined
conditions); `decision` synthesis is allowed to weigh multiple inputs, including
non-deterministic ones (AI-generated commentary), and that different character of
logic deserves a different, clearly-bounded context rather than blurring into the
rules engine's guarantees.

## Core Concepts

### `DecisionContext`

The bundle of trusted inputs assembled before a recommendation is produced —
never assembled implicitly inside the recommendation logic itself, so that what
was actually considered is always inspectable.

```ts
interface DecisionContext {
  id: string;
  assetId: string;
  portfolioId: string;
  assembledAt: string;
  holdingSnapshot: HoldingSnapshot; // from `portfolio`, as of assembledAt
  analyticsSnapshot: AnalyticsSnapshot; // from `analytics`, as of assembledAt
  marketSnapshot: MarketSnapshot; // from `market`, with its own sourceTimestamp
  ruleResults: RuleResult[]; // from `rules`, see rules-engine.md
  researchNote: ResearchNoteRef | null; // from `research`, if one exists
}
```

Every snapshot embedded in a `DecisionContext` carries its own source timestamp
(`HoldingSnapshot.asOf`, `MarketSnapshot.sourceTimestamp`, etc.) — a recommendation
is only as trustworthy as the staleness of what fed it, and that must be visible,
not assumed current.

### `DecisionSignal`

A discrete input suggesting a direction — the atomic unit the recommendation is
built from. Signals originate from `rules` (deterministic), `research` (human
judgement, e.g. a thesis revision), or `ai` (AI-assisted synthesis of the other
two) — never anonymously.

```ts
interface DecisionSignal {
  id: string;
  source: "rule" | "research" | "ai" | "manual";
  sourceRef: string; // e.g. a RuleResult id, a ResearchNote id
  direction: "positive" | "negative" | "neutral";
  strength: number; // 0–1, source-defined
  description: string;
  occurredAt: string;
}
```

### `DecisionEvidence`

A specific fact cited in support of, or contradiction to, a recommendation.
Evidence is always traceable to a concrete source — a price, a rule result, a
research section — never a bare assertion.

```ts
interface DecisionEvidence {
  id: string;
  claim: string;
  polarity: "supporting" | "contradictory";
  sourceType: "market" | "analytics" | "rule" | "research" | "ai";
  sourceRef: string;
  sourceTimestamp: string;
}
```

### `DecisionRisk`

A specific risk factor relevant to the recommendation, distinct from generic
`DecisionEvidence` because a risk is forward-looking (what could go wrong) rather
than a fact about the present.

```ts
interface DecisionRisk {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  likelihood: "low" | "medium" | "high" | "unknown";
  mitigant: string | null;
}
```

### `DecisionRecommendation`

The aggregate root: the explainable output presented to the user.

```ts
type RecommendationAction = "strong_buy" | "buy" | "watch" | "hold" | "trim" | "sell" | "avoid";

type ConclusionSource = "deterministic_rules" | "ai_analysis" | "manual_judgement" | "combined";

interface DecisionRecommendation {
  id: string;
  contextId: string; // the DecisionContext this was built from
  assetId: string;
  portfolioId: string;
  action: RecommendationAction;
  confidence: number; // 0–1
  supportingEvidence: DecisionEvidence[];
  contradictoryEvidence: DecisionEvidence[];
  risks: DecisionRisk[];
  portfolioImpact: PortfolioImpactSummary; // e.g. effect on allocation if acted on
  invalidationConditions: string[]; // what would make this recommendation stale/wrong
  conclusionSource: ConclusionSource;
  generatedAt: string;
  sourceTimestamps: Record<string, string>; // per-input freshness, surfaced verbatim
}
```

Every field above is mandatory, not optional-for-display — a `DecisionRecommendation`
that cannot populate `supportingEvidence`, `risks`, and `invalidationConditions` is
not considered complete enough to present. This is the concrete implementation of
"every recommendation must be explainable": explainability is not a UI
presentation choice layered on afterward, it is a structural requirement of the
data the domain is allowed to produce.

### `DecisionOutcome`

Records what actually happened after a recommendation was made — populated later,
against the same asset/portfolio, allowing recommendation quality to be reviewed
over time.

```ts
interface DecisionOutcome {
  id: string;
  recommendationId: string;
  observedAt: string;
  actionTaken: "followed" | "partially_followed" | "not_followed" | "not_applicable";
  resultSummary: string | null; // human-authored, not auto-computed judgement
}
```

`DecisionOutcome` is deliberately not an automatic score — whether a
recommendation "worked" is a nuanced judgement (a Sell recommendation the user
didn't follow, on a stock that then fell, may still have been the wrong call for
reasons unrelated to price) and is left to the reviewing human via
`DecisionReview`, not computed by the system.

### `DecisionReview`

A periodic, human-authored review of recommendation quality — the decision-domain
analogue of `research-workspace.md`'s review history, applied to the system's own
output rather than to an investment thesis.

```ts
interface DecisionReview {
  id: string;
  period: DateRange;
  recommendationsReviewed: string[];
  summary: string;
  reviewerId: string;
  reviewedAt: string;
}
```

## Recommendation Statuses

| Status     | Meaning                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| Strong Buy | High-confidence positive signal with limited contradictory evidence               |
| Buy        | Positive signal, moderate confidence                                              |
| Watch      | Notable signal, insufficient confidence/evidence to act                           |
| Hold       | No material change; existing position remains appropriate                         |
| Trim       | Positive signal weakened, or a rule-defined trim target reached                   |
| Sell       | Negative signal outweighs supporting evidence                                     |
| Avoid      | Applies to non-held assets under research/consideration; not presently attractive |

This is a fixed, ordered vocabulary (not free text) specifically so that
recommendations are comparable and filterable across the whole portfolio, and so
that `analytics`/UI code can reason about "how positive is this" without parsing
prose.

## Explainability Contract

Every `DecisionRecommendation` must be able to answer, without further
computation:

1. **Action** — `action`.
2. **Confidence** — `confidence`.
3. **Supporting evidence** — `supportingEvidence`.
4. **Contradictory evidence** — `contradictoryEvidence`.
5. **Risks** — `risks`.
6. **Portfolio impact** — `portfolioImpact`.
7. **Conditions that would invalidate it** — `invalidationConditions`.
8. **Source timestamps** — `sourceTimestamps`.
9. **Conclusion source** — `conclusionSource` (deterministic rules / AI analysis /
   manual judgement / combined).

This list is the direct implementation of your requirement that every
recommendation be explainable, and is treated as a non-negotiable schema
constraint, not a UI nicety — a recommendation that cannot populate all nine
fields is not valid output from this domain.

## AI's Role — and Its Limit

`decision` may call the `ai` context (`AIProvider`, `provider-architecture.md`) to
synthesize signals, evidence, and risks into a coherent recommendation narrative,
and to assist in weighing conflicting signals. **AI never computes portfolio
values, holdings quantities, cost basis, returns, or any figure presented as a
financial calculation** — those are always sourced from `analytics`, which
performs deterministic arithmetic over `portfolio`/`trading`/`market` data. AI's
role is confined to synthesis and narrative over numbers `analytics` and `rules`
have already produced, never to producing the numbers themselves. This is
reflected structurally: `DecisionContext.analyticsSnapshot` is assembled from
`analytics` before any AI call is made, and an `AIProvider` call receives that
snapshot as read-only input, never as something it recomputes.

`conclusionSource` is mandatory precisely so a user can always tell whether a
given recommendation leaned on AI synthesis at all, and to what degree — a
`deterministic_rules`-sourced recommendation carries a different weight of trust
than an `ai_analysis`-sourced one, and the UI is expected to visually
distinguish them (`product-specification.md`, extended when this domain ships).

## Relationship to Other Domains

- **`rules`** (`rules-engine.md`) — the primary source of deterministic
  `DecisionSignal`s.
- **`analytics`** — the source of all calculated financial figures referenced in
  a `DecisionContext` and `portfolioImpact`.
- **`research`** — supplies thesis context and can itself be a `DecisionSignal`
  source (e.g., a downgraded bull case).
- **`ai`** — synthesis only, per the limit above.
- **`event-system.md`** — `OpportunityGenerated` (already catalogued) is raised
  when a new `DecisionRecommendation` is produced; `audit-strategy.md` subscribes
  to produce an audit record for every recommendation generated, consistent with
  every other significant domain action.
- **`alerts`** — may subscribe to new recommendations to notify the user,
  particularly for `Strong Buy`/`Sell`/`Trim` actions on held positions.

## Non-Goals

- No automated or one-click trade execution from a recommendation, now or in any
  currently planned phase.
- No recommendation is ever presented as certain — `confidence` is always shown,
  and a recommendation with `contradictoryEvidence` present must display it with
  equal visual weight to supporting evidence, not de-emphasised.
- No portfolio value, return, or holding figure is ever sourced from `ai` — see
  "AI's Role — and Its Limit" above; this is restated because it is the
  requirement most likely to be quietly violated under future feature pressure.
