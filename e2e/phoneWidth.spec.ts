import { expect, test } from "./fixtures";

// The narrowest common phone width.
test.use({ viewport: { width: 320, height: 640 } });

test("on a phone, the top bar wraps its text instead of making the page scroll sideways", async ({ page }) => {
  // Signed out (Sign in shows), and no Web MIDI: the longest kit status the top bar can hold.
  await page.route("**/api/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: null, providers: ["github"] }) }),
  );
  await page.addInitScript(() => Reflect.deleteProperty(Navigator.prototype, "requestMIDIAccess"));
  await page.goto("/");

  const topbar = page.locator(".topbar");
  await expect(topbar.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(topbar).toContainText("doesn't support Web MIDI");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
