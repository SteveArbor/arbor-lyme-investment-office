import type { PriceQuote, SecurityIdentifier } from "./model";

/**
 * The one contract `domain/portfolio` (or anything else that needs a
 * price) ever depends on — ADR 0030's central point: the domain never
 * knows which vendor, or how many vendors, answered a given request. A
 * concrete implementation is a thin router that inspects
 * `identifier.type` and dispatches to the matching entry in a
 * `SecurityPriceProviderMap` (`providers.ts`) — that routing class is the
 * first real implementation to build once this ADR is approved, and is
 * deliberately not part of this interfaces-only milestone: it contains no
 * vendor-specific code, but it is still an *implementation* of this
 * interface, not the interface itself.
 *
 * Interface only — see `docs/adr/0030-price-engine-architecture.md`.
 */
export interface PriceEngine {
  getPrice(identifier: SecurityIdentifier): Promise<PriceQuote>;
  getPrices(identifiers: SecurityIdentifier[]): Promise<PriceQuote[]>;
}
