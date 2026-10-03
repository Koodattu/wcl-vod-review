import type { Page } from "@playwright/test";

export const reviewUrl = "/timeline?wclCode=SyntheticReport1&vodPlatform=youtube&vodId=localVideo1&fightId=1";
export const report = {
  code: "SyntheticReport1", title: "Saturday progression · Synthetic guild", startTime: Date.parse("2026-01-01T18:00:00Z"),
  endTime: Date.parse("2026-01-01T19:00:00Z"), totalDuration: 3600000,
  fights: [
    { id: 1, name: "The Stone Warden", startTime: 60000, endTime: 240000, kill: false },
    { id: 2, name: "The Stone Warden", startTime: 300000, endTime: 570000, kill: true },
  ],
};
export const events = [
  { timestamp: 90000, type: "Casts", abilityGameID: 123, abilityInfo: { gameID: 123, name: "Shattering roar" }, sourceInfo: { id: 9, name: "The Stone Warden", type: "NPC" } },
  { timestamp: 120000, type: "Deaths", targetInfo: { id: 1, name: "Moonleaf", type: "Player", subType: "Druid" } },
];

export async function fixturePlayer(page: Page) {
  // External player SDK double: real React lifecycle and controls, no real video requests.
  await page.route("https://www.youtube.com/iframe_api", route => route.fulfill({ contentType: "application/javascript", body: `
    window.__players = [];
    window.YT = { Player: class {
      constructor(element, config) {
        this.time = config.playerVars.start || 0; this.destroyed = false;
        this.element = document.createElement('div');
        this.element.textContent = 'Synthetic video preview';
        this.element.style.cssText = 'display:grid;place-items:center;height:100%;color:#cbd5e1;background:#111827';
        element.replaceWith(this.element); window.__players.push(this);
        setTimeout(() => config.events.onReady({ target: this }), 20);
      }
      seekTo(time) { if (this.destroyed) throw new Error('Seek on destroyed player'); this.time = time; }
      getCurrentTime() { return this.time; }
      destroy() { this.destroyed = true; this.element.remove(); }
    } };
    window.onYouTubeIframeAPIReady?.();
  ` }));
}

export async function fixtureReview(page: Page) {
  await fixturePlayer(page);
  await page.route("**/api/wcl/reports/SyntheticReport1", route => route.fulfill({ json: report }));
  await page.route("**/api/video-metadata/youtube/localVideo1", route => route.fulfill({ json: {
    id: "localVideo1", title: "Synthetic raid video", duration: 4000, publishedAt: "2026-01-01T18:00:00Z",
  } }));
  await page.route("**/api/wcl/reports/SyntheticReport1/events", route => route.fulfill({ json: {
    events: route.request().postDataJSON().fightId === 1 ? events : [],
  } }));
}
