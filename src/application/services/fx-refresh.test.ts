import { describe, expect, it } from "vitest";

import type { FxRate } from "@/domain/market";

import { type FxRefreshDependencies, refreshFxRates } from "./fx-refresh";

const OWNER = "user-1";

function makeRate(base: string, quote: string, rate: number, overrides: Partial<FxRate> = {}): FxRate {
  return {
    base,
    quote,
    rate,
    providerName: "ecb",
    effectiveTimestamp: "2026-07-20T12:00:00.000Z",
    retrievedTimestamp: "2026-07-21T09:00:00.000Z",
    quality: "reference",
    ...overrides,
  };
}

function makeDeps(overrides: {
  getRates?: (pairs: ReadonlyArray<{ base: string; quote: string }>) => Promise<FxRate[]>;
  getLatestForMany?: (
    ownerId: string,
    pairs: ReadonlyArray<{ base: string; quote: string }>
  ) => Promise<FxRate[]>;
  upserted?: FxRate[];
}): FxRefreshDependencies {
  const upserted = overrides.upserted ?? [];
  return {
    fxRateProvider: {
      getRates: overrides.getRates ?? (async () => []),
    },
    fxRateRepository: {
      getLatestForMany: overrides.getLatestForMany ?? (async () => []),
      upsert: async (_ownerId: string, rate: FxRate) => {
        upserted.push(rate);
      },
    },
  };
}

describe("refreshFxRates", () => {
  it("filters out identity pairs before ever calling the provider or repository", async () => {
    let providerCalled = false;
    const deps = makeDeps({
      getRates: async (pairs) => {
        providerCalled = true;
        return pairs.map((p) => makeRate(p.base, p.quote, 1));
      },
    });

    const results = await refreshFxRates(deps, OWNER, [{ base: "GBP", quote: "GBP" }]);

    expect(results).toEqual([]);
    expect(providerCalled).toBe(false);
  });

  it("fetches and upserts a fresh rate, marking it updated when it differs from the stored rate", async () => {
    const upserted: FxRate[] = [];
    const deps = makeDeps({
      getRates: async (pairs) => pairs.map((p) => makeRate(p.base, p.quote, 0.75)),
      getLatestForMany: async () => [makeRate("USD", "GBP", 0.7)],
      upserted,
    });

    const results = await refreshFxRates(deps, OWNER, [{ base: "USD", quote: "GBP" }]);

    expect(results).toHaveLength(1);
    expect(results[0]!.outcome).toBe("updated");
    expect(results[0]!.rate?.rate).toBe(0.75);
    expect(upserted).toHaveLength(1);
  });

  it("marks a pair unchanged when the fresh rate matches the stored rate exactly", async () => {
    const deps = makeDeps({
      getRates: async (pairs) => pairs.map((p) => makeRate(p.base, p.quote, 0.75)),
      getLatestForMany: async () => [makeRate("USD", "GBP", 0.75)],
    });

    const results = await refreshFxRates(deps, OWNER, [{ base: "USD", quote: "GBP" }]);

    expect(results[0]!.outcome).toBe("unchanged");
  });

  it("falls back to the last known good rate when the provider call fails, without erasing it", async () => {
    const priorRate = makeRate("USD", "GBP", 0.7);
    const deps = makeDeps({
      getRates: async () => {
        throw new Error("ECB feed unreachable");
      },
      getLatestForMany: async () => [priorRate],
    });

    const results = await refreshFxRates(deps, OWNER, [{ base: "USD", quote: "GBP" }]);

    expect(results[0]!.outcome).toBe("failed");
    expect(results[0]!.rate).toEqual(priorRate);
    expect(results[0]!.error).toContain("ECB feed unreachable");
  });

  it("returns a null rate with an error, never a fabricated fallback, when a pair has never been fetched successfully", async () => {
    const deps = makeDeps({
      getRates: async () => {
        throw new Error("ECB feed unreachable");
      },
      getLatestForMany: async () => [],
    });

    const results = await refreshFxRates(deps, OWNER, [{ base: "EUR", quote: "GBP" }]);

    expect(results[0]!.outcome).toBe("failed");
    expect(results[0]!.rate).toBeNull();
  });

  it("one pair's failure does not block another pair's successful refresh", async () => {
    const deps = makeDeps({
      getRates: async (pairs) =>
        // Simulate the provider only being able to resolve USD/GBP this cycle.
        pairs.filter((p) => p.base === "USD").map((p) => makeRate(p.base, p.quote, 0.75)),
      getLatestForMany: async () => [makeRate("EUR", "GBP", 0.85)],
    });

    const results = await refreshFxRates(deps, OWNER, [
      { base: "USD", quote: "GBP" },
      { base: "EUR", quote: "GBP" },
    ]);

    const usd = results.find((r) => r.base === "USD");
    const eur = results.find((r) => r.base === "EUR");
    expect(usd?.outcome).toBe("updated");
    expect(eur?.outcome).toBe("failed");
    expect(eur?.rate?.rate).toBe(0.85); // fell back to the stored rate, not erased
  });
});
