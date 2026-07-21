# 0031. Price Engine Stage 1 Implementation — Twelve Data, Manual Refresh, Quote Quality, Market Status

**Status:** Accepted

## Context

ADR 0030 designed the Price Engine's interfaces and staged the rollout but
implemented nothing. This ADR records what Stage 1 actually built: a
concrete `SecurityPriceProvider` backed by Twelve Data, a `QuoteRepository`
persisted in Postgres, a manual-refresh Server Action, and a
`MarketStatusProvider` — all four named explicitly in the instruction this
milestone was scoped under, alongside price-quality metadata and quote age.
Scheduled/overnight refresh is explicitly deferred to the next milestone;
nothing here builds a cron job or a background worker.

## Decision

### Domain additions (`src/domain/market/model.ts`)

- `PriceQuality` (`"real_time" | "delayed" | "previous_close"`) — added to
  `PriceQuote` alongside a new `providerName: string` field. `providerName`
  is audit-only: it exists so a stored quote can be traced back to the
  vendor that supplied it, but nothing in `domain/portfolio` or the UI is
  permitted to branch on its value — doing so would reintroduce the vendor
  coupling ADR 0030 was written to remove.
- `QuoteAge { ageSeconds, isStale }` and a pure `calculateQuoteAge(quote, now, staleAfterSeconds)`
  function. `now` is always passed in by the caller, never read from the
  system clock inside the function — the same convention
  `docs/rules-engine.md` already established for stale-data checks, so a
  quote's displayed age is always computed fresh at render time from a
  persisted `sourceTimestamp`, not frozen at the moment it was fetched.
- `MarketStatus` (`"open" | "closed" | "pre_market" | "after_hours"`) and
  `MarketStatusInfo`. Twelve Data's `/market_state` endpoint only
  distinguishes open/closed (no separate pre-market/after-hours signal) —
  `TwelveDataMarketStatusProvider` never produces the other two values;
  they exist in the domain type for a future provider that can.
- `buildIdentifierKey(identifier)` — a deterministic string key
  (`fund:<sedol-or-isin>` or `<type>:<ticker>:<exchange>`) used as the
  `QuoteRepository` upsert key, so a repeated refresh of the same security
  always overwrites the same row rather than accumulating duplicates.

### `companies.security_type` (migration `20260721000001`)

Every company now carries a `security_type` (`equity`/`etf`/
`investment_trust`/`fund`), checked at the database level, defaulted to
`equity`. The nine known HL fund holdings were backfilled to `fund` in the
same migration. `domain/company/model.ts` defines its own local
`SecurityType` union rather than importing `domain/market`'s — `company` is
the anchor domain every other domain depends on, and must not gain a
dependency on the newer, more peripheral `market` domain. The two unions are
kept manually in sync; divergence between them would be a signal the value
belongs somewhere else, not a bug to silently paper over.

### `market_quotes` table

One row per `(owner_id, identifier_key)` — a "last known good" cache, not an
append-only ledger. A failed refresh leaves the prior row untouched, so a
caller always has _some_ quote to show, with `source_timestamp` making its
age visible. RLS scopes every row to its owner, matching every other table
in this schema.

### Twelve Data infrastructure (`src/infrastructure/market-data/`)

- `twelveDataGet<T>` — one shared HTTP client used by both the price and
  market-status providers. Normalizes two distinct Twelve Data failure
  modes (HTTP-level 429/401/403, and the vendor's own body-level
  `{status:"error"}` convention returned with a 200) into the same three
  domain errors: `ProviderRateLimitError`, `ProviderAuthError`,
  `ProviderUnavailableError`.
- `TwelveDataPriceProvider implements SecurityPriceProvider` — maps
  `/quote` to a `PriceQuote`. Twelve Data does not expose a real-time-vs-
  delayed flag per call (it's subscription-tier-dependent, not visible in
  the payload); quality is inferred as `"real_time"` when `is_market_open`
  is true and `"previous_close"` otherwise. This is a documented
  simplification, not a claim that Twelve Data guarantees real-time data —
  revisit if a future tier or endpoint exposes the distinction directly.
- `TwelveDataMarketStatusProvider implements MarketStatusProvider` — maps
  `/market_state`'s `is_market_open` to `"open"`/`"closed"` only.
