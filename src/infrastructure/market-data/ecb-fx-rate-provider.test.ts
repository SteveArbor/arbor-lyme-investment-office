import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderUnavailableError } from "@/domain/shared";

import { EcbFxRateProvider } from "./ecb-fx-rate-provider";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time='2026-07-20'>
      <Cube currency='USD' rate='1.1426'/>
      <Cube currency='GBP' rate='0.84888'/>
      <Cube currency='JPY' rate='185.54'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

function textResponse(status: number, body: string) {
  return new Response(body, { status });
}

describe("EcbFxRateProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("computes a EUR-based rate directly from the feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(200, SAMPLE_FEED)));
    const provider = new EcbFxRateProvider();

    const rate = await provider.getRate("EUR", "GBP");

    expect(rate.base).toBe("EUR");
    expect(rate.quote).toBe("GBP");
    expect(rate.rate).toBeCloseTo(0.84888, 6);
    expect(rate.providerName).toBe("ecb");
    expect(rate.quality).toBe("reference");
    expect(rate.effectiveTimestamp).toBe("2026-07-20T12:00:00.000Z");
  });

  it("computes a USD→GBP cross-rate through EUR (ECB publishes no direct USD/GBP rate)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(200, SAMPLE_FEED)));
    const provider = new EcbFxRateProvider();

    const rate = await provider.getRate("USD", "GBP");

    // 1 USD = (0.84888 / 1.1426) GBP
    expect(rate.rate).toBeCloseTo(0.84888 / 1.1426, 6);
  });

  it("returns identity (rate 1) for a same-currency pair without needing that currency in the feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(200, SAMPLE_FEED)));
    const provider = new EcbFxRateProvider();

    const rate = await provider.getRate("GBP", "GBP");

    expect(rate.rate).toBe(1);
  });

  it("answers every requested pair from a single fetch call", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(textResponse(200, SAMPLE_FEED));
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new EcbFxRateProvider();

    const rates = await provider.getRates([
      { base: "USD", quote: "GBP" },
      { base: "EUR", quote: "GBP" },
      { base: "GBP", quote: "GBP" },
    ]);

    expect(rates).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws ProviderUnavailableError for a currency ECB doesn't publish", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(200, SAMPLE_FEED)));
    const provider = new EcbFxRateProvider();

    await expect(provider.getRate("XYZ", "GBP")).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError on an HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(503, "")));
    const provider = new EcbFxRateProvider();

    await expect(provider.getRate("USD", "GBP")).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError if the feed doesn't parse as expected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(200, "<not>the expected format</not>")));
    const provider = new EcbFxRateProvider();

    await expect(provider.getRate("USD", "GBP")).rejects.toThrow(ProviderUnavailableError);
  });
});
