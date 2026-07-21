import { describe, expect, it } from "vitest";

import {
  calculateConcentrationWarnings,
  calculateCountryAllocation,
  calculateCurrencyExposure,
  calculateSectorAllocation,
  type RiskHoldingInput,
} from "./risk";

const HOLDINGS: RiskHoldingInput[] = [
  {
    companyId: "nvda",
    companyName: "NVIDIA Corporation",
    sector: "Technology",
    country: "United States",
    currency: "USD",
    marketValueBase: 9_665.55,
  },
  {
    companyId: "wpp",
    companyName: "WPP plc",
    sector: "Communication Services",
    country: "United Kingdom",
    currency: "GBP",
    marketValueBase: 5_214.15,
  },
  {
    companyId: "asml",
    companyName: "ASML Holding N.V.",
    sector: "Technology",
    country: "Netherlands",
    currency: "EUR",
    marketValueBase: 6_700.21,
  },
];

const TOTAL = 21_579.91 + 10_162.29; // holdings + cash

describe("calculateSectorAllocation", () => {
  it("aggregates market value by sector as a percent of total portfolio value", () => {
    const result = calculateSectorAllocation(HOLDINGS, TOTAL);
    const technology = result.find((r) => r.key === "Technology");
    expect(technology?.valueBase).toBeCloseTo(9_665.55 + 6_700.21, 2);
    expect(technology?.percent).toBeCloseTo((9_665.55 + 6_700.21) / TOTAL, 6);
  });

  it("sorts descending by value", () => {
    const result = calculateSectorAllocation(HOLDINGS, TOTAL);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.valueBase).toBeGreaterThanOrEqual(result[i]!.valueBase);
    }
  });
});

describe("calculateCountryAllocation", () => {
  it("aggregates by country", () => {
    const result = calculateCountryAllocation(HOLDINGS, TOTAL);
    expect(result.find((r) => r.key === "United States")?.valueBase).toBeCloseTo(9_665.55, 2);
    expect(result.find((r) => r.key === "Netherlands")?.valueBase).toBeCloseTo(6_700.21, 2);
  });
});

describe("calculateCurrencyExposure", () => {
  it("folds cash into the base currency bucket", () => {
    const result = calculateCurrencyExposure(HOLDINGS, 10_162.29, "GBP", TOTAL);
    const gbp = result.find((r) => r.key === "GBP");
    expect(gbp?.valueBase).toBeCloseTo(5_214.15 + 10_162.29, 2);
  });

  it("never folds cash into a non-base currency", () => {
    const result = calculateCurrencyExposure(HOLDINGS, 10_162.29, "GBP", TOTAL);
    const usd = result.find((r) => r.key === "USD");
    expect(usd?.valueBase).toBeCloseTo(9_665.55, 2);
  });
});

describe("calculateConcentrationWarnings", () => {
  it("flags a single position above the guideline threshold", () => {
    const warnings = calculateConcentrationWarnings(
      [{ companyName: "NVIDIA Corporation", percent: 0.3 }],
      [],
      [],
      []
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.type).toBe("position");
  });

  it("does not flag a position within the guideline", () => {
    const warnings = calculateConcentrationWarnings(
      [{ companyName: "NVIDIA Corporation", percent: 0.1 }],
      [],
      [],
      []
    );
    expect(warnings).toHaveLength(0);
  });

  it("flags sector, country, and currency concentration independently", () => {
    const warnings = calculateConcentrationWarnings(
      [],
      [{ key: "Technology", valueBase: 1, percent: 0.4 }],
      [{ key: "United States", valueBase: 1, percent: 0.7 }],
      [{ key: "USD", valueBase: 1, percent: 0.65 }]
    );
    expect(warnings.map((w) => w.type).sort()).toEqual(["country", "currency", "sector"]);
  });

  it("sorts warnings descending by severity (percent)", () => {
    const warnings = calculateConcentrationWarnings(
      [{ companyName: "A", percent: 0.16 }],
      [{ key: "Tech", valueBase: 1, percent: 0.9 }],
      [],
      []
    );
    expect(warnings[0]!.type).toBe("sector");
  });
});
