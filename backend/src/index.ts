// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Database } from "./lib/database";
import { WarcraftLogsClient } from "./lib/wcl";
import { BlizzardApiClient } from "./lib/blizzard";
import { parseYouTubeUrl, parseTwitchUrl, parseWCLUrl, detectVODPlatform } from "./lib/urlParsers";

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const database = Database.getInstance();

// Initialize WCL client (now environment variables are loaded)
const wclClient = new WarcraftLogsClient();

// Initialize Blizzard API client
const blizzardClient = new BlizzardApiClient();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
database.connect().catch((error) => {
  console.error("Failed to connect to database:", error);
  process.exit(1);
});

// Initialize Blizzard API (achievements) after database connection
database
  .connect()
  .then(() => {
    blizzardClient.initializeIfNeeded();
  })
  .catch((error) => {
    console.error("Failed to initialize Blizzard API:", error);
  });

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "WCL VOD Review Backend API" });
});

// Health check route
app.get("/health", (req, res) => {
  const dbConnected = database.getConnectionState();
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: dbConnected ? "connected" : "disconnected",
  });
});

// Parse URLs endpoint
app.post("/api/parse-urls", (req: express.Request, res: express.Response) => {
  try {
    const { wclUrl, vodUrl } = req.body;

    if (!wclUrl || !vodUrl) {
      return res.status(400).json({
        error: "Both wclUrl and vodUrl are required",
      });
    }

    // Parse WCL URL
    const wclData = parseWCLUrl(wclUrl);

    // Parse VOD URL
    const vodPlatform = detectVODPlatform(vodUrl);
    let vodData: any;

    if (vodPlatform === "youtube") {
      vodData = parseYouTubeUrl(vodUrl);
    } else if (vodPlatform === "twitch") {
      vodData = parseTwitchUrl(vodUrl);
    } else {
      return res.status(400).json({ error: "Unsupported VOD platform" });
    }

    if (!vodData?.id) {
      return res.status(400).json({ error: "Could not parse VOD URL" });
    }

    const response = {
      wcl: wclData,
      vod: {
        platform: vodPlatform,
        id: vodData.id,
        startSeconds: vodData.startSeconds,
      },
    };

    res.json(response);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get WCL report summary
app.get("/api/wcl/reports/:code", async (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ error: "Report code is required" });
    }

    const report = await wclClient.getReportSummary(code);

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

    const enhancedReport = {
      ...report,
      fights: enhancedFights,
    };

    res.json(enhancedReport);
  } catch (error: any) {
    console.error("Error fetching report:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get WCL report with enhanced encounter details (including journalID)
app.get("/api/wcl/reports/:code/enhanced", async (req: express.Request, res: express.Response) => {
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

    const enhancedReport = {
      ...report,
      fights: enhancedFights,
    };

    res.json(enhancedReport);
  } catch (error: any) {
    console.error("Error fetching enhanced report:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get events for a specific fight
app.post("/api/wcl/reports/:code/events", async (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.params;
    const { fightId, startTime, endTime, eventTypes } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Report code is required" });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "startTime and endTime are required",
      });
    }

    const result = await wclClient.getEvents(code, fightId, startTime, endTime, eventTypes || ["Deaths", "Casts"]);

    res.json({
      events: result.events,
      cached: result.cached,
      lastUpdated: result.lastUpdated,
    });
  } catch (error: any) {
    console.error("Error fetching events:", error);
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
    console.error("Error fetching encounter details:", error);
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
    console.error("Error fetching boss icon:", error);
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger achievement update (for testing/admin purposes)
app.post("/api/admin/update-achievements", async (req: express.Request, res: express.Response) => {
  try {
    await blizzardClient.updateAchievements();
    res.json({ message: "Achievements updated successfully" });
  } catch (error: any) {
    console.error("Error updating achievements:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 WCL VOD Review API ready`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await database.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await database.disconnect();
  process.exit(0);
});
