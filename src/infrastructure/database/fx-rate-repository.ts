import type { SupabaseClient } from "@supabase/supabase-js";

import type { FxRate, FxRateQuality, FxRateRepository } from "@/domain/market";
import type { Database } from "@/types/database";

type FxRateRow = Database["public"]["Tables"]["fx_rates"]["Row"];

function toDomain(row: FxRateRow): FxRate {
  return {
    base: row.base_currency,
    quote: row.quote_currency,
    rate: Number(row.rate),
    providerName: row.provider,
    effectiveTimestamp: row.effective_timestamp,
    retrievedTimestamp: row.retrieved_timestamp,
    quality: row.quality as FxRateQuality,
  };
}

/**
 * `FxRateRepository` implementation (ADR 0032). Owner-scoped, matching
 * `SupabaseQuoteRepository` and every other repository in this codebase —
 * same open question about whether FX/market reference data really needs
 * per-owner scoping once a second real user exists (see
 * `domain/market/repository.ts`'s doc comment on `QuoteRepository`).
 */
export class SupabaseFxRateRepository implements FxRateRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getLatest(ownerId: string, base: string, quote: string): Promise<FxRate | null> {
    const { data, error } = await this.client
      .from("fx_rates")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async getLatestForMany(
    ownerId: string,
    pairs: ReadonlyArray<{ base: string; quote: string }>
  ): Promise<FxRate[]> {
    if (pairs.length === 0) return [];
    const bases = [...new Set(pairs.map((pair) => pair.base))];
    const quotes = [...new Set(pairs.map((pair) => pair.quote))];
    const { data, error } = await this.client
      .from("fx_rates")
      .select("*")
      .eq("owner_id", ownerId)
      .in("base_currency", bases)
      .in("quote_currency", quotes);

    if (error) throw error;
    const pairKeys = new Set(pairs.map((pair) => `${pair.base}:${pair.quote}`));
    return (data ?? [])
      .filter((row) => pairKeys.has(`${row.base_currency}:${row.quote_currency}`))
      .map(toDomain);
  }

  async upsert(ownerId: string, rate: FxRate): Promise<void> {
    const { error } = await this.client.from("fx_rates").upsert(
      {
        owner_id: ownerId,
        base_currency: rate.base,
        quote_currency: rate.quote,
        rate: rate.rate,
        provider: rate.providerName,
        effective_timestamp: rate.effectiveTimestamp,
        retrieved_timestamp: rate.retrievedTimestamp,
        quality: rate.quality,
      },
      { onConflict: "owner_id,base_currency,quote_currency" }
    );

    if (error) throw error;
  }
}
