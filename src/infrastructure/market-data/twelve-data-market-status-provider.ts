import type { MarketStatus, MarketStatusInfo, MarketStatusProvider } from "@/domain/market";

import { twelveDataGet } from "./twelve-data-client";

/** Twelve Data's `/market_state` response shape (fields this provider uses). */
interface TwelveDataMarketState {
  exchange?: string;
  code?: string;
  is_market_open: boolean;
}

function toMarketStatusInfo(exchange: string, raw: TwelveDataMarketState): MarketStatusInfo {
  // Twelve Data's /market_state only ever reports open/closed, not
  // pre-market/after-hours granularity (it does return time_to_open/
  // time_to_close durations, not a distinct session-phase enum) -- so this
  // provider only ever produces "open" or "closed". `pre_market`/
  // `after_hours` remain valid `MarketStatus` values for a future provider
  // that actually distinguishes them; nothing about this mapping being
  // narrower than the domain type is a bug.
  const status: MarketStatus = raw.is_market_open ? "open" : "closed";
  return {
    exchange,
    status,
    sourceTimestamp: new Date().toISOString(),
  };
}

/**
 * `MarketStatusProvider` implementation for Twelve Data (ADR 0031).
 * Requires `TWELVE_DATA_API_KEY`; throws `ProviderAuthError` if missing,
 * at the point of use, not at import time.
 */
export class TwelveDataMarketStatusProvider implements MarketStatusProvider {
  constructor(private readonly apiKey: string | undefined) {}

  async getStatus(exchange: string): Promise<MarketStatusInfo> {
    const raw = await twelveDataGet<TwelveDataMarketState>(
      "/market_state",
      { exchange },
      this.apiKey
    );
    return toMarketStatusInfo(exchange, raw);
  }

  async getStatuses(exchanges: string[]): Promise<MarketStatusInfo[]> {
    return Promise.all(exchanges.map((exchange) => this.getStatus(exchange)));
  }
}
