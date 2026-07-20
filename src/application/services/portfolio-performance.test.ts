import { describe, expect, it } from "vitest";

import type { DecisionRecommendation } from "@/domain/decision";
import type { Holding, Portfolio } from "@/domain/portfolio";
import type { Transaction } from "@/domain/trading";

import { buildPortfolioPerformanceData } from "./portfolio-performance";

const OWNER = "user-1";
const PORTFOLIO_ID = "portfolio-1";
const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: "holding-1",
    ownerId: OWNER,
    portfolioId: PORTFOLIO_ID,
    companyId: COMPANY_A,
    quantity: 10,
    averageCost: 20,
    targetAllocationPercent: 0.1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn-1",
    ownerId: OWNER,
    portfolioId: PORTFOLIO_ID,
    companyId: null,
    type: "cash_adjustment",
    category: null,
    quantity: null,
    pricePerUnit: null,
    amount: 0,
    realisedGain: null,
    occurredAt: "2024-01-01T00:00:00Z",
    notes: null,
    reference: null,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildPortfolioPerformanceData", () => {
  it("aggregates realised gain, dividends, fees, taxes, and net contributions from the transaction history", async () => {
    const portfolio: Portfolio = {
      id: PORTFOLIO_ID,
      ownerId: OWNER,
      name: "Core",
      cash: 5_000,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const holdings = [makeHolding({ companyId: COMPANY_A })];
    const transactions: Transaction[] = [
      makeTransaction({
        type: "cash_adjustment",
        category: "deposit",
        amount: 10_000,
        occurredAt: "2024-01-01T00:00:00Z",
      }),
      makeTransaction({
        type: "cash_adjustment",
        category: "withdrawal",
        amount: -500,
        occurredAt: "2024-02-01T00:00:00Z",
      }),
      makeTransaction({ type: "sell", realisedGain: 300, amount: 1_000 }),
      makeTransaction({ type: "dividend", amount: 50 }),
      makeTransaction({ type: "fee", amount: -10 }),
      makeTransaction({ type: "tax", amount: -20 }),
    ];
    const rating: DecisionRecommendation = {
      id: "rating-1",
      ownerId: OWNER,
      companyId: COMPANY_A,
      inputs: {
        businessQuality: 0.8,
        economicMoat: 0.8,
        financialStrength: 0.8,
        capitalAllocation: 0.8,
        growth: 0.8,
        riskLevel: 0.2,
        expectedReturn: 0.15,
        marginOfSafety: 0.3,
      },
      qualityScore: 0.8,
      valuationScore: 0.7,
      overallScore: 0.76,
      conviction: 0.8,
      rating: "buy",
      conclusionSource: "deterministic_rules",
      generatedAt: "2024-01-01T00:00:00Z",
    };

    const deps = {
      portfolioService: {
        getPortfolio: async () => portfolio,
        listHoldings: async () => holdings,
      },
      tradingService: {
        listTransactions: async () => transactions,
      },
      decisionService: {
        getLatestRatings: async () => [rating],
      },
    };

    const result = await buildPortfolioPerformanceData(deps, OWNER, PORTFOLIO_ID);

    expect(result.cash).toBe(5_000);
    expect(result.realisedGainTotal).toBe(300);
    expect(result.dividendsReceived).toBe(50);
    expect(result.feesPaid).toBe(10);
    expect(result.taxesPaid).toBe(20);
    expect(result.netContributions).toBe(9_500); // 10000 deposit - 500 withdrawal
    expect(result.cashFlows).toHaveLength(2);
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]!.investmentRating).toBe("buy");
    expect(result.holdings[0]!.companyId).toBe(COMPANY_A);
  });

  it("leaves investmentRating null for a holding with no rating yet", async () => {
    const portfolio: Portfolio = {
      id: PORTFOLIO_ID,
      ownerId: OWNER,
      name: "Core",
      cash: 0,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const deps = {
      portfolioService: {
        getPortfolio: async () => portfolio,
        listHoldings: async () => [makeHolding({ companyId: COMPANY_B })],
      },
      tradingService: { listTransactions: async () => [] },
      decisionService: { getLatestRatings: async () => [] },
    };

    const result = await buildPortfolioPerformanceData(deps, OWNER, PORTFOLIO_ID);
    expect(result.holdings[0]!.investmentRating).toBeNull();
    expect(result.netContributions).toBe(0);
    expect(result.cashFlows).toHaveLength(0);
  });
});
