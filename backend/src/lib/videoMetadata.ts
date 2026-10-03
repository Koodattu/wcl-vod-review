import { Video, VideoDocument } from "../models";
import { YouTubeClient } from "./youtube";
import { TwitchClient } from "./twitch";

type Platform = "youtube" | "twitch";
type Metadata = Pick<VideoDocument, "title" | "description" | "publishedAt" | "createdAt" | "channelId" | "channelTitle" | "url" | "thumbnailUrl" | "viewCount" | "userName" | "userLogin"> & {
  id: string;
  platform: Platform;
  duration: number;
  cached: boolean;
  lastUpdated: Date;
};

function normalizeDuration(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match.slice(1).some(Boolean)) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export class VideoMetadataCache {
  private youtube = new YouTubeClient();
  private twitch = new TwitchClient();
  // Only active requests live in memory. Success and failure both remove the entry.
  private pending = new Map<string, Promise<Metadata>>();

  async get(platform: Platform, videoId: string): Promise<Metadata> {
    const key = platform + ":" + videoId;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.load(platform, videoId);
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(platform: Platform, videoId: string): Promise<Metadata> {
    // Lean preserves legacy string durations so they can be read without a migration.
    const cached = await Video.findOne({ platform, videoId }).lean();
    const duration = normalizeDuration(cached?.duration);
    const age = cached?.lastUpdated ? Date.now() - cached.lastUpdated.getTime() : Infinity;
    if (cached && age >= 0 && age < 7 * 24 * 60 * 60 * 1000 && duration !== null) {
      return {
        platform, id: videoId, title: cached.title, description: cached.description, duration,
        publishedAt: cached.publishedAt, createdAt: cached.createdAt, channelId: cached.channelId,
        channelTitle: cached.channelTitle, url: cached.url, thumbnailUrl: cached.thumbnailUrl,
        viewCount: cached.viewCount, userName: cached.userName, userLogin: cached.userLogin,
        cached: true, lastUpdated: cached.lastUpdated,
      };
    }

    const { id, ...metadata } = platform === "youtube"
      ? await this.youtube.getVideoMetadata(videoId)
      : await this.twitch.getVideoMetadata(videoId);
    const lastUpdated = new Date();
    try {
      await Video.findOneAndUpdate({ platform, videoId }, { $set: { ...metadata, lastUpdated } }, { upsert: true, setDefaultsOnInsert: true });
    } catch {
      // A cache write failure must not discard a successful provider response.
      console.error("Could not cache video metadata");
    }
    return { platform, id, ...metadata, cached: false, lastUpdated };
  }
}
