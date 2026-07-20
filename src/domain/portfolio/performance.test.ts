import { describe, expect, it } from "vitest";

import {
  calculateHoldingPerformance,
  calculatePortfolioPerformance,
  calculateXirr,
} from "./performance";

describe("calculateHoldingPerformance", () => {
  it("computes cost basis, market value, unrealised gain, and allocation", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "c1",
        quantity: 100,
        averageCost: 20,
        currentPrice: 25,
        targetAllocationPercent: 0.1,
      },
      10_000
    );

    expect(result.costBasis).toBe(2_000);
    expect(result.marketValue).toBe(2_500);
    expect(result.unrealisedGain).toBe(500);
    expect(result.unrealisedGainPercent).toBeCloseTo(0.25, 6);
    expect(result.allocationPercent).toBeCloseTo(0.25, 6);
    expect(result.allocationDifferencePercent).toBeCloseTo(0.15, 6); // 25% actual vs 10% target
  });

  it("reports a negative unrealised gain and allocation difference when underwater and underweight", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "c1",
        quantity: 50,
        averageCost: 100,
        currentPrice: 80,
        targetAllocationPercent: 0.2,
      },
      10_000
    );

    expect(result.unrealisedGain).toBe(-1_000);
    expect(result.unrealisedGainPercent).toBeCloseTo(-0.2, 6);
    expect(result.allocationPercent).toBeCloseTo(0.4, 6); // 50 * 80 = 4000 / 10000
    expect(result.allocationDifferencePercent).toBeCloseTo(0.4 - 0.2, 6);
  });

  it("treats zero cost basis and zero portfolio value as zero percentages, not NaN/Infinity", () => {
    const result = calculateHoldingPerformance(
      { companyId: "c1", quantity: 0, averageCost: 0, currentPrice: 10, targetAllocationPercent: 0 },
      0
    );
    expect(result.unrealisedGainPercent).toBe(0);
    expect(result.allocationPercent).toBe(0);
    expect(Number.isFinite(result.unrealisedGainPercent)).toBe(true);
    expect(Number.isFinite(result.allocationPercent)).toBe(true);
  });
});

describe("calculateXirr", () => {
  it("returns exactly 10% for a single investment growing 10% over exactly 365 days", () => {
    // 2021 is not a leap year, so 2021-01-01 -> 2022-01-01 is exactly 365
    // days -- picking a leap-year span here would make the actual/365
    // day-count convention (documented in ADR 0027) legitimately produce
    // a rate a little off from a round 10%, which isn't a bug to assert
    // against.
    const rate = calculateXirr([
      { date: "2021-01-01", amount: -1_000 },
      { date: "2022-01-01", amount: 1_100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 4);
  });

  it("returns exactly 10% for a two-year compounding round trip", () => {
    const rate = calculateXirr([
      { date: "2021-01-01", amount: -1_000 },
      { date: "2023-01-01", amount: 1_210 }, // 730 days later, (1.1)^2 = 1.21
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 3);
  });

  it("handles multiple contributions before the terminal value", () => {
    // A rough sanity check, not a hand-derived exact value: two deposits
    // followed by a payout larger than their sum should produce a
    // positive rate, and the NPV at that rate should be ~0.
    const flows = [
      { date: "2020-01-01", amount: -1_000 },
      { date: "2020-07-01", amount: -500 },
      { date: "2021-01-01", amount: 1_800 },
    ];
    const rate = calculateXirr(flows);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
  });

  it("returns null for fewer than two cash flows", () => {
    expect(calculateXirr([])).toBeNull();
    expect(calculateXirr([{ date: "2020-01-01", amount: -1_000 }])).toBeNull();
  });

  it("returns null when every flow has the same sign — no rate can reconcile them", () => {
    const rate = calculateXirr([
      { date: "2020-01-01", amount: -1_000 },
      { date: "2020-06-01", amount: -500 },
    ]);
    expect(rate).toBeNull();
  });
});

describe("calculatePortfolioPerformance", () => {
  it("aggregates holdings, cash, realised/unrealised gain, income, and costs into one summary", () => {
    const result = calculatePortfolioPerformance({
      cash: 5_000,
      holdings: [
        {
          companyId: "c1",
          quantity: 100,
          averageCost: 20,
          currentPrice: 25,
          targetAllocationPercent: 0.3,
        },
        {
          companyId: "c2",
          quantity: 50,
          averageCost: 40,
          currentPrice: 35,
          targetAllocationPercent: 0.2,
        },
      ],
      realisedGainTotal: 300,
      dividendsReceived: 150,
      feesPaid: 20,
      taxesPaid: 10,
      netContributions: 10_000,
      cashFlows: [
        { date: "2024-01-01", amount: -10_000 },
        { date: "2025-01-01", amount: 12_000 },
      ],
    });

    // c1: cost 2000, market 2500, gain +500. c2: cost 2000, market 1750, gain -250.
    expect(result.costBasis).toBe(4_000);
    expect(result.marketValue).toBe(4_250);
    expect(result.unrealisedGain).toBe(250);
    expect(result.totalValue).toBe(9_250); // 4250 + 5000 cash
    expect(result.realisedGain).toBe(300);
    expect(result.dividendsReceived).toBe(150);
    expect(result.feesPaid).toBe(20);
    expect(result.taxesPaid).toBe(10);
    // totalReturn = 250 (unrealised) + 300 (realised) + 150 (dividends) - 20 (fees) - 10 (tax) = 670
    expect(result.totalReturn).toBe(670);
    expect(result.totalReturnPercent).toBeCloseTo(670 / 10_000, 6);
    expect(result.moneyWeightedReturn).not.toBeNull();
    expect(result.moneyWeightedReturn!).toBeCloseTo(0.2, 2); // 10000 -> 12000 in 1 year = 20%
    expect(result.averageHoldingCost).toBe(2_000); // (2000 + 2000) / 2 holdings
  });

  it("identifies the largest position, largest gain, and largest loss correctly", () => {
    const result = calculatePortfolioPerformance({
      cash: 0,
      holdings: [
        {
          companyId: "big",
          quantity: 1000,
          averageCost: 10,
          currentPrice: 10.5,
          targetAllocationPercent: 0.5,
        },
        {
          companyId: "winner",
          quantity: 10,
          averageCost: 5,
          currentPrice: 100, // gain = 10 * (100-5) = 950, more than "big"'s 1000 * 0.5 = 500
          targetAllocationPercent: 0.1,
        },
        {
          companyId: "loser",
          quantity: 100,
          averageCost: 20,
          currentPrice: 5,
          targetAllocationPercent: 0.1,
        },
      ],
      realisedGainTotal: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      netContributions: 1,
      cashFlows: [],
    });

    expect(result.largestPosition?.companyId).toBe("big"); // 1000 * 10.5 = 10500, largest market value
    expect(result.largestGain?.companyId).toBe("winner"); // 10 * (50-5) = 450
    expect(result.largestLoss?.companyId).toBe("loser"); // 100 * (5-20) = -1500
  });

  it("returns zero percentages and null money-weighted return for an empty/new portfolio", () => {
    const result = calculatePortfolioPerformance({
      cash: 0,
      holdings: [],
      realisedGainTotal: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      netContributions: 0,
      cashFlows: [],
    });

    expect(result.totalValue).toBe(0);
    expect(result.totalReturnPercent).toBe(0);
    expect(result.moneyWeightedReturn).toBeNull();
    expect(result.largestPosition).toBeNull();
    expect(result.averageHoldingCost).toBe(0);
  });
});
