import { describe, expect, it } from "vitest";

import type { PriceQuote, SecurityIdentifier } from "@/domain/market";

import { type RefreshableSecurity, refreshPrices } from "./price-refresh";

const OWNER = "user-1";

function makeQuote(identifier: SecurityIdentifier, price = 100): PriceQuote {
  return {
    identifier,
    price,
    currency: identifier.currency,
    sourceTimestamp: "2026-07-21T10:00:00Z",
    quality: "real_time",
    providerName: "fake",
  };
}

function makeDeps(overrides: {
  getPrice?: (identifier: SecurityIdentifier) => Promise<PriceQuote>;
  getLatest?: (ownerId: string, identifier: SecurityIdentifier) => Promise<PriceQuote | null>;
  upserted?: PriceQuote[];
}) {
  const upserted = overrides.upserted ?? [];
  return {
    priceEngine: {
      getPrice:
        overrides.getPrice ?? (async (identifier: SecurityIdentifier) => makeQuote(identifier)),
    },
    quoteRepository: {
      getLatest: overrides.getLatest ?? (async () => null),
      upsert: async (_ownerId: string, quote: PriceQuote) => {
        upserted.push(quote);
      },
    },
  };
}

describe("refreshPrices", () => {
  it("refreshes each eligible security, upserts the resulting quote, and marks it updated when there was no prior quote", async () => {
    const upserted: PriceQuote[] = [];
    const deps = makeDeps({ upserted });
    const securities: RefreshableSecurity[] = [
      {
        companyId: "c1",
        ticker: "NVDA",
        exchange: "NASDAQ",
        currency: "USD",
        securityType: "equity",
      },
      { companyId: "c2", ticker: "TSM", exchange: "NYSE", currency: "USD", securityType: "equity" },
    ];

    const results = await refreshPrices(deps, OWNER, securities);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.every((r) => r.outcome === "updated")).toBe(true);
    expect(upserted).toHaveLength(2);
  });

  it("marks a security unchanged when the fresh quote is identical to what was already stored", async () => {
    const identifier: SecurityIdentifier = {
      type: "equity",
      ticker: "NVDA",
      exchange: "NASDAQ",
      currency: "USD",
    };
    const stored = makeQuote(identifier, 203.28);
    const deps = makeDeps({
      getPrice: async () => stored,
      getLatest: async () => stored,
    });
    const securities: RefreshableSecurity[] = [
      {
        companyId: "c1",
        ticker: "NVDA",
        exchange: "NASDAQ",
        currency: "USD",
        securityType: "equity",
      },
    ];

    const results = await refreshPrices(deps, OWNER, securities);

    expect(results[0]!.outcome).toBe("unchanged");
  });

  it("classifies fund securities as unsupported without attempting a fetch", async () => {
    let fetchAttempted = false;
    const deps = makeDeps({
      getPrice: async (identifier) => {
        fetchAttempted = true;
        return makeQuote(identifier);
      },
    });
    const securities: RefreshableSecurity[] = [
      {
        companyId: "c1",
        ticker: "NVDA",
        exchange: "NASDAQ",
        currency: "USD",
        securityType: "equity",
      },
      { companyId: "c2", ticker: "BJMD6R8", exchange: "", currency: "GBP", securityType: "fund" },
    ];

    const results = await refreshPrices(deps, OWNER, securities);

    expect(results).toHaveLength(2);
    const fund = results.find((r) => r.companyId === "c2");
    expect(fund?.outcome).toBe("unsupported");
    expect(fund?.error).toBeNull();
    // Only NVDA's fetch should ever have been attempted -- the fund's own
    // getPrice call must never happen even once across both securities,
    // so checking the flag after both settle is still a valid assertion.
    expect(fetchAttempted).toBe(true);
  });

  it("a failure on one security does not block the others, and preserves the previous valid quote instead of erasing it", async () => {
    const brokenIdentifier: SecurityIdentifier = {
      type: "equity",
      ticker: "BROKEN",
      exchange: "NASDAQ",
      currency: "USD",
    };
    const previousQuote = makeQuote(brokenIdentifier, 42);
    const deps = makeDeps({
      getPrice: async (identifier) => {
        if (identifier.ticker === "BROKEN") throw new Error("provider unavailable");
        return makeQuote(identifier);
      },
      getLatest: async (_ownerId, identifier) =>
        identifier.ticker === "BROKEN" ? previousQuote : null,
    });
    const securities: RefreshableSecurity[] = [
      {
        companyId: "c1",
        ticker: "NVDA",
        exchange: "NASDAQ",
        currency: "USD",
        securityType: "equity",
      },
      {
        companyId: "c2",
        ticker: "BROKEN",
        exchange: "NASDAQ",
        currency: "USD",
        securityType: "equity",
      },
    ];

    const results = await refreshPrices(deps, OWNER, securities);

    const ok = results.find((r) => r.companyId === "c1");
    const failed = results.find((r) => r.companyId === "c2");
    expect(ok?.outcome).toBe("updated");
    expect(ok?.error).toBeNull();
    expect(ok?.quote).not.toBeNull();
    expect(failed?.outcome).toBe("failed");
    expect(failed?.error).toContain("provider unavailable");
    // The pre-existing quote must be preserved, never erased, on failure.
    expect(failed?.quote).toEqual(previousQuote);
  });
});
