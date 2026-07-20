import { describe, expect, it } from "vitest";

import {
  calculateRealisedGain,
  calculateWeightedAverageCost,
  computeTransactionsWithRunningBalance,
  type Transaction,
} from "./model";

describe("calculateWeightedAverageCost", () => {
  it("returns the buy price when there is no existing position", () => {
    expect(calculateWeightedAverageCost(0, 0, 10, 25)).toBe(25);
  });

  it("blends existing and new shares by quantity", () => {
    // 10 shares @ 20 + 10 shares @ 30 -> 20 shares @ 25
    expect(calculateWeightedAverageCost(10, 20, 10, 30)).toBeCloseTo(25, 5);
  });

  it("weights toward the larger quantity's price", () => {
    // 90 shares @ 10 + 10 shares @ 100 -> 100 shares @ 19
    expect(calculateWeightedAverageCost(90, 10, 10, 100)).toBeCloseTo(19, 5);
  });
});

describe("calculateRealisedGain", () => {
  it("is positive when sold above average cost", () => {
    expect(calculateRealisedGain(10, 30, 20)).toBe(100);
  });

  it("is negative when sold below average cost", () => {
    expect(calculateRealisedGain(10, 15, 20)).toBe(-50);
  });

  it("is zero when sold at average cost", () => {
    expect(calculateRealisedGain(10, 20, 20)).toBe(0);
  });
});

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn",
    ownerId: "user-1",
    portfolioId: "portfolio-1",
    companyId: null,
    type: "cash_adjustment",
    category: "deposit",
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

describe("computeTransactionsWithRunningBalance", () => {
  it("derives the balance after each transaction by working backward from current cash", () => {
    // Newest first, matching listByPortfolioId's natural order.
    const transactions = [
      makeTransaction({ id: "t3", amount: -50, occurredAt: "2024-03-01T00:00:00Z" }),
      makeTransaction({ id: "t2", amount: 200, occurredAt: "2024-02-01T00:00:00Z" }),
      makeTransaction({ id: "t1", amount: 1_000, occurredAt: "2024-01-01T00:00:00Z" }),
    ];
    const currentCash = 1_150; // 1000 + 200 - 50

    const result = computeTransactionsWithRunningBalance(currentCash, transactions);

    expect(result[0]!.transaction.id).toBe("t3");
    expect(result[0]!.balanceAfter).toBe(1_150);
    expect(result[1]!.transaction.id).toBe("t2");
    expect(result[1]!.balanceAfter).toBe(1_200); // before t3's -50
    expect(result[2]!.transaction.id).toBe("t1");
    expect(result[2]!.balanceAfter).toBe(1_000); // before t2's +200
  });

  it("returns an empty array for no transactions", () => {
    expect(computeTransactionsWithRunningBalance(500, [])).toEqual([]);
  });
});
