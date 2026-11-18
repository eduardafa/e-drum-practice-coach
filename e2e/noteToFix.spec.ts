import { chooseExercise, expect, test } from "./fixtures";

// Step 3 of First steps: kick on 1 and 3, snare on 2 and 4. The drummer only ever plays the kick.
test("a note skipped every loop is named and ringed on the results", async ({ page, drummer }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 3: Kick and snare");
  await page.getByLabel("Session length").selectOption("2");
  await page.getByLabel("Countdown before playing").selectOption("0");
  await drummer.play("Space");
  await page.getByRole("button", { name: "Play along" }).click();

  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 30_000 });
  await drummer.stop();
  const fix = results.locator(".note-to-fix");
  await expect(fix).toContainText("The snare on beats 2 and 4 was missed 4 of 4 times.");
  // Both snare notes ringed as missed on the small staff.
  await expect(fix.locator(".note-to-fix-score svg")).toBeVisible();
  await expect(fix.locator(".mark.missed")).toHaveCount(2);
});
