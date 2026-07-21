"use server";

import { revalidatePath } from "next/cache";

import {
  composeAppServices,
  type FxRefreshResult,
  type ManualPriceInput,
  type PriceRefreshResult,
  type RefreshableSecurity,
  refreshFxRates,
  refreshPrices,
  saveManualPrice,
} from "@/application/services";
import type { SecurityIdentifier } from "@/domain/market";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { logger } from "@/lib/logger";

export interface RefreshMarketDataActionResult {
  error: string | null;
  quotes: PriceRefreshResult[];
  fxRates: FxRefreshResult[];
}

/**
 * The Refresh Prices workflow (ADR 0030/0031/0032): refreshes every
 * exchange-traded holding's quote, then every FX pair those holdings'
 * currencies actually need against the portfolio's base currency, in one
 * click. Funds are classified `unsupported` by `refreshPrices` itself
 * (Stage 2 scope) — never attempted, never erroring. A failure refreshing
 * one security or one FX pair never blocks the others (`refreshPrices`/
 * `refreshFxRates`'s own per-item resilience); `revalidatePath` lets the
 * next page load recompute from whatever combination of fresh and
 * previously-stored values resulted.
 */
export async function refreshMarketDataAction(
  portfolioId: string,
  securities: RefreshableSecurity[],
  baseCurrency: string
): Promise<RefreshMarketDataActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in.", quotes: [], fxRates: [] };
  }

  const { priceEngine, quoteRepository, fxRateProvider, fxRateRepository } =
    composeAppServices(supabase);

  let quotes: PriceRefreshResult[];
  let fxRates: FxRefreshResult[];
  try {
    quotes = await refreshPrices({ priceEngine, quoteRepository }, user.id, securities);

    const currencies = new Set(securities.map((security) => security.currency));
    const pairs = [...currencies]
      .filter((currency) => currency !== baseCurrency)
      .map((currency) => ({ base: currency, quote: baseCurrency }));
    fxRates = await refreshFxRates({ fxRateProvider, fxRateRepository }, user.id, pairs);
  } catch (error) {
    logger.error("Market data refresh Server Action failed unexpectedly", {
      action: "refreshMarketDataAction",
      portfolioId,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error: "Something went wrong refreshing market data. Please try again.",
      quotes: [],
      fxRates: [],
    };
  }

  revalidatePath(`/portfolio/${portfolioId}`);
  revalidatePath("/dashboard");

  const anyFailed =
    quotes.some((result) => result.outcome === "failed") ||
    fxRates.some((result) => result.outcome === "failed");
  return {
    error: anyFailed ? "Some prices or FX rates could not be refreshed — see details below." : null,
    quotes,
    fxRates,
  };
}

export interface SaveManualPriceActionResult {
  error: string | null;
}

/**
 * Persists a manual price mark for a holding this platform can't (or
 * can't yet) price live — a `fund`, or an exchange-traded security gated
 * behind Twelve Data's paid tier (ASML's Euronext Amsterdam line, WPP's
 * LSE line). See `application/services/manual-price.ts` for why this
 * writes through `QuoteRepository` directly rather than `PriceEngine`.
 */
export async function saveManualPriceAction(
  portfolioId: string,
  identifier: SecurityIdentifier,
  price: number
): Promise<SaveManualPriceActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { quoteRepository } = composeAppServices(supabase);
  const input: ManualPriceInput = {
    identifier,
    price,
    effectiveTimestamp: new Date().toISOString(),
  };

  try {
    await saveManualPrice({ quoteRepository }, user.id, input);
  } catch (error) {
    if (error instanceof Error && error.name === "ValidationError") {
      return { error: error.message };
    }
    logger.error("Manual price save Server Action failed unexpectedly", {
      action: "saveManualPriceAction",
      portfolioId,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Something went wrong saving this price. Please try again." };
  }

  revalidatePath(`/portfolio/${portfolioId}`);
  revalidatePath("/dashboard");
  return { error: null };
}
