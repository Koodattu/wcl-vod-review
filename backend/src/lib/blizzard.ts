import axios from "axios";
import { AuthToken, Achievement, BossIcon, AchievementUpdateLog } from "../models";

interface BlizzardTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  sub: string;
}

interface BlizzardAchievementIndex {
  _links: {
    self: {
      href: string;
    };
  };
  achievements: Array<{
    key: {
      href: string;
    };
    name: string;
    id: number;
  }>;
}

interface BlizzardAchievementMedia {
  _links: {
    self: {
      href: string;
    };
  };
  assets: Array<{
    key: string;
    value: string;
    file_data_id: number;
  }>;
  id: number;
}

export class BlizzardApiClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly oauthUrl = "https://oauth.battle.net/token";
  private readonly apiBaseUrl = "https://us.api.blizzard.com";
  private readonly namespace = "static-us";
  private readonly locale = "en_US";

  // Rate limiting: max one achievement update per hour
  private readonly UPDATE_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

  // In-memory cache for ongoing boss icon requests to prevent duplicates
  private readonly pendingBossIconRequests = new Map<string, Promise<string | null>>();
  constructor() {
    this.clientId = process.env.BLIZZARD_CLIENT_ID!;
    this.clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Blizzard API credentials not found in environment variables");
    }
  }

  /**
   * Get a valid access token, fetching a new one if necessary
   */
  private async getAccessToken(): Promise<string> {
    try {
      // Check if we have a valid token in the database
      const existingToken = await AuthToken.findOne({ service: "blizzard" });

      if (existingToken && existingToken.expiresAt > new Date()) {
        return existingToken.accessToken;
      }

      // Fetch a new token
      console.log("Fetching new Blizzard OAuth token...");
      const response = await axios.post<BlizzardTokenResponse>(
        this.oauthUrl,
        new URLSearchParams({
          grant_type: "client_credentials",
        }),
        {
          auth: {
            username: this.clientId,
            password: this.clientSecret,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, token_type, expires_in } = response.data;

      // Calculate expiration time (subtract 60 seconds for safety buffer)
      const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

      // Store in database (upsert to replace existing token)
      await AuthToken.findOneAndUpdate(
        { service: "blizzard" },
        {
          service: "blizzard",
          accessToken: access_token,
          tokenType: token_type,
          expiresAt,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ New Blizzard token acquired, expires at: ${expiresAt.toISOString()}`);
      return access_token;
    } catch (error: any) {
      console.error("Error fetching Blizzard access token:", error.response?.data || error.message);
      throw new Error("Failed to obtain Blizzard API access token");
    }
  }

  /**
   * Make an authenticated API call to Blizzard
   */
  private async makeAuthenticatedRequest<T>(url: string): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await axios.get<T>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error(`Error making authenticated request to ${url}:`, error.response?.data || error.message);
      throw new Error(`Blizzard API request failed: ${error.response?.status || error.message}`);
    }
  }

  /**
   * Check if we should update achievements (respects cooldown)
   */
  private async shouldUpdateAchievements(): Promise<boolean> {
    const updateLog = await AchievementUpdateLog.findOne();

    if (!updateLog) {
      return true; // First time, definitely update
    }

    const timeSinceUpdate = Date.now() - updateLog.lastFullUpdate.getTime();
    return timeSinceUpdate >= this.UPDATE_COOLDOWN;
  }

  /**
   * Fetch all achievements from Blizzard API and store them
   */
  public async updateAchievements(): Promise<void> {
    try {
      if (!(await this.shouldUpdateAchievements())) {
        console.log("⏰ Skipping achievement update due to cooldown");
        return;
      }

      console.log("📋 Fetching achievements from Blizzard API...");
      const url = `${this.apiBaseUrl}/data/wow/achievement/index?namespace=${this.namespace}&locale=${this.locale}`;
      const achievementIndex = await this.makeAuthenticatedRequest<BlizzardAchievementIndex>(url);

      console.log(`📋 Found ${achievementIndex.achievements.length} achievements to process`);

      // Use bulk operations for better performance
      const bulkOps = achievementIndex.achievements.map((achievement) => ({
        updateOne: {
          filter: { id: achievement.id },
          update: {
            $set: {
              id: achievement.id,
              name: achievement.name,
              href: achievement.key.href,
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await Achievement.bulkWrite(bulkOps);
        console.log(`✅ Successfully updated ${bulkOps.length} achievements`);
      }

      // Update the log
      await AchievementUpdateLog.findOneAndUpdate(
        {},
        {
          lastFullUpdate: new Date(),
          $inc: { attemptCount: 1 },
        },
        { upsert: true }
      );

      console.log("✅ Achievement update completed successfully");
    } catch (error: any) {
      console.error("Error updating achievements:", error.message);
      throw new Error(`Failed to update achievements: ${error.message}`);
    }
  }

  /**
   * Find achievement by partial boss name match
   */
  public async findAchievementByBossName(bossName: string): Promise<{ id: number; name: string } | null> {
    try {
      // First, try exact match patterns for mythic achievements
      const mythicPattern = `Mythic: ${bossName}`;
      let achievement = await Achievement.findOne({
        name: { $regex: new RegExp(`^${mythicPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // Try partial matching with the boss name
      const escapedBossName = bossName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      achievement = await Achievement.findOne({
        name: { $regex: new RegExp(escapedBossName, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // If no match found, try updating achievements if cooldown allows
      const shouldUpdate = await this.shouldUpdateAchievements();
      if (shouldUpdate) {
        console.log(`🔄 No match found for "${bossName}", updating achievements...`);
        await this.updateAchievements();

        // Try again after update
        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(`^${mythicPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });

        if (!achievement) {
          achievement = await Achievement.findOne({
            name: { $regex: new RegExp(escapedBossName, "i") },
          });
        }

        if (achievement) {
          return { id: achievement.id, name: achievement.name };
        }
      }

      console.log(`⚠️  No achievement found for boss: "${bossName}"`);
      return null;
    } catch (error: any) {
      console.error(`Error finding achievement for boss "${bossName}":`, error.message);
      return null;
    }
  }

  /**
   * Fetch achievement media (icon) by achievement ID
   */
  public async getAchievementMedia(achievementId: number): Promise<string | null> {
    try {
      const url = `${this.apiBaseUrl}/data/wow/media/achievement/${achievementId}?namespace=${this.namespace}&locale=${this.locale}`;
      const media = await this.makeAuthenticatedRequest<BlizzardAchievementMedia>(url);

      const iconAsset = media.assets.find((asset) => asset.key === "icon");
      if (!iconAsset) {
        console.log(`⚠️  No icon found for achievement ${achievementId}`);
        return null;
      }

      return iconAsset.value;
    } catch (error: any) {
      console.error(`Error fetching media for achievement ${achievementId}:`, error.message);
      return null;
    }
  }

  /**
   * Get boss icon URL by boss name (main entry point)
   */
  public async getBossIconUrl(bossName: string): Promise<string | null> {
    // Check if there's already a pending request for this boss name
    if (this.pendingBossIconRequests.has(bossName)) {
      console.log(`⏳ Waiting for existing request for boss: ${bossName}`);
      return this.pendingBossIconRequests.get(bossName)!;
    }

    // Create a new promise for this boss name
    const promise = this._fetchBossIconUrl(bossName);
    this.pendingBossIconRequests.set(bossName, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up the pending request when done
      this.pendingBossIconRequests.delete(bossName);
    }
  }

  /**
   * Internal method to actually fetch the boss icon URL
   */
  private async _fetchBossIconUrl(bossName: string): Promise<string | null> {
    try {
      // Check if we already have the icon cached
      const cachedIcon = await BossIcon.findOne({ bossName });
      if (cachedIcon) {
        console.log(`✅ Found cached icon for boss: ${bossName}`);
        return cachedIcon.iconUrl;
      }

      // Find the achievement for this boss
      const achievement = await this.findAchievementByBossName(bossName);
      if (!achievement) {
        return null;
      }

      // Get the icon from the achievement media
      const iconUrl = await this.getAchievementMedia(achievement.id);
      if (!iconUrl) {
        return null;
      }

      // Cache the result using upsert to avoid race conditions
      await BossIcon.findOneAndUpdate(
        { bossName },
        {
          bossName,
          iconUrl,
          achievementId: achievement.id,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Cached new icon for boss: ${bossName} -> ${iconUrl}`);
      return iconUrl;
    } catch (error: any) {
      console.error(`Error getting boss icon for "${bossName}":`, error.message);
      return null;
    }
  }

  /**
   * Batch fetch boss icons for multiple boss names (deduplicates automatically)
   */
  public async getBossIconUrls(bossNames: string[]): Promise<Map<string, string | null>> {
    // Deduplicate boss names
    const uniqueBossNames = [...new Set(bossNames)];

    if (uniqueBossNames.length < bossNames.length) {
      console.log(`🔄 Deduplicated ${bossNames.length} boss names to ${uniqueBossNames.length} unique names`);
    }

    // Process all unique boss names concurrently
    const results = await Promise.all(
      uniqueBossNames.map(async (bossName) => {
        const iconUrl = await this.getBossIconUrl(bossName);
        return [bossName, iconUrl] as const;
      })
    );

    // Return as a Map for easy lookup
    return new Map(results);
  }

  /**
   * Initialize achievements if none exist
   */
  public async initializeIfNeeded(): Promise<void> {
    try {
      const count = await Achievement.countDocuments();
      if (count === 0) {
        console.log("🚀 No achievements found, performing initial fetch...");
        await this.updateAchievements();
      }
    } catch (error: any) {
      console.error("Error during initialization:", error.message);
      // Don't throw here, as this is initialization and shouldn't block startup
    }
  }
}
