import { TwitchData, WCLData, YouTubeData } from "../types";

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const TWITCH_HOSTS = new Set(["twitch.tv", "m.twitch.tv"]);

function parseUrl(value: string, service: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error(`Invalid ${service} URL`);
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function parseStartSeconds(value: string | null): number {
  if (!value) return 0;

  const timestamp = value.trim().toLowerCase();
  if (/^\d+$/.test(timestamp)) {
    return Number.parseInt(timestamp, 10);
  }

  const match = timestamp.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match.slice(1).some(Boolean)) return 0;

  return Number.parseInt(match[1] || "0", 10) * 3600 + Number.parseInt(match[2] || "0", 10) * 60 + Number.parseInt(match[3] || "0", 10);
}

/** Parse a supported YouTube URL into its video ID and optional start time. */
export function parseYouTubeUrl(value: string): YouTubeData {
  const url = parseUrl(value, "YouTube");
  const hostname = normalizedHostname(url);

  if (!YOUTUBE_HOSTS.has(hostname)) {
    throw new Error("Invalid YouTube URL");
  }

  let videoId: string | null = null;
  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:embed|live|shorts)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    videoId = match?.[1] || null;
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube URL");
  }

  return {
    id: videoId,
    startSeconds: parseStartSeconds(url.searchParams.get("t") || url.searchParams.get("start")),
  };
}

/** Parse a Twitch VOD URL and its optional start time. */
export function parseTwitchUrl(value: string): TwitchData {
  const url = parseUrl(value, "Twitch");
  const hostname = normalizedHostname(url);
  const match = url.pathname.match(/^\/videos\/(\d+)(?:\/|$)/);

  if (!TWITCH_HOSTS.has(hostname) || !match) {
    throw new Error("Invalid Twitch URL");
  }

  return {
    id: match[1],
    startSeconds: parseStartSeconds(url.searchParams.get("t")),
  };
}

/** Parse a Warcraft Logs report URL and an optional numeric fight ID. */
export function parseWCLUrl(value: string): WCLData {
  const url = parseUrl(value, "Warcraft Logs");
  const hostname = normalizedHostname(url);
  const match = url.pathname.match(/^\/reports\/([A-Za-z0-9]+)(?:\/|$)/);

  if (hostname !== "warcraftlogs.com" || !match) {
    throw new Error("Invalid Warcraft Logs URL");
  }

  const hashParams = new URLSearchParams(url.hash.slice(1));
  const fight = hashParams.get("fight") || url.searchParams.get("fight");

  return {
    code: match[1],
    fightId: fight && /^\d+$/.test(fight) ? Number.parseInt(fight, 10) : undefined,
  };
}

/** Detect which supported VOD service owns the URL. */
export function detectVODPlatform(value: string): "youtube" | "twitch" {
  const url = parseUrl(value, "VOD");
  const hostname = normalizedHostname(url);

  if (YOUTUBE_HOSTS.has(hostname)) return "youtube";
  if (TWITCH_HOSTS.has(hostname)) return "twitch";

  throw new Error("Unsupported VOD platform");
}
