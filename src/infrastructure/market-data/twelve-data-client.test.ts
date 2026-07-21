import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderAuthError, ProviderRateLimitError, ProviderUnavailableError } from "@/domain/shared";

import { twelveDataGet } from "./twelve-data-client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("twelveDataGet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ProviderAuthError without making a request when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(twelveDataGet("/quote", { symbol: "NVDA" }, undefined)).rejects.toThrow(
      ProviderAuthError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the parsed body on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { close: "203.28" })));

    const result = await twelveDataGet<{ close: string }>("/quote", { symbol: "NVDA" }, "key");

    expect(result).toEqual({ close: "203.28" });
  });

  it("maps an HTTP 429 to ProviderRateLimitError using the retry-after header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(429, {}, { "retry-after": "30" }))
    );

    const error = await twelveDataGet("/quote", { symbol: "NVDA" }, "key").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderRateLimitError);
    expect((error as ProviderRateLimitError).retryAfterSeconds).toBe(30);
  });

  it("maps Twelve Data's body-level error convention (HTTP 200) to the matching domain error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { status: "error", code: 401, message: "invalid apikey" })
      )
    );

    await expect(twelveDataGet("/quote", { symbol: "NVDA" }, "key")).rejects.toThrow(
      ProviderAuthError
    );
  });

  it("surfaces the vendor's informative message for a non-2xx status with an error body, instead of a bare HTTP code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(404, {
          code: 404,
          status: "error",
          message: "This symbol is available starting with the Grow or Venture plan.",
        })
      )
    );

    await expect(twelveDataGet("/quote", { symbol: "WPP" }, "key")).rejects.toThrow(
      "This symbol is available starting with the Grow or Venture plan."
    );
  });

  it("falls back to a bare HTTP status for a non-2xx response with no parseable error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 500 })));

    await expect(twelveDataGet("/quote", { symbol: "NVDA" }, "key")).rejects.toThrow(
      ProviderUnavailableError
    );
  });
});
