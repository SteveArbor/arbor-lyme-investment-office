import type { FxRate, FxRateProvider } from "@/domain/market";
import { ProviderUnavailableError } from "@/domain/shared";

const PROVIDER_NAME = "ecb";
const FEED_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

interface ParsedEcbFeed {
  /** The date ECB's own feed states these rates are for (YYYY-MM-DD). */
  date: string;
  /** Every published rate is "1 EUR = X <currency>" — ECB's feed has no other base. */
  ratesFromEur: Map<string, number>;
}

/**
 * Parses ECB's `eurofxref-daily.xml` — a small, flat format
 * (`<Cube time="YYYY-MM-DD"><Cube currency="XXX" rate="Y.YYYY"/>...</Cube>`)
 * ECB has published unchanged for years. A regex extractor is used
 * deliberately instead of adding an XML-parsing dependency for a feed this
 * simple and this stable (ADR 0032); if the format ever changes, this
 * throws `ProviderUnavailableError` rather than silently misparsing.
 */
function parseEcbFeed(xml: string): ParsedEcbFeed {
  const dateMatch = xml.match(/<Cube time=['"]([\d-]+)['"]/);
  if (!dateMatch?.[1]) {
    throw new ProviderUnavailableError(
      PROVIDER_NAME,
      "could not find a Cube time attribute in the ECB feed"
    );
  }

  const ratesFromEur = new Map<string, number>();
  const cubeRegex = /<Cube currency=['"]([A-Z]{3})['"] rate=['"]([\d.]+)['"]\s*\/>/g;
  for (const match of xml.matchAll(cubeRegex)) {
    ratesFromEur.set(match[1]!, Number(match[2]));
  }
  if (ratesFromEur.size === 0) {
    throw new ProviderUnavailableError(PROVIDER_NAME, "no currency rates found in the ECB feed");
  }

  return { date: dateMatch[1], ratesFromEur };
}

/** 1 EUR = X `currency` → EUR itself is always exactly 1 EUR, never present as its own `<Cube>` entry in the feed. */
function eurRate(feed: ParsedEcbFeed, currency: string): number {
  if (currency === "EUR") return 1;
  const rate = feed.ratesFromEur.get(currency);
  if (rate === undefined) {
    throw new ProviderUnavailableError(
      PROVIDER_NAME,
      `ECB does not publish a reference rate for ${currency}`
    );
  }
  return rate;
}

/**
 * `FxRateProvider` implementation (ADR 0032) backed by the European
 * Central Bank's daily reference-rate feed — free, no API key, no rate
 * limit, and (per this platform's own provider evaluation) the right
 * shape of data for a decision-support tool: an official once-daily
 * reference rate, not a real-time trading feed this platform has no use
 * for. ECB publishes every rate relative to EUR; a USD→GBP request (this
 * platform's actual need) is computed as a cross-rate through EUR — see
 * `eurRate` above. One HTTP fetch answers every requested pair, since the
 * feed already contains every published currency in a single small
 * document — no per-pair request, unlike `TwelveDataPriceProvider`.
 */
export class EcbFxRateProvider implements FxRateProvider {
  async getRate(base: string, quote: string): Promise<FxRate> {
    const [rate] = await this.getRates([{ base, quote }]);
    return rate!;
  }

  async getRates(pairs: ReadonlyArray<{ base: string; quote: string }>): Promise<FxRate[]> {
    let response: Response;
    try {
      response = await fetch(FEED_URL);
    } catch (cause) {
      throw new ProviderUnavailableError(
        PROVIDER_NAME,
        cause instanceof Error ? cause.message : String(cause)
      );
    }
    if (!response.ok) {
      throw new ProviderUnavailableError(PROVIDER_NAME, `HTTP ${response.status}`);
    }

    const xml = await response.text();
    const feed = parseEcbFeed(xml);
    // ECB states a date only, never an intraday time — noon UTC is a
    // documented, disclosed nominal time-of-day, not a claim of
    // ECB-reported precision that doesn't exist.
    const effectiveTimestamp = `${feed.date}T12:00:00.000Z`;
    const retrievedTimestamp = new Date().toISOString();

    return pairs.map(({ base, quote }) => {
      const rate = base === quote ? 1 : eurRate(feed, quote) / eurRate(feed, base);
      return {
        base,
        quote,
        rate,
        providerName: PROVIDER_NAME,
        effectiveTimestamp,
        retrievedTimestamp,
        quality: "reference",
      };
    });
  }
}
