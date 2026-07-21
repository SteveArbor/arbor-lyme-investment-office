import type { PriceQuote, SecurityIdentifier } from "./model";

/**
 * Persistence for the "last known good" price of each security
 * (`docs/data-flow.md` §4's refresh sequence: a scheduled or manual
 * refresh upserts here; a provider failure leaves the prior row in place
 * rather than deleting it, so a caller always has *some* quote, with
 * `sourceTimestamp` making its staleness visible rather than hidden — see
 * `rules-engine.md`'s stale-data rule). Owner-scoped for consistency with
 * every other repository in this codebase (ADR 0030 notes this as an open
 * question worth revisiting: a market price is arguably shared, objective
 * reference data rather than private per-owner financial data, and might
 * not need RLS-per-owner at all once a second real user ever exists — not
 * resolved now, since this system is single-tenant-per-deployment today).
 *
 * Interface only — see `docs/adr/0030-price-engine-architecture.md`.
 */
export interface QuoteRepository {
  getLatest(ownerId: string, identifier: SecurityIdentifier): Promise<PriceQuote | null>;
  getLatestForMany(ownerId: string, identifiers: SecurityIdentifier[]): Promise<PriceQuote[]>;
  upsert(ownerId: string, quote: PriceQuote): Promise<void>;
}
