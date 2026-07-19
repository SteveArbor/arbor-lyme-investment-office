import { describe, expect, it } from "vitest";

import { FEATURE_FLAGS, getAllFeatureFlags, isFeatureEnabled } from "./feature-flags";

describe("feature flags", () => {
  it("has investmentOffice enabled by default", () => {
    expect(isFeatureEnabled(FEATURE_FLAGS.INVESTMENT_OFFICE)).toBe(true);
  });

  it("has every other Foundation-listed flag disabled by default", () => {
    const others = Object.values(FEATURE_FLAGS).filter(
      (flag) => flag !== FEATURE_FLAGS.INVESTMENT_OFFICE
    );

    for (const flag of others) {
      expect(isFeatureEnabled(flag)).toBe(false);
    }
  });

  it("getAllFeatureFlags returns exactly one enabled flag", () => {
    const all = getAllFeatureFlags();
    const enabled = Object.entries(all).filter(([, value]) => value);

    expect(enabled).toEqual([["investmentOffice", true]]);
  });
});
