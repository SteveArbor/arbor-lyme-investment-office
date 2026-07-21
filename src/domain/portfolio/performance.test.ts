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
        currency: "GBP",
        fxRateToBase: 1,
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
        currency: "GBP",
        fxRateToBase: 1,
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
      {
        companyId: "c1",
        quantity: 0,
        averageCost: 0,
        currentPrice: 10,
        currency: "GBP",
        fxRateToBase: 1,
        targetAllocationPercent: 0,
      },
      0
    );
    expect(result.unrealisedGainPercent).toBe(0);
    expect(result.allocationPercent).toBe(0);
    expect(Number.isFinite(result.unrealisedGainPercent)).toBe(true);
    expect(Number.isFinite(result.allocationPercent)).toBe(true);
  });
});

describe("calculateHoldingPerformance — currency conversion (ADR 0032)", () => {
  it("converts a USD holding's market value into the base currency using fxRateToBase", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "nvda",
        quantity: 64,
        averageCost: 152.89, // GBP, historical cost basis
        currentPrice: 203.28, // USD
        currency: "USD",
        fxRateToBase: 0.74, // 1 USD = 0.74 GBP
        targetAllocationPercent: 0.1,
      },
      100_000
    );

    expect(result.currentPriceBase).toBeCloseTo(203.28 * 0.74, 6);
    expect(result.marketValue).toBeCloseTo(64 * 203.28 * 0.74, 6);
    expect(result.costBasis).toBe(64 * 152.89);
    // Never the "sum USD and GBP directly" bug: marketValue must not equal quantity * currentPrice unconverted.
    expect(result.marketValue).not.toBeCloseTo(64 * 203.28, 2);
  });

  it("applies identity conversion for a GBP holding regardless of the fxRateToBase value passed", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "wpp",
        quantity: 1331,
        averageCost: 3.92,
        currentPrice: 4.0,
        currency: "GBP",
        fxRateToBase: 1,
        targetAllocationPercent: 0.05,
      },
      100_000
    );

    expect(result.currentPriceBase).toBe(4.0);
    expect(result.marketValue).toBeCloseTo(1331 * 4.0, 6);
  });

  it("computes daily change amount and percent from previousClose, converted to base currency", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "nvda",
        quantity: 64,
        averageCost: 152.89,
        currentPrice: 210,
        currency: "USD",
        fxRateToBase: 0.75,
        previousClose: 200,
        targetAllocationPercent: 0.1,
      },
      100_000
    );

    // (210 - 200) * 64 * 0.75 = 480
    expect(result.dailyChangeAmountBase).toBeCloseTo(480, 6);
    expect(result.dailyChangePercent).toBeCloseTo(10 / 200, 6);
  });

  it("returns null daily change fields when previousClose is absent, never a fabricated zero", () => {
    const result = calculateHoldingPerformance(
      {
        companyId: "fund",
        quantity: 100,
        averageCost: 10,
        currentPrice: 10.5,
        currency: "GBP",
        fxRateToBase: 1,
        targetAllocationPercent: 0.1,
      },
      100_000
    );

    expect(result.dailyChangeAmountBase).toBeNull();
    expect(result.dailyChangePercent).toBeNull();
  });
});

