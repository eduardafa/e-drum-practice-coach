import { chooseExercise, expect, test } from "./fixtures";

// Step 4 of First steps: hi-hat eighth notes, with the kick on beats 1 and 3.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 4: Hi-hat and kick");
});

test("tapping a note names its drums and hands, and the key shows which drum is which", async ({ page }) => {
  const strip = page.getByRole("region", { name: "Exercise notation" });
  const key = strip.locator(".staff-key");
  await expect(key.getByText("Which drum is which")).toBeVisible();
  await expect(key.getByRole("listitem")).toHaveText(["Hi-hat: an x just above the top line", "Kick: the bottom space"]);

  await strip.getByRole("button", { name: "Beat 1: Hi-hat, right hand; Kick, right foot" }).click();
  const label = strip.locator(".note-label");
  await expect(label).toContainText("Hi-hat, right hand");
  await expect(label).toContainText("Kick, right foot");

  // The arrow keys move to the next note, and Esc closes the label.
  await page.keyboard.press("ArrowRight");
  await expect(strip.getByRole("button", { name: 'The "&" of beat 1: Hi-hat, right hand' })).toBeFocused();
  await expect(label).toHaveText('The "&" of beat 1Hi-hat, right hand');
  await page.keyboard.press("Escape");
  await expect(label).toBeHidden();
});
