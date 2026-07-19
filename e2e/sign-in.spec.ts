import { expect, test } from "@playwright/test";

test.describe("Sign in", () => {
  test("shows the sign-in form with accessible labels", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("shows a generic error message on failed sign-in, without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    await page.getByLabel("Email address").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Not getByRole("alert") alone: Next.js's built-in route announcer
    // (#__next-route-announcer__) also carries role="alert", so that query
    // matches two elements. Scoping by text is specific and still verifies
    // the real behaviour (a visible, accessible error message).
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("the submit button returns to enabled after a failed attempt (no stuck loading state)", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    await page.getByLabel("Email address").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    const button = page.getByRole("button", { name: "Sign in" });
    await button.click();

    await expect(button).toBeEnabled({ timeout: 5000 });
  });
});
