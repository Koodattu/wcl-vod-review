import axios from "axios";

interface TwitchAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TwitchVideoData {
  id: string;
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
}

interface TwitchVideosResponse {
  data: TwitchVideoData[];
}

export class TwitchClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private baseUrl = "https://api.twitch.tv/helix";
  private authUrl = "https://id.twitch.tv/oauth2/token";

  constructor() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be set in environment variables");
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Parse Twitch duration string to seconds
   * @param duration Twitch duration string (e.g., "1h23m45s" or "45m12s" or "30s")
   * @returns Duration in seconds
   */
  private parseDuration(duration: string): number {
    let totalSeconds = 0;

    const hoursMatch = duration.match(/(\d+)h/);
    const minutesMatch = duration.match(/(\d+)m/);
    const secondsMatch = duration.match(/(\d+)s/);

    if (hoursMatch) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minutesMatch) totalSeconds += parseInt(minutesMatch[1], 10) * 60;
    if (secondsMatch) totalSeconds += parseInt(secondsMatch[1], 10);

    return totalSeconds;
  }

  /**
   * Authenticate with Twitch API using OAuth Client Credentials flow
   */
  private async authenticate() {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<TwitchAuthResponse>(this.authUrl, null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        },
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 1 hour before actual expiry for safety
      this.tokenExpiry = Date.now() + (response.data.expires_in - 3600) * 1000;

      return this.accessToken;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Twitch authentication error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get video metadata including created date
   * @param videoId Twitch video ID (numeric string)
   * @returns Video metadata with created_at date in ISO 8601 format and duration in seconds
   */
  async getVideoMetadata(videoId: string) {
    try {
      const token = await this.authenticate();

      const response = await axios.get<TwitchVideosResponse>(`${this.baseUrl}/videos`, {
        params: {
          id: videoId,
        },
        headers: {
          "Client-Id": this.clientId,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = response.data.data[0];
      const durationSeconds = this.parseDuration(video.duration);

      return {
        id: video.id,
        createdAt: video.created_at,
        publishedAt: video.published_at,
        title: video.title,
        description: video.description,
        url: video.url,
        thumbnailUrl: video.thumbnail_url,
        duration: durationSeconds,
        viewCount: video.view_count,
        userName: video.user_name,
        userLogin: video.user_login,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Twitch API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
