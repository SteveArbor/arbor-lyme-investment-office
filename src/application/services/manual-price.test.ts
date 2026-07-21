import { describe, expect, it } from "vitest";

import type { PriceQuote } from "@/domain/market";
import { ValidationError } from "@/domain/shared";

import { saveManualPrice } from "./manual-price";

describe("saveManualPrice", () => {
  it("upserts a quote with quality manual and providerName manual", async () => {
    const upserted: PriceQuote[] = [];
    const deps = {
      quoteRepository: {
        upsert: async (_ownerId: string, quote: PriceQuote) => {
          upserted.push(quote);
        },
      },
    };

    await saveManualPrice(deps, "owner-1", {
      identifier: { type: "fund", sedol: "BJMD6R8", currency: "GBP" },
      price: 1.25,
      effectiveTimestamp: "2026-07-21T09:00:00Z",
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0]!.quality).toBe("manual");
    expect(upserted[0]!.providerName).toBe("manual");
    expect(upserted[0]!.price).toBe(1.25);
    expect(upserted[0]!.sourceTimestamp).toBe("2026-07-21T09:00:00Z");
  });

  it("rejects a non-positive price without touching the repository", async () => {
    let called = false;
    const deps = {
      quoteRepository: {
        upsert: async () => {
          called = true;
        },
      },
    };

    await expect(
      saveManualPrice(deps, "owner-1", {
        identifier: { type: "fund", sedol: "BJMD6R8", currency: "GBP" },
        price: 0,
        effectiveTimestamp: "2026-07-21T09:00:00Z",
      })
    ).rejects.toThrow(ValidationError);
    expect(called).toBe(false);
  });
});
