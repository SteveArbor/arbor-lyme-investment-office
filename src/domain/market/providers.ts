import type {
  FxRate,
  MarketStatusInfo,
  PriceQuote,
  SecurityIdentifier,
  SecurityType,
} from "./model";

/**
 * A single vendor's ability to answer "what does this security cost" —
 * implemented in `infrastructure/` (a `TwelveDataProvider`, a
 * `ManualFundPriceProvider`, etc.), never in `domain/*`. Per
 * `docs/provider-architecture.md`'s common design rules: methods return
 * domain types (never a vendor's own JSON shape), and throw
 * `ProviderRateLimitError`/`ProviderUnavailableError`/`ProviderAuthError`
 * (`domain/shared`) rather than a raw HTTP error, so calling code reacts
 * the same way regardless of which vendor is behind this call.
 *
 * Interface only — see `docs/adr/0030-price-engine-architecture.md`.
 */
export interface SecurityPriceProvider {
  getPrice(identifier: SecurityIdentifier): Promise<PriceQuote>;
  getPrices(identifiers: SecurityIdentifier[]): Promise<PriceQuote[]>;
}

/**
 * Currency conversion is a deliberately separate concern from pricing a
 * security (ADR 0030) — a `SecurityPriceProvider` never converts on the
 * caller's behalf, so a rate never gets silently baked into a price the
 * caller can't see or account for. An application-layer composer
 * (`application/services/portfolio-valuation.ts`, ADR 0032) calls this
 * explicitly when it needs to express a non-base-currency holding in the
 * portfolio's base currency (GBP today).
 *
 * Implemented by `EcbFxRateProvider` (`infrastructure/market-data/`) —
 * the European Central Bank's daily reference-rate feed, chosen over a
 * real-time FX vendor because this platform is decision support, not
 * trade execution (ADR 0032's provider evaluation).
 */
export interface FxRateProvider {
  getRate(base: string, quote: string): Promise<FxRate>;
  getRates(pairs: ReadonlyArray<{ base: string; quote: string }>): Promise<FxRate[]>;
}

/**
 * The Price Engine's routing table (ADR 0030) — composition-time
 * configuration (`provider-architecture.md`'s "swappable via
 * configuration, not a code change" rule), never a decision a call site
 * makes itself. One `SecurityPriceProvider` instance may legitimately
 * serve more than one `SecurityType` — Stage 1's single exchange-traded
 * provider is expected to be assigned to `equity`, `etf`, and
 * `investment_trust` alike, since all three share the same real-world
 * quote shape — the map only guarantees that the *choice* per type is
 * independently configurable, not that each type needs its own instance.
 *
 * Deliberately `Partial` (ADR 0031): Stage 1 configures only the
 * exchange-traded slots and leaves `fund` unset, since building a
 * placeholder "fund provider" purely to satisfy a `Record`'s completeness
 * would be exactly the over-engineering Stage 2 was scoped to avoid. A
 * `RoutingPriceEngine` given an identifier whose type has no configured
 * provider throws `ProviderUnavailableError` naming the missing type,
 * rather than silently returning nothing.
 */
export type SecurityPriceProviderMap = Partial<Record<SecurityType, SecurityPriceProvider>>;

/**
 * Whether a given exchange is currently trading — a Stage 1 addition
 * (ADR 0031) alongside `SecurityPriceProvider`, not folded into it: market
 * status is a fact about a *venue*, shared by every security listed there,
 * whereas a price is a fact about one security. Kept separate so a quote's
 * age can be interpreted correctly (`PriceQuote.quality`'s doc comment) —
 * without it, a stale-looking quote and a healthy "market's shut" quote
 * are indistinguishable from `sourceTimestamp` alone.
 */
export interface MarketStatusProvider {
  getStatus(exchange: string): Promise<MarketStatusInfo>;
  getStatuses(exchanges: string[]): Promise<MarketStatusInfo[]>;
}
