# 0030. Price Engine — Provider-Neutral, Security-Type-Routed Market Data Architecture

**Status:** Accepted

## Context

`docs/market-data-provider-evaluation.md` compared market data vendors
against this platform's actual portfolio and reached a conclusion more
important than which single vendor scored highest: **exchange-traded
securities and UK OEIC/unit trust funds are two different pricing
problems, solved by different kinds of vendor, at very different price
points.** No mainstream, affordably-priced API reliably prices UK OEIC
funds by SEDOL; that data lives with specialist B2B vendors that quote
enterprise pricing. Recommending a single market-data vendor for "the
portfolio" would have been the wrong shape of decision before this
architecture existed to say so.

Separately, ADR 0006 named `MarketDataProvider` as one of six vendor-neutral
provider interfaces to build, as a single flat contract
(`docs/provider-architecture.md`: `getQuote`/`getQuotes`/
`getHistoricalPrices`/`searchInstruments`/`getInstrumentDetails`). That ADR's
own Future Review Criteria anticipated this moment exactly: *"Revisit
per-interface if a specific abstraction proves to leak... at that point, the
interface itself needs redesign, which is a normal and expected outcome of
designing an interface before more than one implementation exists."* A flat
`MarketDataProvider` leaks the moment a second, genuinely different provider
(a fund NAV source) needs to sit behind the same call site as an equity
quote source — this ADR is that redesign, triggered exactly as ADR 0006
anticipated, not a reversal of it.

This ADR is architecture and a staging plan only. Per the instruction it was
written under, **only interfaces exist as code** (`src/domain/market/`) — no
concrete provider, no HTTP client, no scheduled job, no database migration.
Implementation begins only after this ADR is reviewed.

## Decision

### The Price Engine is a router, not a vendor client

`domain/market` now owns four interfaces (all in `src/domain/market/`,
none implemented):

- **`SecurityIdentifier`** (`model.ts`) — how a security is identified
  depends on what it is: exchange-traded securities (`equity`/`etf`/
  `investment_trust`) carry `ticker` + `exchange`; funds carry `sedol`/
  `isin` instead, since a UK OEIC has neither a ticker nor a listing
  exchange at all.
- **`PriceEngine`** (`service.ts`) — `getPrice`/`getPrices`, taking a
  `SecurityIdentifier` and returning a `PriceQuote`. **This is the only
  contract any consuming domain (`portfolio`, eventually `analytics`,
  `rules`) will ever depend on.** Nothing about a vendor appears in this
  interface's shape, its inputs, or its outputs — satisfying "the domain
  should never know which provider supplied the price" structurally, not
  by convention.
- **`SecurityPriceProvider`** (`providers.ts`) — what a single vendor
  implementation actually looks like. A concrete `PriceEngine` (the first
  real implementation, built when Stage 1 begins) holds a
  `SecurityPriceProviderMap` — a `Record<SecurityType, SecurityPriceProvider>`
  — and dispatches each request to the entry matching `identifier.type`.
  One provider instance may legitimately be assigned to more than one
  `SecurityType` (Stage 1 assigns the same exchange-traded-securities
  provider to `equity`, `etf`, and `investment_trust` alike, since all
  three share an identical real-world quote shape); the map's job is
  making that assignment independently configurable per type, not forcing
  a distinct instance per type.
- **`FxRateProvider`** (`providers.ts`) — deliberately separate from
  `PriceEngine`. A `SecurityPriceProvider` always returns a price in the
  security's own listing currency (EUR for ASML's Euronext Amsterdam line,
  USD for the NASDAQ/NYSE names) — it never silently converts to GBP.
  Converting is an explicit, separate call an application-layer composer
  makes when it needs to express a holding in the portfolio's base
  currency, using whichever rate source is configured — so a price and
  the FX rate applied to it are always two independently visible,
  independently swappable facts, never one vendor's opaque bundle.
