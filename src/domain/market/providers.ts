import type { FxRate, PriceQuote, SecurityIdentifier, SecurityType } from "./model";

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
 * caller can't see or account for. An application-layer composer (e.g. a
 * future evolution of `application/services/portfolio-performance.ts`)
 * calls this explicitly when it needs to express a non-GBP holding in the
 * portfolio's base currency.
 */
export interface FxRateProvider {
  getRate(from: string, to: string): Promise<FxRate>;
  getRates(pairs: ReadonlyArray<{ from: string; to: string }>): Promise<FxRate[]>;
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
 */
export type SecurityPriceProviderMap = Record<SecurityType, SecurityPriceProvider>;
