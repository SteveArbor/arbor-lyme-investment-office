/**
 * The Price Engine's data shapes (ADR 0030). Framework-free, vendor-free —
 * every field here is named to match the pre-existing design references
 * this domain was scaffolded against (`docs/provider-architecture.md`,
 * `docs/data-flow.md` §4, `docs/rules-engine.md`'s stale-data rule), not
 * invented fresh: `sourceTimestamp` in particular is `rules-engine.md`'s
 * own field name for exactly this value, chosen there before this file
 * existed.
 *
 * Interfaces only — see `docs/adr/0030-price-engine-architecture.md`. No
 * concrete provider, no HTTP client, no scheduled job exists yet.
 */

/**
 * Five categories the Price Engine routes on (ADR 0030). `investment_trust`
 * is listed separately from `equity` even though both trade on an exchange
 * with an identical data shape (ticker + exchange, single quote) — the
 * split exists so the routing table (`SecurityPriceProviderMap`) *can*
 * assign a closed-end-fund-specialist provider to investment trusts later
 * without touching this type or anything that depends on it, not because
 * today's implementation needs two different providers for them.
 */
export const SECURITY_TYPE_OPTIONS = ["equity", "etf", "investment_trust", "fund"] as const;

export type SecurityType = (typeof SECURITY_TYPE_OPTIONS)[number];

/**
 * How a security is identified depends on what kind of security it is —
 * this is itself a reason `type` is required, not inferred: an
 * exchange-traded security (`equity`/`etf`/`investment_trust`) has a
 * ticker and trades on a named exchange; a `fund` (UK OEIC/unit trust) has
 * neither — it is never listed anywhere, and is identified by SEDOL or
 * ISIN instead (see `docs/market-data-provider-evaluation.md`). A given
 * identifier populates whichever of `ticker`/`exchange` or
 * `sedol`/`isin` its `type` actually has; the unused fields are absent, not
 * fabricated as empty strings.
 */
export interface SecurityIdentifier {
  type: SecurityType;
  ticker?: string;
  exchange?: string;
  sedol?: string;
  isin?: string;
  /** ISO 4217 — the currency a price for this identifier is quoted in (its home-listing currency, e.g. EUR for ASML's Euronext Amsterdam line, never assumed to be GBP). */
  currency: string;
}

/**
 * A single price, in the security's own listing currency — never
 * converted to the portfolio's base currency here (see `FxRateProvider`
 * in `providers.ts` for that, kept as a deliberately separate concern so
 * a price provider can never silently bake in a currency conversion the
 * caller didn't ask for and can't see).
 */
export interface PriceQuote {
  identifier: SecurityIdentifier;
  price: number;
  /** ISO 4217. Matches `identifier.currency` for a provider-sourced quote; present on its own because a manually-marked quote (Stage 2 funds) still needs a currency even though it has no `SecurityIdentifier` provider to inherit one from. */
  currency: string;
  /** ISO datetime — when the *provider* says this price was valid. Never "now"; never assumed fresh. This is `rules-engine.md`'s `market.sourceTimestamp stale_after settings.maxDataAge` field. */
  sourceTimestamp: string;
}

/** ISO 4217 to ISO 4217. */
export interface FxRate {
  from: string;
  to: string;
  rate: number;
  sourceTimestamp: string;
}

/**
 * What caused a refresh — the Price Engine's two supported triggers for
 * exchange-traded securities (ADR 0030): a user-initiated one-off refresh,
 * or the overnight scheduled job. Funds support `scheduled` only (a daily
 * NAV has nothing new to fetch mid-session) — enforced by the refresh
 * orchestrator's own logic (implementation, not this interface layer),
 * not by this type.
 */
export const REFRESH_TRIGGER_OPTIONS = ["manual", "scheduled"] as const;
export type RefreshTrigger = (typeof REFRESH_TRIGGER_OPTIONS)[number];

/** The `PriceUpdated` event payload `docs/data-flow.md` §4 already names — published once a refresh's result has been persisted via `QuoteRepository`. */
export interface PriceUpdatedPayload {
  identifier: SecurityIdentifier;
  price: number;
  currency: string;
  sourceTimestamp: string;
  trigger: RefreshTrigger;
}
