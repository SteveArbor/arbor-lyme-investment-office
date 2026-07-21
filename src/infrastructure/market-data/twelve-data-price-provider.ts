import type {
  PriceQuality,
  PriceQuote,
  SecurityIdentifier,
  SecurityPriceProvider,
} from "@/domain/market";
import { ProviderUnavailableError } from "@/domain/shared";

import { twelveDataGet } from "./twelve-data-client";

const PROVIDER_NAME = "twelve_data";

/**
 * Twelve Data's own exchange vocabulary for a handful of markets doesn't
 * match this platform's `companies.exchange` values. Found live (ADR 0031
 * validation): our ASML holding is stored as exchange "Euronext Amsterdam"
 * (a clear, human-readable name consistent with "NASDAQ"/"NYSE"/"LSE"),
 * but Twelve Data's `/quote` only recognises the umbrella name "Euronext"
 * for that market (confirmed via `/symbol_search`). Extend this map if a
 * future holding hits the same mismatch on a different market.
 */
const TWELVE_DATA_EXCHANGE_ALIASES: Record<string, string> = {
  "Euronext Amsterdam": "Euronext",
};

/**
 * This platform's `companies` table enforces one ticker per owner
 * (`companies_owner_ticker_unique`), so a company dual-listed under the
 * same bare ticker on two exchanges (e.g. ASML: NASDAQ ADR and Euronext
 * Amsterdam ordinary shares) is stored with a disambiguating suffix
 * (`ASML.AS`) on the second listing. Twelve Data disambiguates the same
 * case purely via its `exchange` parameter and expects the bare symbol —
 * passing `ASML.AS` returns "symbol ... invalid", not the intended quote.
 * This strips exactly the suffix this platform itself adds for that
 * reason; it is a Twelve Data request-shape detail, not a domain concept —
 * the stored ticker and every other layer of this platform are untouched.
 */
function toTwelveDataSymbol(identifier: SecurityIdentifier): { symbol: string; exchange: string } {
  const exchange = TWELVE_DATA_EXCHANGE_ALIASES[identifier.exchange!] ?? identifier.exchange!;
  const symbol = identifier.ticker!.replace(/\.AS$/, "");
  return { symbol, exchange };
}

/**
 * Twelve Data's `/quote` response shape (fields this provider actually
 * uses; the vendor returns more than this, deliberately not modelled —
 * mapping only what the domain needs at the boundary, per
 * `docs/provider-architecture.md`'s common design rules).
 */
interface TwelveDataQuote {
  symbol: string;
  exchange: string;
  currency: string;
  close: string;
  timestamp: number;
  is_market_open: boolean;
  previous_close?: string;
}

function toPriceQuote(identifier: SecurityIdentifier, raw: TwelveDataQuote): PriceQuote {
  // Twelve Data's /quote response doesn't distinguish "real-time" from
  // "delayed" explicitly -- that depends on which data the account's
  // subscription tier is entitled to, not a per-call flag. `is_market_open`
  // is the one signal actually present: while the market is open, the
  // quote reflects live trading (real_time, at whatever entitlement the
  // account has); once it closes, every further call returns the same
  // previous_close figure until the next session.
  const quality: PriceQuality = raw.is_market_open ? "real_time" : "previous_close";

  return {
    identifier,
    price: Number(raw.close),
    currency: raw.currency,
    sourceTimestamp: new Date(raw.timestamp * 1000).toISOString(),
    quality,
    providerName: PROVIDER_NAME,
    previousClose: raw.previous_close !== undefined ? Number(raw.previous_close) : undefined,
  };
}

/**
 * `SecurityPriceProvider` implementation for Twelve Data (ADR 0030/0031
 * Stage 1) — assigned to `equity`/`etf`/`investment_trust` in the
 * composition root's `SecurityPriceProviderMap`. Requires
 * `TWELVE_DATA_API_KEY` (`src/config/env.server.ts`); throws
 * `ProviderAuthError` if it's missing, not at import time.
 */
export class TwelveDataPriceProvider implements SecurityPriceProvider {
  constructor(private readonly apiKey: string | undefined) {}

  async getPrice(identifier: SecurityIdentifier): Promise<PriceQuote> {
    if (!identifier.ticker || !identifier.exchange) {
      throw new ProviderUnavailableError(
        "Twelve Data",
        `identifier missing ticker/exchange for type ${identifier.type}`
      );
    }
    const raw = await twelveDataGet<TwelveDataQuote>(
      "/quote",
      toTwelveDataSymbol(identifier),
      this.apiKey
    );
    return toPriceQuote(identifier, raw);
  }

  async getPrices(identifiers: SecurityIdentifier[]): Promise<PriceQuote[]> {
    // Twelve Data supports comma-joined symbols in a single /quote call,
    // but exchange-disambiguation per-symbol in a batched call isn't
    // reliable across mixed exchanges -- calling once per identifier is
    // simpler and correct for Stage 1's small (six-holding) scope; batching
    // is a candidate optimisation once the held-security count actually
    // makes per-call overhead matter (see ADR 0031 Future Review Criteria).
    return Promise.all(identifiers.map((identifier) => this.getPrice(identifier)));
  }
}
