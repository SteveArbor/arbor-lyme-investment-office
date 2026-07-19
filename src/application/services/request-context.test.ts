import { describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();

// createSupabaseServerClient transitively imports "server-only" and
// next/headers' cookies() — neither works under plain Vitest (correct in a
// real Next.js server context, not this unit test). Mocked at the module
// boundary so this stays a focused test of getRequestContext's own control
// flow, not an accidental integration test of Supabase client construction.
vi.mock("@/infrastructure/auth", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const { getRequestContext } = await import("./request-context");

describe("getRequestContext", () => {
  it("returns null when there is no authenticated session", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const context = await getRequestContext();

    expect(context).toBeNull();
  });

  it("returns the user and composed services when a session exists", async () => {
    const fakeUser = { id: "user-1", email: "user@example.com" };
    mockGetUser.mockResolvedValueOnce({ data: { user: fakeUser } });

    const context = await getRequestContext();

    expect(context?.user).toBe(fakeUser);
    expect(context?.services.companyService).toBeDefined();
    expect(context?.services.tradingService).toBeDefined();
  });
});
