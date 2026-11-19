import { test as base } from "@playwright/test";
import { chooseExercise, expect, test } from "./fixtures";

/** Runs in the page before the app: a browser like Safari today (every iPhone browser), without Temporal or Web MIDI. */
function likeSafari() {
  Reflect.deleteProperty(globalThis, "Temporal");
  Reflect.deleteProperty(Navigator.prototype, "requestMIDIAccess");
}

/** The polyfill's chunk, named after the module it comes from. */
const POLYFILL = /temporal|global\.esm/i;

test("without Temporal, the polyfill loads and a session is saved to History", async ({ page, drummer }) => {
  await page.addInitScript(likeSafari);
  const polyfill = page.waitForRequest(POLYFILL);
  await page.goto("/");
  await expect(page.getByText(/doesn't support Web MIDI/)).toBeVisible();
  await polyfill;

  // History stamps each session with Temporal: play a short one on the keyboard and find it there.
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");
  await page.getByLabel("Session length").selectOption("2");
  await page.getByLabel("Countdown before playing").selectOption("0");
  await drummer.play("KeyA");
  await page.getByRole("button", { name: "Play along" }).click();
  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await drummer.stop();
  await results.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".history-open").first()).toContainText("Step 1: Hi-hat on every click");
});

// Plain Playwright: the shared fixtures fail any test whose page logs an error, and this one makes it.
base("if the app can't load, it says so instead of showing a blank page", async ({ page }) => {
  await page.addInitScript(likeSafari);
  await page.route(POLYFILL, (route) => route.abort());
  await page.goto("/");

  const crash = page.getByRole("alert");
  await expect(crash.getByRole("heading")).toHaveText("Something went wrong");
  await expect(crash.getByRole("button", { name: "Reload" })).toBeVisible();
  await crash.getByText("Details").click();
  await expect(crash.locator("pre")).toContainText(/import|fetch|module/i);
});

test("a browser with Temporal doesn't download the polyfill", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Choose an exercise" })).toBeVisible();
  expect(requested.filter((url) => POLYFILL.test(url))).toEqual([]);
});
