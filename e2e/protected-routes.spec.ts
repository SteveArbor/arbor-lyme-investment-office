import { expect, test } from "@playwright/test";

test.describe("Protected routes", () => {
  test("redirects an unauthenticated visitor from the dashboard to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("redirects an unauthenticated visitor from settings to sign-in", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("redirects the root path toward sign-in for an unauthenticated visitor", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
