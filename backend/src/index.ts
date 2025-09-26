// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Database } from "./lib/database";
import { WarcraftLogsClient } from "./lib/wcl";
import { parseYouTubeUrl, parseTwitchUrl, parseWCLUrl, detectVODPlatform } from "./lib/urlParsers";

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const database = Database.getInstance();

// Initialize WCL client (now environment variables are loaded)
const wclClient = new WarcraftLogsClient();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
database.connect().catch((error) => {
  console.error("Failed to connect to database:", error);
  process.exit(1);
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

    res.json(report);
  } catch (error: any) {
    console.error("Error fetching report:", error);
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
