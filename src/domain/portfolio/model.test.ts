import { describe, expect, it } from "vitest";

import {
  calculateCurrentAllocationPercent,
  calculateCurrentValue,
  calculateUnrealisedGainLoss,
} from "./model";

describe("calculateCurrentValue", () => {
  it("multiplies quantity by current price", () => {
    expect(calculateCurrentValue(10, 25)).toBe(250);
  });

  it("returns 0 for a zero position", () => {
    expect(calculateCurrentValue(0, 25)).toBe(0);
  });
});

describe("calculateUnrealisedGainLoss", () => {
  it("is positive when the current price exceeds average cost", () => {
    expect(calculateUnrealisedGainLoss(10, 20, 25)).toBe(50);
  });

  it("is negative when the current price is below average cost", () => {
    expect(calculateUnrealisedGainLoss(10, 25, 20)).toBe(-50);
  });

  it("is zero when the current price equals average cost", () => {
    expect(calculateUnrealisedGainLoss(10, 20, 20)).toBe(0);
  });
});

describe("calculateCurrentAllocationPercent", () => {
  it("computes the position's share of total portfolio value", () => {
    expect(calculateCurrentAllocationPercent(2500, 10_000)).toBeCloseTo(0.25, 5);
  });

  it("returns 0 when the portfolio has no value", () => {
    expect(calculateCurrentAllocationPercent(2500, 0)).toBe(0);
  });

  it("clamps to 1 rather than exceeding it", () => {
    expect(calculateCurrentAllocationPercent(15_000, 10_000)).toBe(1);
  });
});
