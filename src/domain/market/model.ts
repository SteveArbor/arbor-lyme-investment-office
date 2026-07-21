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
 * A deterministic string a `QuoteRepository` implementation can use as its
 * dedup/upsert key — pure domain logic, not persistence-specific, so a
 * test can assert on it without touching a database. Exchange-traded
 * identifiers key on ticker+exchange (a `fund`'s ticker/exchange are
 * absent, never fabricated); funds key on SEDOL. Throws rather than
 * silently producing an ambiguous key if the fields the identifier's own
 * `type` requires are missing — a malformed identifier should fail loudly,
 * not collide with an unrelated security.
 */
export function buildIdentifierKey(identifier: SecurityIdentifier): string {
  if (identifier.type === "fund") {
    if (!identifier.sedol && !identifier.isin) {
      throw new Error("A fund SecurityIdentifier requires sedol or isin");
    }
    return `fund:${identifier.sedol ?? identifier.isin}`;
  }
  if (!identifier.ticker || !identifier.exchange) {
    throw new Error(`A ${identifier.type} SecurityIdentifier requires ticker and exchange`);
  }
  return `${identifier.type}:${identifier.ticker}:${identifier.exchange}`;
}

/**
 * What kind of price this is, as reported (or reasonably inferred) by the
 * provider itself — not a judgement about whether it's "good enough,"
 * which is a separate, caller-side decision (`calculateQuoteAge` below).
 * `real_time`/`delayed` only mean anything while the relevant market is
 * open; outside trading hours every exchange-traded quote is legitimately
 * a `previous_close`, which is why quality and market status
 * (`MarketStatusProvider`, `providers.ts`) are surfaced as two separate
 * facts rather than collapsed into one "is this stale?" flag — a
 * five-hour-old `previous_close` on a Saturday is healthy; a five-hour-old
 * `real_time` quote on a Tuesday afternoon is not, and only knowing the
 * market's status lets a caller tell the two apart.
 */
/**
 * `manual` (ADR 0032) is a user-entered mark, not a vendor quote — for
 * securities the configured provider can't price at all (a fund, or an
 * exchange gated behind a paid vendor tier, e.g. ASML's Euronext
 * Amsterdam line or WPP's LSE line on Twelve Data's free plan). It reuses
 * `PriceQuote`/`QuoteRepository` rather than a parallel storage
 * mechanism specifically so a manual mark gets the same persisted
 * `sourceTimestamp`/age/staleness treatment a live quote does — the UI
 * must never present one as the other (`docs/adr/0032-fx-conversion-and-live-quote-propagation.md`).
 */
export const PRICE_QUALITY_OPTIONS = ["real_time", "delayed", "previous_close", "manual"] as const;
export type PriceQuality = (typeof PRICE_QUALITY_OPTIONS)[number];

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
  quality: PriceQuality;
  /**
   * Which concrete provider answered — retained purely for audit/storage
   * (`docs/data-flow.md` §4: "every stored price retains sourceTimestamp
   * and provider identity"). `domain/portfolio` and every UI component
   * must never read or branch on this field; it exists so
   * `QuoteRepository` can persist it without the repository itself
   * needing to hardcode a vendor name.
   */
  providerName: string;
  /**
   * The prior session's closing price, in `currency` (ADR 0032) — what a
   * "daily change" is computed against. Absent for a `manual` mark (a
   * hand-typed price has no vendor-reported "yesterday") and for any
   * provider response that doesn't report it; a caller must treat a
   * missing value as "daily change unknown," never fall back to
   * `sourceTimestamp`-based guessing.
   */
  previousClose?: number;
}

/** A quote's move since the prior session's close — `amount` is in the quote's own `currency` (a caller converts to base currency separately, same as any other money figure); `percent` is a currency-agnostic ratio, safe to compare or rank across holdings regardless of what each is priced in. */
export interface DailyChange {
  amount: number;
  percent: number;
}

/**
 * `null` when `previousClose` is absent — never a fabricated 0% change.
 * Pure and deterministic: no clock, no lookup, matching every other
 * calculation in this file.
 */
export function calculateDailyChange(
  quote: Pick<PriceQuote, "price" | "previousClose">
): DailyChange | null {
  if (quote.previousClose === undefined || quote.previousClose === 0) return null;
  const amount = quote.price - quote.previousClose;
  return { amount, percent: amount / quote.previousClose };
}

/**
 * How old a quote is, and whether it exceeds a caller-supplied threshold —
 * deliberately a pure function of `(quote, now, staleAfterSeconds)`, never
 * reading the system clock itself, matching `rules-engine.md`'s own
 * "no hidden state, no current-time lookups inside the evaluation itself"
 * rule for exactly this kind of time-relative comparison. `now` and the
 * threshold are supplied by the caller (an application-layer composer
 * that also knows the relevant market's status) precisely so this stays
 * a deterministic, unit-testable calculation — never a source of "it
 * depends what time you ran the test" flakiness.
 */
