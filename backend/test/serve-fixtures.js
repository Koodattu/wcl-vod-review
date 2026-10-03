const mongoose = require("mongoose");
const axios = require("axios");
const express = require("express");

// No .env loading, real credentials, or outbound network. Only this disposable database is writable.
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !/^mongodb:\/\/127\.0\.0\.1:\d+\/wcl_goal_test_[a-z0-9_]+$/.test(uri)) {
  throw new Error("Set MONGODB_TEST_URI to a disposable localhost wcl_goal_test_* database");
}
Object.assign(process.env, {
  WCL_API_BASE: "https://synthetic-warcraftlogs.invalid",
  WCL_CLIENT_ID: "synthetic", WCL_CLIENT_SECRET: "synthetic", YT_API_KEY: "synthetic",
  TWITCH_CLIENT_ID: "", TWITCH_CLIENT_SECRET: "", BLIZZARD_CLIENT_ID: "", BLIZZARD_CLIENT_SECRET: "",
});

const report = {
  title: "Saturday progression · Synthetic guild",
  startTime: Date.parse("2026-01-01T18:00:00Z"), endTime: Date.parse("2026-01-01T19:00:00Z"),
  owner: { name: "Synthetic guild" },
  fights: [
    { id: 1, name: "The Stone Warden", startTime: 60000, endTime: 240000, encounterID: 1, kill: false },
    { id: 2, name: "The Stone Warden", startTime: 300000, endTime: 570000, encounterID: 1, kill: true },
  ],
};
const providerCalls = { report: 0, events: 0, video: 0 };
axios.defaults.adapter = async config => {
  let data;
  if (config.url === "https://synthetic-warcraftlogs.invalid/oauth/token") {
    data = { access_token: "synthetic-local-token", token_type: "Bearer", expires_in: 3600 };
  } else if (config.url === "https://synthetic-warcraftlogs.invalid/api/v2/client") {
    const { query, variables } = JSON.parse(config.data);
    if (query.includes("GetMasterData")) {
      data = { data: { reportData: { report: { masterData: {
        abilities: [{ gameID: 123, name: "Shattering roar", icon: "" }],
        actors: [{ id: 1, name: "Moonleaf", type: "Player", subType: "Druid" }, { id: 9, name: "The Stone Warden", type: "NPC" }],
      } } } } };
    } else if (query.includes("GetMultipleEncounters")) {
      data = { data: { worldData: { encounter0: { id: 1, name: "The Stone Warden", journalID: 1, zone: { id: 1, name: "Synthetic raid" } } } } };
    } else if (query.includes("GetEvents")) {
      providerCalls.events++;
      const events = variables.fightIDs[0] === 1 ? [
        { timestamp: 90000, type: "cast", abilityGameID: 123, sourceID: 9 },
        { timestamp: 120000, type: "death", targetID: 1 },
      ] : [];
      data = { data: { reportData: { report: { events: { data: events, nextPageTimestamp: null } } } } };
    } else if (query.includes("GetReport")) {
      providerCalls.report++;
      data = { data: { reportData: { report } } };
    } else { throw new Error("Unexpected synthetic GraphQL request"); }
  } else if (config.url === "https://www.googleapis.com/youtube/v3/videos") {
    providerCalls.video++;
    data = { items: [{ id: config.params.id,
      snippet: { title: "Synthetic raid video", description: "", publishedAt: "2026-01-01T18:00:00Z", channelId: "synthetic", channelTitle: "Synthetic guild" },
      contentDetails: { duration: "PT1H6M40S" },
    }] };
  } else { throw new Error("Unexpected external request blocked by synthetic fixture"); }
  return { status: 200, statusText: "OK", headers: {}, config, data };
};

async function main() {
  await mongoose.connect(uri + "_browser", { serverSelectionTimeoutMS: 5000 });
  const { app } = require("../dist/app");
  const { Report, CachedEvents, Video, AuthToken } = require("../dist/models");
  await Promise.all([Report.init(), CachedEvents.init(), Video.init(), AuthToken.init()]);
  const fixture = express();
  fixture.get("/api/__fixture", (_req, res) => res.json({ fixture: "wcl-synthetic-local", providerCalls }));
  fixture.use(app);
  const server = fixture.listen(43181, "127.0.0.1", () => console.log("Synthetic API ready on http://127.0.0.1:43181"));
  const stop = async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
