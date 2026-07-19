# 0023. Separate Investment Rating from Portfolio Action

**Status:** Accepted — supersedes [ADR 0014](0014-decision-engine-domain.md)

## Context

ADR 0014 gave the Decision Engine a single output vocabulary
(`strong_buy | buy | watch | hold | trim | sell | avoid`) conflating two
different questions: "how good is this opportunity" and "what should I do
in my portfolio right now." Those are genuinely different judgments — an
Exceptional-quality company can still warrant "Hold" in the portfolio
because the position is already at its target allocation, and a
deteriorating company can still warrant "Exit" even if its rating hasn't
yet dropped to Sell. Collapsing both into one enum forces the Decision
Engine to either know about portfolio state (violating the domain
boundary — research/decision logic must not depend on portfolio) or
produce a portfolio-blind label that misleads the user into thinking it's
an action.

## Decision

Split into two distinct concepts, produced by two distinct domains:

### `InvestmentRating` — produced by `domain/decision`

Describes the quality of the opportunity itself, independent of whether
or how much is currently held.

```ts
type InvestmentRating =
  "exceptional" | "strong_buy" | "buy" | "hold" | "reduce_conviction" | "sell" | "avoid";
```

`DecisionRecommendation` (ADR 0014) is updated: its `action` field is
renamed `rating` and re-typed to `InvestmentRating`. Every other part of
the explainability contract (confidence, supporting/contradictory
evidence, risks, invalidation conditions, source timestamps, conclusion
source) is unchanged and still required.

### `PortfolioAction` — produced by a Portfolio Engine within `domain/portfolio`

Describes what to actually do in the portfolio, computed from the
`InvestmentRating` plus portfolio-specific state the decision domain must
never see.

```ts
type PortfolioAction = "initiate_position" | "add" | "hold" | "trim" | "exit";

interface PortfolioActionInputs {
  investmentRating: InvestmentRating; // from domain/decision — read-only input
  currentPositionSize: number; // 0 if not held
  targetAllocation: number;
  marginOfSafety: number; // from domain/valuation
  riskLimits: RiskLimits;
  cashAvailable: number;
}
```

The Portfolio Engine is a `domain/portfolio` service (`portfolio-engine.ts`,
built out during Phase 2 implementation), not part of `domain/decision` —
this is what keeps the dependency direction correct: `domain/portfolio`
is allowed to depend on `domain/decision`'s output type, but
`domain/decision` must never depend on `domain/portfolio` (see
"Research remains independent" below).

## Consequences

- A user can now see, separately, "this is an Exceptional company" and
  "but the correct action right now is Hold, because you're already at
  target allocation" — both true, both useful, previously inexpressible
  as a single value.
- `domain/decision` stays free of portfolio-state dependencies, preserving
  the dependency-direction rule in `docs/domain-driven-design.md` and the
  explicit design goal in `docs/research-workspace.md` that research must
  exist independently of whether a position is held.
- Two enums to maintain instead of one, and every consumer (UI, alerts,
  the decision journal) must be updated to render both, not one combined
  label — a real but bounded cost, paid once.
- `ADR 0014` is retained in the historical record (never edited) but its
  `action`/`RecommendationAction` vocabulary is no longer authoritative —
  this ADR is the current source of truth for both output types.

## Alternatives Considered

- **Keep ADR 0014's single 7-value vocabulary** — rejected: cannot express
  "great company, but don't add more right now," which is a routine,
  important real-world case.
- **Adopt the flat 5-value `Buy/Accumulate/Hold/Reduce/Sell` vocabulary**
  (the Phase 2 brief's first draft) — rejected on reflection: still
  conflates opportunity quality with portfolio-specific sizing action,
  just with different labels than ADR 0014's version. The split resolves
  the actual problem; picking a different single vocabulary would not
  have.
- **Let the Decision Engine take portfolio state as an input and produce
  one combined output** — rejected: reopens the exact dependency-direction
  violation `docs/domain-driven-design.md` and `docs/research-workspace.md`
  were written to prevent (research/decision must not depend on
  portfolio).

## Future Review Criteria

Revisit the two vocabularies' specific values once real usage during
Phase 2 implementation surfaces a case neither enum expresses well —
evaluated against real data, not speculatively now.
