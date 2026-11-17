import { chooseExercise, expect, test } from "./fixtures";

// Step 4 of First steps: hi-hat and kick together on 1 and 3. The drummer's kick comes 35 ms after the hi-hat.
test("a kick that keeps landing after the hi-hat is called out on the results", async ({ page, drummer }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 4: Hi-hat and kick");
  await page.getByLabel("Session length").selectOption("4");
  await page.getByLabel("Countdown before playing").selectOption("0");
  await drummer.play([
    { code: "KeyA", lateMs: 0 },
    { code: "Space", lateMs: 35 },
  ]);
  await page.getByRole("button", { name: "Play along" }).click();

  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 40_000 });
  await drummer.stop();
  const note = results.locator(".together-note");
  await expect(note).toContainText("your kick lands about");
  await expect(note).toContainText("after the hi-hat");
});

test("hits that land together get no note", async ({ page, drummer }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 4: Hi-hat and kick");
  await page.getByLabel("Session length").selectOption("4");
  await page.getByLabel("Countdown before playing").selectOption("0");
  await drummer.play([
    { code: "KeyA", lateMs: 0 },
    { code: "Space", lateMs: 0 },
  ]);
  await page.getByRole("button", { name: "Play along" }).click();

  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 40_000 });
  await drummer.stop();
  await expect(results.locator(".results-score")).toBeVisible();
  await expect(results.locator(".together-note")).toHaveCount(0);
});