- **`QuoteRepository`** (`repository.ts`) — persistence for the
  "last known good" price of each security, matching the refresh sequence
  `docs/data-flow.md` §4 already designed: a refresh (manual or scheduled)
  upserts here; a provider failure leaves the prior row in place rather
  than deleting it, so a caller always has *some* quote, with
  `sourceTimestamp` (the exact field name `docs/rules-engine.md`'s
  stale-data rule already uses) making its staleness visible rather than
  hidden.

Provider failures map to `ProviderRateLimitError`/`ProviderUnavailableError`/
`ProviderAuthError` — added to `domain/shared/errors.ts` this milestone
(named in `provider-architecture.md`/`data-flow.md` since ADR 0006, never
actually implemented until now) so every future provider-backed context
(AI, notifications, documents) reacts to "the vendor is rate-limiting us"
the same way, not a market-data-specific error shape.

### Refresh strategy

| | Exchange-traded (Stage 1) | Funds (Stage 2) |
| --- | --- | --- |
| Manual (user-triggered) refresh | Supported | Not offered — a daily NAV has nothing new to fetch mid-session |
| Scheduled (overnight) refresh | Supported | The only refresh path — once daily, matching how the fund itself is priced |

Both triggers do the same thing: call `PriceEngine.getPrice(s)`, upsert the
result via `QuoteRepository`, publish `PriceUpdated` (the event shape
`data-flow.md` §4 already named). The distinction between "manual" and
"scheduled" is carried as `RefreshTrigger` on that event, not as two
different code paths through the engine itself.

## Staging Plan

### Stage 1 — exchange-traded securities only

**Scope:** the six most recently added holdings — NVIDIA, Broadcom, AMD,
Taiwan Semiconductor (NYSE ADS), ASML (Euronext Amsterdam ordinary shares),
e.l.f. Beauty — plus WPP and every equity in Core Growth Portfolio, all
routed through a single `SecurityPriceProvider` implementation assigned to
`equity`/`etf`/`investment_trust`.

**Provider:** Twelve Data (Pro tier), per
`docs/market-data-provider-evaluation.md` — confirmed Euronext Amsterdam
coverage by name, which this stage genuinely needs (ASML is a real holding).

**Refresh:** both manual and overnight-scheduled, per the table above.

**What Stage 1 does *not* need:** any change to `QuoteRepository`'s shape,
any change to `PriceEngine`'s interface, or a second provider — it's a
single routing-table entry (three `SecurityType`s, one provider instance)
plus one concrete `SecurityPriceProvider` implementation. This is the
argument for staging at all: Stage 1 is small, contained, and fully
exercises the architecture without touching funds.

### Stage 2 — UK OEIC/unit trust funds, daily NAV only

**Scope:** the nine fund holdings already in HL Stocks & Shares ISA
(Artemis, Fidelity, HL Global Bond, Invesco, L&G, LF Equity Income, two
Royal London funds, Vanguard), routed through the `fund` slot of the same
routing table.

**Provider:** deliberately **not** a real vendor integration yet.
`docs/market-data-provider-evaluation.md` found no realistically-priced
vendor for this data (Exchange Data International/Xignite/Morningstar
Direct all quote enterprise pricing). Building a real
`FundNavProvider` against one of those now — before a quote is even in
hand — would be over-engineering exactly what the brief warned against.

Instead, Stage 2's `SecurityPriceProvider` for `fund` is a thin adapter
over the **existing** manual price-marking workflow (Milestone 2.7's
Portfolio Performance panel): it satisfies the interface (so `fund` has a
routing-table entry, and nothing about `PriceEngine`'s contract has a
"funds aren't really supported yet" carve-out visible to callers), but its
implementation is "return the price a user most recently entered," not a
live vendor call. This keeps the *architecture* fund-ready — swapping in a
real fund-NAV vendor later is a routing-table change, not a redesign — 
without buying data nobody has priced yet.

**Refresh:** scheduled only (daily), matching how OEIC/unit trust NAVs are
themselves priced — there is nothing for a "manual refresh" to fetch that
a NAV-once-a-day fund could have changed mid-session.

## Consequences

**Easier:**

