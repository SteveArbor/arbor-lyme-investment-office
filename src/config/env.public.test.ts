import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPublicEnv() memoizes after its first successful call, so each test
// re-imports the module fresh (vi.resetModules) to observe validation
// behaviour in isolation rather than a cached result from a prior test.

describe("getPublicEnv", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns parsed values when all required variables are present and valid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const { getPublicEnv } = await import("./env.public");
    const env = getPublicEnv();

    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("throws a clear error naming missing variables, without requiring them to build", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);

    const { getPublicEnv } = await import("./env.public");

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_APP_URL/);
  });

  it("throws when a variable is present but malformed (not a URL)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-valid-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const { getPublicEnv } = await import("./env.public");

    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("never echoes the submitted values back in the error message", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-valid-url-marker-xyz");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const { getPublicEnv } = await import("./env.public");

    expect(() => getPublicEnv()).not.toThrowError(/not-a-valid-url-marker-xyz/);
  });
});
