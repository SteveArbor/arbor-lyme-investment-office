# domain/market — Interfaces only (ADR 0030)

**Status:** Interfaces defined (`model.ts`, `providers.ts`, `repository.ts`,
`service.ts`). No implementation exists yet — do not import a concrete
provider from this path, because there isn't one. `infrastructure/` has no
`market` subdirectory yet; the first one to be added (a `TwelveDataProvider`,
a `ManualFundPriceProvider`, a `RoutingPriceEngine`, a Supabase
`QuoteRepository`) is implementation work explicitly deferred until
`docs/adr/0030-price-engine-architecture.md`'s staging plan is approved.

**Purpose:** the Price Engine — a provider-neutral, security-type-routed
pricing layer. Supplies prices (`PriceEngine`), currency conversion
(`FxRateProvider`), and price history (`QuoteRepository`) to whichever
domain needs them, without that domain ever knowing which vendor answered.

**Design reference:** `docs/adr/0030-price-engine-architecture.md` (the
authoritative decision), `docs/provider-architecture.md` (`MarketDataProvider`
— refined, not superseded, by ADR 0030's more granular routing), ADR 0006,
`docs/data-flow.md` §4 (Refreshing Market Data), `docs/rules-engine.md`
(stale-data rule), `docs/market-data-provider-evaluation.md` (the vendor
research this architecture was designed against).

**Target phase:** implementation staged as Stage 1 (exchange-traded
securities only) and Stage 2 (UK OEIC/unit trust funds, daily NAV) — see the
ADR. Neither stage has been built yet.
