import { describe, expect, it } from "vitest";

import { calculateRealisedGain, calculateWeightedAverageCost } from "./model";

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
