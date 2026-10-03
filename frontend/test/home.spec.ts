import { test, expect } from "@playwright/test";
import { fixtureReview } from "./fixtures";

test("form keeps links on failure and opens the requested fight on retry", async ({ page }, testInfo) => {
  await fixtureReview(page);
  let failing = true;
  await page.route("**/api/parse-urls", route => failing
    ? route.fulfill({ status: 502, body: "temporary non-JSON gateway error" })
    : route.fulfill({ json: { wcl: { code: "SyntheticReport1", fightId: 2 }, vod: { platform: "youtube", id: "localVideo1", startSeconds: 40 } } }));
  await page.goto("/");
  await page.getByLabel("Warcraft Logs report URL").fill("https://www.warcraftlogs.com/reports/SyntheticReport1#fight=2");
  await page.getByLabel("YouTube video or Twitch VOD URL").fill("https://youtu.be/localVideo1?t=40");
  await page.getByRole("button", { name: "Create timeline" }).click();
  const error = page.getByRole("alert").filter({ hasText: "The service is unavailable" });
  await expect(error).toBeVisible();
  await expect(page.getByLabel("YouTube video or Twitch VOD URL")).toHaveValue("https://youtu.be/localVideo1?t=40");
  await expect(error).toBeFocused();
  await page.screenshot({ path: "../work/goal-improvement/evidence/form-recovery-" + testInfo.project.name + ".png", fullPage: true });
  failing = false;
  await page.getByRole("button", { name: "Create timeline" }).click();
  await expect(page.getByLabel("Fight", { exact: true })).toHaveValue("2");
  await expect(page).toHaveURL(/startSeconds=40/);
});
