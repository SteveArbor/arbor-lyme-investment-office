import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SecurityIdentifier } from "@/domain/market";

import { twelveDataGet } from "./twelve-data-client";
import { TwelveDataPriceProvider } from "./twelve-data-price-provider";

vi.mock("./twelve-data-client", () => ({
  twelveDataGet: vi.fn(),
}));

const mockedGet = vi.mocked(twelveDataGet);

function rawQuote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: "NVDA",
    exchange: "NASDAQ",
    currency: "USD",
    close: "203.28",
    timestamp: 1784554200,
    is_market_open: false,
    ...overrides,
  };
}

describe("TwelveDataPriceProvider", () => {
  beforeEach(() => {
    mockedGet.mockClear();
  });

  it("requests the identifier's own ticker/exchange unchanged for an ordinary listing", async () => {
    mockedGet.mockResolvedValueOnce(rawQuote());
    const provider = new TwelveDataPriceProvider("test-key");
    const identifier: SecurityIdentifier = {
      type: "equity",
      ticker: "NVDA",
      exchange: "NASDAQ",
      currency: "USD",
    };

    await provider.getPrice(identifier);

    expect(mockedGet).toHaveBeenCalledWith(
      "/quote",
      { symbol: "NVDA", exchange: "NASDAQ" },
      "test-key"
    );
  });

  it("strips the .AS disambiguation suffix and translates Euronext Amsterdam for Twelve Data's request", async () => {
    mockedGet.mockResolvedValueOnce(
      rawQuote({ symbol: "ASML", exchange: "Euronext", currency: "EUR", close: "1050.5" })
    );
    const provider = new TwelveDataPriceProvider("test-key");
    const identifier: SecurityIdentifier = {
      type: "equity",
      ticker: "ASML.AS",
      exchange: "Euronext Amsterdam",
      currency: "EUR",
    };

    const quote = await provider.getPrice(identifier);

    expect(mockedGet).toHaveBeenCalledWith(
      "/quote",
      { symbol: "ASML", exchange: "Euronext" },
      "test-key"
    );
    // The domain identifier on the returned quote is untouched -- only the
    // outbound vendor request was translated (ADR 0031).
    expect(quote.identifier).toBe(identifier);
    expect(quote.identifier.ticker).toBe("ASML.AS");
  });

  it("infers real_time quality while the market is open and previous_close once it isn't", async () => {
    mockedGet.mockResolvedValueOnce(rawQuote({ is_market_open: true }));
    const provider = new TwelveDataPriceProvider("test-key");
    const identifier: SecurityIdentifier = {
      type: "equity",
      ticker: "NVDA",
      exchange: "NASDAQ",
      currency: "USD",
    };

    const openQuote = await provider.getPrice(identifier);
    expect(openQuote.quality).toBe("real_time");

    mockedGet.mockResolvedValueOnce(rawQuote({ is_market_open: false }));
    const closedQuote = await provider.getPrice(identifier);
    expect(closedQuote.quality).toBe("previous_close");
  });

  it("throws ProviderUnavailableError when the identifier is missing ticker or exchange", async () => {
    const provider = new TwelveDataPriceProvider("test-key");
    const identifier: SecurityIdentifier = {
      type: "fund",
      sedol: "BJMD6R8",
      currency: "GBP",
    };

    await expect(provider.getPrice(identifier)).rejects.toThrow(/missing ticker\/exchange/);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
