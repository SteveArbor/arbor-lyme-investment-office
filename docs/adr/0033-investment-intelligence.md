# 0033. Investment Intelligence — Portfolio Health, Risk, Opportunities, Insights

**Status:** Accepted

## Context

Phase 3.2 made the platform's numbers correct (FX conversion, live quote
propagation). Phase 4's brief is different in kind: turn a portfolio
management application into a decision-support platform — the Dashboard
should answer "how am I doing, what changed, where should I focus, what
opportunities exist," not just display figures. Explicitly out of scope
this milestone: Document Intelligence, AI analysis, PDF ingestion — every
new panel here is built from data this platform already owns
(holdings, quotes, FX, thesis, valuation, decision, journal), combined
with deterministic rules, never a model or a vendor call.

## Decision

### Portfolio Health score — deterministic, explainable, weighted factors

`domain/portfolio/health.ts`'s `calculatePortfolioHealth` follows the exact
pattern `domain/decision`'s Investment Rating already established (ADR
0023): named 0–1 factors, each independently inspectable, combined by a
documented weighting into one 0–10 score. Eight factors, matching the
brief's own list: diversification, cash allocation, sector/country/
single-position concentration, liquidity, portfolio drift, missing
research. Every threshold (e.g. cash's 5–15% ideal band, 15% single-
position guideline) is a **documented starting point**, not tuned against
real usage — the same convention ADR 0023's rating thresholds already
use, and explicitly named as revisitable below.

**Liquidity** is scored leniently (a fund allocation up to 50% costs
nothing): an OEIC/unit trust settles slower than an exchange-traded sale
but is not unsellable, and this platform's own real portfolio is
majority funds by design (a UK ISA holding a diversified multi-asset
mix) — scoring that harshly would penalise a perfectly normal portfolio
shape.

### Country exposure — derived from exchange, not a new data field

`domain/company/model.ts`'s `deriveCountryFromExchange` maps a security's
listing exchange to a country (`NASDAQ`/`NYSE` → United States, `LSE` →
United Kingdom, `Euronext Amsterdam` → Netherlands, HL's fund platform →
United Kingdom). This is a deliberate heuristic, disclosed in the
function's own doc comment: it names where a security _trades_, not
necessarily where the underlying business is domiciled or headquartered
(a UK-listed ADR of a US company would map to "United Kingdom" by this
function). Adding a real `country` field to every company would be more
correct in the general case but requires new data entry for every
existing holding; deriving from an already-required field needed no new
data and is accurate for every security actually held today. Extend the
map, don't invent a value, the day a held company's exchange isn't
listed in it.

### Risk Overview — sector/country/currency exposure, concentration warnings

`domain/portfolio/risk.ts` aggregates holdings by sector/country/currency
(cash folds into the base-currency bucket only — it has no sector or
country) and flags concentrations above named thresholds (30% sector,
15% single position, 60% country/currency — country/currency allow more
concentration before flagging, since a UK investor holding mostly UK/US
assets in GBP/USD is normal, not itself a red flag, the way a single
sector or position dominating the book would be).

### Opportunities — heuristic ranking, explicitly not a valuation model

`domain/portfolio/opportunities.ts`'s `identifyOpportunities` ranks using
data this platform already has: allocation drift (absolute and relative
to target), Investment Rating, Twelve Data's own daily `previous_close`
field, and spare cash. **This is a documented placeholder** — the brief's
own "manual placeholder scoring is acceptable until valuation models
exist" — not a claim of investment merit. Each opportunity type is
independently optional; a portfolio with no underweight holdings simply
produces no `largest_underweight` entry rather than a fabricated one.

### Portfolio Insights — rules, not AI

`domain/portfolio/insights.ts` turns `risk.ts`'s already-computed
concentration warnings into plain-English observations, adds a cash-
above-target check and a caller-supplied "watch list" of sectors worth
flagging if entirely absent (a policy choice the _application_ layer
makes explicitly — `WATCHED_SECTORS_FOR_GAPS` in
`application/services/portfolio-intelligence.ts` — never a taxonomy this
pure domain function invents itself), and falls back to "No action
required today" when nothing else triggers. Zero AI, zero external
calls — every insight is reproducible from the same inputs every time.

### Allocation Analysis — a deterministic recommended action

`domain/portfolio/allocation.ts`'s `calculateAllocationAction` maps
allocation drift to increase/reduce/hold, with a `watch` override that
fires regardless of drift when a thesis has broken or the rating says
sell/avoid — drift alone can't see that a position needs attention for
reasons that have nothing to do with its size.

### Cross-portfolio combination — a disclosed, accepted limitation

