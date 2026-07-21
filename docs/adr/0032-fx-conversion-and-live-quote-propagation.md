# 0032. FX Conversion and Live Quote Propagation

**Status:** Accepted

## Context

ADR 0031's live validation of Price Engine Stage 1 found a real, live-reproducible
correctness bug: the Portfolio Performance panel summed every holding's price
into the portfolio's GBP totals **unconverted**. A refreshed NVIDIA quote's
real $203.28 close was added to "Market value"/"Unrealised gain"/"Total
portfolio value" as if it were £203.28 — inflating every headline figure for
any refreshed non-GBP holding. The underlying persisted data was always
correct (`market_quotes.currency` honestly stored `USD`); the bug was
entirely confined to the recalculation layer, which had never been built to
handle multi-currency holdings — a gap that was latent while prices were
only ever manually typed (a user naturally entered a GBP-equivalent figure
by hand) and became concretely wrong the moment a live, non-GBP quote
started flowing into the same untyped-currency slot.

This milestone closes that gap properly — a real `FxRateProvider`
implementation, conversion built into the domain calculation layer, and
persisted live quotes propagated consistently across the Dashboard,
Portfolio, and Company pages, rather than confined to one panel.

## FX Provider Evaluation

|                                                          | ECB daily reference rates                                                                                                                                                                                                                    | Twelve Data FX                                                                                                                                          | Bank of England                                                                                                                      | Other (Fixer.io, exchangerate-api, etc.)                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Cost                                                     | Free, no key                                                                                                                                                                                                                                 | Included in the existing Twelve Data plan, but FX endpoints sit behind the same tier restrictions already found gating LSE/Euronext equities (ADR 0031) | Free, no key                                                                                                                         | Free tiers exist but cap requests/month; paid tiers for reliability                                                 |
| Data shape                                               | Once-daily official reference rate (~16:00 CET)                                                                                                                                                                                              | Real-time/intraday                                                                                                                                      | Once-daily (and historical series) spot rates, GBP-centric                                                                           | Mixed — usually real-time, some daily                                                                               |
| Coverage of this platform's actual needs (USD, EUR, GBP) | All three, directly (EUR base) or via one cross-rate calculation                                                                                                                                                                             | All three                                                                                                                                               | GBP crosses only — no direct EUR/USD rate, would need its own cross-rate math anyway                                                 | All three, typically                                                                                                |
| Reliability / authority                                  | Official central-bank reference data, published on a fixed daily schedule, used throughout Europe as the standard reference rate                                                                                                             | Reliable, but adds a second dependency on the same vendor already found to have real coverage gaps at the current plan tier                             | Official, authoritative, but UK-specific                                                                                             | Varies by vendor; none carry central-bank authority                                                                 |
| Fit for this platform                                    | A daily reference rate is exactly right for a decision-support tool that revalues a portfolio once (or a few times) a day — paying for or depending on intraday FX volatility this platform never acts on intraday would be over-engineering | Real-time FX is capability this platform has no use for, at added cost/dependency risk                                                                  | Good option, but requires computing EUR crosses manually with no advantage over ECB doing the same thing with EUR as its native base | No reputational/authority advantage over ECB, and would add a real ongoing cost or rate-limit risk for zero benefit |

**Decision: European Central Bank daily reference rates**
(`eurofxref-daily.xml`). Free, no API key, no rate limit, one HTTP request
answers every currency this platform needs (the whole feed is a single
small XML document), and — the deciding factor — its once-daily cadence is
the _correct_ shape of data for a platform whose own stated purpose is
decision support, not trade execution. Twelve Data's FX endpoints were
ruled out primarily because they sit behind the same paid-tier wall ADR
0031 already found blocking LSE/Euronext equity coverage — introducing a
second dependency on a vendor whose free tier has already proven
insufficient for this portfolio's actual securities, for a capability
(intraday FX) this platform doesn't need, was an easy rejection. Bank of
England data was seriously considered (equally authoritative, free) but
publishes rates GBP-as-base rather than EUR-as-base; since ECB's EUR-based
feed already contains both USD and GBP rates directly, computing a
USD→GBP cross-rate through EUR is no more work than computing it through
GBP would have been, and ECB's feed is marginally simpler to consume (one
document, no historical-series parameters to navigate).

**Limitation, disclosed:** ECB publishes no rate at all on weekends/EU
holidays, and its published rate lags real-time markets by up to one
business day. This is accepted as correct for this platform's purpose —
see "Refresh Lifecycle" below for how staleness is surfaced rather than
hidden.

## Decision

### Currency conversion policy

1. **A `PriceQuote`'s `currency` is never overwritten or reinterpreted.**
   `EcbFxRateProvider`/`SupabaseFxRateRepository` are entirely separate from
   `SecurityPriceProvider`/`QuoteRepository` (ADR 0030's original design,
   now actually built) — a price provider never bakes in a conversion the
   caller can't see.
