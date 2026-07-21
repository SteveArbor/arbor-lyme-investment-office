import { describe, expect, it } from "vitest";

import {
  buildFxPairKey,
  buildIdentifierKey,
  calculateDailyChange,
  calculateFxRateAge,
  calculateQuoteAge,
  convertCurrency,
} from "./model";

describe("buildIdentifierKey", () => {
  it("keys an exchange-traded identifier on type:ticker:exchange", () => {
    expect(
      buildIdentifierKey({ type: "equity", ticker: "NVDA", exchange: "NASDAQ", currency: "USD" })
    ).toBe("equity:NVDA:NASDAQ");
  });

  it("keys a fund identifier on its SEDOL", () => {
    expect(buildIdentifierKey({ type: "fund", sedol: "BJMD6R8", currency: "GBP" })).toBe(
      "fund:BJMD6R8"
    );
  });

  it("falls back to ISIN for a fund with no SEDOL", () => {
    expect(buildIdentifierKey({ type: "fund", isin: "GB0001234567", currency: "GBP" })).toBe(
      "fund:GB0001234567"
    );
  });

  it("throws for an exchange-traded identifier missing ticker or exchange", () => {
    expect(() => buildIdentifierKey({ type: "equity", currency: "USD" })).toThrow();
    expect(() => buildIdentifierKey({ type: "etf", ticker: "VUSA", currency: "USD" })).toThrow();
  });

  it("throws for a fund identifier missing both sedol and isin", () => {
    expect(() => buildIdentifierKey({ type: "fund", currency: "GBP" })).toThrow();
  });
});

describe("calculateQuoteAge", () => {
  it("is not stale when the age is under the threshold", () => {
    const result = calculateQuoteAge(
      { sourceTimestamp: "2026-07-21T09:00:00Z" },
      "2026-07-21T09:10:00Z",
      900 // 15 minutes
    );
    expect(result.ageSeconds).toBe(600);
    expect(result.isStale).toBe(false);
  });

  it("is stale once the age exceeds the threshold", () => {
    const result = calculateQuoteAge(
      { sourceTimestamp: "2026-07-21T09:00:00Z" },
      "2026-07-21T09:20:00Z",
      900
    );
    expect(result.ageSeconds).toBe(1200);
    expect(result.isStale).toBe(true);
  });

  it("is exactly at the threshold boundary is not stale (strictly greater-than)", () => {
    const result = calculateQuoteAge(
      { sourceTimestamp: "2026-07-21T09:00:00Z" },
      "2026-07-21T09:15:00Z",
      900
    );
    expect(result.ageSeconds).toBe(900);
    expect(result.isStale).toBe(false);
  });

  it("never reads the system clock — identical calls with the same inputs always agree", () => {
    const a = calculateQuoteAge(
      { sourceTimestamp: "2026-01-01T00:00:00Z" },
      "2026-01-02T00:00:00Z",
      3600
    );
    const b = calculateQuoteAge(
      { sourceTimestamp: "2026-01-01T00:00:00Z" },
      "2026-01-02T00:00:00Z",
      3600
    );
    expect(a).toEqual(b);
    expect(a.ageSeconds).toBe(86400);
  });
});

describe("convertCurrency", () => {
  it("returns the amount unchanged for identity conversion, regardless of the rate passed", () => {
    expect(convertCurrency(100, "GBP", "GBP", 999)).toBe(100);
  });

  it("multiplies by the rate for a genuine cross-currency conversion", () => {
    expect(convertCurrency(100, "USD", "GBP", 0.75)).toBe(75);
  });

  it("never conflates two different currencies' amounts (0.74 USD/GBP example)", () => {
    const usdAmount = 203.28;
    const converted = convertCurrency(usdAmount, "USD", "GBP", 0.7428);
    expect(converted).not.toBe(usdAmount);
    expect(converted).toBeCloseTo(151.02, 1);
  });
});

describe("buildFxPairKey", () => {
  it("builds a deterministic base:quote key", () => {
    expect(buildFxPairKey("USD", "GBP")).toBe("USD:GBP");
    expect(buildFxPairKey("GBP", "USD")).toBe("GBP:USD");
  });
});

describe("calculateFxRateAge", () => {
  it("judges staleness against effectiveTimestamp, not retrievedTimestamp", () => {
    const fresh = calculateFxRateAge(
      { effectiveTimestamp: "2026-07-20T12:00:00Z" },
      "2026-07-20T13:00:00Z",
      3600 * 24
    );
    expect(fresh.isStale).toBe(false);

    const stale = calculateFxRateAge(
      { effectiveTimestamp: "2026-07-18T12:00:00Z" },
      "2026-07-20T13:00:00Z",
      3600 * 24
    );
    expect(stale.isStale).toBe(true);
  });
});

describe("calculateDailyChange", () => {
  it("computes amount and percent when previousClose is present", () => {
    const result = calculateDailyChange({ price: 110, previousClose: 100 });
    expect(result).toEqual({ amount: 10, percent: 0.1 });
  });

  it("returns null when previousClose is absent — never a fabricated 0% change", () => {
    expect(calculateDailyChange({ price: 110, previousClose: undefined })).toBeNull();
  });

  it("returns null when previousClose is exactly 0 (avoids a division by zero)", () => {
    expect(calculateDailyChange({ price: 10, previousClose: 0 })).toBeNull();
  });
});
