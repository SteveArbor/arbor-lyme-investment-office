# 0029. Portfolio Rounding Policy

**Status:** Accepted

## Context

No single document has ever stated how monetary values, quantities, and
percentages are rounded across this platform — the behaviour existed only
as an emergent property of column precision choices (ADR 0025's
migrations) and `src/lib/format.ts` (Milestone 2.7). That gap surfaced
concretely during the HL Stocks & Shares ISA opening-balance import: the
Portfolio Performance panel displayed a Total Portfolio Value of
£128,749.**47** and an Unrealised Gain of £5,600.**07**, one penny short
of the source spreadsheet's £128,749.48 / £5,600.08, even though every
individual holding's quantity, cost basis, and market value matched the
source exactly, to the penny.

The cause was traced precisely: `calculatePortfolioPerformance`
(`domain/portfolio/performance.ts`) sums each holding's raw
`quantity × currentPrice` as JavaScript `number` values (IEEE-754 double
precision) and rounds only once, when the total is formatted for display.
The source spreadsheet instead summed ten values that were _each already
rounded_ to two decimal places. Summing unrounded figures and then
rounding once ("round-then-sum") and summing already-rounded figures
("sum-then-round") are both legitimate, standard techniques, but they are
not required to agree — and won't, whenever the discarded fractional
pence don't happen to cancel out. This is not a defect in either figure;
it is a well-known, unavoidable property of the two approaches, one every
accounting/ERP system that aggregates independently-rounded line items
has to live with. What was missing was a stated, deliberate choice of
which approach this platform uses, and why — so that the next time this
happens (it will), it's recognised immediately as expected behaviour
rather than re-investigated as a bug.

This ADR is documentation-only: it formalises the rounding behaviour that
`domain/*`, `application/services/*`, and `src/lib/format.ts` already
implement as of Milestone 2.7. No implementation change was needed to
write it — see "Verification" below.

## Decision

**Round exactly once, at the boundary where a value leaves the system —
either into permanent storage or onto the screen. Never round an
intermediate value.**

This single rule is applied identically in the two places this platform
ever rounds a number:

### 1. Database (authoritative storage)

Every table column that holds a financial figure has a fixed decimal
scale, and PostgreSQL enforces it on every insert/update:

| Value                                   | Column(s)                                                                                            | Scale                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Cash, transaction amount, realised gain | `portfolios.cash`, `transactions.amount`, `transactions.realised_gain`                               | `numeric(18,2)` — 2dp (pence)                  |
| Quantity, price, average cost           | `holdings.quantity`, `holdings.average_cost`, `transactions.quantity`, `transactions.price_per_unit` | `numeric(18,6)` — 6dp                          |
| Target allocation                       | `holdings.target_allocation_percent`                                                                 | `numeric(5,4)` — 4dp fraction (0.0001 = 0.01%) |

Every atomic RPC (ADR 0025) computes its result — `quantity × price`,
`quantity × (price − average_cost)`, the blended new average cost — using
PostgreSQL's `numeric` type, which is exact, arbitrary-precision decimal
arithmetic (unlike a binary float, `numeric` has no representation error
at all: `0.1 + 0.2` is exactly `0.3`). The _only_ rounding that ever
happens at this layer is PostgreSQL's implicit, deterministic truncation
of that exact result to a column's declared scale on assignment — e.g.
`cash - v_cost` (both `numeric(18,2)`) rounds `v_cost` to 2dp the moment
it's subtracted into a `numeric(18,2)` column. This uses PostgreSQL's
documented `numeric` rounding rule: round half away from zero. No RPC
rounds a value explicitly (via `round()`) before that implicit,
column-driven rounding — the intermediate `v_cost`/`v_realised_gain`/
`v_new_average_cost` local variables are untyped `numeric` and carry full
precision until the single insert/update that stores them.

### 2. Application and display (derived, in-memory)

