import { chooseExercise, expect, test } from "./fixtures";

// A fresh browser, so the card opens on its own the first time.
test.use({ beforeYouPlaySeen: false });

test("the Before you play card opens once for First steps, and again from the guide", async ({ page }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");

  const card = page.getByRole("dialog", { name: "Before you play" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("listitem")).not.toHaveCount(0);
  await expect(card).toContainText("hi-hat pedal");
  // Focus starts inside the card, on its only button.
  await expect(card.getByRole("button", { name: "Got it" })).toBeFocused();
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toBeHidden();

  // Dismissed for good: another First steps exercise, and a reload, don't bring it back.
  // With an exercise chosen, the library opens from its name above the staff.
  await page.getByRole("button", { name: "Step 1: Hi-hat on every click" }).click();
  await page.getByRole("tab", { name: "First steps" }).click();
  await page.getByRole("listitem").filter({ hasText: "Step 3: Kick and snare" }).getByRole("button", { name: "Practice this" }).click();
  await expect(page.getByRole("button", { name: "Step 3: Kick and snare" })).toBeVisible();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Step 3: Kick and snare" })).toBeVisible();
  await expect(card).toBeHidden();

  // The metronome guide opens it again; Esc closes it and focus goes back to the guide's button.
  await page.getByRole("button", { name: /Open the guide|How to play with the metronome/ }).click();
  const reopen = page.getByRole("button", { name: "Before you play" });
  await reopen.click();
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(reopen).toBeFocused();
  // Esc closed only the card, not the guide behind it.
  await expect(page.getByRole("heading", { name: "How to play with the metronome" })).toBeVisible();
});
