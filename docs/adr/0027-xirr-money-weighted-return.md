# 0027. Money-Weighted Return via Newton-Raphson XIRR, No External Library

**Status:** Accepted

## Context

Milestone 2.7 ("Portfolio Completion & UX Polish") asks for a Money
Weighted Return figure — the standard XIRR calculation used across
brokerages and spreadsheet tools, giving an annualised rate of return that
correctly weights the timing and size of every deposit/withdrawal, unlike
a simple total-return percentage. XIRR has no closed-form solution — it
requires solving `sum(cashFlow_i / (1+r)^(days_i/365)) = 0` for `r`
numerically. This needs a decision about method (Newton-Raphson? bisection?
a third-party library?), day-count convention, and what to do when the
search doesn't converge — none of which this project had settled before.

## Decision

`domain/portfolio/performance.ts`'s `calculateXirr` implements XIRR
directly, in plain TypeScript, no external dependency:

- **Newton-Raphson first, bisection as a fallback.** Newton-Raphson
  converges fast (usually under 10 iterations) for well-behaved cash flow
  patterns, which covers the overwhelming majority of real portfolios
  (a handful of deposits/withdrawals over months or years). It can fail to
  converge or overshoot for pathological patterns (many flows, extreme
  rates, near-zero derivatives), so a bisection fallback runs afterward
  over a wide, financially-sane bracket (−99.99% to +1000% annualised) —
  slower, but guaranteed to converge whenever a sign change exists in that
  bracket. This mirrors how Excel's own `XIRR` function is documented to
  behave (iterative, can fail with `#NUM!` on some inputs) rather than
  promising a solution always exists — because one doesn't, mathematically,
  for every possible cash flow pattern.
- **Actual/365 day-count convention** (`years = daysBetween / 365`), the
  same convention Excel's `XIRR` uses. Not adjusted for leap years — a
  365-day span in a leap year is treated as slightly less than exactly one
  year, which is a documented, accepted source of small (sub-0.1%) error
  in this convention generally, not specific to this implementation.
- **Never throws, never returns `NaN`/`Infinity`.** `calculateXirr`
  returns `number | null` — `null` for fewer than two cash flows, for
  flows that are all the same sign (no rate can reconcile pure outflows or
  pure inflows — there's no "return" to measure), or when neither
  Newton-Raphson nor the bisection fallback converges. Every caller
  (`calculatePortfolioPerformance`, and the UI it feeds) must handle
  `null` as "not calculable yet" (e.g., a portfolio with no deposits on
  record), never as zero — zero would silently claim "no return" for a
  case that's actually "unknown."
- **No external library** (e.g. a finance-math npm package). The
  algorithm is short (under 40 lines including both methods), has no
  dependency-supply-chain surface to audit, and needed the same
  never-throw/no-NaN discipline this codebase already applies everywhere
  else — wrapping a third-party implementation to add that discipline
  would have been more code, not less.
- **The caller assembles cash flows, not this function.** `calculateXirr`
  takes a plain `CashFlow[]` (date + signed amount); it has no knowledge
  of what a "deposit" or "withdrawal" transaction is — that's Trading's
  concept, not Portfolio's, and `domain/portfolio` cannot import from
  `domain/trading` without creating a circular dependency (Trading already
  depends on Portfolio's repositories). The application-layer composer
  that builds the Portfolio Performance view is responsible for turning
  deposit/withdrawal transactions into `CashFlow` entries and appending a
  final "as if liquidated today" flow at the current total portfolio
  value — only the caller knows what "today" should mean for a given
  render.

## Consequences

**Easier:**

- Money-weighted return is available with zero new runtime dependencies,
  fully unit-testable (`performance.test.ts` verifies exact known-good
  cases: a single round trip at exactly 10% simple, and at 10%
  compounded over two years).
- The `null`-not-`NaN` contract means every consumer is forced to handle
  "not yet calculable" explicitly, rather than accidentally rendering
  `NaN%` or `Infinity%` on a new portfolio with no deposit history.

**Harder:**

- This implementation has not been benchmarked against Excel's `XIRR` or
  a reference financial library across a large corpus of inputs — the
  unit tests prove correctness for hand-verifiable cases, not bit-for-bit
  parity with any other implementation for arbitrary cash flow patterns.
  Two independent implementations of the same underlying mathematics can
  legitimately disagree in the last few decimal places due to convergence
  tolerance and day-count rounding; this is expected, not a defect.
- A truly pathological cash flow pattern (e.g., many alternating tiny
  flows) could still return `null` even though a mathematically valid
  rate exists somewhere outside the bisection bracket — this is a
  deliberate boundary (a ±1000% annualised search range covers every
  realistic portfolio), not an oversight.

## Alternatives Considered

- **A third-party XIRR/finance library.** Rejected: adds a dependency for
  ~40 lines of well-understood, testable mathematics, and most such
  libraries don't share this codebase's specific never-throw/`null`-not-
  `NaN` discipline, meaning a wrapper would have been needed anyway.
- **Bisection only, no Newton-Raphson.** Rejected: bisection alone is
  slower (up to 200 iterations vs. usually under 10) for the common case,
  with no accuracy benefit once it converges — using it as a fallback
  rather than the primary method gets the speed of Newton-Raphson and the
  robustness of bisection.
- **A simple (non-time-weighted) total return percentage instead of
  XIRR.** Rejected as the _only_ return figure — `totalReturnPercent`
  (relative to net contributions) already exists in
  `PortfolioPerformance` for exactly this simpler case; XIRR is additive,
  not a replacement, because it answers a genuinely different question
  ("what annualised rate explains this exact sequence of cash flows,"
  not just "how much did the total grow").

## Future Review Criteria

Revisit if: a real portfolio's cash flow pattern is found where this
implementation returns `null` but a reference tool (Excel, a brokerage
statement) successfully computes a rate — that would indicate the
bisection bracket or iteration limits need widening, not a change to the
underlying method. Revisit the day-count convention if leap-year precision
ever matters at a level finer than what Actual/365 provides (unlikely for
a personal decision-support tool, per ADR 0026's own scope boundaries).