Everything computed in TypeScript — `domain/portfolio/performance.ts`,
`domain/trading/model.ts`, the `application/services/*` composers — uses
native JavaScript `number` (IEEE-754 double) and performs **no**
intermediate rounding whatsoever. A multi-step calculation (market value
→ unrealised gain → total return → XIRR) carries full float precision
through every step, including sums across multiple holdings
(`calculatePortfolioPerformance`'s `marketValue`/`costBasis` are the sum
of each holding's _unrounded_ `quantity × price`, not a sum of
already-rounded per-holding figures).

Rounding happens exactly once, inside `src/lib/format.ts`, at the moment
a number is about to be shown to a user — never before:

- **Currency** — `formatCurrency`/`formatSignedCurrency`: `Intl.NumberFormat`
  with `style: "currency"`, rounded to the target currency's minor-unit
  precision (2dp for GBP/USD/EUR, the only currencies this platform
  currently handles). Verified empirically (Node 26, this project's
  runtime) to round half away from zero at exact decimal boundaries
  (`2.675` → `£2.68`, `1.005` → `£1.01`), not the raw IEEE-754 value
  underneath the shortest decimal representation.
- **Percentages** — `formatPercent`/`formatSignedPercent`: `Intl.NumberFormat`
  with `style: "percent"`, 1 decimal place by default (the `fractionDigits`
  parameter exists for the rare caller that needs a different precision,
  but every current call site uses the default). Same rounding rule as
  currency.
