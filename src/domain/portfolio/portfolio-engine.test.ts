import { describe, expect, it } from "vitest";

import type { InvestmentRating } from "@/domain/decision";

import { calculatePortfolioAction, type PortfolioActionInputs } from "./portfolio-engine";

function inputs(overrides: Partial<PortfolioActionInputs> = {}): PortfolioActionInputs {
  return {
    investmentRating: "buy",
    currentPositionValue: 0,
    portfolioTotalValue: 100_000,
    targetAllocationPercent: 0.1,
    marginOfSafety: 0.35,
    requiredMarginOfSafety: 0.3,
    cashAvailable: 10_000,
    maxPositionPercent: 0.15,
    ...overrides,
  };
}

describe("calculatePortfolioAction", () => {
  it.each<[InvestmentRating, boolean, string]>([
    ["avoid", false, "hold"],
    ["avoid", true, "exit"],
    ["sell", false, "hold"],
    ["sell", true, "exit"],
    ["reduce_conviction", false, "hold"],
    ["reduce_conviction", true, "trim"],
    ["hold", false, "hold"],
    ["hold", true, "hold"],
  ])("rating %s, held=%s -> %s", (rating, held, expected) => {
    const action = calculatePortfolioAction(
      inputs({
        investmentRating: rating,
        currentPositionValue: held ? 5_000 : 0,
      })
    );
    expect(action).toBe(expected);
  });

  it("initiates a new position on a strong rating with capacity and margin of safety", () => {
    const action = calculatePortfolioAction(inputs({ investmentRating: "strong_buy" }));
    expect(action).toBe("initiate_position");
  });

  it("adds to an existing position when below target allocation", () => {
    const action = calculatePortfolioAction(
      inputs({ investmentRating: "buy", currentPositionValue: 3_000, targetAllocationPercent: 0.1 })
    );
    expect(action).toBe("add");
  });

  it("holds rather than adding once at or above target allocation", () => {
    const action = calculatePortfolioAction(
      inputs({
        investmentRating: "buy",
        currentPositionValue: 12_000,
        targetAllocationPercent: 0.1,
      })
    );
    expect(action).toBe("hold");
  });

  it("holds when margin of safety has not been achieved, even with a good rating", () => {
    const action = calculatePortfolioAction(
      inputs({ investmentRating: "exceptional", marginOfSafety: 0.1, requiredMarginOfSafety: 0.3 })
    );
    expect(action).toBe("hold");
  });

  it("holds when there is no cash available to fund the purchase", () => {
    const action = calculatePortfolioAction(inputs({ investmentRating: "buy", cashAvailable: 0 }));
    expect(action).toBe("hold");
  });

  it("holds when the single-position risk limit has already been reached", () => {
    const action = calculatePortfolioAction(
      inputs({
        investmentRating: "buy",
        currentPositionValue: 15_000,
        portfolioTotalValue: 100_000,
        targetAllocationPercent: 0.2,
        maxPositionPercent: 0.15,
      })
    );
    expect(action).toBe("hold");
  });
});
