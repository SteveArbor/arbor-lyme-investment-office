import { expect, test } from "@playwright/test";

/**
 * Prepared but not run without real credentials, per the Foundation
 * brief ("one authenticated journey may be prepared but should not
 * require real production credentials"). Signing in successfully requires
 * a real Supabase project with a real test user — this environment has
 * neither (see docs/local-supabase-strategy.md: a hosted dev project is
 * recommended but has not been created). Skipped rather than deleted, so
 * setting E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD (against a
 * disposable Supabase test account, never a real one) is the only change
 * needed to run it.
 */
test.skip(
  !process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD,
  "Requires E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD against a real Supabase project"
);

test("a real user can sign in, reach the dashboard, and sign out", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email address").fill(process.env.E2E_TEST_USER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Investment Office" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});
