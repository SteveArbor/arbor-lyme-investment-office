import { describe, expect, it } from "vitest";

import { calculatePortfolioHealth, type PortfolioHealthInput } from "./health";

function wellBalancedInput(): PortfolioHealthInput {
  return {
    cashPercent: 0.08,
    holdingCount: 20,
    largestPositionPercent: 0.05,
    largestSectorPercent: 0.15,
    largestCountryPercent: 0.5,
    averageAbsoluteDriftPercent: 0.01,
    fundPercent: 0.3,
    missingResearchPercent: 0,
  };
}

describe("calculatePortfolioHealth", () => {
  it("scores a well-balanced portfolio highly", () => {
    const result = calculatePortfolioHealth(wellBalancedInput());
    expect(result.score).toBeGreaterThan(9);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("scores a highly concentrated, cash-heavy, unresearched portfolio poorly", () => {
    const result = calculatePortfolioHealth({
      cashPercent: 0.5,
      holdingCount: 2,
      largestPositionPercent: 0.6,
      largestSectorPercent: 0.9,
      largestCountryPercent: 1,
      averageAbsoluteDriftPercent: 0.3,
      fundPercent: 1,
      missingResearchPercent: 1,
    });
    expect(result.score).toBeLessThan(3);
  });

  it("returns 8 factors whose weights sum to 1", () => {
    const result = calculatePortfolioHealth(wellBalancedInput());
    expect(result.factors).toHaveLength(8);
    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it("every factor score is within [0, 1]", () => {
    const result = calculatePortfolioHealth(wellBalancedInput());
    for (const factor of result.factors) {
      expect(factor.score).toBeGreaterThanOrEqual(0);
      expect(factor.score).toBeLessThanOrEqual(1);
    }
  });

  it("identifies the weakest factor in the summary", () => {
    const result = calculatePortfolioHealth({
      ...wellBalancedInput(),
      largestPositionPercent: 0.4, // clearly the worst factor
    });
    expect(result.summary.toLowerCase()).toContain("position");
  });

  it("penalises cash both above and below the target range", () => {
    const tooLittle = calculatePortfolioHealth({ ...wellBalancedInput(), cashPercent: 0 });
    const tooMuch = calculatePortfolioHealth({ ...wellBalancedInput(), cashPercent: 0.5 });
    const ideal = calculatePortfolioHealth({ ...wellBalancedInput(), cashPercent: 0.1 });
    expect(tooLittle.score).toBeLessThan(ideal.score);
    expect(tooMuch.score).toBeLessThan(ideal.score);
  });
});
