import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixtureReview, reviewUrl } from "./fixtures";

test("a saved review reopens the selected fight, video moment and calibration", async ({ page }) => {
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=40");
  await page.getByRole("button", { name: "Align fight start to current video time" }).click();
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Review saved in this browser." })).toBeVisible();
  await page.getByRole("link", { name: /New review/ }).click();
  const saved = page.getByRole("region", { name: "Saved reviews" });
  await expect(saved.getByText(/Saturday progression/)).toBeVisible();
  await saved.getByRole("link", { name: /Saturday progression/ }).click();
  await expect(page.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("1");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __players: { time: number }[] }).__players.at(-1)?.time)).toBe(100);
});

test("moment links work in a fresh browser and recover when the clipboard is denied", async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } });
  });
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=40");
  await page.getByRole("button", { name: "Align fight start to current video time" }).click();
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await page.getByRole("button", { name: "Copy moment link" }).click();
  const link = await page.getByLabel("Moment link").inputValue();
  expect(new URL(link).searchParams.get("startSeconds")).toBe("100");
  expect(new URL(link).searchParams.get("syncOffset")).toBe("20");
  const other = await browser.newContext();
  try {
    const recipient = await other.newPage();
    await fixtureReview(recipient);
    await recipient.goto(link);
    await expect(recipient.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
    await expect(recipient.getByRole("button", { name: "Copy moment link" })).toBeEnabled();
    await recipient.getByRole("button", { name: /Moonleaf/ }).click();
    await expect(recipient.getByRole("status").filter({ hasText: "Video moved to 1:40." })).toBeVisible();
  } finally { await other.close(); }
});

