import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Uses fake-but-well-formed Supabase env values (see webServer.env below)
 * so the app boots and every non-authenticated journey — sign-in
 * rendering, generic error messages, route protection, 404 handling — is
 * exercisable without a real Supabase project. The one authenticated
 * journey that genuinely needs real credentials is skipped by default;
 * see e2e/authenticated-journey.spec.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key-for-e2e-tests",
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
