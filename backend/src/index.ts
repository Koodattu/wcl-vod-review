// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Database } from "./lib/database";
import { WarcraftLogsClient } from "./lib/wcl";
import { BlizzardApiClient } from "./lib/blizzard";
import { YouTubeClient } from "./lib/youtube";
import { TwitchClient } from "./lib/twitch";
import { parseYouTubeUrl, parseTwitchUrl, parseWCLUrl, detectVODPlatform } from "./lib/urlParsers";
import { Video } from "./models";

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const database = Database.getInstance();

// Initialize WCL client (now environment variables are loaded)
const wclClient = new WarcraftLogsClient();

// Initialize Blizzard API client
const blizzardClient = new BlizzardApiClient();

// Initialize YouTube client
const youtubeClient = new YouTubeClient();

// Initialize Twitch client
const twitchClient = new TwitchClient();

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
app.post("/api/parse-urls", async (req: express.Request, res: express.Response) => {
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

    // Proactively fetch and cache video metadata in the background (don't await)
    // This way the response is fast but we still cache the data
    const videoId = vodData.id;
    const platform = vodPlatform as "youtube" | "twitch";

    (async () => {
      try {
        // Check if we already have cached video data
        const cachedVideo = await Video.findOne({ platform, videoId });

        // Define cache expiry (7 days)
        const CACHE_EXPIRY_DAYS = 7;
        const now = new Date();
        const isCacheValid = cachedVideo && cachedVideo.lastUpdated && now.getTime() - cachedVideo.lastUpdated.getTime() < CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

        if (isCacheValid) {
          return;
        }

        // Fetch and cache video metadata
        let metadata;
        if (platform === "youtube") {
          metadata = await youtubeClient.getVideoMetadata(videoId);
        } else {
          metadata = await twitchClient.getVideoMetadata(videoId);
        }

        // Save to database
        const videoData = {
          platform,
          videoId,
          title: metadata.title,
          description: metadata.description,
          publishedAt: (metadata as any).publishedAt,
          createdAt: (metadata as any).createdAt,
          channelId: (metadata as any).channelId,
          channelTitle: (metadata as any).channelTitle,
          url: (metadata as any).url,
          thumbnailUrl: (metadata as any).thumbnailUrl,
          duration: (metadata as any).duration,
          viewCount: (metadata as any).viewCount,
          userName: (metadata as any).userName,
          userLogin: (metadata as any).userLogin,
          lastUpdated: now,
        };

        await Video.findOneAndUpdate({ platform, videoId }, videoData, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });
      } catch (error: any) {
        // Log error but don't fail the request
        console.error(`Failed to cache video metadata:`, error.message);
      }
    })();

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

    // Calculate total duration (endTime already comes from WCL API)
    const totalDuration = report.endTime - report.startTime; // Duration in milliseconds

    const enhancedReport = {
      ...report,
      fights: enhancedFights,
      totalDuration,
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

    // Check if we have cached video data
    const cachedVideo = await Video.findOne({ platform, videoId });

    // Define cache expiry (7 days)
    const CACHE_EXPIRY_DAYS = 7;
    const now = new Date();
    const isCacheValid =
      cachedVideo &&
      cachedVideo.lastUpdated &&
      now.getTime() - cachedVideo.lastUpdated.getTime() < CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000 &&
      cachedVideo.duration !== undefined && // Ensure duration exists
      cachedVideo.duration !== null;

    if (isCacheValid && cachedVideo) {
      // Parse duration if it's stored as a string (old format)
      let duration = cachedVideo.duration;
      if (typeof duration === "string") {
        // Parse Twitch duration string format (e.g., "3h14m40s")
        const parseDuration = (durationStr: string): number => {
          let totalSeconds = 0;
          const hoursMatch = durationStr.match(/(\d+)h/);
          const minutesMatch = durationStr.match(/(\d+)m/);
          const secondsMatch = durationStr.match(/(\d+)s/);

          if (hoursMatch) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
          if (minutesMatch) totalSeconds += parseInt(minutesMatch[1], 10) * 60;
          if (secondsMatch) totalSeconds += parseInt(secondsMatch[1], 10);

          return totalSeconds;
        };
        duration = parseDuration(duration);

        // Update the database with the parsed value
        await Video.updateOne({ platform, videoId }, { $set: { duration } });
      }

      // Return cached data
      return res.json({
        platform: cachedVideo.platform,
        id: cachedVideo.videoId,
        title: cachedVideo.title,
        description: cachedVideo.description,
        publishedAt: cachedVideo.publishedAt,
        createdAt: cachedVideo.createdAt,
        channelId: cachedVideo.channelId,
        channelTitle: cachedVideo.channelTitle,
        url: cachedVideo.url,
        thumbnailUrl: cachedVideo.thumbnailUrl,
        duration: duration,
        viewCount: cachedVideo.viewCount,
        userName: cachedVideo.userName,
        userLogin: cachedVideo.userLogin,
        cached: true,
        lastUpdated: cachedVideo.lastUpdated,
      });
    }

    // Fetch fresh data from API
    let metadata;
    if (platform === "youtube") {
      metadata = await youtubeClient.getVideoMetadata(videoId);
    } else {
      metadata = await twitchClient.getVideoMetadata(videoId);
    }

    // Save or update video metadata in database
    const videoData = {
      platform,
      videoId,
      title: metadata.title,
      description: metadata.description,
      publishedAt: (metadata as any).publishedAt,
      createdAt: (metadata as any).createdAt,
      channelId: (metadata as any).channelId,
      channelTitle: (metadata as any).channelTitle,
      url: (metadata as any).url,
      thumbnailUrl: (metadata as any).thumbnailUrl,
      duration: (metadata as any).duration,
      viewCount: (metadata as any).viewCount,
      userName: (metadata as any).userName,
      userLogin: (metadata as any).userLogin,
      lastUpdated: now,
    };

    await Video.findOneAndUpdate({ platform, videoId }, videoData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    res.json({
      platform,
      ...metadata,
      cached: false,
      lastUpdated: now,
    });
  } catch (error: any) {
    console.error("Error fetching video metadata:", error);
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