- `RoutingPriceEngine implements PriceEngine` — holds a
  `SecurityPriceProviderMap`, now typed `Partial<Record<SecurityType,
SecurityPriceProvider>>` rather than a full `Record` (a change from ADR
  0030's original description). Stage 1 has no `fund` provider yet; forcing
  a complete map would have required either a placeholder fund provider
  (over-engineering, explicitly out of scope until Stage 2) or a
  TypeScript error. `resolve()` throws a clear `ProviderUnavailableError`
  naming the missing `SecurityType` if something asks for a type with no
  configured provider, so an incomplete routing table fails loudly rather
  than silently.

### Manual refresh only (`application/services/price-refresh.ts`, `price-refresh-actions.ts`)

`refreshPrices()` filters out `securityType === "fund"` before building any
`SecurityIdentifier`, so funds never reach the Price Engine this milestone.
Each remaining security is refreshed independently inside its own
`try/catch` (not `Promise.allSettled`, not a single batched call) so one
failing symbol — rate-limited, delisted, a transient vendor error — never
blocks the rest of a portfolio's refresh; a dedicated test asserts this.
The Server Action (`refreshPricesAction`) is invoked from the Portfolio
Performance panel via a "Refresh prices" button wrapped in `useTransition`;
there is no automatic or scheduled trigger anywhere in this milestone.

### UI (`portfolio/[id]/page.tsx`, `portfolio-performance-panel.tsx`)

The Server Component reads only the _persisted_ `QuoteRepository` value on
every ordinary page load and computes quote age from it locally — it never
calls Twelve Data on render. A live vendor call happens only when the user
explicitly clicks "Refresh prices," preserving the manual-refresh design and
avoiding hitting vendor rate limits on every page view. Exchange-traded
holdings show a quality/age caption under the price input (amber if stale,
using a 20-minute threshold); funds are untouched — same manual
price-marking UI as before Stage 1.

## Consequences

**Easier:**

- Swapping Twelve Data for another equity vendor is a one-line change in
  `compose.ts`'s `securityPriceProviders` map — nothing in `domain/portfolio`,
  the Server Action, or the UI component references Twelve Data by name.
- The per-security try/catch means a single bad symbol degrades gracefully
  instead of failing an entire portfolio's refresh.
- `TWELVE_DATA_API_KEY` is optional in `env.server.ts`; the app runs and
  builds without one configured, throwing `ProviderAuthError` only at the
  point a refresh is actually attempted — matching this codebase's existing
  pattern for optional third-party integrations.

**Harder / accepted debt:**

- Quote-quality inference (`real_time` iff market open) is a genuine
  approximation, not a real per-call signal from the vendor. Documented
  inline; revisit if a higher Twelve Data tier or a different endpoint ever
  exposes the real distinction.
- `TwelveDataPriceProvider.getPrices` currently calls `getPrice` once per
  identifier via `Promise.all` rather than using a true vendor batch
  endpoint — correct, but not the most request-efficient shape against
  vendor rate limits. Left as a documented future optimization rather than
  built now, since Stage 1's holding count is small.
- The UI's post-refresh `QuoteAge` is constructed client-side as
  `{ageSeconds: 0, isStale: false}` immediately after a successful refresh
  (correct at that instant) but does not visibly tick upward again until
  the page is reloaded — a full page reload recomputes true age
  server-side from the persisted `sourceTimestamp`. Acceptable for a
  manual-refresh-only milestone; would need a client-side timer if quote
  age needed to visibly age in place without a reload.

## Alternatives Considered

- **A full `Record<SecurityType, SecurityPriceProvider>` per ADR 0030's
  original wording, with a placeholder `fund` provider.** Rejected: the
  brief for this exact milestone warned against over-engineering Stage 2
  ahead of need; a placeholder fund provider with nothing behind it is
  exactly that.
- **`Promise.allSettled` instead of per-security try/catch in
  `refreshPrices`.** Considered — functionally similar. Chose explicit
  try/catch because it keeps `PriceRefreshResult`'s shape
  (`{companyId, quote, error}`) directly attributable per security without
  a second mapping pass over settled-promise result objects.
- **Fetch market status on every page load to show a live open/closed
  badge.** Rejected for this milestone: it reintroduces exactly the
  "hitting the vendor on every render" problem the manual-refresh design
  exists to avoid. `MarketStatusProvider` is implemented and available to
  the refresh action but is not yet wired into a page-load-time UI badge —
  left for a future milestone that also wants live status display.

## Future Review Criteria

Revisit `TwelveDataPriceProvider.getPrices`'s one-call-per-identifier shape
if the portfolio's exchange-traded holding count grows large enough that
sequential-per-symbol requests risk the vendor's rate limit during a single
manual refresh.

Revisit quote-quality inference if a Twelve Data plan or endpoint upgrade
ever exposes real-time-vs-delayed explicitly per call.

Revisit the client-side quote-age freeze-after-refresh behaviour if a
future milestone wants the "X minutes ago" caption to visibly age without a
page reload.

Wire `MarketStatusProvider` into a visible UI element (e.g., an
open/closed badge near the refresh button) when a milestone actually wants
that displayed — it is implemented and composed today but currently unused
by any page.

## Live Validation Addendum (2026-07-21)

The migration was pushed to the live Supabase project and the manual
refresh flow was exercised against the real Twelve Data API for all six
Stage 1 holdings plus WPP. Three real defects were found and fixed:

1. **`getServerEnv()` (`src/config/env.server.ts`) parsed a hardcoded `{}`
   instead of `process.env`.** Every field it validated — in practice just
   `TWELVE_DATA_API_KEY` — was therefore always `undefined`, regardless of
   `.env.local`'s actual contents. `env.public.ts` (the sibling module this
   file's own doc comment cites as the pattern to follow) does this
   correctly; this one was never actually wired to it. Every refresh
   failed identically with `ProviderAuthError` until this was caught by
   reproducing the exact server-side call in isolation and finding it
   succeeded outside the app but failed inside it.
2. **`twelveDataGet` (`twelve-data-client.ts`) only parsed the response
   body on the HTTP-200 path**, per this ADR's original documented
   assumption that Twelve Data always encodes errors as `{status:"error"}`
   inside a 200. That assumption was incomplete: a plan-tier restriction
   (see below) comes back as a genuine non-2xx status with the _same_
   informative body attached, which the client discarded in favour of a
   bare `HTTP 404`. Fixed by reading the body first, regardless of status,
   before falling back to a bare status code.
3. **ASML's stored identifier (`ticker: "ASML.AS"`, `exchange: "Euronext
Amsterdam"`) doesn't match Twelve Data's own vocabulary** (bare `ASML` +
   `exchange: "Euronext"`, confirmed via Twelve Data's `/symbol_search`).
   The suffix exists specifically because this schema's
   `companies_owner_ticker_unique` constraint already gives the bare
   `ASML` ticker to the pre-existing NASDAQ demo company for this owner —
   changing the stored ticker was not an option. Fixed with a small,
   documented Twelve-Data-specific translation inside
   `TwelveDataPriceProvider` (strip the disambiguating suffix, alias the
   exchange name) applied only to the outbound vendor request; nothing
   about the stored company record or any other layer changed.

After both symbol and error-message fixes, ASML and WPP both correctly
resolve to Twelve Data's real response: their listings require the paid
Grow/Venture plan (`"This symbol is available starting with the Grow or
Venture plan"`) — a genuine vendor coverage/cost limitation on the current
plan, not a mapping defect. NVIDIA, Broadcom, AMD, Taiwan Semiconductor,
and e.l.f. Beauty all refreshed successfully with correct symbol,
exchange, live price, `previous_close` quality (US markets were closed at
test time), a fresh `sourceTimestamp`, and a persisted `market_quotes` row
confirmed by direct query — native currency (USD) stored correctly
throughout. Application-code latency for one refresh across 7 securities
in parallel was ~1.9s.

**Significant limitation found, deliberately not fixed in this pass:** the
Portfolio Performance panel (`portfolio-performance-panel.tsx`) has no
currency-conversion step — it sums every holding's price into the
portfolio's base-currency totals unconverted. This was latent while prices
were only ever manually typed (a user naturally entered a GBP-equivalent
figure by hand) but is now concretely, live-reproducibly wrong: a
refreshed NVIDIA quote's real $203.28 close is summed as if it were
£203.28, inflating "Market value," "Unrealised gain," and "Total portfolio
value" for every refreshed non-GBP holding. This is exactly the gap this
ADR's own Decision section already named as deliberately separate (`FxRateProvider`,
"an explicit, separate call an application-layer composer makes") — it was
designed for, not overlooked, but was never built, and Stage 1's live
quotes are the first thing to actually exercise the gap. Recorded as a
High-priority item in `docs/PROJECT_STATUS.md`'s Technical Debt; the
refresh feature should not be relied on for any non-GBP holding until it
is addressed.
