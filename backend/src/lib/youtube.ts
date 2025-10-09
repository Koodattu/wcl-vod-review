import axios from "axios";

interface YouTubeVideoSnippet {
  publishedAt: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
}

interface YouTubeContentDetails {
  duration: string; // ISO 8601 duration format (e.g., "PT1H23M45S")
}

interface YouTubeVideoResponse {
  items: Array<{
    id: string;
    snippet: YouTubeVideoSnippet;
    contentDetails: YouTubeContentDetails;
  }>;
}

export class YouTubeClient {
  private apiKey: string;
  private baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor() {
    const apiKey = process.env.YT_API_KEY;
    if (!apiKey) {
      throw new Error("YT_API_KEY is not set in environment variables");
    }
    this.apiKey = apiKey;
  }

  /**
   * Parse ISO 8601 duration string to seconds
   * @param duration ISO 8601 duration string (e.g., "PT1H23M45S")
   * @returns Duration in seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get video metadata including published date and duration
   * @param videoId YouTube video ID
   * @returns Video metadata with publishedAt date in ISO 8601 format and duration in seconds
   */
  async getVideoMetadata(videoId: string) {
    try {
      const response = await axios.get<YouTubeVideoResponse>(`${this.baseUrl}/videos`, {
        params: {
          part: "snippet,contentDetails",
          id: videoId,
          key: this.apiKey,
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = response.data.items[0];
      const durationSeconds = this.parseDuration(video.contentDetails.duration);

      return {
        id: video.id,
        publishedAt: video.snippet.publishedAt,
        title: video.snippet.title,
        description: video.snippet.description,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        duration: durationSeconds,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`YouTube API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
}
