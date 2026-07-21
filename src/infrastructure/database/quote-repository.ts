import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildIdentifierKey,
  type PriceQuality,
  type PriceQuote,
  type QuoteRepository,
  type SecurityIdentifier,
  type SecurityType,
} from "@/domain/market";
import type { Database } from "@/types/database";

type MarketQuoteRow = Database["public"]["Tables"]["market_quotes"]["Row"];

function toDomain(row: MarketQuoteRow): PriceQuote {
  const identifier: SecurityIdentifier = {
    type: row.security_type as SecurityType,
    ticker: row.ticker ?? undefined,
    exchange: row.exchange ?? undefined,
    sedol: row.sedol ?? undefined,
    isin: row.isin ?? undefined,
    currency: row.currency,
  };
  return {
    identifier,
    price: Number(row.price),
    currency: row.currency,
    sourceTimestamp: row.source_timestamp,
    quality: row.quality as PriceQuality,
    providerName: row.provider,
    previousClose: row.previous_close !== null ? Number(row.previous_close) : undefined,
  };
}

/**
 * `QuoteRepository` implementation (ADR 0030/0031). Owner-scoped, matching
 * every other repository in this codebase — see `domain/market/repository.ts`'s
 * doc comment for why that's an open question rather than a settled
 * design choice for market data specifically.
 */
export class SupabaseQuoteRepository implements QuoteRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getLatest(ownerId: string, identifier: SecurityIdentifier): Promise<PriceQuote | null> {
    const { data, error } = await this.client
      .from("market_quotes")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("identifier_key", buildIdentifierKey(identifier))
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async getLatestForMany(
    ownerId: string,
    identifiers: SecurityIdentifier[]
  ): Promise<PriceQuote[]> {
    if (identifiers.length === 0) return [];
    const keys = identifiers.map(buildIdentifierKey);
    const { data, error } = await this.client
      .from("market_quotes")
      .select("*")
      .eq("owner_id", ownerId)
      .in("identifier_key", keys);

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async upsert(ownerId: string, quote: PriceQuote): Promise<void> {
    const { error } = await this.client.from("market_quotes").upsert(
      {
        owner_id: ownerId,
        security_type: quote.identifier.type,
        ticker: quote.identifier.ticker ?? null,
        exchange: quote.identifier.exchange ?? null,
        sedol: quote.identifier.sedol ?? null,
        isin: quote.identifier.isin ?? null,
        identifier_key: buildIdentifierKey(quote.identifier),
        price: quote.price,
        currency: quote.currency,
        quality: quote.quality,
        source_timestamp: quote.sourceTimestamp,
        previous_close: quote.previousClose ?? null,
        provider: quote.providerName,
      },
      { onConflict: "owner_id,identifier_key" }
    );

    if (error) throw error;
  }
}
