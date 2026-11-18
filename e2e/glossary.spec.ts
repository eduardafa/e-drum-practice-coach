import { expect, openLibrary, test } from "./fixtures";

test("a drumming word shows its definition on focus and hides on Esc", async ({ page }) => {
  await page.goto("/");

  // BPM next to the tempo: focusing it shows the definition, which is also its description.
  const bpm = page.locator(".tempo").getByRole("button", { name: "BPM", exact: true });
  await bpm.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Beats per minute");
  await expect(bpm).toHaveAccessibleDescription(/Beats per minute/);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();

  // In the open library, Esc closes the definition first and leaves the library open.
  await openLibrary(page, "First steps");
  const groove = page.locator(".library").getByRole("button", { name: "groove", exact: true });
  await groove.focus();
  await expect(page.getByRole("tooltip")).toContainText("repeats to keep the beat going");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await expect(page.locator(".library")).toBeVisible();

  // Tapping a word (a click) shows it too.
  await groove.blur();
  await groove.click();
  await expect(page.getByRole("tooltip")).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // In Settings the word sits in a slider's label: the slider keeps its name.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Scoring" }).click();
  await expect(page.getByRole("slider", { name: /On-time window/ })).toBeVisible();
  await page.getByRole("button", { name: "On-time window", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("count as on time");
});