describe("calculatePortfolioPerformance — mixed-currency aggregation (ADR 0032)", () => {
  it("never sums USD, EUR, and GBP amounts directly — every holding is converted to base currency before aggregation", () => {
    const result = calculatePortfolioPerformance({
      cash: 0,
      holdings: [
        {
          companyId: "usd-holding",
          quantity: 10,
          averageCost: 100, // GBP cost basis
          currentPrice: 100, // USD
          currency: "USD",
          fxRateToBase: 0.75, // 1 USD = 0.75 GBP -> market value 750 GBP
          targetAllocationPercent: 0.5,
        },
        {
          companyId: "eur-holding",
          quantity: 10,
          averageCost: 100, // GBP cost basis
          currentPrice: 100, // EUR
          currency: "EUR",
          fxRateToBase: 0.85, // 1 EUR = 0.85 GBP -> market value 850 GBP
          targetAllocationPercent: 0.5,
        },
      ],
      realisedGainTotal: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      netContributions: 1,
      cashFlows: [],
    });

    // Correct: 10*100*0.75 + 10*100*0.85 = 750 + 850 = 1600
    expect(result.marketValue).toBeCloseTo(1_600, 6);
    // Wrong (the bug this ADR fixes): naively summing raw prices would give 10*100 + 10*100 = 2000
    expect(result.marketValue).not.toBeCloseTo(2_000, 2);
    expect(result.costBasis).toBe(2_000); // GBP cost basis, unconverted
  });

  it("aggregates daily gain across mixed-currency holdings and identifies the largest daily gainer/loser", () => {
    const result = calculatePortfolioPerformance({
      cash: 0,
      holdings: [
        {
          companyId: "usd-gainer",
          quantity: 10,
          averageCost: 100,
          currentPrice: 110,
          currency: "USD",
          fxRateToBase: 0.75,
          previousClose: 100,
          targetAllocationPercent: 0.5,
        },
        {
          companyId: "eur-loser",
          quantity: 10,
          averageCost: 100,
          currentPrice: 90,
          currency: "EUR",
          fxRateToBase: 0.85,
          previousClose: 100,
          targetAllocationPercent: 0.5,
        },
        {
          companyId: "manual-fund",
          quantity: 10,
          averageCost: 100,
          currentPrice: 100,
          currency: "GBP",
          fxRateToBase: 1,
          // no previousClose -- manually priced, must be excluded from daily gain, not treated as flat
          targetAllocationPercent: 0,
        },
      ],
      realisedGainTotal: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      netContributions: 1,
      cashFlows: [],
    });

    // usd-gainer: (110-100)*10*0.75 = 75. eur-loser: (90-100)*10*0.85 = -85. Sum = -10.
    expect(result.dailyGain).toBeCloseTo(-10, 6);
    expect(result.largestDailyGainer?.companyId).toBe("usd-gainer");
    expect(result.largestDailyLoser?.companyId).toBe("eur-loser");
  });

  it("returns null dailyGain/dailyGainPercent when no holding has daily-change data", () => {
    const result = calculatePortfolioPerformance({
      cash: 0,
      holdings: [
        {
          companyId: "fund",
          quantity: 10,
          averageCost: 100,
          currentPrice: 100,
          currency: "GBP",
          fxRateToBase: 1,
          targetAllocationPercent: 1,
        },
      ],
      realisedGainTotal: 0,
      dividendsReceived: 0,
      feesPaid: 0,
      taxesPaid: 0,
      netContributions: 1,
      cashFlows: [],
    });

    expect(result.dailyGain).toBeNull();
    expect(result.dailyGainPercent).toBeNull();
    expect(result.largestDailyGainer).toBeNull();
    expect(result.largestDailyLoser).toBeNull();
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
          currency: "GBP",
          fxRateToBase: 1,
          targetAllocationPercent: 0.3,
        },
        {
          companyId: "c2",
          quantity: 50,
          averageCost: 40,
          currentPrice: 35,
          currency: "GBP",
          fxRateToBase: 1,
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
          currency: "GBP",
          fxRateToBase: 1,
          targetAllocationPercent: 0.5,
        },
        {
          companyId: "winner",
          quantity: 10,
          averageCost: 5,
          currentPrice: 100, // gain = 10 * (100-5) = 950, more than "big"'s 1000 * 0.5 = 500
          currency: "GBP",
          fxRateToBase: 1,
          targetAllocationPercent: 0.1,
        },
        {
          companyId: "loser",
          quantity: 100,
          averageCost: 20,
          currentPrice: 5,
          currency: "GBP",
          fxRateToBase: 1,
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
