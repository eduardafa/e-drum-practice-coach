import type { Page } from "@playwright/test";
import { expect, openLibrary, percentOf, test } from "./fixtures";
import { clickSong, rockBeatGuitarPro, rockBeatMidi, type TestFile } from "./media";

/** Opens a song from the Songs tab and waits for its beats to be found. */
async function openSong(page: Page, file: TestFile): Promise<void> {
  await openLibrary(page, "Songs");
  await page.locator('input[type=file][accept*=".mp3"]').setInputFiles(file);
  await expect(page.getByRole("button", { name: "Loop this part" })).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("playing along to a song is scored against its beats", async ({ page, drummer }) => {
  await openSong(page, clickSong());
  // The beat finder found the song's 120 BPM.
  await expect(page.locator(".song-tempo")).toContainText("120");
  // The switch's checkbox is drawn by its label (the input itself takes no space), so press the label.
  await page.locator("label.switch", { hasText: "Click on the beats" }).click();
  await expect(page.getByRole("switch", { name: "Click on the beats" })).toBeChecked();
  await page.getByLabel("Countdown before playing").selectOption("0");

  await drummer.play("Space");
  await page.getByRole("button", { name: "Play along" }).click();
  await page.waitForTimeout(12_000);
  await page.getByRole("button", { name: "Stop" }).click();
  await drummer.stop();

  const results = page.locator("dialog.song-results");
  await expect(results).toBeVisible();
  await expect(results.getByRole("heading").first()).toContainText("Test Song");
  expect(await percentOf(results.locator(".results-score").textContent())).toBeGreaterThanOrEqual(80);
});

test("a section of a song loops", async ({ page }) => {
  await openSong(page, clickSong());
  await page.getByRole("button", { name: "Loop this part" }).click();
  await expect(page.locator(".song-loop-label")).toContainText("Repeating");
  await expect(page.getByRole("button", { name: "Speed up as I get it" })).toBeVisible();
  await page.getByRole("button", { name: "Clear loop" }).click();
  await expect(page.getByRole("button", { name: "Loop this part" })).toBeVisible();
});

test("a MIDI drum tab and a Guitar Pro one open with a song, as notation", async ({ page }) => {
  await openSong(page, clickSong());
  const tab = page.locator(".drum-tab");
  await tab.locator("input[type=file]").setInputFiles(rockBeatMidi());
  await expect(tab.locator(".drum-tab-name")).toHaveText("Tab: Rock Beat");
  await expect(tab.locator(".tab-notation svg")).toBeVisible();

  await tab.locator("input[type=file]").setInputFiles(rockBeatGuitarPro());
  await expect(tab.locator(".drum-tab-name")).toHaveText("Tab: Rock Beat");
  await expect(tab.locator(".tab-notation svg")).toBeVisible();
  await expect(tab.locator(".warn-note")).toHaveCount(0);
});

test("a Guitar Pro tab opens on its own, without a song", async ({ page }) => {
  await openLibrary(page, "Songs");
  await page.locator(".song-open-button.secondary-look input[type=file]").setInputFiles(rockBeatGuitarPro());
  await expect(page.getByRole("button", { name: "Close tab" })).toBeVisible();
  await expect(page.locator(".drum-tab .tab-notation svg")).toBeVisible();
  await expect(page.getByLabel("Speed")).toBeVisible();
});
