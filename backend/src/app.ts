import express from "express";
import { Database } from "./lib/database";
import { WarcraftLogsClient } from "./lib/wcl";
import { BlizzardApiClient } from "./lib/blizzard";
import { VideoMetadataCache } from "./lib/videoMetadata";
import { parseYouTubeUrl, parseTwitchUrl, parseWCLUrl, detectVODPlatform } from "./lib/urlParsers";

export const app = express();

// The server bootstrap owns connection and background-job startup.
const database = Database.getInstance();

// Environment must be configured before importing the app.
const wclClient = new WarcraftLogsClient();

// Initialize Blizzard API client
const blizzardClient = new BlizzardApiClient();

const videoMetadata = new VideoMetadataCache();

// Middleware
app.use(express.json());

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "WCL VOD Review Backend API" });
});

// Health check route
app.get("/health", (req, res) => {
  const dbConnected = database.getConnectionState();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "unhealthy",
    timestamp: new Date().toISOString(),
    database: dbConnected ? "connected" : "disconnected",
  });
});

// Parse URLs endpoint
app.post("/api/parse-urls", async (req: express.Request, res: express.Response) => {
  try {
    const { wclUrl, vodUrl } = req.body || {};

    if (typeof wclUrl !== "string" || typeof vodUrl !== "string" || !wclUrl.trim() || !vodUrl.trim()) {
      return res.status(400).json({
        error: "Both wclUrl and vodUrl are required",
      });
    }

    // Parse WCL URL
    const wclData = parseWCLUrl(wclUrl);

    // Parse VOD URL
    const vodPlatform = detectVODPlatform(vodUrl);
    const vodData = vodPlatform === "youtube" ? parseYouTubeUrl(vodUrl) : parseTwitchUrl(vodUrl);

    const response = {
      wcl: wclData,
      vod: {
        platform: vodPlatform,
        id: vodData.id,
        startSeconds: vodData.startSeconds,
      },
    };

    // Warm the same retrieval path used by the timeline; concurrent callers share the work.
    void videoMetadata.get(vodPlatform, vodData.id).catch(() => {
      console.error("Could not preload video metadata");
    });

    res.json(response);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get WCL report summary
app.get(["/api/wcl/reports/:code", "/api/wcl/reports/:code/enhanced"], async (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ error: "Report code is required" });
    }

    const report = await wclClient.getReportWithEncounterDetails(code);

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Extract unique boss names for batch processing
    const bossNames = report.fights.map((fight) => fight.name);

    // Batch fetch all boss icons
    const bossIconMap = await blizzardClient.getBossIconUrls(bossNames);

    // Enhance fights with boss icons from the batch result
    const enhancedFights = report.fights.map((fight) => ({
      ...fight,
      iconUrl: bossIconMap.get(fight.name) || null,
    }));

    // Calculate total duration (endTime already comes from WCL API)
    const totalDuration = report.endTime - report.startTime; // Duration in milliseconds

    const enhancedReport = {
      ...report,
      fights: enhancedFights,
      totalDuration,
    };

    res.json(enhancedReport);
  } catch (error: any) {
    console.error("Error fetching report:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get events for a specific fight
app.post("/api/wcl/reports/:code/events", async (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.params;
    const { fightId, startTime, endTime, eventTypes } = req.body || {};

    if (!code) {
      return res.status(400).json({ error: "Report code is required" });
    }

    if (typeof startTime !== "number" || !Number.isFinite(startTime) || typeof endTime !== "number" || !Number.isFinite(endTime)) {
      return res.status(400).json({
        error: "startTime and endTime are required",
      });
    }

    if (startTime < 0 || endTime < startTime) {
      return res.status(400).json({ error: "Use a non-negative time range with endTime at or after startTime" });
    }
    if (fightId !== undefined && (!Number.isSafeInteger(fightId) || fightId <= 0)) {
      return res.status(400).json({ error: "fightId must be a positive integer" });
    }
    if (eventTypes !== undefined && (!Array.isArray(eventTypes) || !eventTypes.length || eventTypes.some(type => type !== "Deaths" && type !== "Casts"))) {
      return res.status(400).json({ error: "eventTypes must contain Deaths, Casts, or both" });
    }

    const result = await wclClient.getEvents(code, fightId, startTime, endTime, eventTypes || ["Deaths", "Casts"]);

    res.json({
      events: result.events,
      cached: result.cached,
      lastUpdated: result.lastUpdated,
    });
  } catch (error: any) {
    console.error("Error fetching events:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get encounter details by encounterID (including journalID)
app.get("/api/wcl/encounters/:encounterID", async (req: express.Request, res: express.Response) => {
  try {
    const { encounterID } = req.params;
    const id = parseInt(encounterID);

    if (!encounterID || isNaN(id)) {
      return res.status(400).json({ error: "Valid encounter ID is required" });
    }

    const encounter = await wclClient.getEncounterDetails(id);

    if (!encounter) {
      return res.status(404).json({ error: "Encounter not found" });
    }

    res.json(encounter);
  } catch (error: any) {
    console.error("Error fetching encounter details:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get boss icon by name
app.get("/api/boss-icon/:bossName", async (req: express.Request, res: express.Response) => {
  try {
    const { bossName } = req.params;

    if (!bossName) {
      return res.status(400).json({ error: "Boss name is required" });
    }

    const iconUrl = await blizzardClient.getBossIconUrl(decodeURIComponent(bossName));

    if (!iconUrl) {
      return res.status(404).json({
        error: "Boss icon not found",
        bossName: decodeURIComponent(bossName),
      });
    }

    res.json({
      bossName: decodeURIComponent(bossName),
      iconUrl,
    });
  } catch (error: any) {
    console.error("Error fetching boss icon:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger achievement update (for testing/admin purposes)
app.post("/api/admin/update-achievements", async (req: express.Request, res: express.Response) => {
  try {
    await blizzardClient.updateAchievements();
    res.json({ message: "Achievements updated successfully" });
  } catch (error: any) {
    console.error("Error updating achievements:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get video metadata (YouTube or Twitch)
app.get("/api/video-metadata/:platform/:videoId", async (req: express.Request, res: express.Response) => {
  try {
    const { platform, videoId } = req.params;

    if (!platform || !videoId) {
      return res.status(400).json({ error: "Platform and videoId are required" });
    }

    if (platform !== "youtube" && platform !== "twitch") {
      return res.status(400).json({ error: "Platform must be 'youtube' or 'twitch'" });
    }

    res.json(await videoMetadata.get(platform, videoId));
  } catch (error: any) {
    console.error("Error fetching video metadata:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Keep parser errors consumable by the browser without exposing bodies or stack traces.
app.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON" });
  if (error.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large" });
  console.error("Unhandled API request failure");
  return res.status(500).json({ error: "The request could not be completed. Please retry." });
});
