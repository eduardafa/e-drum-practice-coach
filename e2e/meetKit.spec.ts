import type { Page } from "@playwright/test";
import { expect, openLibrary, test } from "./fixtures";

/** The app's keyboard fallback, by the tour's names for the pads. */
const KEYS: [RegExp, string][] = [
  [/hi-hat pedal/i, "KeyZ"],
  [/hi-hat/i, "KeyA"],
  [/snare/i, "KeyS"],
  [/kick/i, "Space"],
  [/crash/i, "KeyQ"],
  [/ride/i, "KeyR"],
  [/tom 1/i, "KeyW"],
  [/tom 2/i, "KeyE"],
  [/tom 3/i, "KeyD"],
];

function keyFor(name: string): string {
  const key = KEYS.find(([pattern]) => pattern.test(name))?.[1];
  if (!key) throw new Error(`No key for "${name}"`);
  return key;
}

async function hit(page: Page, code: string) {
  await page.keyboard.press(code);
}

/**
 * Answers the pads asked for, one after another (each waits for the one before):
 * from step `at` to `of`, where `meta(at)` is the panel's progress line.
 */
async function answer(page: Page, meta: (at: number) => string, at: number, of: number): Promise<void> {
  if (at > of) return;
  const panel = page.locator(".kit-tour");
  await expect(panel.locator(".calibration-meta")).toHaveText(meta(at));
  const asked = (await panel.locator(".kit-tour-name").textContent()) ?? "";
  await hit(page, keyFor(asked.replace("Hit the ", "")));
  await answer(page, meta, at + 1, of);
}

test("step 0 tours the kit pad by pad, then quizzes it, and leads to step 1", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Meet your kit" }).click();
  const panel = page.locator(".kit-tour");
  const name = panel.locator(".kit-tour-name");

  // The tour: a wrong pad doesn't move on, the right one does.
  await expect(panel.locator(".calibration-meta")).toHaveText("Pad 1 of 9");
  await expect(name).toHaveText("Hi-hat");
  await expect(panel.locator(".kit-tour-staff svg")).toBeVisible();
  await hit(page, "KeyS");
  await expect(panel.locator(".kit-tour-feedback")).toContainText("That was the snare. Find the hi-hat");
  await expect(panel.locator(".calibration-meta")).toHaveText("Pad 1 of 9");
  await answer(page, (at) => `Pad ${at} of 9`, 1, 9);

  // The quiz: one wrong answer, then all right.
  await expect(panel.locator(".calibration-meta")).toHaveText("Quiz · 1 of 6");
  const asked = (await name.textContent()) ?? "";
  await hit(page, keyFor(asked) === "KeyS" ? "KeyA" : "KeyS");
  await expect(panel.locator(".kit-tour-feedback")).toContainText("is lit up now");
  await answer(page, (at) => `Quiz · ${at} of 6`, 1, 6);

  await expect(panel.locator(".results-score")).toHaveText("5 of 6");
  await panel.getByRole("button", { name: /^Next: Step 1/ }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".exercise-button")).toContainText("Step 1: Hi-hat on every click");

  // Done is remembered: the prompt doesn't come back.
  await page.reload();
  await expect(page.getByRole("button", { name: "Meet your kit" })).toHaveCount(0);
  // And History lists it as step 0 of part 1, done.
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".first-steps-list li").first()).toContainText("Step 0: Meet your kit");
  await expect(page.locator(".first-steps-list li").first()).toContainText("Done");
});

test("step 0 is in the First steps tab of the library", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "First steps");
  await page.getByRole("button", { name: "Start the tour" }).click();
  await expect(page.locator(".kit-tour .kit-tour-name")).toHaveText("Hi-hat");
  await page.keyboard.press("Escape");
  await expect(page.locator(".kit-tour")).toHaveCount(0);
});
