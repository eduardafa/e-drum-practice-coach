import { chooseExercise, expect, openLibrary, test } from "./fixtures";

test("the notation guide pages through engraved examples and closes with Esc", async ({ page }) => {
  await page.goto("/");
  await chooseExercise(page, "First steps", "Step 1: Hi-hat on every click");
  await page.getByRole("button", { name: "How to read this" }).click();

  const guide = page.getByRole("region", { name: "How to read drum notation" });
  await expect(guide).toBeVisible();
  const next = guide.getByRole("button", { name: "Next" });

  // Each page has its own engraved example; Next until the last page offers Step 1.
  const pageThrough = async (seen: string[]): Promise<string[]> => {
    const title = (await guide.locator("h3").textContent()) ?? "";
    expect(seen).not.toContain(title);
    await expect(guide.locator(".notation-guide-score svg")).toBeVisible();
    if (!(await next.isVisible())) return [...seen, title];
    await next.click();
    await expect(guide.locator("h3")).not.toHaveText(title);
    return pageThrough([...seen, title]);
  };
  const titles = await pageThrough([]);
  expect(titles.length).toBeGreaterThan(1);
  await expect(guide.getByRole("button", { name: "Try Step 1" })).toBeVisible();

  await guide.getByRole("button", { name: "Back" }).click();
  await expect(guide.locator("h3")).toHaveText(titles.at(-2) ?? "");

  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
});

test("the library's First steps open the guide, and its last page starts Step 1", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "First steps");
  await page.getByRole("button", { name: "How to read drum notation" }).click();
  const guide = page.getByRole("region", { name: "How to read drum notation" });
  await expect(guide).toBeVisible();
  await expect(page.getByRole("region", { name: "Exercises" })).toBeHidden();

  const toEnd = async (): Promise<void> => {
    const next = guide.getByRole("button", { name: "Next" });
    if (!(await next.isVisible())) return;
    await next.click();
    return toEnd();
  };
  await toEnd();
  await guide.getByRole("button", { name: "Try Step 1" }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByRole("button", { name: /Step 1: Hi-hat on every click/ })).toBeVisible();
});
