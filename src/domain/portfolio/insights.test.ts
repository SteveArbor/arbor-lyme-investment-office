import { describe, expect, it } from "vitest";

import { generatePortfolioInsights } from "./insights";

describe("generatePortfolioInsights", () => {
  it("flags cash above target", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0.2,
      cashTargetPercent: 0.15,
      concentrationWarnings: [],
      heldSectors: [],
      watchedSectorsForGaps: [],
    });
    expect(result.some((i) => i.message.includes("Cash is"))).toBe(true);
  });

  it("does not flag cash within target", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0.1,
      cashTargetPercent: 0.15,
      concentrationWarnings: [],
      heldSectors: [],
      watchedSectorsForGaps: [],
    });
    expect(result.some((i) => i.message.includes("Cash is"))).toBe(false);
  });

  it("turns a sector concentration warning into a plain-English insight", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0,
      cashTargetPercent: 0.15,
      concentrationWarnings: [{ type: "sector", key: "Technology", percent: 0.4, message: "" }],
      heldSectors: ["Technology"],
      watchedSectorsForGaps: [],
    });
    expect(result.some((i) => i.message.includes("Technology is overweight"))).toBe(true);
  });

  it("flags a watched sector with zero exposure", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0,
      cashTargetPercent: 0.15,
      concentrationWarnings: [],
      heldSectors: ["Technology"],
      watchedSectorsForGaps: ["Healthcare"],
    });
    expect(result.some((i) => i.message === "No Healthcare exposure.")).toBe(true);
  });

  it("does not flag a watched sector that is actually held", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0,
      cashTargetPercent: 0.15,
      concentrationWarnings: [],
      heldSectors: ["Healthcare"],
      watchedSectorsForGaps: ["Healthcare"],
    });
    expect(result.some((i) => i.message.includes("No Healthcare"))).toBe(false);
  });

  it("flags growing concentration when multiple warnings are present", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0,
      cashTargetPercent: 0.15,
      concentrationWarnings: [
        { type: "sector", key: "Technology", percent: 0.4, message: "" },
        { type: "position", key: "NVIDIA", percent: 0.2, message: "" },
      ],
      heldSectors: ["Technology"],
      watchedSectorsForGaps: [],
    });
    expect(result.some((i) => i.message.includes("becoming concentrated"))).toBe(true);
  });

  it("falls back to 'no action required today' when nothing triggers", () => {
    const result = generatePortfolioInsights({
      cashPercent: 0.1,
      cashTargetPercent: 0.15,
      concentrationWarnings: [],
      heldSectors: [],
      watchedSectorsForGaps: [],
    });
    expect(result).toEqual([{ message: "No action required today.", severity: "info" }]);
  });
});