`application/services/portfolio-intelligence.ts`'s `buildPortfolioIntelligence`
accepts one or more `PortfolioValuation`s so the Dashboard's existing
"All portfolios" view (Phase 3.2) gets the same intelligence panels a
single portfolio does. **Holdings are not deduplicated by company across
portfolios.** If the same company is held in two portfolios (this
platform's own real accounts do this — NVIDIA is held in both the demo
Core Growth Portfolio and the real HL Stocks & Shares ISA), "largest
single position" and portfolio drift undercount that company's true
combined exposure, and it appears as two separate rows in the Allocation
Analysis table (each keyed uniquely so React never collides, but
genuinely two rows). Sector/country/currency totals are unaffected — they
sum correctly regardless of how many rows a company occupies. Selecting a
single portfolio (the common real-world case) never hits this at all.
Deduplicating properly means merging holdings by company across
portfolios and recomputing percentages against a true combined position —
real work, deliberately deferred rather than rushed into an already large
milestone; see Future Review Criteria.

### Journal completeness — a coarse, honest signal, not invented fields

`domain/journal/model.ts`'s `calculateJournalCompleteness` reports on the
seven fields the brief names an investment should support (Investment
Thesis, Reason for Purchase, Expected Outcome, Risks, Review Date,
Confidence, Exit Strategy, Current Thesis Status — mapped to
`thesisSummary`/`expectedReturnAtPurchase`/`risks`/`convictionAtPurchase`/
`invalidationConditions`/`Thesis.overallStatus`). Six of these are created
together, atomically, by the existing `journalEntryOpenSchema` — there is
no "partially filled in" journal entry today, so completeness for those
six is really "does an open entry exist at all," not per-field gaps
within one. **`reviewDate` has no backing column and is always reported
absent** — an honest, disclosed gap (see Future Review Criteria), not a
fabricated value.

## Consequences

**Easier:**

- Every new panel (Health, Risk, Opportunities, Insights, Allocation) is a
  pure function tested in isolation — the Dashboard and a future Portfolio-
  page equivalent can both call the same `buildPortfolioIntelligence`
  composer and never disagree.
- Country/sector/currency exposure required zero new data entry — derived
  entirely from fields this platform already requires.

**Harder / accepted trade-offs:**

- Cross-portfolio combination's position-concentration undercounting
  (above) — disclosed, not fixed, this milestone.
- "Largest daily gainer/loser" (Phase 3.2, still true here) and any
  ranking built the same way can surface a "loser" that's actually a
  small gain when nothing lost value that day — an existing, accepted
  convention, not a new one.
- Every Health/concentration threshold is a documented starting point.
  Real usage may show they need tuning — that is expected, not a defect.
- `reviewDate` is named as a required journal field but has no schema
  support yet — always reported incomplete until a future milestone adds
  it.

## Alternatives Considered

- **Add a real `country` column to `companies`.** Rejected for now:
  requires new data entry for every existing company for a fact
  (`exchange`) that already determines it correctly for every currently-
  held security. Revisit if a held company's country and listing exchange
  ever genuinely diverge in a way that matters.
- **Deduplicate holdings by company when combining portfolios.** Considered
  and deliberately deferred — correct deduplication needs to merge
  quantity/cost basis across portfolios and decide what "target
  allocation" means for a combined position (each portfolio sets its own),
  which is real design work, not a quick fix, for a milestone already
  covering Health/Risk/Opportunities/Insights/Allocation/Journal
  integration/Company page enhancements in one pass.
- **Add a `reviewDate` column to `journal_entries` now.** Considered;
  deferred to keep this milestone's scope to what the brief's completion
  criteria actually require (journal integration _visible_, not every
  named field newly persisted) — recommended as the natural next journal-
  domain follow-up.
- **Rank Opportunities/Insights using a real valuation model.** Not
  possible yet — no DCF/valuation-model output beyond the manually-entered
  `blendedFairValue` exists; the brief's own instruction ("manual
  placeholder scoring is acceptable") anticipated this.

## Future Review Criteria

Revisit Health/concentration thresholds once real usage (this platform's
actual portfolios, over time) shows whether they're too strict, too
lenient, or roughly right.

Revisit cross-portfolio deduplication the first time "All portfolios"
concentration figures are relied on for an actual decision, not just
browsed — at that point the undercounting stops being a disclosed nuance
and becomes worth the deduplication work.

Add a `reviewDate` column to `journal_entries` (with a form field and a
migration) the first time journal review reminders become a real,
requested workflow rather than a named-but-unbuilt field.

Revisit Opportunities' heuristic ranking the moment a real valuation model
exists — the brief's own scoping already anticipates this replacement.
