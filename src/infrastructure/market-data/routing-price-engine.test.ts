import { describe, expect, it } from "vitest";

import type {
  PriceQuote,
  SecurityIdentifier,
  SecurityPriceProvider,
  SecurityPriceProviderMap,
} from "@/domain/market";
import { ProviderUnavailableError } from "@/domain/shared";

import { RoutingPriceEngine } from "./routing-price-engine";

function makeQuote(identifier: SecurityIdentifier, price: number): PriceQuote {
  return {
    identifier,
    price,
    currency: identifier.currency,
    sourceTimestamp: "2026-07-21T10:00:00Z",
    quality: "real_time",
    providerName: "fake",
  };
}

class FakeProvider implements SecurityPriceProvider {
  public readonly received: SecurityIdentifier[] = [];

  constructor(private readonly name: string) {}

  async getPrice(identifier: SecurityIdentifier): Promise<PriceQuote> {
    this.received.push(identifier);
    return makeQuote(identifier, 100);
  }

  async getPrices(identifiers: SecurityIdentifier[]): Promise<PriceQuote[]> {
    this.received.push(...identifiers);
    return identifiers.map((identifier) => makeQuote(identifier, 100));
  }

  label(): string {
    return this.name;
  }
}

describe("RoutingPriceEngine", () => {
  it("routes a single getPrice call to the provider assigned to that security type", async () => {
    const equityProvider = new FakeProvider("equity-provider");
    const fundProvider = new FakeProvider("fund-provider");
    const providers: SecurityPriceProviderMap = {
      equity: equityProvider,
      etf: equityProvider,
      investment_trust: equityProvider,
      fund: fundProvider,
    };
    const engine = new RoutingPriceEngine(providers);

    const identifier: SecurityIdentifier = {
      type: "equity",
      ticker: "NVDA",
      exchange: "NASDAQ",
      currency: "USD",
    };
    await engine.getPrice(identifier);

    expect(equityProvider.received).toEqual([identifier]);
    expect(fundProvider.received).toEqual([]);
  });

  it("routes a fund identifier to the fund provider, not the equity one", async () => {
    const equityProvider = new FakeProvider("equity-provider");
    const fundProvider = new FakeProvider("fund-provider");
    const providers: SecurityPriceProviderMap = {
      equity: equityProvider,
      etf: equityProvider,
      investment_trust: equityProvider,
      fund: fundProvider,
    };
    const engine = new RoutingPriceEngine(providers);

    const identifier: SecurityIdentifier = { type: "fund", sedol: "BJMD6R8", currency: "GBP" };
    await engine.getPrice(identifier);

    expect(fundProvider.received).toEqual([identifier]);
    expect(equityProvider.received).toEqual([]);
  });

  it("groups a mixed getPrices call by type, one batched call per provider", async () => {
    const equityProvider = new FakeProvider("equity-provider");
    const fundProvider = new FakeProvider("fund-provider");
    const providers: SecurityPriceProviderMap = {
      equity: equityProvider,
      etf: equityProvider,
      investment_trust: equityProvider,
      fund: fundProvider,
    };
    const engine = new RoutingPriceEngine(providers);

    const nvda: SecurityIdentifier = {
      type: "equity",
      ticker: "NVDA",
      exchange: "NASDAQ",
      currency: "USD",
    };
    const avgo: SecurityIdentifier = {
      type: "equity",
      ticker: "AVGO",
      exchange: "NASDAQ",
      currency: "USD",
    };
    const fund: SecurityIdentifier = { type: "fund", sedol: "BJMD6R8", currency: "GBP" };

    const results = await engine.getPrices([nvda, fund, avgo]);

    expect(equityProvider.received).toEqual([nvda, avgo]);
    expect(fundProvider.received).toEqual([fund]);
    expect(results).toHaveLength(3);
  });

  it("lets a single provider instance serve multiple security types", async () => {
    const sharedProvider = new FakeProvider("shared");
    const providers: SecurityPriceProviderMap = {
      equity: sharedProvider,
      etf: sharedProvider,
      investment_trust: sharedProvider,
      fund: sharedProvider,
    };
    const engine = new RoutingPriceEngine(providers);

    await engine.getPrice({ type: "equity", ticker: "A", exchange: "X", currency: "USD" });
    await engine.getPrice({ type: "etf", ticker: "B", exchange: "X", currency: "USD" });
    await engine.getPrice({ type: "investment_trust", ticker: "C", exchange: "X", currency: "GBP" });

    expect(sharedProvider.received).toHaveLength(3);
  });

  it("throws ProviderUnavailableError naming the type when no provider is configured for it (Stage 1: fund is unset)", async () => {
    const equityProvider = new FakeProvider("equity-provider");
    const providers: SecurityPriceProviderMap = {
      equity: equityProvider,
      etf: equityProvider,
      investment_trust: equityProvider,
      // fund deliberately absent -- Stage 1 scope (ADR 0031)
    };
    const engine = new RoutingPriceEngine(providers);

    await expect(
      engine.getPrice({ type: "fund", sedol: "BJMD6R8", currency: "GBP" })
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
