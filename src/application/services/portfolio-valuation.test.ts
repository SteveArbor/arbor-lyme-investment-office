import { describe, expect, it } from "vitest";

import type { FxRate, PriceQuote } from "@/domain/market";

import type { PortfolioPerformanceData } from "./portfolio-performance";
import { buildPortfolioValuation,type CompanyLookup } from "./portfolio-valuation";

const NOW = "2026-07-21T10:00:00.000Z";

function baseData(overrides: Partial<PortfolioPerformanceData> = {}): PortfolioPerformanceData {
  return {
    portfolioId: "p1",
    cash: 1_000,
    holdings: [],
    realisedGainTotal: 0,
    dividendsReceived: 0,
    feesPaid: 0,
    taxesPaid: 0,
    netContributions: 1,
    cashFlows: [],
    ...overrides,
  };
}

function nvdaCompany(): CompanyLookup {
  return { ticker: "NVDA", exchange: "NASDAQ", currency: "USD", securityType: "equity", name: "NVIDIA Corporation" };
}

function fundCompany(): CompanyLookup {
  return { ticker: "BJMD6R8", exchange: "", currency: "GBP", securityType: "fund", name: "Artemis High Income" };
}

function nvdaQuote(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    identifier: { type: "equity", ticker: "NVDA", exchange: "NASDAQ", currency: "USD" },
    price: 203.28,
    currency: "USD",
    sourceTimestamp: "2026-07-21T09:55:00.000Z",
    quality: "previous_close",
    providerName: "twelve_data",
    ...overrides,
  };
}

function usdGbpRate(rate = 0.75): FxRate {
  return {
    base: "USD",
    quote: "GBP",
    rate,
    providerName: "ecb",
    effectiveTimestamp: "2026-07-20T12:00:00.000Z",
    retrievedTimestamp: "2026-07-21T09:00:00.000Z",
    quality: "reference",
  };
}

describe("buildPortfolioValuation", () => {
  it("converts a USD live quote into GBP using the resolved FX rate", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "nvda-1",
          quantity: 64,
          averageCost: 152.89,
          targetAllocationPercent: 0.1,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const companies = new Map([["nvda-1", nvdaCompany()]]);

    const result = buildPortfolioValuation(
      data,
      companies,
      [nvdaQuote()],
      [usdGbpRate(0.75)],
      "GBP",
      NOW
    );

    const holding = result.holdings[0]!;
    expect(holding.isManual).toBe(false);
    expect(holding.fxRateMissing).toBe(false);
    expect(holding.quote?.currency).toBe("USD");
    expect(holding.performance.currentPriceBase).toBeCloseTo(203.28 * 0.75, 6);
    expect(holding.performance.marketValue).toBeCloseTo(64 * 203.28 * 0.75, 6);
    expect(result.quoteCoverage.live).toBe(1);
    expect(result.quoteCoverage.manual).toBe(0);
    expect(result.lastMarketUpdate).toBe("2026-07-21T09:55:00.000Z");
  });

  it("falls back to cost (never an unconverted price) when a live quote exists but no FX rate is available", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "nvda-1",
          quantity: 64,
          averageCost: 152.89,
          targetAllocationPercent: 0.1,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const companies = new Map([["nvda-1", nvdaCompany()]]);

    const result = buildPortfolioValuation(data, companies, [nvdaQuote()], [], "GBP", NOW);

    const holding = result.holdings[0]!;
    expect(holding.fxRateMissing).toBe(true);
    expect(holding.isManual).toBe(true);
    expect(holding.performance.currentPriceBase).toBe(152.89); // falls back to cost, in GBP
    expect(holding.performance.marketValue).toBeCloseTo(64 * 152.89, 6);
  });

  it("classifies a fund holding as manual without a quote lookup, using cost as its shown price", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "fund-1",
          quantity: 8_000,
          averageCost: 1.23,
          targetAllocationPercent: 0.1,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const companies = new Map([["fund-1", fundCompany()]]);

    const result = buildPortfolioValuation(data, companies, [], [], "GBP", NOW);

    const holding = result.holdings[0]!;
    expect(holding.isManual).toBe(true);
    expect(holding.quote).toBeNull();
    expect(holding.performance.currentPriceBase).toBe(1.23);
    expect(result.quoteCoverage.manual).toBe(1);
    expect(result.quoteCoverage.live).toBe(0);
  });

  it("classifies a manually-marked quote (quality: manual) as manual, not live, even though a quote row exists", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "fund-1",
          quantity: 8_000,
          averageCost: 1.23,
          targetAllocationPercent: 0.1,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    // A fund never gets a quote lookup attempted in this composer today, so
    // this test exercises the manual-quality branch directly via an
    // equity whose provider quote happens to carry quality "manual" (e.g.
    // a saved manual mark for an equity Twelve Data can't price).
    const companies = new Map([["fund-1", nvdaCompany()]]);
    const manualQuote = nvdaQuote({ quality: "manual", providerName: "manual", previousClose: undefined });

    const result = buildPortfolioValuation(data, companies, [manualQuote], [usdGbpRate()], "GBP", NOW);

    const holding = result.holdings[0]!;
    expect(holding.isManual).toBe(true);
    expect(holding.quote?.quality).toBe("manual");
    expect(result.quoteCoverage.manual).toBe(1);
    expect(result.quoteCoverage.live).toBe(0);
  });

  it("computes daily change on a live quote and reports quote age", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "nvda-1",
          quantity: 64,
          averageCost: 152.89,
          targetAllocationPercent: 0.1,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const companies = new Map([["nvda-1", nvdaCompany()]]);
    const quote = nvdaQuote({ previousClose: 200, sourceTimestamp: "2026-07-21T09:50:00.000Z" });

    const result = buildPortfolioValuation(data, companies, [quote], [usdGbpRate(0.75)], "GBP", NOW);

    const holding = result.holdings[0]!;
    expect(holding.quote?.dailyChange).toEqual({ amount: 203.28 - 200, percent: (203.28 - 200) / 200 });
    expect(holding.quote?.age.ageSeconds).toBe(600); // 10 minutes before NOW
  });

  it("treats a GBP-listed holding as identity conversion, needing no FX rate at all", () => {
    const data = baseData({
      holdings: [
        {
          companyId: "wpp-1",
          quantity: 1331,
          averageCost: 3.92,
          targetAllocationPercent: 0.05,
          investmentRating: null,
          lastUpdated: "2026-07-20T00:00:00Z",
        },
      ],
    });
    const companies = new Map([
      ["wpp-1", { ticker: "WPP", exchange: "LSE", currency: "GBP", securityType: "equity", name: "WPP plc" } as CompanyLookup],
    ]);
    const wppQuote: PriceQuote = {
      identifier: { type: "equity", ticker: "WPP", exchange: "LSE", currency: "GBP" },
      price: 4.0,
      currency: "GBP",
      sourceTimestamp: "2026-07-21T09:55:00.000Z",
      quality: "previous_close",
      providerName: "twelve_data",
    };

    const result = buildPortfolioValuation(data, companies, [wppQuote], [], "GBP", NOW);

    const holding = result.holdings[0]!;
    expect(holding.isManual).toBe(false);
    expect(holding.fxRateMissing).toBe(false);
    expect(holding.performance.currentPriceBase).toBe(4.0);
  });
});