test("timestamped notes survive reload, support editing and export a useful debrief", async ({ page }, testInfo) => {
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=40");
  await page.getByRole("button", { name: "Align fight start to current video time" }).click();
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Use a defensive before the roar.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.reload();
  const notes = page.getByRole("region", { name: "Review notes", exact: true });
  await expect(notes.getByText("Use a defensive before the roar.", { exact: true })).toBeVisible();
  await notes.getByRole("button", { name: "Edit note" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Moonleaf: use a defensive before the roar.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  expect(text).toContain("Moonleaf: use a defensive before the roar.");
  expect(text).toContain("startSeconds=100&syncOffset=20");
  expect(text).toContain("Stone Warden");
  await notes.getByRole("button", { name: "Delete note" }).click();
  await expect(notes.getByText("Moonleaf: use a defensive before the roar.", { exact: true })).toBeHidden();
  await notes.getByRole("button", { name: "Undo delete" }).click();
  await expect(notes.getByText("Moonleaf: use a defensive before the roar.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../work/goal-improvement/evidence/workspace-release/notebook-" + testInfo.project.name + ".png", fullPage: true });
});

test("unavailable storage retains the note draft and never reports a successful save", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await fixtureReview(page);
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Keep this unsaved observation.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("Keep this unsaved observation.");
  await expect(page.getByRole("alert").filter({ hasText: /could not be saved/i })).toBeVisible();
  await expect(page.getByText("Note saved in this browser.", { exact: true })).toBeHidden();
});

test("notes capture a fixed video moment and restore its fight and shared calibration", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wcl-vod-review:sync:SyntheticReport1:youtube:localVideo1", "33"));
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=100&syncOffset=20");
  await expect(page.getByRole("button", { name: "Copy moment link" })).toBeEnabled();
  await expect(page.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
  await page.getByLabel("Fight", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("The observed fight matters, even if another fight is selected.");
  // External SDK boundary: playback continues while the user writes.
  await page.evaluate(() => { (window as unknown as { __players: { time: number }[] }).__players.at(-1)!.time = 150; });
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const noteLink = page.getByRole("region", { name: "Review notes", exact: true }).getByRole("link", { name: /1:40 Fight 1/ });
  await expect(noteLink).toHaveAttribute("href", /fightId=1&startSeconds=100&syncOffset=20$/);
  await noteLink.click();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("1");
  await expect(page.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("wcl-vod-review:sync:SyntheticReport1:youtube:localVideo1"))).toBe("33");
  await page.goto(reviewUrl);
  await expect(page.getByText("Offset 0:33.0", { exact: true })).toBeVisible();
});

test("saved reviews update across tabs and removal can be undone with notes intact", async ({ page }, testInfo) => {
  await fixtureReview(page);
  await page.goto("/");
  const second = await page.context().newPage();
  try {
    await fixtureReview(second);
    await second.goto(reviewUrl + "&startSeconds=100&syncOffset=20");
    await second.getByRole("button", { name: "Add note at current time" }).click();
    await second.getByLabel("Review note", { exact: true }).fill("Keep the raid plan when returning.");
    await second.getByRole("button", { name: "Save note", exact: true }).click();
    const saved = page.getByRole("region", { name: "Saved reviews" });
    await expect(saved.getByText(/Video 1:40 · 1 note/)).toBeVisible();
    await saved.getByRole("button", { name: /Remove saved review and its notes/ }).click();
    await expect(saved.getByText("No saved reviews yet.")).toBeVisible();
    await saved.getByRole("button", { name: "Undo removal" }).click();
    await expect(saved.getByText(/Video 1:40 · 1 note/)).toBeVisible();
    await page.screenshot({ path: "../work/goal-improvement/evidence/workspace-release/saved-reviews-" + testInfo.project.name + ".png", fullPage: true });
    await saved.getByRole("link", { name: /Saturday progression/ }).click();
    await expect(page.getByText("Keep the raid plan when returning.", { exact: true })).toBeVisible();
  } finally { await second.close(); }
});

test("damaged or unknown-version storage is preserved and quota failure retains a draft", async ({ page }) => {
  await fixtureReview(page);
  await page.goto("/");
  for (const value of ["{broken", '{"version":99,"reviews":[]}']) {
    await page.evaluate(value => localStorage.setItem("wcl-vod-review:reviews:v1", value), value);
    await page.goto(reviewUrl);
    await page.getByRole("button", { name: "Save review", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Existing browser data has been left unchanged/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("wcl-vod-review:reviews:v1"))).toBe(value);
  }
  await page.evaluate(() => {
    localStorage.removeItem("wcl-vod-review:reviews:v1");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "wcl-vod-review:reviews:v1") throw new DOMException("Full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Copy this draft if the browser is full.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /unavailable or full/ })).toBeVisible();
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("Copy this draft if the browser is full.");
});

test("a full library does not evict existing reviews, and clipboard success is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wcl-vod-review:reviews:v1", JSON.stringify({ version: 1, reviews: Array.from({ length: 20 }, (_, i) => ({
      wclCode: "PriorReport" + i, platform: "youtube", vodId: "localVideo1", fightId: 1, startSeconds: 100, syncOffset: 20,
      title: "Earlier review " + i, fightName: "Stone Warden", updatedAt: 1, notes: [],
    })) }));
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => {
      (window as unknown as { copiedLink: string }).copiedLink = text;
    } } });
  });
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=100&syncOffset=20");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You have 20 saved reviews" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wcl-vod-review:reviews:v1")!).reviews.length)).toBe(20);
  await page.getByRole("button", { name: "Copy moment link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moment link copied." })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink)).toContain("startSeconds=100&syncOffset=20");
});

test("a busy notebook fits a narrow screen, protects drafts and exports every note", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("wcl-vod-review:reviews:v1", JSON.stringify({ version: 1, reviews: [{
    wclCode: "SyntheticReport1", platform: "youtube", vodId: "localVideo1", fightId: 1, startSeconds: 100, syncOffset: 20,
    title: "Busy review", fightName: "The Stone Warden", updatedAt: 1,
    notes: Array.from({ length: 100 }, (_, i) => ({ id: "note" + i, text: i === 0 ? "LongObservation".repeat(120) : "Observation " + i,
      startSeconds: 100 + i, syncOffset: 20, fightId: 1, fightName: "The Stone Warden", createdAt: i })),
  }] })));
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=100&syncOffset=20");
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("A draft to keep.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This review has 100 notes" })).toBeVisible();
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("A draft to keep.");
  const dialogPromise = page.waitForEvent("dialog").then(async dialog => { expect(dialog.message()).toContain("unsaved note"); await dialog.dismiss(); });
  await page.getByRole("link", { name: /New review/ }).click();
  await dialogPromise;
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("A draft to keep.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  const content = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(content.match(/\[Open this moment\]/g)).toHaveLength(100);
  expect(content).toContain("Observation 99");
});