- **Quantities** — no dedicated formatter exists yet; the few places a raw
  quantity is displayed (e.g. the Holdings table's `QUANTITY` column) show
  the JS number as-is via string interpolation, at whatever precision it
  naturally has after being read from the `numeric(18,6)` column.
- **Dates** — out of scope for this ADR (see `formatDate`/`formatDateTime`,
  unrelated to numeric rounding).

Domain and application-layer code must never call `.toFixed()`,
`Math.round()`, `Math.floor()`, or any other numeric rounding on a
financial value — only the formatters in `src/lib/format.ts` may round,
and only at the point a value is rendered.

### 3. The accepted consequence

A platform-computed aggregate (portfolio total value, total unrealised
gain, total cost basis) can differ from an external source's total by up
to a few pence — bounded by roughly `±0.5p × (number of line items summed)`
— whenever that source computed its total by summing figures it had
already rounded. This is expected, not a defect, and must never be
"corrected" by adjusting an input (a price, a quantity) to force an exact
match to a third party's total — the individual, line-level figures
remain the source of truth and should be verified against those, not
against a lossy aggregate.

## Consequences

**Easier:**

- One rule, two enforcement points (a database column's declared scale;
  `src/lib/format.ts`) — trivial to audit: `grep` domain/application code
  for `toFixed`/`Math.round` should return nothing (verified below), and
  every currency/percentage figure on screen should trace to one of the
  four formatter functions.
- Multi-step derived figures (XIRR, blended average cost, allocation
  percent) are as accurate as IEEE-754 double precision allows — rounding
  an intermediate value at every step, instead, would make every one of
  these _less_ accurate, not more, since rounding error compounds across
  steps.
- A future contributor who sees a platform total differ from a broker
  statement or export by a penny now has a named, understood explanation
  to check first, instead of chasing it as a bug (as very nearly happened
  during the HL import).

**Harder:**

- **Known, currently-existing deviations from this policy** (pre-dating
  `src/lib/format.ts`, never migrated): several pages still call raw
  `.toFixed()` directly instead of the shared formatters —
  `dashboard/page.tsx` and `companies/[id]/page.tsx`
  (`blendedFairValue.toFixed(2)`), `portfolio/page.tsx`
  (`portfolio.cash.toFixed(2)`), `companies/[id]/valuation/page.tsx` and
  `valuation-form.tsx` (`fairValue.toFixed(2)`), and several
  percentage displays at inconsistent precision —
  `journal/page.tsx`/`companies/[id]/journal/page.tsx`
  (`(convictionAtPurchase * 100).toFixed(0)`, 0dp) and
  `companies/[id]/page.tsx` (`(expectedReturn * 100).toFixed(1)` at 1dp,
  `(marginOfSafety * 100).toFixed(0)` at 0dp, three different precisions
  across one page). None of these are financial-integrity bugs — `.toFixed()`
  and `Intl.NumberFormat` round the same way for the values these pages
  display — but they don't show a currency symbol or thousands
  separator, and the inconsistent percentage precision is a real,
  visible inconsistency this ADR's "consistent display throughout the
  platform" objective doesn't yet fully hold. Recorded as technical debt
  (see `docs/PROJECT_STATUS.md`) rather than fixed here, per instruction
  not to change implementation for this ADR.
- A reconciliation view that wants to match an external source's total
  exactly (rather than explain the penny gap) would need a genuinely
  different, sum-then-round calculation path — not something this policy
  provides, and not something to build speculatively without a real
  need for it.

## Alternatives Considered

- **Round every intermediate calculation to display precision (2dp)
  immediately, then sum/derive from the rounded figures ("sum-then-round"
  throughout).** This is what would have made the HL import's aggregate
  match the source spreadsheet's total exactly. Rejected as the general
  policy: it requires inserting an explicit rounding call at every one of
  roughly fifteen calculation sites across `domain/portfolio/performance.ts`,
  `domain/trading/model.ts`, and the composers — a much larger, easier
  ways to be inconsistent than "round once, in one file" — and it makes
  genuinely multi-step figures (XIRR's iterative solver, blended average
  cost across several buys) measurably less accurate by compounding
  rounding error at every step, not just at the end.
- **Round half to even ("banker's rounding") instead of half away from
  zero.** Not chosen because it isn't a real choice at either enforcement
  point: PostgreSQL's `numeric` type and JavaScript's `Intl.NumberFormat`
  both round half away from zero, not half-to-even, and there is no
  documented, supported way to change either without abandoning the
  standard library/database behaviour this ADR otherwise builds on.
  Re-implementing rounding by hand purely to get banker's rounding would
  add real complexity for a difference that only matters for exact
  halfway values, which floating-point representation makes rare in
  practice anyway.
- **Store a running "penny drift" adjustment and silently absorb it into
  the largest holding**, a technique some accounting systems use to force
  a displayed total to tie out exactly. Rejected: it would mean a
  displayed per-holding figure no longer equals `quantity × price` for
  that holding — a fabricated, invented adjustment this platform's "no
  invented data" principle (`docs/engineering-standards.md`) rules out on
  the same grounds ADR 0026 and ADR 0028 already apply to financial data.

## Future Review Criteria

Revisit if a genuine cross-portfolio consolidated reporting feature
(named as future work in `docs/PROJECT_STATUS.md`'s Outstanding Roadmap)
needs to reproduce a specific external source's total exactly rather than
this platform's own internally-consistent one — at that point a
deliberate, separate sum-then-round code path for that one reconciliation
view is the right scope, not a platform-wide change to this policy.

Revisit the `.toFixed()` stragglers named under Consequences the next
time any of those five files is touched for an unrelated reason — replace
with the shared formatter then, rather than as a dedicated cleanup pass.

## Verification

This ADR required no implementation change:

- `grep -rn "toFixed\|Math.round" src/domain src/application` (excluding
  tests) returns exactly one, unrelated hit — a day-count rounding in
  `domain/journal/model.ts`, not a financial value.
- `src/lib/format.ts` is the only place `Intl.NumberFormat` is used for
  currency/percentage in the codebase.
- The database column scales and RPC arithmetic described above are as
  written in `supabase/migrations/20260719000015_transaction_integrity_hardening.sql`
  and `supabase/migrations/20260720000001_cash_management_and_performance.sql`.
