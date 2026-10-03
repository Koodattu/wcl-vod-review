import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fixtureReview, report, reviewUrl } from "./fixtures";

const denseReport = {
  ...report,
  title: "Saturday progression · Synthetic guild · The Stone Warden and the Council of Ash",
  endTime: report.startTime + 14400000,
  fights: Array.from({ length: 24 }, (_, index) => ({
    id: index + 1, name: index < 16 ? "The Stone Warden" : "Council of Ash",
    encounterID: index < 16 ? 1 : 2,
    startTime: 60000 + index * 500000,
    endTime: 60000 + index * 500000 + 180000 + index * 5000,
    kill: index === 15 || index === 23,
  })),
};
const denseEvents = Array.from({ length: 240 }, (_, index) => ({
  timestamp: 60000 + index * 750,
  type: index % 30 === 29 ? "Deaths" : "Casts",
  abilityGameID: 100 + index % 12,
  abilityInfo: { gameID: 100 + index % 12, name: ["Shattering roar", "Stone eruption", "Crushing slam", "Earthen spike", "Sundering charge", "Seismic pulse", "Falling debris", "Resonating fissure", "Molten armor", "Unstable ground", "Stone prison", "Final reckoning"][index % 12] },
  sourceInfo: { id: 9, name: "The Stone Warden", type: "NPC" },
  targetInfo: { id: index % 4 + 1, name: index % 2 ? "Moonleaf" : "Oakshield", type: "Player", subType: "Druid" },
}));

async function populatedReview(page: Parameters<typeof fixtureReview>[0]) {
  await fixtureReview(page);
  await page.route("**/api/wcl/reports/SyntheticReport1", route => route.fulfill({ json: denseReport }));
  await page.route("**/api/wcl/reports/SyntheticReport1/events", route => route.fulfill({ json: {
    events: denseEvents.map(event => ({ ...event, timestamp: event.timestamp + (route.request().postDataJSON().fightId - 1) * 500000 })),
  } }));
}