2. **Conversion happens once, at the domain calculation boundary.**
   `domain/portfolio/performance.ts`'s `HoldingPerformanceInput` now carries
   `currency` and an already-resolved `fxRateToBase` multiplier;
   `calculateHoldingPerformance` computes `currentPriceBase = currentPrice *
fxRateToBase` and every other money figure (`marketValue`,
   `unrealisedGain`, `dailyChangeAmountBase`) derives from that one value.
   `fxRateToBase` is always `1` for a holding whose currency already
   matches the base currency, which is what makes GBP→GBP a true identity
   conversion (requirement 4) rather than a database round-trip for a rate
   nobody needs. **The domain layer never sums two different currencies'
   raw amounts** — this is requirement 9, made structurally true by this
   single choke point rather than policed by convention at every call
   site.
3. **Resolving _which_ rate applies is an application-layer concern**
   (`application/services/portfolio-valuation.ts`'s `buildPortfolioValuation`),
   not a domain one — the domain function only ever multiplies by whatever
   it's given. This mirrors exactly how `RoutingPriceEngine` resolves
   _which_ provider answers a price request while the provider itself just
   answers it.
4. **A live quote with no available FX rate is never guessed at.** If
   `buildPortfolioValuation` cannot find a stored rate for a holding's
   currency, it falls back to showing that holding **at cost** (its
   already-GBP cost basis, exactly as if no live quote existed) rather than
   risk an unconverted or estimated price — flagged to the caller as
   `fxRateMissing: true` so the UI can say so explicitly, never silently.

### Portfolio base currency

**GBP**, per `settings.baseCurrency` — this milestone does not build
multi-base-currency support (a user changing their base currency mid-flight
is out of scope); it builds correct conversion _into_ whatever the single
configured base currency is.

### Cost basis: stored in the base currency, at the historical trade-date rate

Verified against the real HL Stocks & Shares ISA ledger before writing any
code: `transactions.price_per_unit`/`amount` and `holdings.average_cost`
are **already** recorded in GBP for every real trade — HL's own contract
notes state the GBP execution price directly (e.g. NVIDIA's buy transaction
notes read "Execution price £152.889377/share as stated on the contract
note"), and that GBP figure, not a USD one, is what was persisted at import
time. **This milestone does not alter any historical transaction.** Cost
basis is fixed at whatever FX rate applied on the historical trade date —
exactly correct brokerage accounting — and this platform never re-derives
or re-converts it using today's rate. Only the _live_ market value
(today's quote × today's FX rate) is a moving, converted figure;
`unrealisedGain = marketValueBase - costBasisBase` is therefore always a
comparison of two genuinely base-currency figures, never a mix.

### Refresh lifecycle

The existing "Refresh prices" action (ADR 0030/0031) is extended, not
replaced: `refreshMarketDataAction` now calls `refreshPrices` (quotes, ADR
0031, unchanged) and then `refreshFxRates` (new) for every currency this
portfolio's holdings actually trade in, other than the base currency
itself. Both refresh independently and both are resilient the same way:

- **`FxRateRepository` is a "last known good" cache**, structurally
  identical to `QuoteRepository` — one row per currency pair, upserted on
  success, _never deleted or overwritten on failure_. A failed ECB fetch
  simply leaves the previous row exactly as it was.
- **`EcbFxRateProvider` answers every requested pair from one HTTP call**,
  and resolves each pair independently after that single fetch — one
  currency's coverage gap can never fail a different pair in the same
  batch (mirroring `refreshPrices`'s own per-security resilience).
- **Manual FX refresh happens automatically as part of every "Refresh
  prices" click** — there is no separate FX-only button; the requirement
  ("automatic FX refresh as part of Refresh Prices") is satisfied by
  `refreshMarketDataAction` always calling both.
- **Rate age is judged against `effectiveTimestamp`** (the date ECB itself
  states the rate is for), computed at render time via
  `calculateFxRateAge` — the same pure, caller-supplied-`now` pattern
  `calculateQuoteAge` already established (ADR 0030/0031), never a stored
  boolean that itself goes stale.

### Manual price holdings — now genuinely persisted

Previously (Milestone 2.7), a manually-typed price was explicitly
ephemeral ("Prices you edit below are not saved"). This milestone adds
`PriceQuality`'s fourth value, `manual`, and a new `saveManualPrice`
application service that writes straight to `QuoteRepository` (never
through `PriceEngine` — a manual mark is a distinct, legitimate write path
to the same persistence store, not a vendor-sourced price) with
`providerName: "manual"` and `sourceTimestamp` set to the moment the user
saved it. This is the only way "Effective date, Age, Stale warning" (an
explicit requirement for manual holdings) can mean anything real — an
ephemeral, un-timestamped price typed into a form has no genuine
"effective date" to report. A holding is presented as manually priced
whenever it is a `fund`, has no quote at all, or its latest quote's
`quality` is `manual` — computed at read time
(`buildPortfolioValuation`'s `isManual` flag), never a separately stored
classification that could drift from what's actually stored.

### Live quote propagation

The Dashboard and Company pages now read the exact same persisted
`QuoteRepository`/`FxRateRepository` data the Portfolio Performance panel
does, via the same `buildPortfolioValuation` composer — **no page in this
platform calls Twelve Data (or any vendor) directly during ordinary
rendering**; every vendor call happens exclusively inside the explicit
"Refresh prices" action. This is what makes "Dashboard and portfolio pages
agree" (a live-validation requirement) structurally true rather than a
matter of keeping two independent implementations in sync.

## Consequences

**Easier:**

- The "never sum different currencies" invariant is enforced by one
  function's arithmetic (`currentPrice * fxRateToBase`), not by discipline
  at every call site that touches a holding's value.
- Adding a Dashboard-level "largest daily gainer/loser across every
  portfolio" or a Company page's live quote required zero new
  vendor-integration code — both are pure joins over data
  `buildPortfolioValuation` already assembles correctly.
- A future specialist FX vendor (if ECB's coverage or cadence ever proves
  insufficient) is a `compose.ts` one-line swap, exactly like Twelve Data
  swapping is for equities (ADR 0030's whole point).

**Harder / accepted trade-offs:**

- Daily change (`dailyChangeAmountBase`) is computed using **today's** FX
  rate applied to both today's and yesterday's price in the trading
  currency — not yesterday's actual FX rate. This platform does not
  maintain FX rate history (out of this milestone's scope: no historical
  charts), so a holding's "daily change in GBP" slightly misstates the
  FX-driven portion of the move on days where GBP itself moved
  materially against the holding's currency. Disclosed, not hidden;
  revisit only if this proves materially wrong in practice.
- A holding whose FX rate is missing falls back to being shown at cost,
  which is safe but means its `unrealisedGain` genuinely shows `0` on the
  very first refresh cycle before that holding's currency has ever been
  fetched — a brief, self-correcting state, not a persistent one.
- Manual price entry is a small UX change (a "Save" button, not just
  ephemeral typing) — a deliberate trade-off: it is exactly what makes
  "Effective date, Age" mean anything real for a manually-priced holding.

## Alternatives Considered

- **Fold FX conversion into `TwelveDataPriceProvider`, returning an
  already-GBP-converted price.** Rejected: exactly the design ADR 0030
  already rejected for the same reason — a price provider silently
  applying a conversion the caller can't see or override, and coupling the
  FX rate's freshness to whichever equity happened to be refreshed most
  recently.
- **Store `isStale`/converted-value fields directly on `FxRate`.**
  Rejected: staleness is a function of `(rate, now, threshold)`, not a
  fact about the rate itself — storing it would mean a correct value the
  moment it's written and a silently wrong one an hour later, the same
  reasoning `QuoteAge` already established for prices.
- **Give `FX_RATE_QUALITY_OPTIONS` a written `stale_fallback` value,
  persisted to the database the moment a refresh fails.** Considered, but
  a persisted row's `quality` should describe what it genuinely was when
  fetched (a real ECB reference rate), not what happened on some later,
  unrelated refresh attempt. `stale_fallback` remains in the enum for a
  future provider that might explicitly report an estimated/derived
  rate; `EcbFxRateProvider` and today's refresh orchestrator only ever
  persist `quality: "reference"` — a failed refresh's "we're using a
  fallback" fact is expressed via the refresh result's `outcome`/`error`
  fields plus the rate's own computed age, not by relabelling stored data.
- **Rank "largest daily gainer/loser" by percentage change instead of
  absolute base-currency amount.** Rejected for consistency with the
  pre-existing `largestGain`/`largestLoss` (unrealised), which already
  rank by absolute amount — mixing ranking conventions across the same
  panel would be a more confusing inconsistency than the (minor) FX-timing
  approximation this ranking inherits.

## Future Review Criteria

Revisit ECB's cadence/coverage if a future holding trades in a currency
ECB doesn't publish, or if same-day FX movement ever needs to be reflected
faster than once daily (a genuine shift toward trade execution, not
decision support, would be the trigger for that).

Revisit the "today's FX rate applied to yesterday's price" daily-change
approximation if this platform ever builds historical price/FX time
series (explicitly out of scope this milestone).

Revisit `stale_fallback`'s unused status if a future FX provider
explicitly distinguishes a true reference rate from an estimated one.

Revisit manual price entry's UX (a single save button per holding) if a
future milestone wants bulk manual-price entry across many funds at once.
