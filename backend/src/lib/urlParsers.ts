import { YouTubeData, TwitchData, WCLData } from "../types/index";

/**
 * Parse YouTube URL to extract video ID and start time
 * Supports various YouTube URL formats
 */
export function parseYouTubeUrl(url: string): YouTubeData {
  // Regular expressions for different YouTube URL formats
  const patterns = [
    // youtube.com/watch?v=VIDEO_ID&t=123s
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?:.*[&?]t=(\d+))?/,
    // youtube.com/watch?v=VIDEO_ID&t=1m23s
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?:.*[&?]t=(\d+)m(\d+)s)?/,
    // youtube.com/watch?v=VIDEO_ID&t=1h2m3s
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?:.*[&?]t=(\d+)h(\d+)m(\d+)s)?/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const videoId = match[1];
      let startSeconds = 0;

      if (match[2] && !match[3] && !match[4]) {
        // Simple seconds format (t=123)
        startSeconds = parseInt(match[2]);
      } else if (match[2] && match[3] && !match[4]) {
        // Minutes and seconds format (t=1m23s)
        startSeconds = parseInt(match[2]) * 60 + parseInt(match[3]);
      } else if (match[2] && match[3] && match[4]) {
        // Hours, minutes and seconds format (t=1h2m3s)
        startSeconds = parseInt(match[2]) * 3600 + parseInt(match[3]) * 60 + parseInt(match[4]);
      }

      return {
        id: videoId,
        startSeconds: startSeconds || 0,
      };
    }
  }

  throw new Error("Invalid YouTube URL");
}

/**
 * Parse Twitch URL to extract video ID and start time
 * Supports twitch.tv/videos/VIDEO_ID format with optional ?t=1h2m3s timestamp
 */
export function parseTwitchUrl(url: string): TwitchData {
  const regex = /twitch\.tv\/videos\/(\d+)/;
  const match = url.match(regex);

  if (!match) {
    throw new Error("Invalid Twitch URL");
  }

  const videoId = match[1];
  let startSeconds = 0;

  // Parse timestamp if present (format: ?t=1h2m3s or ?t=2m30s or ?t=90s)
  const timestampMatch = url.match(/[?&]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (timestampMatch) {
    const hours = timestampMatch[1] ? parseInt(timestampMatch[1]) : 0;
    const minutes = timestampMatch[2] ? parseInt(timestampMatch[2]) : 0;
    const seconds = timestampMatch[3] ? parseInt(timestampMatch[3]) : 0;
    startSeconds = hours * 3600 + minutes * 60 + seconds;
  }

  return {
    id: videoId,
    startSeconds: startSeconds || 0,
  };
}

/**
 * Parse Warcraft Logs URL to extract report code and fight ID
 */
export function parseWCLUrl(url: string): WCLData {
  const regex = /warcraftlogs\.com\/reports\/([A-Za-z0-9]+)(?:#fight=(\d+))?/;
  const match = url.match(regex);

  if (!match) {
    throw new Error("Invalid Warcraft Logs URL");
  }

  return {
    code: match[1],
    fightId: match[2] ? parseInt(match[2]) : undefined,
  };
}

/**
 * Detect VOD platform from URL
 */
export function detectVODPlatform(url: string): "youtube" | "twitch" {
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  } else if (url.includes("twitch.tv")) {
    return "twitch";
  }

  throw new Error("Unsupported VOD platform");
}
