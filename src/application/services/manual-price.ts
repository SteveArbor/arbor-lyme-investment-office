import type { QuoteRepository, SecurityIdentifier } from "@/domain/market";
import { ValidationError } from "@/domain/shared";

export interface ManualPriceInput {
  identifier: SecurityIdentifier;
  price: number;
  /** ISO datetime the user is asserting this price as of — defaults to "now" at the call site, never invented here. */
  effectiveTimestamp: string;
}

export interface ManualPriceDependencies {
  quoteRepository: Pick<QuoteRepository, "upsert">;
}

/**
 * Persists a user-entered price mark (ADR 0032) — for a `fund`, or an
 * exchange-traded security the configured live provider can't price
 * (ASML's Euronext Amsterdam line, WPP's LSE line, both gated behind
 * Twelve Data's paid tier at the time of writing). Reuses
 * `QuoteRepository`/`PriceQuote` rather than a parallel storage
 * mechanism, with `quality: "manual"` and `providerName: "manual"` so the
 * UI can render it with the exact same effective-date/age/staleness
 * treatment a live quote gets — see `PriceQuality`'s doc comment
 * (`domain/market/model.ts`) for why this reuse is deliberate. Never
 * routed through `PriceEngine`: a manual mark is a distinct, legitimate
 * write path straight to the same persistence store, not a vendor-sourced
 * price, so it must never be presented as one.
 */
export async function saveManualPrice(
  deps: ManualPriceDependencies,
  ownerId: string,
  input: ManualPriceInput
): Promise<void> {
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new ValidationError("Invalid manual price", {
      price: ["Price must be a positive number"],
    });
  }

  await deps.quoteRepository.upsert(ownerId, {
    identifier: input.identifier,
    price: input.price,
    currency: input.identifier.currency,
    sourceTimestamp: input.effectiveTimestamp,
    quality: "manual",
    providerName: "manual",
  });
}
