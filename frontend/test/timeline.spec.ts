import { test, expect } from "@playwright/test";
import { fixtureReview, reviewUrl, report } from "./fixtures";

test("incomplete timeline links give a way back instead of loading forever", async ({ page }) => {
  await page.goto("/timeline");
  await expect(page.getByRole("link", { name: /new review/i })).toBeVisible();
  await expect(page.getByText("Loading report data...")).toBeHidden();
});

test("a failed report can be retried without re-entering links", async ({ page }) => {
  await fixtureReview(page);
  let failing = true;
  await page.route("**/api/wcl/reports/SyntheticReport1", async route => {
    if (failing) await route.fulfill({ status: 503, json: { error: "Report temporarily unavailable" } });
    else await route.fallback();
  });
  await page.goto(reviewUrl);
  await expect(page.getByText("Report temporarily unavailable")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry report" }).click();
  await expect(page.getByRole("heading", { name: /Saturday progression/ })).toBeVisible();
});

test("events have visible loading, failure, retry and empty states", async ({ page }) => {
  await fixtureReview(page);
  let failing = true;
  await page.route("**/api/wcl/reports/SyntheticReport1/events", async route => {
    if (failing) await route.fulfill({ status: 503, json: { error: "Events temporarily unavailable" } });
    else await route.fallback();
  });
  await page.goto(reviewUrl);
  await expect(page.getByText("Events temporarily unavailable")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry events" }).click();
  await expect(page.getByRole("button", { name: /Moonleaf/ })).toBeVisible();
  await page.getByLabel("Fight", { exact: true }).selectOption("2");
  await expect(page.getByText("No tracked events in this fight.")).toBeVisible();
});

test("calibration can align a fight without dragging and survive reload", async ({ page }) => {
  await fixtureReview(page);
  await page.goto(reviewUrl + "&startSeconds=40");
  await expect(page.getByText("Synthetic video preview")).toBeVisible();
  await page.getByRole("button", { name: "Align fight start to current video time" }).click();
  await expect(page.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Video moved to 1:40." })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Offset 0:20.0", { exact: true })).toBeVisible();
});

test("blocked browser storage does not prevent review or calibration", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await fixtureReview(page);
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Earlier 0.5s" }).click();
  await expect(page.getByText("Offset 0:00.5", { exact: true })).toBeVisible();
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
});

test("metadata failure preserves events and can be retried", async ({ page }) => {
  await fixtureReview(page);
  let failing = true;
  await page.route("**/api/video-metadata/**", async route => {
    if (failing) await route.fulfill({ status: 503, json: { error: "Video details unavailable." } });
    else await route.fallback();
  });
  await page.goto(reviewUrl);
  await expect(page.getByRole("button", { name: /Moonleaf/ })).toBeVisible();
  await expect(page.getByText(/Video details unavailable/)).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry video details" }).click();
  await expect(page.getByText("Synthetic raid video")).toBeVisible();
});

test("review controls fit the viewport and remain usable after interaction", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fixtureReview(page);
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Fit report" }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Pan later" }).click();
  await page.getByRole("button", { name: "Pan earlier" }).click();
  await page.getByRole("button", { name: "Fit fight" }).click();
  await page.getByRole("button", { name: "Unlocked", exact: true }).click();
  await expect(page.getByRole("button", { name: "Locked", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Later 0.5s" }).click();
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await expect(page.getByRole("button", { name: /Shattering roar/ })).toHaveCount(0);
  const death = page.getByRole("button", { name: /Moonleaf/ });
  await death.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Video moved to 2:00." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "../work/goal-improvement/evidence/review-" + testInfo.project.name + ".png", fullPage: true });
});

test("long content, pagination and empty reports remain usable at 320px with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixtureReview(page);
  await page.route("**/api/wcl/reports/SyntheticReport1", route => route.fulfill({ json: {
    ...report, title: "Saturday progression · A very long synthetic guild report title with many words",
  } }));
  await page.route("**/api/wcl/reports/SyntheticReport1/events", route => route.fulfill({ json: {
    events: Array.from({ length: 51 }, (_, i) => ({ timestamp: 61000 + i * 1000, type: "Casts", abilityGameID: 123,
      abilityInfo: { gameID: 123, name: "Shattering roar with a long synthetic ability name " + i } })),
  } }));
  await page.goto(reviewUrl);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next events" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next events" }).click();
  await expect(page.getByRole("button", { name: /ability name 50$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next events" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous events" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await expect(page.getByText("No tracked events match this filter.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "../work/goal-improvement/evidence/narrow-empty-filter.png", fullPage: true });
  await page.route("**/api/wcl/reports/SyntheticReport1", route => route.fulfill({ json: { ...report, fights: [] } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "No boss fights in this report" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← New review" })).toBeVisible();
});
