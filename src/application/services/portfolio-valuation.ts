import type { InvestmentRating } from "@/domain/decision";
import {
  buildFxPairKey,
  buildIdentifierKey,
  calculateDailyChange,
  calculateQuoteAge,
  type DailyChange,
  type FxRate,
  type PriceQuality,
  type PriceQuote,
  type QuoteAge,
  type SecurityIdentifier,
  type SecurityType,
} from "@/domain/market";
import {
  calculatePortfolioPerformance,
  type HoldingPerformance,
  type HoldingPerformanceInput,
  type PortfolioPerformance,
} from "@/domain/portfolio";

import type { PortfolioPerformanceData } from "./portfolio-performance";

export interface HoldingQuoteInfo {
  price: number;
  currency: string;
  quality: PriceQuality;
  providerName: string;
  sourceTimestamp: string;
  age: QuoteAge;
  previousClose?: number;
  dailyChange: DailyChange | null;
}

export interface HoldingValuation {
  companyId: string;
  companyName: string;
  ticker: string;
  exchange: string | null;
  securityType: SecurityType;
  currency: string;
  targetAllocationPercent: number;
  investmentRating: InvestmentRating | null;
  lastUpdated: string;
  /** The persisted quote behind this holding's price, if any (live or manual) — `null` only when nothing has ever been fetched or marked for it. */
  quote: HoldingQuoteInfo | null;
  /**
   * True whenever this holding's displayed price is not a genuine
   * unconverted live quote in effect right now: a `fund` (Stage 2 scope),
   * a security with no quote at all yet, a `manual` mark, or an
   * exchange-traded holding whose quote came back fine but no FX rate was
   * available to convert it (a rare, disclosed degradation — see
   * `fxRateMissing`). The UI's "Manual Price Holdings" section is exactly
   * this flag.
   */
  isManual: boolean;
  /** Set only when a live quote exists but this holding's currency had no available FX rate this render — the holding is shown at cost (never at an unconverted or guessed price) until FX data is available. */
  fxRateMissing: boolean;
  performance: HoldingPerformance;
}

export interface PortfolioValuation {
  portfolioId: string;
  baseCurrency: string;
  performance: PortfolioPerformance;
  holdings: HoldingValuation[];
  /** Every FX rate actually resolved for this portfolio's holdings, for display (rate age, staleness, provider). */
  fxRates: FxRate[];
  quoteCoverage: {
    total: number;
    live: number;
    manual: number;
    stale: number;
  };
  /** The most recent `sourceTimestamp` among every live (non-manual) quote — `null` when no holding has a live quote at all. */
  lastMarketUpdate: string | null;
  /**
   * Pass-through of `PortfolioPerformanceData`'s own inputs that
   * `PortfolioPerformance`'s output shape doesn't retain — needed only so
   * a client component can re-run `calculatePortfolioPerformance` itself
   * (e.g. after a manual price edit) without this composer needing to
   * expose its internal `HoldingPerformanceInput` construction.
   */
  netContributions: number;
  cashFlows: PortfolioPerformanceData["cashFlows"];
}

export interface CompanyLookup {
  ticker: string;
  exchange: string;
  currency: string;
  securityType: SecurityType;
  name: string;
}

const DEFAULT_STALE_AFTER_SECONDS = 20 * 60;

/**
 * Joins ledger data (`PortfolioPerformanceData`), persisted quotes, and
 * persisted FX rates into one converted, render-ready view (ADR 0032) —
 * the single place this platform turns "a price in its own trading
 * currency" into "a value in the portfolio's base currency," used by both
 * the Portfolio Performance panel and the Dashboard so the two can never
 * disagree about how a holding was converted.
 *
 * Pure and synchronous: every dependency (companies, quotes, fx rates) is
 * already-fetched data the caller assembled — this function only joins
 * and converts, exactly like `buildPortfolioPerformanceData` deliberately
 * fetches ledger data but never a price (`application/services/portfolio-performance.ts`'s
 * own doc comment).
 */
