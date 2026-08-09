const assert = require("node:assert/strict");
const test = require("node:test");

const { detectVODPlatform, parseTwitchUrl, parseWCLUrl, parseYouTubeUrl } = require("../dist/lib/urlParsers");

test("parses YouTube share timestamps without truncating units", () => {
  assert.deepEqual(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=1m23s"), {
    id: "dQw4w9WgXcQ",
    startSeconds: 83,
  });
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s").startSeconds, 3723);
});

test("supports YouTube embed URLs and numeric start values", () => {
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ?start=90"), {
    id: "dQw4w9WgXcQ",
    startSeconds: 90,
  });
});

test("parses Twitch VOD timestamps", () => {
  assert.deepEqual(parseTwitchUrl("https://www.twitch.tv/videos/123456789?t=2h3m4s"), {
    id: "123456789",
    startSeconds: 7384,
  });
});

test("parses numeric Warcraft Logs fight IDs from the hash", () => {
  assert.deepEqual(parseWCLUrl("https://www.warcraftlogs.com/reports/AbCdEf123#fight=42&type=damage-done"), {
    code: "AbCdEf123",
    fightId: 42,
  });
});

test("rejects lookalike hosts", () => {
  assert.throws(() => detectVODPlatform("https://example.com/?next=youtube.com"), /Unsupported VOD platform/);
  assert.throws(() => parseWCLUrl("https://example.com/reports/AbCdEf123"), /Invalid Warcraft Logs URL/);
});
