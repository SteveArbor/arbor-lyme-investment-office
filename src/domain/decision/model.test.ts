import { describe, expect, it } from "vitest";

import {
  calculateConviction,
  calculateInvestmentRating,
  calculateOverallScore,
  calculateQualityScore,
  calculateValuationScore,
  type DecisionInputs,
} from "./model";

function inputs(
  overrides: Partial<Omit<DecisionInputs, "companyId">> = {}
): Omit<DecisionInputs, "companyId"> {
  return {
    businessQuality: 0.5,
    economicMoat: 0.5,
    financialStrength: 0.5,
    capitalAllocation: 0.5,
    growth: 0.5,
    riskLevel: 0.5,
    expectedReturn: 0.1,
    marginOfSafety: 0.2,
    ...overrides,
  };
}

describe("calculateQualityScore", () => {
  it("returns 0.5 for all-neutral (0.5) inputs, including inverted risk", () => {
    expect(calculateQualityScore(inputs())).toBeCloseTo(0.5, 5);
  });

  it("returns 1.0 for maximum quality and zero risk", () => {
    const score = calculateQualityScore(
      inputs({
        businessQuality: 1,
        economicMoat: 1,
        financialStrength: 1,
        capitalAllocation: 1,
        growth: 1,
        riskLevel: 0,
      })
    );
    expect(score).toBeCloseTo(1, 5);
  });

  it("penalises high risk even when every other dimension is maximal", () => {
    const lowRisk = calculateQualityScore(inputs({ riskLevel: 0 }));
    const highRisk = calculateQualityScore(inputs({ riskLevel: 1 }));
    expect(highRisk).toBeLessThan(lowRisk);
  });
});

describe("calculateValuationScore", () => {
  it("returns 0 for zero (or negative) expected return and zero margin of safety", () => {
    expect(calculateValuationScore(inputs({ expectedReturn: 0, marginOfSafety: 0 }))).toBe(0);
  });

  it("clamps at 1 for expected return/margin of safety beyond the reference range", () => {
    expect(calculateValuationScore(inputs({ expectedReturn: 1, marginOfSafety: 1 }))).toBe(1);
  });

  it("increases monotonically with expected return", () => {
    const low = calculateValuationScore(inputs({ expectedReturn: 0.05 }));
    const high = calculateValuationScore(inputs({ expectedReturn: 0.25 }));
    expect(high).toBeGreaterThan(low);
  });
});

describe("calculateOverallScore", () => {
  it("weights quality at 60% and valuation at 40%", () => {
    expect(calculateOverallScore(1, 0)).toBeCloseTo(0.6, 5);
    expect(calculateOverallScore(0, 1)).toBeCloseTo(0.4, 5);
  });
});

describe("calculateConviction", () => {
  it("equals the quality score, independent of valuation", () => {
    expect(calculateConviction(0.73)).toBe(0.73);
  });
});

describe("calculateInvestmentRating", () => {
  it.each([
    [0.9, "exceptional"],
    [0.85, "exceptional"],
    [0.75, "strong_buy"],
    [0.7, "strong_buy"],
    [0.6, "buy"],
    [0.55, "buy"],
    [0.45, "hold"],
    [0.4, "hold"],
    [0.3, "reduce_conviction"],
    [0.25, "reduce_conviction"],
    [0.15, "sell"],
    [0.1, "sell"],
    [0.05, "avoid"],
    [0, "avoid"],
  ])("maps overall score %f to rating %s", (score, expected) => {
    expect(calculateInvestmentRating(score)).toBe(expected);
  });
});
