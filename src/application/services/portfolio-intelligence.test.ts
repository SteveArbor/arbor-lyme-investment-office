import { describe, expect, it } from "vitest";

import type { Company } from "@/domain/company";

import type { CompanyMonitoringSummary } from "./monitoring";
import { buildPortfolioIntelligence } from "./portfolio-intelligence";
import type { HoldingValuation, PortfolioValuation } from "./portfolio-valuation";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "nvda",
    ownerId: "owner-1",
    name: "NVIDIA Corporation",
    ticker: "NVDA",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Semiconductors",
    currency: "USD",
    status: "holding",
    watchlist: false,
    notes: null,
    profile: null,
    securityType: "equity",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHolding(overrides: Partial<HoldingValuation> = {}): HoldingValuation {
  return {
    companyId: "nvda",
    companyName: "NVIDIA Corporation",
    ticker: "NVDA",
    exchange: "NASDAQ",
    securityType: "equity",
    currency: "USD",
    targetAllocationPercent: 0.1,
    investmentRating: null,
    lastUpdated: "2026-07-20T00:00:00Z",
    quote: null,
    isManual: true,
    fxRateMissing: false,
    performance: {
      companyId: "nvda",
      quantity: 10,
      averageCost: 100,
      currentPrice: 100,
      currency: "USD",
      fxRateToBase: 0.75,
      currentPriceBase: 75,
      costBasis: 1_000,
      marketValue: 750,
      unrealisedGain: -250,
      unrealisedGainPercent: -0.25,
      allocationPercent: 0.075,
      targetAllocationPercent: 0.1,
      allocationDifferencePercent: -0.025,
      dailyChangeAmountBase: null,
      dailyChangePercent: null,
    },
    ...overrides,
  };
}

function makeValuation(holdings: HoldingValuation[], overrides: Partial<PortfolioValuation> = {}): PortfolioValuation {
  const marketValue = holdings.reduce((sum, h) => sum + h.performance.marketValue, 0);
  const cash = overrides.performance?.cash ?? 1_000;
  return {
    portfolioId: "p1",
    baseCurrency: "GBP",
    performance: {
      marketValue,
      costBasis: holdings.reduce((sum, h) => sum + h.performance.costBasis, 0),
      cash,
      totalValue: marketValue + cash,
      unrealisedGain: holdings.reduce((sum, h) => sum + h.performance.unrealisedGain, 0),
      unrealisedGainPercent: 0,
      realisedGain: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      totalReturn: 0,
      totalReturnPercent: 0,
      moneyWeightedReturn: null,
      averageHoldingCost: 0,
      largestPosition: null,
      largestGain: null,
      largestLoss: null,
      dailyGain: null,
      dailyGainPercent: null,
      largestDailyGainer: null,
      largestDailyLoser: null,
      holdings: holdings.map((h) => h.performance),
    },
    holdings,
    fxRates: [],
    quoteCoverage: { total: holdings.length, live: 0, manual: holdings.length, stale: 0 },
    lastMarketUpdate: null,
    netContributions: 1,
    cashFlows: [],
    ...overrides,
  };
}

describe("buildPortfolioIntelligence", () => {
  it("computes a health score, risk breakdowns, and allocation rows for a simple portfolio", () => {
    const holding = makeHolding();
    const valuation = makeValuation([holding]);
    const companies = [makeCompany()];
    const snapshots = new Map<string, CompanyMonitoringSummary>();

    const result = buildPortfolioIntelligence([valuation], companies, snapshots);

    expect(result.health.score).toBeGreaterThanOrEqual(0);
    expect(result.health.score).toBeLessThanOrEqual(10);
    expect(result.sectorAllocation.find((s) => s.key === "Technology")).toBeDefined();
    expect(result.countryAllocation.find((c) => c.key === "United States")).toBeDefined();
    expect(result.allocationRows).toHaveLength(1);
    // Recomputed against total portfolio value (marketValue 750 + cash 1000 = 1750):
    // 750/1750 ≈ 42.9% actual vs. 10% target — heavily overweight, not the fixture's
    // own per-portfolio allocationPercent (0.075), confirming the composer recomputes
    // rather than reusing a stale per-portfolio percentage.
    expect(result.allocationRows[0]!.currentPercent).toBeCloseTo(750 / 1750, 6);
    expect(result.allocationRows[0]!.action).toBe("reduce");
  });

  it("marks a holding watch when its thesis has broken, overriding drift-based logic", () => {
    const holding = makeHolding({
      performance: { ...makeHolding().performance, allocationDifferencePercent: 0 },
    });
    const valuation = makeValuation([holding]);
    const companies = [makeCompany()];
    const snapshots = new Map<string, CompanyMonitoringSummary>([
      [
        "nvda",
        {
          companyId: "nvda",
          thesisStatus: "broken",
          marginOfSafety: null,
          blendedFairValue: null,
          latestRating: null,
          expectedReturn: null,
          risks: null,
          monitoringMetrics: null,
          openJournalEntry: null,
        },
      ],
    ]);

    const result = buildPortfolioIntelligence([valuation], companies, snapshots);
    expect(result.allocationRows[0]!.action).toBe("watch");
  });

  it("counts a holding with neither a rating nor a thesis as missing research", () => {
    const holding = makeHolding({ investmentRating: null });
    const valuation = makeValuation([holding]);
    const companies = [makeCompany()];
    const snapshots = new Map<string, CompanyMonitoringSummary>();

    const result = buildPortfolioIntelligence([valuation], companies, snapshots);
    const missingResearchFactor = result.health.factors.find((f) => f.key === "missingResearch");
    expect(missingResearchFactor?.score).toBe(0); // 100% missing -> worst possible score for this factor
  });

  it("combines multiple portfolios' holdings into one set of totals", () => {
    const holdingA = makeHolding({ companyId: "nvda" });
    const holdingB = makeHolding({ companyId: "wpp", companyName: "WPP plc", ticker: "WPP", currency: "GBP" });
    const valuationA = makeValuation([holdingA]);
    const valuationB = makeValuation([holdingB], { portfolioId: "p2" });
    const companies = [makeCompany(), makeCompany({ id: "wpp", name: "WPP plc", ticker: "WPP", exchange: "LSE", currency: "GBP", sector: "Communication Services" })];

    const result = buildPortfolioIntelligence([valuationA, valuationB], companies, new Map());

    expect(result.totalValue).toBeCloseTo(valuationA.performance.totalValue + valuationB.performance.totalValue, 2);
    expect(result.allocationRows).toHaveLength(2);
  });
});
