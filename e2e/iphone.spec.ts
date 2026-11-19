import { expect, test } from "./fixtures";

// Chrome on an iPhone: Safari's engine underneath, so no Web MIDI, whatever the browser's name.
test.use({
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.0.0 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
});

test("on an iPhone, the app says the kit can't connect there instead of suggesting Chrome", async ({ page }) => {
  await page.addInitScript(() => Reflect.deleteProperty(Navigator.prototype, "requestMIDIAccess"));
  await page.goto("/");

  await expect(page.locator(".topbar")).toContainText("Kit can't connect on iPhone");
  await expect(page.getByText(/Use Chrome/)).toHaveCount(0);
  const note = page.getByRole("note");
  await expect(note).toContainText("The kit can't connect on an iPhone.");
  await expect(note).toContainText("open the app on a computer or an Android phone");
  // No keyboard on a phone: the keyboard hint gives way to the note.
  await expect(page.getByText("No kit? Use the keyboard")).toHaveCount(0);
});
