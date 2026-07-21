import { describe, expect, it } from "vitest";

import { identifyOpportunities, type OpportunityHoldingInput } from "./opportunities";

function holding(overrides: Partial<OpportunityHoldingInput> = {}): OpportunityHoldingInput {
  return {
    companyId: "c1",
    companyName: "Test Co",
    ticker: "TST",
    investmentRating: null,
    allocationPercent: 0.05,
    targetAllocationPercent: 0.05,
    allocationDifferencePercent: 0,
    dailyChangePercent: null,
    ...overrides,
  };
}

describe("identifyOpportunities", () => {
  it("identifies the highest-conviction underweight holding by rating", () => {
    const holdings = [
      holding({
        companyId: "buy",
        companyName: "Buy Co",
        investmentRating: "buy",
        allocationDifferencePercent: -0.02,
      }),
      holding({
        companyId: "strong",
        companyName: "Strong Co",
        investmentRating: "strong_buy",
        allocationDifferencePercent: -0.01,
      }),
    ];
    const result = identifyOpportunities(holdings, 0, 100_000);
    const highestConviction = result.find((o) => o.type === "highest_conviction");
    expect(highestConviction?.companyId).toBe("strong");
  });

  it("never proposes a highest-conviction pick from an overweight holding", () => {
    const holdings = [
      holding({ investmentRating: "exceptional", allocationDifferencePercent: 0.05 }),
    ];
    const result = identifyOpportunities(holdings, 0, 100_000);
    expect(result.find((o) => o.type === "highest_conviction")).toBeUndefined();
  });

  it("identifies the largest absolute underweight", () => {
    const holdings = [
      holding({ companyId: "small-gap", allocationDifferencePercent: -0.01 }),
      holding({ companyId: "big-gap", allocationDifferencePercent: -0.08 }),
    ];
    const result = identifyOpportunities(holdings, 0, 100_000);
    expect(result.find((o) => o.type === "largest_underweight")?.companyId).toBe("big-gap");
  });

  it("identifies the largest relative discount to target, distinct from absolute gap", () => {
    const holdings = [
      // Absolute gap 2pp but relatively small vs a large target (small relative discount)
      holding({
        companyId: "small-relative",
        allocationPercent: 0.18,
        targetAllocationPercent: 0.2,
        allocationDifferencePercent: -0.02,
      }),
      // Absolute gap 1pp but relatively huge vs a tiny target (large relative discount)
      holding({
        companyId: "large-relative",
        allocationPercent: 0.01,
        targetAllocationPercent: 0.05,
        allocationDifferencePercent: -0.04,
      }),
    ];
    const result = identifyOpportunities(holdings, 0, 100_000);
    expect(result.find((o) => o.type === "largest_relative_discount")?.companyId).toBe(
      "large-relative"
    );
  });

  it("identifies the most attractive recent performer by daily change percent", () => {
    const holdings = [
      holding({ companyId: "flat", dailyChangePercent: 0.001 }),
      holding({ companyId: "up-big", dailyChangePercent: 0.08 }),
    ];
    const result = identifyOpportunities(holdings, 0, 100_000);
    expect(result.find((o) => o.type === "recent_performer")?.companyId).toBe("up-big");
  });

  it("flags cash for deployment only when above the guideline threshold", () => {
    const holdings = [holding()];
    const below = identifyOpportunities(holdings, 5_000, 100_000);
    const above = identifyOpportunities(holdings, 20_000, 100_000);
    expect(below.find((o) => o.type === "cash_deployment")).toBeUndefined();
    expect(above.find((o) => o.type === "cash_deployment")).toBeDefined();
  });

  it("produces no opportunities from an empty, fully-invested, on-target portfolio", () => {
    const result = identifyOpportunities([holding()], 0, 100_000);
    expect(result).toHaveLength(0);
  });
});
