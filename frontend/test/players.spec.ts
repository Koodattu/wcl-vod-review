import { test, expect } from "@playwright/test";
import { fixtureReview, reviewUrl } from "./fixtures";

test("a blocked video SDK gives a retry and can recover", async ({ page }) => {
  await fixtureReview(page);
  let failing = true;
  await page.route("https://www.youtube.com/iframe_api", route => failing ? route.abort() : route.fallback());
  await page.goto(reviewUrl);
  await expect(page.getByText(/Could not load the YouTube player/)).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry player" }).click();
  await expect(page.getByText("Synthetic video preview")).toBeVisible();
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Video moved to" })).toBeVisible();
});

test("Twitch can seek and unmount using its documented playback interface", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fixtureReview(page);
  await page.route("**/api/video-metadata/twitch/123", route => route.fulfill({ json: { id: "123", title: "Synthetic Twitch VOD", duration: 4000, createdAt: "2026-01-01T17:59:00Z" } }));
  await page.route("https://player.twitch.tv/js/embed/v1.js", route => route.fulfill({ contentType: "application/javascript", body: `
    window.Twitch = { Player: class {
      static READY = 'ready';
      constructor(id, options) {
        this.container = typeof id === 'string' ? document.getElementById(id) : id;
        this.container.textContent = 'Synthetic Twitch preview';
        this.time = 0; this.listeners = new Map();
      }
      addEventListener(name, fn) { this.listeners.set(name, fn); if (name === 'ready') setTimeout(fn, 20); }
      removeEventListener(name) { this.listeners.delete(name); }
      getCurrentTime() { return this.time; }
      seek(time) { this.time = time; }
      pause() {}
    } };
  ` }));
  await page.goto(reviewUrl.replace("youtube&vodId=localVideo1", "twitch&vodId=123"));
  await expect(page.getByText("Synthetic Twitch preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Align fight start to current video time" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Moonleaf/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Video moved to 3:04." })).toBeVisible();
  await page.getByRole("link", { name: "← New review" }).click();
  await expect(page.getByRole("button", { name: "Create timeline" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("leaving while the SDK loads does not create a late player", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fixtureReview(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://www.youtube.com/iframe_api", async route => { await held; await route.fallback(); });
  await page.goto(reviewUrl);
  await expect(page.getByText("Loading YouTube player…")).toBeVisible();
  await page.getByRole("link", { name: "← New review" }).click();
  await expect(page.getByRole("button", { name: "Create timeline" })).toBeVisible();
  release();
  await expect.poll(() => page.evaluate(() => !!window.YT?.Player)).toBe(true);
  // A subsequent review must be playable using the now-loaded SDK.
  await page.getByLabel("Warcraft Logs report URL").fill("https://www.warcraftlogs.com/reports/SyntheticReport1");
  await page.getByLabel("YouTube video or Twitch VOD URL").fill("https://youtu.be/localVideo1");
  await page.route("**/api/parse-urls", route => route.fulfill({ json: { wcl: { code: "SyntheticReport1" }, vod: { platform: "youtube", id: "localVideo1" } } }));
  await page.getByRole("button", { name: "Create timeline" }).click();
  await page.getByRole("button", { name: "Align fight start to current video time" }).click();
  await expect(page.getByText("Offset 1:00.0", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