export interface QuoteAge {
  ageSeconds: number;
  isStale: boolean;
}

export function calculateQuoteAge(
  quote: Pick<PriceQuote, "sourceTimestamp">,
  now: string,
  staleAfterSeconds: number
): QuoteAge {
  const ageSeconds = (new Date(now).getTime() - new Date(quote.sourceTimestamp).getTime()) / 1000;
  return { ageSeconds, isStale: ageSeconds > staleAfterSeconds };
}

/**
 * Whether an exchange is currently trading — the fact that makes a quote's
 * age interpretable (see `PriceQuality`'s doc comment above). Keyed by
 * exchange, not by security, since every security listed on the same
 * exchange shares the same trading calendar.
 */
export const MARKET_STATUS_OPTIONS = ["open", "closed", "pre_market", "after_hours"] as const;
export type MarketStatus = (typeof MARKET_STATUS_OPTIONS)[number];

export interface MarketStatusInfo {
  exchange: string;
  status: MarketStatus;
  /** ISO datetime this status was determined as of — a market-status check is itself a fact with a freshness, same reasoning as `PriceQuote.sourceTimestamp`. */
  sourceTimestamp: string;
}

/**
 * `reference` — a daily reference rate freshly retrieved this refresh (ADR
 * 0032 deliberately prefers a daily reference-rate provider, e.g. the
 * ECB, over a real-time FX feed: this platform is decision support, not
 * trade execution, so a once-daily official rate is both cheaper and more
 * appropriate than paying for intraday FX). `stale_fallback` — a refresh
 * was attempted and failed, and this is the last known good rate being
 * reused rather than erased (requirement: never lose a valid prior rate
 * to a failed refresh).
 */
export const FX_RATE_QUALITY_OPTIONS = ["reference", "stale_fallback"] as const;
export type FxRateQuality = (typeof FX_RATE_QUALITY_OPTIONS)[number];

/**
 * One currency pair's conversion rate (ADR 0032): 1 unit of `base` = `rate`
 * units of `quote`. Deliberately mirrors `PriceQuote`'s shape
 * (`providerName`/timestamp/quality) — an FX rate is the same kind of fact
 * as a price (something a vendor reports, that goes stale, that needs
 * audit provenance), not a special case requiring its own vocabulary.
 */
export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  providerName: string;
  /** ISO datetime — the date/session this rate is officially for (a daily reference rate has no intraday precision; never inflate one with a fabricated time-of-day beyond what the provider actually states). */
  effectiveTimestamp: string;
  /** ISO datetime — when this application actually retrieved the rate; distinct from `effectiveTimestamp` because a rate fetched today is still "today's rate" even if retrieved several times over the course of the day. */
  retrievedTimestamp: string;
  quality: FxRateQuality;
}

/** Mirrors `QuoteAge`/`calculateQuoteAge` exactly — pure, `now` supplied by the caller, staleness judged against `effectiveTimestamp` (the rate's own official date), not `retrievedTimestamp` (when we happened to fetch it). */
export interface FxRateAge {
  ageSeconds: number;
  isStale: boolean;
}

export function calculateFxRateAge(
  rate: Pick<FxRate, "effectiveTimestamp">,
  now: string,
  staleAfterSeconds: number
): FxRateAge {
  const ageSeconds = (new Date(now).getTime() - new Date(rate.effectiveTimestamp).getTime()) / 1000;
  return { ageSeconds, isStale: ageSeconds > staleAfterSeconds };
}

/** Deterministic upsert/lookup key for an `FxRateRepository` — mirrors `buildIdentifierKey`. */
export function buildFxPairKey(base: string, quote: string): string {
  return `${base}:${quote}`;
}

/**
 * Converts an amount from `from` into `to` using an already-resolved
 * multiplier (1 unit of `from` = `rate` units of `to`). Identity
 * conversion (`from === to`) always returns the amount completely
 * unchanged regardless of what `rate` is passed, so a caller never needs
 * a real `FxRate` fetched or stored for a same-currency holding (ADR
 * 0032, requirement 4: GBP→GBP is identity). Resolving *which* rate
 * applies (looking one up, handling a missing or stale pair) is the
 * application layer's job — this function's only responsibility is the
 * arithmetic, which is exactly what keeps requirement 9 ("never sum USD,
 * EUR, and GBP directly") a single, obvious, unit-testable choke point
 * rather than scattered multiplication at every call site.
 */
export function convertCurrency(amount: number, from: string, to: string, rate: number): number {
  if (from === to) return amount;
  return amount * rate;
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
