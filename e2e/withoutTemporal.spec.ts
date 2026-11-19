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

test("a browser with Temporal doesn't download the polyfill", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Choose an exercise" })).toBeVisible();
  expect(requested.filter((url) => POLYFILL.test(url))).toEqual([]);
});
