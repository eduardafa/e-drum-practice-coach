import { chooseExercise, expect, test } from "./fixtures";

// Step 1 of First steps, with the click quiet for one bar in two. The drummer keeps playing through the quiet bars,
// but 40 ms early: the results say it sped up without the click.
test("the click drops out for a bar, and the results say how time held without it", async ({ page, drummer }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");
  await page.getByLabel("Session length").selectOption("4");
  await page.getByLabel("Countdown before playing").selectOption("0");
  await page.getByLabel("Quiet bars").selectOption({ label: "Quiet bar: 1 in 2" });
  await drummer.play("KeyA", { lateMs: -40 });
  await page.getByRole("button", { name: "Play along" }).click();

  // During a quiet bar the kit view says the silence is on purpose.
  await expect(page.locator(".quiet-bar")).toContainText("Keep going", { timeout: 20_000 });

  const results = page.locator(".results");
  await expect(results).toBeVisible({ timeout: 40_000 });
  await drummer.stop();
  await expect(results.locator("dt", { hasText: "Missed" }).locator("+ dd")).toHaveText("0");
  await expect(results.locator(".quiet-bars-note")).toContainText("In the quiet bars you sped up");
  await expect(results.locator(".quiet-bars-note")).toContainText("with the click");
});
