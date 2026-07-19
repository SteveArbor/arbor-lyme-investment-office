# Decision Engine

> **Vocabulary note:** this document has been updated per
> [ADR 0023](adr/0023-investment-rating-vs-portfolio-action.md), which
> supersedes [ADR 0014](adr/0014-decision-engine-domain.md)'s single-enum
> output. The Decision Engine now produces an `InvestmentRating` only —
> "what to do in the portfolio" (`PortfolioAction`) is a separate,
> downstream concept owned by `domain/portfolio`, described at the end of
> this document.

## Purpose

`domain/decision` combines trusted information from `market`, `analytics`,
`rules`, and `research` into a structured, explainable **Investment
Rating** for a company — the point where deterministic calculation, rule
evaluation, research judgement, and (later) AI-assisted synthesis converge
into a single, well-reasoned view of an opportunity's quality, independent
of whether or how much of it is currently held.

**The decision domain never places a trade, and never knows about
portfolio state.** It produces a rating for a human (or the downstream
Portfolio Engine) to act on, with full visibility into why it was reached.
Trade execution is out of scope for this system entirely
(`vision.md`, `product-specification.md`'s deferred screens).

This is a design specification, implemented as part of Phase 2
(`development-roadmap.md`).

## Why a Separate Domain from `rules` and `analytics`

`analytics` calculates facts (valuation metrics, financial strength
indicators, growth rates). `rules` (`rules-engine.md`) evaluates
deterministic conditions against those facts and produces signals.
Neither, on its own, answers "how good is this opportunity, and how sure
are we." `decision` is the synthesis layer — it consumes signals, facts,
and research, and produces a single, structured, explainable rating.
Keeping it separate from `rules` matters because rule evaluation must stay
pure and deterministic (a testable yes/no against defined conditions);
`decision` synthesis is allowed to weigh multiple inputs, including
non-deterministic ones (AI-generated commentary), and that different
character of logic deserves a clearly-bounded context rather than
blurring into the rules engine's guarantees.

## Why the Decision Engine Does Not Know About Portfolio State

An `InvestmentRating` describes the opportunity, not the action. A company
can be rated Exceptional while the correct portfolio action is Hold
(already at target allocation) — or rated Buy while the correct action is
Exit (a risk-limit breach elsewhere in the portfolio forces
de-risking). Conflating the two, as an earlier design (ADR 0014) did,
either forces the Decision Engine to depend on portfolio state — violating
the dependency direction `docs/domain-driven-design.md` establishes and
the independence `docs/research-workspace.md` requires between research
and portfolio — or produces a portfolio-blind label that misleads the
user into thinking it's an instruction. See ADR 0023 for the full
reasoning.

## Core Concepts

### `DecisionContext`

The bundle of trusted inputs assembled before a rating is produced — never
assembled implicitly inside the rating logic itself, so that what was
actually considered is always inspectable. Deliberately company-scoped,
not portfolio-scoped — nothing here varies by which portfolio (if any)
holds the company.

```ts
interface DecisionContext {
  id: string;
  companyId: string;
  assembledAt: string;
  analyticsSnapshot: CompanyAnalyticsSnapshot; // valuation/financial metrics, from `analytics`
  marketSnapshot: MarketSnapshot; // from `market`, with its own sourceTimestamp
  ruleResults: RuleResult[]; // from `rules`, see rules-engine.md
  researchNote: ResearchNoteRef | null; // from `research`, if one exists
}
```

Every snapshot embedded in a `DecisionContext` carries its own source
timestamp — a rating is only as trustworthy as the staleness of what fed
it, and that must be visible, not assumed current.

### `DecisionSignal`

A discrete input suggesting a direction — the atomic unit the rating is
built from. Signals originate from `rules` (deterministic), `research`
(human judgement, e.g. a thesis revision), or `ai` (AI-assisted synthesis
of the other two) — never anonymously.

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

A specific fact cited in support of, or contradiction to, a rating.
Evidence is always traceable to a concrete source — a price, a rule
result, a research section — never a bare assertion.

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

A specific risk factor relevant to the rating, distinct from generic
`DecisionEvidence` because a risk is forward-looking (what could go wrong)
rather than a fact about the present.

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
type InvestmentRating =
  "exceptional" | "strong_buy" | "buy" | "hold" | "reduce_conviction" | "sell" | "avoid";

type ConclusionSource = "deterministic_rules" | "ai_analysis" | "manual_judgement" | "combined";

interface DecisionRecommendation {
  id: string;
  contextId: string; // the DecisionContext this was built from
  companyId: string;
  rating: InvestmentRating;
  confidence: number; // 0–1
  supportingEvidence: DecisionEvidence[];
  contradictoryEvidence: DecisionEvidence[];
  risks: DecisionRisk[];
  invalidationConditions: string[]; // what would make this rating stale/wrong
  conclusionSource: ConclusionSource;
  generatedAt: string;
  sourceTimestamps: Record<string, string>; // per-input freshness, surfaced verbatim
}
```

Every field above is mandatory, not optional-for-display — a
`DecisionRecommendation` that cannot populate `supportingEvidence`,
`risks`, and `invalidationConditions` is not considered complete enough to
present. This is the concrete implementation of "every recommendation
must be explainable": explainability is a structural requirement of the
data the domain is allowed to produce, not a UI presentation choice
layered on afterward. Note there is no `portfolioImpact` field here — see
"Portfolio Action" below for where that reasoning now lives.

### `DecisionOutcome`

Records what actually happened after a rating was produced — populated
later, against the same company, allowing rating quality to be reviewed
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
rating "worked" is a nuanced judgement and is left to the reviewing human
via `DecisionReview`, not computed by the system.

### `DecisionReview`

A periodic, human-authored review of rating quality — the decision-domain
analogue of `research-workspace.md`'s review history, applied to the
system's own output rather than to an investment thesis.

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

## Investment Ratings

| Rating            | Meaning                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Exceptional       | Outstanding business quality and margin of safety together — the rare, highest-conviction case         |
| Strong Buy        | High-confidence positive signal with limited contradictory evidence                                    |
| Buy               | Positive signal, moderate confidence                                                                   |
| Hold              | No material change; the opportunity's quality assessment stands as-is                                  |
| Reduce Conviction | The thesis has weakened — quality/valuation case is less compelling than before, though not yet a Sell |
| Sell              | Negative signal outweighs supporting evidence                                                          |
| Avoid             | Not presently attractive as an opportunity, regardless of held/not held                                |

This is a fixed, ordered vocabulary (not free text), specifically so
ratings are comparable and filterable across every company, and so
`analytics`/UI code can reason about "how positive is this" without
parsing prose. **A rating is not an instruction** — see "Portfolio Action"
below for what to actually do about it.

## Explainability Contract

Every `DecisionRecommendation` must be able to answer, without further
computation:

1. **Rating** — `rating`.
2. **Confidence** — `confidence`.
3. **Supporting evidence** — `supportingEvidence`.
4. **Contradictory evidence** — `contradictoryEvidence`.
5. **Risks** — `risks`.
6. **Conditions that would invalidate it** — `invalidationConditions`.
7. **Source timestamps** — `sourceTimestamps`.
8. **Conclusion source** — `conclusionSource` (deterministic rules / AI
   analysis / manual judgement / combined).

This is a non-negotiable schema constraint, not a UI nicety — a rating
that cannot populate all eight fields is not valid output from this
domain. ("Portfolio impact" was part of this contract prior to ADR 0023;
it now belongs to `PortfolioAction`'s explainability contract instead,
since it is inherently portfolio-state-dependent.)

## AI's Role — and Its Limit

`decision` may call the `ai` context (`AIProvider`, `provider-architecture.md`)
to synthesize signals, evidence, and risks into a coherent narrative, and
to assist in weighing conflicting signals. **AI never computes valuation
figures, financial metrics, or any number presented as a financial
calculation** — those are always sourced from `analytics`, which performs
deterministic arithmetic. AI's role is confined to synthesis and narrative
over numbers `analytics` and `rules` have already produced, never to
producing the numbers themselves. This is reflected structurally:
`DecisionContext.analyticsSnapshot` is assembled before any AI call is
made, and an `AIProvider` call receives that snapshot as read-only input,
never as something it recomputes.

`conclusionSource` is mandatory precisely so a user can always tell
whether a given rating leaned on AI synthesis at all — a
`deterministic_rules`-sourced rating carries a different weight of trust
than an `ai_analysis`-sourced one, and the UI is expected to visually
distinguish them.

## Portfolio Action — A Separate, Downstream Concept

Per ADR 0023, `domain/portfolio` owns a **Portfolio Engine** that computes
what to actually do, given a company's `InvestmentRating` plus
portfolio-specific state the decision domain must never see:

```ts
type PortfolioAction = "initiate_position" | "add" | "hold" | "trim" | "exit";

interface PortfolioActionInputs {
  investmentRating: InvestmentRating; // read-only input from domain/decision
  currentPositionSize: number; // 0 if not held
  targetAllocation: number;
  marginOfSafety: number; // from domain/valuation
  riskLimits: RiskLimits;
  cashAvailable: number;
}
```

The dependency runs one way only: `domain/portfolio` depends on
`domain/decision`'s output type; `domain/decision` has no dependency on,
or awareness of, `domain/portfolio` at all. This is what keeps the
guarantee in `docs/research-workspace.md` true one layer further up the
stack: not just research, but the entire rating process, is independent
of whether or how a company is held.

`PortfolioAction`'s own explainability contract (inputs considered,
portfolio-impact reasoning, why this action given this rating) is
specified alongside the Portfolio Engine's implementation, not here — see
the portfolio domain's design work for Phase 2.

## Relationship to Other Domains

- **`rules`** (`rules-engine.md`) — the primary source of deterministic
  `DecisionSignal`s.
- **`analytics`** — the source of all calculated financial/valuation
  figures referenced in a `DecisionContext`.
- **`research`** — supplies thesis context and can itself be a
  `DecisionSignal` source (e.g., a downgraded bull case).
- **`ai`** — synthesis only, per the limit above.
- **`event-system.md`** — `OpportunityGenerated` is raised when a new
  `DecisionRecommendation` is produced; `audit-strategy.md` subscribes to
  produce an audit record for every rating generated.
- **`portfolio`** — a _downstream consumer_ of `InvestmentRating`, never
  an input to it (see "Portfolio Action" above). `alerts` may subscribe to
  both new ratings and new portfolio actions to notify the user.

## Non-Goals

- No automated or one-click trade execution, now or in any currently
  planned phase.
- No rating is ever presented as certain — `confidence` is always shown,
  and `contradictoryEvidence` must display with equal visual weight to
  supporting evidence, not de-emphasised.
- No valuation or financial figure is ever sourced from `ai` — see "AI's
  Role — and Its Limit" above.
- No portfolio-state input to the rating process, ever — see "Why the
  Decision Engine Does Not Know About Portfolio State" above; this is the
  requirement ADR 0023 exists specifically to enforce structurally.