export function buildPortfolioValuation(
  data: PortfolioPerformanceData,
  companies: Map<string, CompanyLookup>,
  quotes: PriceQuote[],
  fxRates: FxRate[],
  baseCurrency: string,
  now: string,
  staleAfterSeconds: number = DEFAULT_STALE_AFTER_SECONDS
): PortfolioValuation {
  const quotesByKey = new Map<string, PriceQuote>();
  for (const quote of quotes) {
    quotesByKey.set(buildIdentifierKey(quote.identifier), quote);
  }
  const fxRatesByPair = new Map<string, FxRate>();
  for (const rate of fxRates) {
    fxRatesByPair.set(buildFxPairKey(rate.base, rate.quote), rate);
  }

  const holdingInputs: HoldingPerformanceInput[] = [];
  const holdingMeta: Array<{
    company: CompanyLookup;
    quote: PriceQuote | null;
    isManual: boolean;
    fxRateMissing: boolean;
  }> = [];

  for (const holding of data.holdings) {
    const company = companies.get(holding.companyId);
    if (!company) continue;

    let quote: PriceQuote | null = null;
    if (company.securityType !== "fund") {
      const identifier: SecurityIdentifier = {
        type: company.securityType,
        ticker: company.ticker,
        exchange: company.exchange,
        currency: company.currency,
      };
      quote = quotesByKey.get(buildIdentifierKey(identifier)) ?? null;
    }

    let currentPrice = holding.averageCost;
    let currency = baseCurrency;
    let fxRateToBase = 1;
    let previousClose: number | undefined;
    let fxRateMissing = false;
    const isManual = company.securityType === "fund" || quote === null || quote.quality === "manual";

    if (quote) {
      if (quote.currency === baseCurrency) {
        currentPrice = quote.price;
        currency = quote.currency;
        fxRateToBase = 1;
        previousClose = quote.previousClose;
      } else {
        const rate = fxRatesByPair.get(buildFxPairKey(quote.currency, baseCurrency));
        if (rate) {
          currentPrice = quote.price;
          currency = quote.currency;
          fxRateToBase = rate.rate;
          previousClose = quote.previousClose;
        } else {
          // A live quote exists but no FX rate is available to convert it
          // safely — degrade to showing the holding at cost (never an
          // unconverted or guessed price) rather than violate "never sum
          // different currencies directly."
          fxRateMissing = true;
        }
      }
    }

    holdingInputs.push({
      companyId: holding.companyId,
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      currentPrice,
      currency,
      fxRateToBase,
      previousClose,
      targetAllocationPercent: holding.targetAllocationPercent,
    });
    holdingMeta.push({ company, quote, isManual: isManual || fxRateMissing, fxRateMissing });
  }

  const performance = calculatePortfolioPerformance({
    cash: data.cash,
    holdings: holdingInputs,
    realisedGainTotal: data.realisedGainTotal,
    dividendsReceived: data.dividendsReceived,
    feesPaid: data.feesPaid,
    taxesPaid: data.taxesPaid,
    netContributions: data.netContributions,
    cashFlows: data.cashFlows,
  });

  const performanceByCompanyId = new Map(performance.holdings.map((h) => [h.companyId, h]));
  const holdingSourceById = new Map(data.holdings.map((h) => [h.companyId, h]));

  const holdings: HoldingValuation[] = holdingMeta.map((meta, index) => {
    const holdingPerf = performanceByCompanyId.get(data.holdings[index]!.companyId)!;
    const source = holdingSourceById.get(data.holdings[index]!.companyId)!;
    const quoteInfo: HoldingQuoteInfo | null = meta.quote
      ? {
          price: meta.quote.price,
          currency: meta.quote.currency,
          quality: meta.quote.quality,
          providerName: meta.quote.providerName,
          sourceTimestamp: meta.quote.sourceTimestamp,
          age: calculateQuoteAge(meta.quote, now, staleAfterSeconds),
          previousClose: meta.quote.previousClose,
          dailyChange: calculateDailyChange(meta.quote),
        }
      : null;

    return {
      companyId: source.companyId,
      companyName: meta.company.name,
      ticker: meta.company.ticker,
      exchange: meta.company.securityType === "fund" ? null : meta.company.exchange,
      securityType: meta.company.securityType,
      currency: meta.company.currency,
      targetAllocationPercent: source.targetAllocationPercent,
      investmentRating: source.investmentRating,
      lastUpdated: source.lastUpdated,
      quote: quoteInfo,
      isManual: meta.isManual,
      fxRateMissing: meta.fxRateMissing,
      performance: holdingPerf,
    };
  });

  const liveQuotes = holdings.filter((h) => h.quote !== null && !h.isManual);
  const staleQuotes = liveQuotes.filter((h) => h.quote!.age.isStale);
  const manualQuotes = holdings.filter((h) => h.isManual);
  const lastMarketUpdate =
    liveQuotes.length > 0
      ? liveQuotes.reduce(
          (latest, h) => (h.quote!.sourceTimestamp > latest ? h.quote!.sourceTimestamp : latest),
          liveQuotes[0]!.quote!.sourceTimestamp
        )
      : null;

  return {
    portfolioId: data.portfolioId,
    baseCurrency,
    performance,
    holdings,
    fxRates: [...fxRatesByPair.values()],
    quoteCoverage: {
      total: holdings.length,
      live: liveQuotes.length,
      manual: manualQuotes.length,
      stale: staleQuotes.length,
    },
    lastMarketUpdate,
    netContributions: data.netContributions,
    cashFlows: data.cashFlows,
  };
}
