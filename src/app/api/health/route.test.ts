import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns status ok with environment, commit, and timestamp fields", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.environment).toBe("string");
    expect(typeof body.commit).toBe("string");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it("does not expose secrets, database URLs, or dependency versions", async () => {
    const response = await GET();
    const bodyText = await response.text();

    expect(bodyText).not.toMatch(/supabase\.co/i);
    expect(bodyText).not.toMatch(/postgres/i);
    expect(bodyText).not.toMatch(/key/i);
    expect(bodyText).not.toMatch(/secret/i);
  });

  it("sets Cache-Control: no-store so the timestamp is never cached", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
