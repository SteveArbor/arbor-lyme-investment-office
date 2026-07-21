import type {
  PriceEngine,
  PriceQuote,
  QuoteRepository,
  SecurityIdentifier,
  SecurityType,
} from "@/domain/market";

/** The subset of a held company's fields a price refresh actually needs. */
export interface RefreshableSecurity {
  companyId: string;
  ticker: string;
  exchange: string;
  currency: string;
  securityType: SecurityType;
}

/**
 * `updated` — a fresh quote was fetched and differs from what was stored.
 * `unchanged` — a fresh quote was fetched but is identical to what was
 * already stored (common while a market is closed: the same
 * `previous_close` repeats every call until the next session).
 * `unsupported` — this security's type has no configured live provider at
 * all (`fund`, Stage 2 scope) — no fetch is even attempted, so this is
 * known in advance, not a failure.
 * `failed` — a fetch was attempted against a configured provider and
 * errored (rate limit, auth, an unrecognised symbol, a plan-tier
 * restriction). The previously stored quote, if any, is preserved and
 * returned unchanged (requirement: never erase a valid prior value on a
 * failed refresh) — the UI's "Manual Price Holdings" section is exactly
 * where a security that fails every refresh (e.g. an exchange gated
 * behind a paid vendor tier) ends up being presented, without this
 * platform ever pretending the failed fetch didn't happen.
 */
export const PRICE_REFRESH_OUTCOME_OPTIONS = [
  "updated",
  "unchanged",
  "unsupported",
  "failed",
] as const;
export type PriceRefreshOutcome = (typeof PRICE_REFRESH_OUTCOME_OPTIONS)[number];

export interface PriceRefreshResult {
  companyId: string;
  outcome: PriceRefreshOutcome;
  /** The quote now in effect for this holding — freshly fetched for `updated`/`unchanged`, the pre-existing stored quote (or `null` if none exists yet) for `unsupported`/`failed`. Never erased by a failed refresh. */
  quote: PriceQuote | null;
  error: string | null;
}

export interface PriceRefreshDependencies {
  priceEngine: Pick<PriceEngine, "getPrice">;
  quoteRepository: Pick<QuoteRepository, "getLatest" | "upsert">;
}

function toIdentifier(security: RefreshableSecurity): SecurityIdentifier {
  return {
    type: security.securityType,
    ticker: security.ticker,
    exchange: security.exchange,
    currency: security.currency,
  };
}

/**
 * The manual refresh action's quote half (ADR 0030/0031/0032) — the same
 * operation a future scheduled job will call too (deferred), per ADR
 * 0030's "both triggers do the same thing" design. `fund` securities are
 * classified `unsupported` without a fetch attempt: Stage 2 hasn't wired
 * a fund provider yet, and attempting one would produce a confusing
 * per-fund error every refresh rather than the fund UI's existing
 * manual-marking workflow continuing to work untouched. Every other
 * security is refreshed independently (`Promise.all`, per-security
 * try/catch) so one failure — a rate limit, an unrecognised symbol, a
 * plan-tier restriction — never blocks the rest of a portfolio's refresh.
 */
export async function refreshPrices(
  deps: PriceRefreshDependencies,
  ownerId: string,
  securities: RefreshableSecurity[]
): Promise<PriceRefreshResult[]> {
  return Promise.all(
    securities.map(async (security): Promise<PriceRefreshResult> => {
      const identifier = toIdentifier(security);

      if (security.securityType === "fund") {
        const existing = await deps.quoteRepository.getLatest(ownerId, identifier);
        return { companyId: security.companyId, outcome: "unsupported", quote: existing, error: null };
      }

      const previous = await deps.quoteRepository.getLatest(ownerId, identifier);
      try {
        const quote = await deps.priceEngine.getPrice(identifier);
        await deps.quoteRepository.upsert(ownerId, quote);
        const unchanged =
          previous !== null &&
          previous.price === quote.price &&
          previous.sourceTimestamp === quote.sourceTimestamp;
        return {
          companyId: security.companyId,
          outcome: unchanged ? "unchanged" : "updated",
          quote,
          error: null,
        };
      } catch (error) {
        return {
          companyId: security.companyId,
          outcome: "failed",
          quote: previous,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}
