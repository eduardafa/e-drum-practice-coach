import { chooseExercise, expect, percentOf, test } from "./fixtures";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    /** How many spoken syllables the page has scheduled. */
    syllablesSaid?: number;
  }
}

/** Counts the spoken count's syllables: each is a slice of one sound (AudioBufferSourceNode.start with an offset). */
function hookVoice() {
  window.syllablesSaid = 0;
  // oxlint-disable-next-line typescript/unbound-method -- wrapped below, and always called with the node as `this`
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
    if (args[1] !== undefined) window.syllablesSaid = (window.syllablesSaid ?? 0) + 1;
    start.apply(this, args);
  };
}

const syllablesSaid = (page: Page) => page.evaluate(() => window.syllablesSaid ?? 0);

/** Plays a two-loop session of the chosen exercise, the drummer on the hi-hat, and returns its score. */
async function playSession(page: Page, drummer: { play(code: string): Promise<void>; stop(): Promise<void> }) {
  await drummer.play("KeyA");
  await page.getByRole("button", { name: "Play along" }).click();
  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await drummer.stop();
  const score = await percentOf(results.locator(".results-score").textContent());
  await results.getByRole("button", { name: "Close" }).click();
  return score;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hookVoice);
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");
  await page.getByLabel("Session length").selectOption("2");
  await page.getByLabel("Countdown before playing").selectOption("0");
});

test("First steps count out loud by default, and the session still scores", async ({ page, drummer }) => {
  expect(await playSession(page, drummer)).toBeGreaterThanOrEqual(90);
  // A bar of count-in and two loops of four beats, each beat said.
  expect(await syllablesSaid(page)).toBeGreaterThanOrEqual(8);
});

test("the spoken count can be turned off in Settings", async ({ page, drummer }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const countOutLoud = page.getByLabel("Count out loud");
  await expect(countOutLoud).toHaveValue("firstSteps");
  await countOutLoud.selectOption("never");
  await expect(page.getByLabel("Keep the click while counting")).toBeDisabled();
  await page.getByRole("button", { name: "Close settings" }).click();

  expect(await playSession(page, drummer)).toBeGreaterThanOrEqual(90);
  expect(await syllablesSaid(page)).toBe(0);
});
