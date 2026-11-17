import { chooseExercise, expect, percentOf, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Step 1 of First steps: the hi-hat on every click, which the drummer plays.
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");
  await page.getByLabel("Session length").selectOption("2");
  await page.getByLabel("Countdown before playing").selectOption("0");
});

test("a play-along session is scored and its results are saved to History", async ({ page, drummer }) => {
  await drummer.play("KeyA");
  await page.getByRole("button", { name: "Play along" }).click();

  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await drummer.stop();
  await expect(results.getByRole("heading")).toContainText("Step 1: Hi-hat on every click");
  expect(await percentOf(results.locator(".results-score").textContent())).toBeGreaterThanOrEqual(90);
  // Four clicks a bar, two loops: every note on time, none missed, nothing extra.
  await expect(results.locator("dt", { hasText: "On time" }).locator("+ dd")).toHaveText("8 of 8");
  await expect(results.locator("dt", { hasText: "Missed" }).locator("+ dd")).toHaveText("0");
  await expect(results.locator("dt", { hasText: "Extra hits" }).locator("+ dd")).toHaveText("0");

  await results.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator(".history-open").first()).toContainText("Step 1: Hi-hat on every click");
});

test("the tempo trainer speeds up after a clean round and stops at the target", async ({ page, drummer }) => {
  await page.getByRole("button", { name: "Tempo trainer" }).click();
  const trainer = page.locator(".trainer");
  await trainer.getByLabel("Start", { exact: false }).fill("60");
  await trainer.getByLabel("Target").fill("64");
  await trainer.getByLabel("Step").fill("4");
  await drummer.play("KeyA");
  await trainer.getByRole("button", { name: "Start training" }).click();

  await expect(trainer.locator(".calibration-headline")).toContainText("Round 1", { timeout: 30_000 });
  await expect(trainer).toContainText("Next round at 64 BPM");
  await expect(trainer.locator(".calibration-headline")).toHaveText("You reached 64 BPM!", { timeout: 40_000 });
  await expect(trainer).toContainText("2 rounds, from 60 BPM.");
  await drummer.stop();
});