- Swapping Stage 1's equity provider (Twelve Data → anything else) is a
  one-line change to the `SecurityPriceProviderMap`'s `equity`/`etf`/
  `investment_trust` entries — nothing in `domain/portfolio` or any UI
  component changes, because none of them ever imported a provider
  directly.
- A future specialist fund-data vendor slots into the exact same `fund`
  routing-table entry Stage 2 already created — no interface redesign
  needed when that budget decision eventually gets made.
- `domain/portfolio`'s tests (and any future `domain/market` tests) use
  fake `SecurityPriceProvider`/`QuoteRepository` implementations, never a
  real vendor's HTTP API — consistent with how every other provider
  interface in this codebase is meant to be tested (ADR 0006).

**Harder:**

- Two refresh paths (manual, scheduled) and a persisted quote cache
  (`QuoteRepository`) are more moving parts than Milestone 2.7's
  session-only price marking. That complexity is the direct cost of
  turning "look at your actual portfolio as it stands today" (this
  milestone's stated objective) into something true without the user
  re-typing six prices every time they open the app.
- Stage 2 ships a `fund` provider that is honestly just a wrapper around
  manual entry — not a capability improvement over what exists today, only
  an architectural placeholder that keeps the door open. This needs to be
  communicated plainly when Stage 2 is built, not presented as "funds are
  now live-priced."
- `QuoteRepository` being owner-scoped (matching every other repository in
  this codebase) means, in a future multi-user deployment, N users holding
  NVIDIA would each maintain their own cached copy of the same public
  price — mildly wasteful, not incorrect. Named as an open question, not
  fixed now (see Future Review Criteria).

## Alternatives Considered

- **Keep ADR 0006's single flat `MarketDataProvider` and give it an
  `assetType` parameter instead of routing at a higher level.** Rejected:
  this pushes the routing decision (and therefore the vendor-swap
  decision) inside every implementation of the interface, which is exactly
  the leak ADR 0006's own Future Review Criteria described — a caller
  would still need to know an asset-type-to-vendor mapping exists, just
  hidden one layer down instead of made explicit as configuration.
- **Fold FX conversion into `PriceEngine.getPrice`, returning an
  already-GBP-converted price.** Rejected: a price provider silently
  applying a currency conversion the caller can't see or override
  contradicts this platform's "no invented data" principle applied to
  *rates*, not just prices — and it would make the FX rate itself
  unswappable independent of the price vendor, when in practice a
  dedicated FX-rate vendor is a completely reasonable, separate choice.
- **Build the Stage 2 fund provider against Exchange Data International or
  Xignite now, on the strength of the evaluation's research.** Rejected:
  neither vendor's pricing is public; committing budget to an enterprise
  quote before a single fund price is actually needed live is the
  over-engineering this milestone's brief explicitly warned against.
  Revisit once Stage 1 is live and the fund gap is the *remaining* problem,
  not a theoretical one.
- **Build the concrete `RoutingPriceEngine` router class now, since it has
  no vendor dependencies.** Considered, since the router itself is pure
  domain logic with nothing vendor-specific in it. Held back anyway: the
  instruction this milestone was scoped under draws the line at
  "interfaces only, then an ADR, then implementation" as three distinct,
  separately-approved steps — building the router now would blur the
  second and third.

## Future Review Criteria

Revisit `QuoteRepository`'s owner-scoping if/when a second real user is
ever onboarded — at that point, N users independently caching the same
public NVIDIA price stops being a rounding error and becomes worth a
shared, non-owner-scoped quote cache instead.

Revisit Stage 2's manual-wrapper `fund` provider the moment a specialist
fund-data vendor's actual price is in hand (a quote from Exchange Data
International, Xignite, or an equivalent) and is judged worth paying for —
this ADR's `fund` routing slot was built specifically so that becomes a
configuration change, not an architecture change.

Revisit the Twelve Data choice itself if its Euronext Amsterdam or
mutual-fund-NAV coverage, once tested against a live trial key, doesn't
actually match its public documentation — `docs/market-data-provider-evaluation.md`
already flagged this as unverified-beyond-documentation and named it as the
natural first step of implementation.
