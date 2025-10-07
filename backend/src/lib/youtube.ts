import axios from "axios";

interface YouTubeVideoSnippet {
  publishedAt: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
}

interface YouTubeVideoResponse {
  items: Array<{
    id: string;
    snippet: YouTubeVideoSnippet;
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
   * Get video metadata including published date
   * @param videoId YouTube video ID
   * @returns Video metadata with publishedAt date in ISO 8601 format
   */
  async getVideoMetadata(videoId: string) {
    try {
      const response = await axios.get<YouTubeVideoResponse>(`${this.baseUrl}/videos`, {
        params: {
          part: "snippet",
          id: videoId,
          key: this.apiKey,
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = response.data.items[0];
      return {
        id: video.id,
        publishedAt: video.snippet.publishedAt,
        title: video.snippet.title,
        description: video.snippet.description,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`YouTube API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
}
