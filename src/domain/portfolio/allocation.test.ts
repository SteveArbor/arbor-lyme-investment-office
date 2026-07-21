import { describe, expect, it } from "vitest";

import { calculateAllocationAction } from "./allocation";

describe("calculateAllocationAction", () => {
  it("recommends reduce when meaningfully overweight", () => {
    expect(calculateAllocationAction(0.05, "stable", "buy")).toBe("reduce");
  });

  it("recommends increase when meaningfully underweight", () => {
    expect(calculateAllocationAction(-0.05, "stable", "buy")).toBe("increase");
  });

  it("recommends hold within the drift tolerance band", () => {
    expect(calculateAllocationAction(0.01, "stable", "buy")).toBe("hold");
    expect(calculateAllocationAction(-0.01, "stable", "buy")).toBe("hold");
    expect(calculateAllocationAction(0, null, null)).toBe("hold");
  });

  it("recommends watch when the thesis is broken, regardless of drift", () => {
    expect(calculateAllocationAction(0, "broken", "buy")).toBe("watch");
  });

  it("recommends watch when the rating is sell or avoid, regardless of drift", () => {
    expect(calculateAllocationAction(0, "stable", "sell")).toBe("watch");
    expect(calculateAllocationAction(0, "stable", "avoid")).toBe("watch");
  });

  it("does not treat an absent thesis/rating as a red flag on its own", () => {
    expect(calculateAllocationAction(0, null, null)).toBe("hold");
  });
});
