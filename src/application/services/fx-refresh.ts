import { buildFxPairKey, type FxRate, type FxRateProvider, type FxRateRepository } from "@/domain/market";

export const FX_REFRESH_OUTCOME_OPTIONS = ["updated", "unchanged", "failed"] as const;
export type FxRefreshOutcome = (typeof FX_REFRESH_OUTCOME_OPTIONS)[number];

export interface FxRefreshResult {
  base: string;
  quote: string;
  outcome: FxRefreshOutcome;
  /** The rate now in effect for this pair — freshly fetched for `updated`/`unchanged`, the last known good stored rate for `failed` (never erased by a failed refresh), or `null` if this pair has never been successfully fetched at all. */
  rate: FxRate | null;
  error: string | null;
}

export interface FxRefreshDependencies {
  fxRateProvider: Pick<FxRateProvider, "getRates">;
  fxRateRepository: Pick<FxRateRepository, "getLatestForMany" | "upsert">;
}

/**
 * Refreshes every non-identity currency pair the current holdings
 * actually need (ADR 0032). Identity pairs (`base === quote`) are filtered
 * out before ever reaching a provider or the repository — GBP→GBP needs
 * no rate, stored or fetched, per requirement 4.
 *
 * One provider call answers every requested pair (`EcbFxRateProvider`
 * fetches ECB's single daily feed once, regardless of how many pairs are
 * asked for), then each pair is resolved independently: a pair the
 * provider didn't return (a genuine per-pair failure, or the whole
 * provider call throwing) falls back to the last stored rate for that
 * pair rather than leaving the caller with nothing — the same "one
 * failure never blocks the rest, and a failed refresh never erases a
 * valid prior value" resilience `refreshPrices` already established for
 * quotes.
 */
export async function refreshFxRates(
  deps: FxRefreshDependencies,
  ownerId: string,
  pairs: ReadonlyArray<{ base: string; quote: string }>
): Promise<FxRefreshResult[]> {
  const nonIdentityPairs = pairs.filter((pair) => pair.base !== pair.quote);
  if (nonIdentityPairs.length === 0) return [];

  const previousRates = await deps.fxRateRepository.getLatestForMany(ownerId, nonIdentityPairs);
  const previousByKey = new Map(
    previousRates.map((rate) => [buildFxPairKey(rate.base, rate.quote), rate])
  );

  let fetched: FxRate[] = [];
  let fetchError: string | null = null;
  try {
    fetched = await deps.fxRateProvider.getRates(nonIdentityPairs);
  } catch (error) {
    fetchError = error instanceof Error ? error.message : String(error);
  }
  const fetchedByKey = new Map(fetched.map((rate) => [buildFxPairKey(rate.base, rate.quote), rate]));

  return Promise.all(
    nonIdentityPairs.map(async (pair): Promise<FxRefreshResult> => {
      const key = buildFxPairKey(pair.base, pair.quote);
      const fresh = fetchedByKey.get(key);
      const prior = previousByKey.get(key) ?? null;

      if (fresh) {
        await deps.fxRateRepository.upsert(ownerId, fresh);
        const unchanged =
          prior !== null &&
          prior.rate === fresh.rate &&
          prior.effectiveTimestamp === fresh.effectiveTimestamp;
        return {
          base: pair.base,
          quote: pair.quote,
          outcome: unchanged ? "unchanged" : "updated",
          rate: fresh,
          error: null,
        };
      }

      return {
        base: pair.base,
        quote: pair.quote,
        outcome: "failed",
        rate: prior,
        error: fetchError ?? `No rate returned for ${pair.base}/${pair.quote}`,
      };
    })
  );
}