test("find a mechanic, coordinate the timeline and watch its lead-up", async ({ page }) => {
  await populatedReview(page);
  await page.goto(reviewUrl);
  await page.getByLabel("Search events").fill("shattering");
  await expect(page.getByText("20 of 240 events", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /20 matching events/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Stone eruption/ })).toHaveCount(0);
  await page.getByLabel("Playback lead-in").selectOption("5");
  await page.getByRole("button", { name: /Shattering roar/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Video moved to 0:55." })).toBeVisible();
  await page.getByRole("button", { name: "Clear event filters" }).click();
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await expect(page.getByText("8 of 240 events", { exact: true })).toBeVisible();
  await expect(page.getByText("0:21.750", { exact: true })).toBeVisible();
  await page.getByLabel("Search events").fill("missing player");
  await expect(page.getByText("No tracked events match this filter.")).toBeVisible();
  await page.getByRole("button", { name: "Clear event filters" }).click();
  await expect(page.getByText("240 of 240 events", { exact: true })).toBeVisible();
});

test("pull browsing and event filters survive refresh and browser history without losing a note draft", async ({ page }) => {
  await populatedReview(page);
  await page.goto(reviewUrl);
  await page.getByLabel("Search events").fill("roar");
  await page.getByLabel("Playback lead-in").selectOption("5");
  await page.getByRole("button", { name: "Add note at current time" }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Keep this draft while looking at another pull.");
  await page.getByRole("button", { name: "Next fight", exact: true }).click();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("2");
  await expect(page).toHaveURL(/fightId=2/);
  await page.goBack();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("1");
  await page.goForward();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("Keep this draft while looking at another pull.");
  expect(await page.evaluate(() => (window as unknown as { __players: unknown[] }).__players.length)).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Search events")).toHaveValue("roar");
  await expect(page.getByLabel("Playback lead-in")).toHaveValue("5");
  await page.getByText("Browse fights", { exact: true }).click();
  await page.getByLabel("Boss", { exact: true }).selectOption("Council of Ash");
  await page.getByLabel("Result", { exact: true }).selectOption("kill");
  const browse = page.getByRole("region", { name: "Browse report fights" });
  await expect(browse.getByRole("button", { name: /Fight 24/ })).toBeVisible();
  await expect(browse.getByRole("button", { name: /Fight 17/ })).toHaveCount(0);
  await browse.getByRole("button", { name: /Fight 24/ }).click();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("24");
  await expect(page.getByRole("button", { name: "Next fight", exact: true })).toBeDisabled();
});

test("populated review keeps its evidence and controls usable", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await populatedReview(page);
  await page.goto(reviewUrl + "&startSeconds=40");
  await expect(page.getByText("Synthetic video preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Fight events/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const prefix = process.env.WCL_EVIDENCE_PREFIX || "workspace-after";
  const path = "../work/goal-improvement/evidence/" + prefix + "-" + testInfo.project.name;
  await page.screenshot({ path: path + ".png", fullPage: true });
  await page.screenshot({ path: path + "-viewport.png", scale: "css" });
  const measurements = await page.evaluate(() => {
    const position = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height) };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, pageHeight: document.documentElement.scrollHeight,
      video: position('[aria-label="Video"]'), events: position('[aria-label="Fight events"]'),
      timeline: position('#review-timeline'), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  await writeFile(path + ".json", JSON.stringify(measurements, null, 2) + "\n");
  expect(measurements.overflow).toBe(false);
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await expect(page.getByRole("button", { name: /Moonleaf/ })).toHaveCount(8);
  await page.getByRole("button", { name: /Moonleaf/ }).first().click();
  await expect(page.getByRole("status").filter({ hasText: /Video moved/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("event pages and the chosen view travel with a moment link", async ({ page, context }) => {
  await populatedReview(page);
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Next events" }).click();
  await expect(page.getByText("Page 2 of 10")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Page 2 of 10")).toBeVisible();
  await page.getByLabel("Search events").fill("Moonleaf");
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await page.getByLabel("Playback lead-in").selectOption("10");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await page.getByRole("button", { name: "Copy moment link" }).click();
  const link = await page.getByLabel("Moment link", { exact: true }).inputValue();
  const other = await context.newPage();
  await populatedReview(other);
  await other.goto(link);
  await expect(other.getByLabel("Search events")).toHaveValue("Moonleaf");
  await expect(other.getByLabel("Show", { exact: true })).toHaveValue("Deaths");
  await expect(other.getByLabel("Playback lead-in")).toHaveValue("10");
  await expect(other.getByText("8 of 240 events", { exact: true })).toBeVisible();
  await other.close();
});

test("unknown results, repeated deaths and recording boundaries remain truthful", async ({ page }) => {
  await fixtureReview(page);
  await page.route("**/api/wcl/reports/SyntheticReport1", route => route.fulfill({ json: {
    ...report, fights: [{ id: 1, name: "The Stone Warden", startTime: 0, endTime: 30000 }],
  } }));
  await page.route("**/api/video-metadata/youtube/localVideo1", route => route.fulfill({ json: { id: "localVideo1", title: "Short recording", duration: 12 } }));
  await page.route("**/api/wcl/reports/SyntheticReport1/events", route => route.fulfill({ json: { events: [
    { timestamp: 20000, type: "Deaths", targetInfo: { id: 1, name: "Moonleaf", type: "Player" } },
    { timestamp: 1000, type: "Casts", abilityGameID: 1, abilityInfo: { name: "Melee", gameID: 1 } },
    { timestamp: 2500, type: "Deaths", targetInfo: { id: 1, name: "Moonleaf", type: "Player" } },
  ] } }));
  await page.goto(reviewUrl + "999&eventType=bad&leadIn=-10&eventPage=NaN");
  await expect(page.getByText("This fight is not in the report. Showing the first available fight.")).toBeVisible();
  await expect(page.getByLabel("Fight", { exact: true }).locator("option:checked")).toContainText("Unknown result");
  await expect(page.getByText("2 of 2 events", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Playback lead-in")).toHaveValue("0");
  await page.getByLabel("Playback lead-in").selectOption("10");
  const deaths = page.getByRole("button", { name: /Moonleaf/ });
  await expect(page.getByRole("button", { name: "Save review", exact: true })).toBeEnabled();
  await deaths.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Video moved to 0:00." })).toBeVisible();
  await expect(deaths.first()).toHaveAttribute("aria-current", "true");
  const video = await page.getByText("Synthetic video preview").boundingBox();
  expect(video!.y).toBeGreaterThanOrEqual(0);
  expect(video!.y + video!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await deaths.last().click();
  await expect(page.getByRole("status").filter({ hasText: /falls outside the video/ })).toBeVisible();
  await expect(deaths.first()).toHaveAttribute("aria-current", "true");
  await expect(deaths.last()).not.toHaveAttribute("aria-current", "true");
});

test("fight discovery resets empty results and retains filters on reload", async ({ page }, testInfo) => {
  await populatedReview(page);
  await page.goto(reviewUrl);
  await page.getByText("Browse fights", { exact: true }).click();
  await page.getByLabel("Boss", { exact: true }).selectOption("Council of Ash");
  await page.getByLabel("Result", { exact: true }).selectOption("unknown");
  await expect(page.getByText("No fights match. Try another boss or result.")).toBeVisible();
  await page.getByRole("button", { name: "Clear fight filters" }).click();
  await expect(page.getByText("24 of 24 fights")).toBeVisible();
  await page.getByLabel("Result", { exact: true }).selectOption("kill");
  await page.reload();
  await page.getByText("Browse fights", { exact: true }).click();
  await expect(page.getByLabel("Result", { exact: true })).toHaveValue("kill");
  await expect(page.getByText("2 of 24 fights")).toBeVisible();
  await page.getByRole("region", { name: "Browse report fights" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../work/goal-improvement/evidence/workspace-fights-" + testInfo.project.name + ".png", scale: "css" });
  await page.getByRole("region", { name: "Browse report fights" }).getByRole("button", { name: /Fight 16/ }).click();
  await expect(page.getByLabel("Fight", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("16");
  await page.getByLabel("Show", { exact: true }).selectOption("Deaths");
  await page.getByRole("region", { name: "Fight events" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../work/goal-improvement/evidence/workspace-events-" + testInfo.project.name + ".png", scale: "css" });
});

test("narrow and landscape workspaces keep keyboard controls and overflow contained", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await populatedReview(page);
  await page.goto(reviewUrl);
  for (const viewport of [{ width: 320, height: 700 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.getByLabel("Search events").fill("shattering");
    await expect(page.getByText("20 of 240 events", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear event filters" }).click();
    await expect(page.getByLabel("Search events")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Next fight", exact: true })).toHaveCSS("min-height", "44px");
  }
});
