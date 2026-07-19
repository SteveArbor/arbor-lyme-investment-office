import { describe, expect, it } from "vitest";

import {
  calculateBlendedFairValue,
  calculateScenarioFairValue,
  calculateValuationStatus,
  type ValuationScenario,
} from "./model";

describe("calculateScenarioFairValue", () => {
  it("computes a fair value from EPS growth, terminal multiple, and discounting", () => {
    // EPS 10, grows 10%/yr for 5 years -> ~16.105, x terminal multiple 15 -> ~241.6
    // discounted back at 10%/yr for 5 years -> ~150.0
    const fairValue = calculateScenarioFairValue(
      {
        epsAssumption: 10,
        growthRateAssumption: 0.1,
        terminalMultiple: 15,
        discountRate: 0.1,
        probability: 1,
      },
      5
    );

    expect(fairValue).toBeCloseTo(150.0, 0);
  });

  it("returns the terminal price undiscounted when discount rate is 0", () => {
    const fairValue = calculateScenarioFairValue(
      {
        epsAssumption: 10,
        growthRateAssumption: 0,
        terminalMultiple: 15,
        discountRate: 0,
        probability: 1,
      },
      5
    );

    expect(fairValue).toBeCloseTo(150.0, 5); // no growth, no discount: 10 * 15
  });

  it("is generic — works identically for any EPS/growth/multiple combination (no hardcoded company)", () => {
    const smallCompany = calculateScenarioFairValue(
      {
        epsAssumption: 0.5,
        growthRateAssumption: 0.25,
        terminalMultiple: 30,
        discountRate: 0.12,
        probability: 1,
      },
      3
    );
    const largeCompany = calculateScenarioFairValue(
      {
        epsAssumption: 50,
        growthRateAssumption: 0.05,
        terminalMultiple: 10,
        discountRate: 0.08,
        probability: 1,
      },
      10
    );

    expect(smallCompany).toBeGreaterThan(0);
    expect(largeCompany).toBeGreaterThan(0);
  });
});

describe("calculateBlendedFairValue", () => {
  it("computes a probability-weighted average across bear/base/bull", () => {
    const scenario = (fairValue: number, probability: number): ValuationScenario => ({
      epsAssumption: 0,
      growthRateAssumption: 0,
      terminalMultiple: 0,
      discountRate: 0,
      probability,
      fairValue,
    });

    const blended = calculateBlendedFairValue(
      scenario(50, 0.25),
      scenario(100, 0.5),
      scenario(150, 0.25)
    );

    expect(blended).toBeCloseTo(100, 5); // 50*0.25 + 100*0.5 + 150*0.25 = 100
  });
});

describe("calculateValuationStatus", () => {
  it("is undervalued once the discount to fair value meets the required margin of safety", () => {
    // Fair value 100, 30% margin of safety required -> undervalued at or below 70
    expect(calculateValuationStatus(70, 100, 0.3)).toBe("undervalued");
    expect(calculateValuationStatus(65, 100, 0.3)).toBe("undervalued");
  });

  it("is fairly valued between the required discount and fair value", () => {
    expect(calculateValuationStatus(85, 100, 0.3)).toBe("fairly_valued");
  });

  it("is overvalued once price exceeds fair value", () => {
    expect(calculateValuationStatus(101, 100, 0.3)).toBe("overvalued");
  });

  it("treats a degenerate zero-or-negative fair value as overvalued", () => {
    expect(calculateValuationStatus(10, 0, 0.3)).toBe("overvalued");
  });
});
