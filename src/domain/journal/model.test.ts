import { describe, expect, it } from "vitest";

import { calculateHoldingPeriodDays } from "./model";

describe("calculateHoldingPeriodDays", () => {
  it("returns null while the position remains open", () => {
    expect(calculateHoldingPeriodDays("2026-01-01T00:00:00.000Z", null)).toBeNull();
  });

  it("computes the whole-day span between purchase and sale", () => {
    expect(calculateHoldingPeriodDays("2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z")).toBe(
      10
    );
  });

  it("never returns a negative period", () => {
    expect(calculateHoldingPeriodDays("2026-01-11T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(
      0
    );
  });
});
