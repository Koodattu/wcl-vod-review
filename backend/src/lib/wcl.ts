import axios from "axios";
import { Report, CachedEvents, AuthToken } from "../models/index";

interface WCLAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface WCLGraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

interface WCLReportData {
  reportData: {
    report: {
      startTime: number;
      endTime: number;
      title: string;
      owner: { name: string };
      fights: Array<{
        id: number;
        name: string;
        startTime: number;
        endTime: number;
        encounterID?: number;
        difficulty?: number;
        kill?: boolean;
        fightPercentage?: number;
        lastPhase?: number;
      }>;
    } | null;
  } | null;
}

interface WCLEventsResponse {
  reportData: {
    report: {
      events: {
        data: Array<{
          timestamp: number;
          type: string;
          sourceID?: number;
          targetID?: number;
          abilityGameID?: number;
          ability?: { name: string; guid: number; type: number };
          data?: any;
        }>;
        nextPageTimestamp?: number | null;
      } | null;
    } | null;
  } | null;
}

interface SimpleReport {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner: { name: string };
  fights: Array<{
    id: number;
    name: string;
    startTime: number;
    endTime: number;
    encounterID?: number;
    difficulty?: number;
    kill?: boolean;
    fightPercentage?: number;
    lastPhase?: number;
  }>;
  lastUpdated: Date;
  lastFightCount: number;
}

interface EnhancedSimpleReport extends Omit<SimpleReport, "fights"> {
  fights: Array<{
    id: number;
    name: string;
    startTime: number;
    endTime: number;
    encounterID?: number;
    journalID?: number;
    encounterName?: string;
    zoneName?: string;
    difficulty?: number;
    kill?: boolean;
    fightPercentage?: number;
    lastPhase?: number;
  }>;
}

interface AbilityInfo {
  gameID: number;
  name: string;
  icon: string;
  type?: number;
}

interface ActorInfo {
  id: number;
  name: string;
  type: string; // "Player", "NPC", "Pet"
  subType?: string; // For players: class name, for NPCs: "NPC" or "Boss"
  server?: string;
  icon?: string;
  petOwner?: number;
}

interface SimpleEvent {
  reportCode: string;
  fightId: number;
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  ability?: { name: string; guid: number; type: number };
  data?: any;
  // Enhanced data
  abilityInfo?: AbilityInfo;
  sourceInfo?: ActorInfo;
  targetInfo?: ActorInfo;
}

interface EncounterDetails {
  id: number;
  name: string;
  journalID: number;
  zone: {
    id: number;
    name: string;
  };
}

export class WarcraftLogsClient {
  private clientId: string;
  private clientSecret: string;
  private apiBase: string;

  constructor() {
    this.clientId = process.env.WCL_CLIENT_ID || "";
    this.clientSecret = process.env.WCL_CLIENT_SECRET || "";
    this.apiBase = process.env.WCL_API_BASE || "https://www.warcraftlogs.com";

    if (!this.clientId || !this.clientSecret) {
      throw new Error("WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set in environment variables");
    }
  }

  async getAccessToken(): Promise<string> {
    // Check if we have a valid token in the database
    const existingToken = await AuthToken.findOne({ service: "wcl" });

    if (existingToken && existingToken.expiresAt > new Date()) {
      return existingToken.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

      const response = await axios.post<WCLAccessTokenResponse>(`${this.apiBase}/oauth/token`, "grant_type=client_credentials", {
        timeout: 15_000,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token, token_type, expires_in } = response.data;

      // Calculate expiration time (subtract 60 seconds for safety buffer)
      const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

      // Store in database (upsert to replace existing token)
      await AuthToken.findOneAndUpdate(
        { service: "wcl" },
        {
          service: "wcl",
          accessToken: access_token,
          tokenType: token_type,
          expiresAt,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ WCL access token acquired, expires at: ${expiresAt.toISOString()}`);
      return access_token;
    } catch (error: any) {
      console.error("Error getting WCL access token:", error.response?.data || error.message);
      throw new Error("Failed to authenticate with Warcraft Logs API");
    }
  }

  async executeGraphQLQuery<T>(query: string, variables: any = {}): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await axios.post<WCLGraphQLResponse<T>>(
        `${this.apiBase}/api/v2/client`,
        {
          query,
          variables,
        },
        {
          timeout: 15_000,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${response.data.errors.map((e) => e.message).join(", ")}`);
      }

      return response.data.data;
    } catch (error: any) {
      console.error("GraphQL query error:", error.response?.data || error.message);
      throw new Error("Failed to execute GraphQL query");
    }
  }

  async getReportSummary(reportCode: string): Promise<SimpleReport | null> {
    try {
      // Check cache first
      console.log(`Checking for cached report: ${reportCode}`);
      const cachedReport = await Report.findOne({ code: reportCode });

      if (cachedReport) {
        // Check if cache is still valid (under 1 hour old)
        const cacheAge = Date.now() - cachedReport.lastUpdated.getTime();
        const oneHour = 60 * 60 * 1000;

        if (cacheAge < oneHour) {
          console.log(`Using cached report for ${reportCode} (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
          return cachedReport.toObject() as SimpleReport;
        } else {
          console.log(`Cached report for ${reportCode} is too old (${Math.round(cacheAge / 1000 / 60)} minutes), fetching fresh data`);
        }
      } else {
        console.log(`No cached report found for ${reportCode}, fetching from WCL`);
      }

      // Fetch from WCL API
      const query = `
        query GetReport($code: String!) {
          reportData {
            report(code: $code) {
              title
              startTime
              endTime
              owner {
                name
              }
              fights {
                id
                name
                startTime
                endTime
                encounterID
                difficulty
                kill
                fightPercentage
                lastPhase
              }
            }
          }
        }
      `;

      const variables = { code: reportCode };
      const result = await this.executeGraphQLQuery<WCLReportData>(query, variables);

      const reportData = result.reportData?.report;
      if (!reportData) {
        return null;
      }

      // Filter out trash fights (encounterID <= 0 or missing)
      const bossFights = reportData.fights.filter((f) => f.encounterID && f.encounterID > 0);
      // Create report object
      const report: SimpleReport = {
        code: reportCode,
        title: reportData.title,
        startTime: reportData.startTime,
        endTime: reportData.endTime,
        owner: reportData.owner,
        fights: bossFights,
        lastUpdated: new Date(),
        lastFightCount: bossFights.length,
      };

      // Update or create cache
      try {
        if (cachedReport) {
          console.log(`Updating cached report for ${reportCode}`);
          await Report.updateOne({ code: reportCode }, report);
          console.log(`✅ Updated cached report for ${reportCode}`);
        } else {
          console.log(`Creating new cached report for ${reportCode}`);
          await new Report(report).save();
          console.log(`✅ Created new cached report for ${reportCode}`);
        }
      } catch (dbError: any) {
        console.error(`❌ Database error saving report ${reportCode}:`, dbError.message);
        // Don't fail the request if database save fails, just log and continue
      }

      return report;
    } catch (error: any) {
      console.error(`Error fetching report ${reportCode}:`, error.message);
      throw error;
    }
  }

  async getEncounterDetails(encounterID: number): Promise<EncounterDetails | null> {
    try {
      const query = `
        query GetEncounter($encounterID: Int!) {
          worldData {
            encounter(id: $encounterID) {
              id
              name
              journalID
              zone {
                id
                name
              }
            }
          }
        }
      `;

      const variables = { encounterID };
      const result = await this.executeGraphQLQuery<{
        worldData: {
          encounter: EncounterDetails | null;
        };
      }>(query, variables);

      return result.worldData?.encounter || null;
    } catch (error: any) {
      console.error(`Error fetching encounter details for ID ${encounterID}:`, error.message);
      return null;
    }
  }

  async getMasterData(reportCode: string): Promise<{
    abilities: Map<number, AbilityInfo>;
    actors: Map<number, ActorInfo>;
  }> {
    try {
      const query = `
        query GetMasterData($code: String!) {
          reportData {
            report(code: $code) {
              masterData {
                abilities {
                  gameID
                  name
                  icon
                  type
                }
                actors {
                  id
                  name
                  type
                  subType
                  server
                  icon
                  petOwner
                }
              }
            }
          }
        }
      `;

      const variables = { code: reportCode };
      const result = await this.executeGraphQLQuery<{
        reportData: {
          report: {
            masterData: {
              abilities: AbilityInfo[];
              actors: ActorInfo[];
            } | null;
          } | null;
        } | null;
      }>(query, variables);

      const masterData = result.reportData?.report?.masterData;

      const abilities = new Map<number, AbilityInfo>();
      const actors = new Map<number, ActorInfo>();

      if (masterData) {
        masterData.abilities?.forEach((ability) => {
          abilities.set(ability.gameID, ability);
        });

        masterData.actors?.forEach((actor) => {
          actors.set(actor.id, actor);
        });
      }

      console.log(`Fetched master data for ${reportCode}: ${abilities.size} abilities, ${actors.size} actors`);

      return { abilities, actors };
    } catch (error: any) {
      console.error(`Error fetching master data for ${reportCode}:`, error.message);
      throw error;
    }
  }

  async getMultipleEncounterDetails(encounterIDs: number[]): Promise<Map<number, EncounterDetails>> {
    const encounterMap = new Map<number, EncounterDetails>();

    // Remove duplicates
    const uniqueIDs = [...new Set(encounterIDs)];

    try {
      // We can query multiple encounters in a single request by using multiple encounter fields
      // However, GraphQL doesn't support dynamic field names easily, so we'll batch them
      const batchSize = 10; // Reasonable batch size

      for (let i = 0; i < uniqueIDs.length; i += batchSize) {
        const batch = uniqueIDs.slice(i, i + batchSize);

        // Create a query with multiple encounter calls
        const encounterQueries = batch
          .map(
            (id, index) =>
              `encounter${index}: encounter(id: ${id}) {
            id
            name
            journalID
            zone {
              id
              name
            }
          }`
          )
          .join("\n");

        const query = `
          query GetMultipleEncounters {
            worldData {
              ${encounterQueries}
            }
          }
        `;

        const result = await this.executeGraphQLQuery<{
          worldData: Record<string, EncounterDetails | null>;
        }>(query);

        // Process results
        if (result.worldData) {
          Object.values(result.worldData).forEach((encounter) => {
            if (encounter && encounter.id) {
              encounterMap.set(encounter.id, encounter);
            }
          });
        }
      }
    } catch (error: any) {
      console.error(`Error fetching multiple encounter details:`, error.message);
      // Fall back to individual requests
      for (const encounterID of uniqueIDs) {
        const encounter = await this.getEncounterDetails(encounterID);
        if (encounter) {
          encounterMap.set(encounterID, encounter);
        }
      }
    }

    return encounterMap;
  }

  async getReportWithEncounterDetails(reportCode: string): Promise<EnhancedSimpleReport | null> {
    try {
      // First get the basic report
      const report = await this.getReportSummary(reportCode);
      if (!report) {
        return null;
      }

      // Get unique encounter IDs from fights
      const encounterIDs = report.fights.map((f) => f.encounterID).filter((id): id is number => id !== undefined && id > 0);

      if (encounterIDs.length === 0) {
        // No encounters to enhance, return as is but with enhanced type
        return {
          ...report,
          fights: report.fights.map((fight) => ({
            ...fight,
            journalID: undefined,
            encounterName: undefined,
            zoneName: undefined,
          })),
        };
      }

      // Get encounter details
      const encounterDetails = await this.getMultipleEncounterDetails(encounterIDs);

      // Enhance fights with encounter details
      const enhancedFights = report.fights.map((fight) => {
        const encounterDetail = fight.encounterID ? encounterDetails.get(fight.encounterID) : undefined;

        return {
          ...fight,
          journalID: encounterDetail?.journalID,
          encounterName: encounterDetail?.name,
          zoneName: encounterDetail?.zone?.name,
        };
      });

      const enhancedReport = {
        ...report,
        fights: enhancedFights,
      };

      // Only a fresh report response may update the cached fights and source age.
      return enhancedReport;
    } catch (error: any) {
      console.error(`Error fetching enhanced report ${reportCode}:`, error.message);
      throw error;
    }
  }

  async getEvents(
    reportCode: string,
    fightId?: number,
    startTime?: number,
    endTime?: number,
    eventTypes: string[] = ["Deaths", "Casts"]
  ): Promise<{ events: SimpleEvent[]; cached: boolean; lastUpdated?: Date }> {
    const normalizedTypes = [...new Set(eventTypes)].sort();
    const cacheKey = fightId !== undefined && startTime !== undefined && endTime !== undefined
      ? { reportCode, fightId, startTime, endTime, eventTypes: normalizedTypes, cacheVersion: 2 }
      : null;
    try {
      // Check cache first
      if (cacheKey) {
        const cached = await CachedEvents.findOne(cacheKey);

        if (cached) {
          // Check if cache is still valid (under 15 minutes old)
          const cacheAge = Date.now() - cached.lastUpdated.getTime();
          const fifteenMinutes = 15 * 60 * 1000;

          if (cacheAge < fifteenMinutes) {
            console.log(`Using cached events for ${reportCode} fight ${fightId}`);
            return {
              events: cached.events as SimpleEvent[],
              cached: true,
              lastUpdated: cached.lastUpdated,
            };
          }
        }
      }

      // Fetch master data first (abilities and actors)
      console.log(`Fetching master data for ${reportCode}...`);
      const { abilities, actors } = await this.getMasterData(reportCode);

      // Fetch from WCL API
      const events: SimpleEvent[] = [];
      let nextPageTimestamp: number | null | undefined;
      let pageCount = 0;
      const maxPages = 100; // Bound upstream work; never return a truncated success.

      do {
        const query = `
          query GetEvents($code: String!, $startTime: Float!, $endTime: Float!, $filterExpression: String, $fightIDs: [Int]) {
            reportData {
              report(code: $code) {
                events(
                  startTime: $startTime
                  endTime: $endTime
                  filterExpression: $filterExpression
                  fightIDs: $fightIDs
                  limit: 1000
                ) {
                  data
                  nextPageTimestamp
                }
              }
            }
          }
        `;

        const filterExpressions = normalizedTypes
          .map((type) => {
            if (type === "Deaths") {
              // Filter to only player deaths (exclude pets and NPCs)
              return "type = 'death' and target.type = 'Player'";
            } else if (type === "Casts") {
              // Filter to only boss casts (exclude trash mobs)
              return "type = 'cast' and source.type = 'NPC'";
            }
            return "";
          })
          .filter(Boolean);

        const variables: any = {
          code: reportCode,
          startTime: nextPageTimestamp ?? startTime ?? 0,
          endTime: endTime ?? Date.now(),
          filterExpression: filterExpressions.join(" or "),
          fightIDs: fightId !== undefined ? [fightId] : undefined,
        };

        const result = await this.executeGraphQLQuery<WCLEventsResponse>(query, variables);
        const eventData = result.reportData?.report?.events;

        if (!eventData || !Array.isArray(eventData.data)) {
          throw new Error("Warcraft Logs did not return events for this report. Retry or check the report link.");
        }

        // Process events and enhance with master data
        eventData.data.forEach((event: any) => {
          const eventType = event.type === "death" ? "Deaths" : "Casts";

          // Build enhanced event
          const enhancedEvent: SimpleEvent = {
            reportCode,
            fightId: fightId || 0,
            timestamp: event.timestamp,
            type: eventType as "Deaths" | "Casts",
            sourceID: event.sourceID,
            targetID: event.targetID,
            abilityGameID: event.abilityGameID,
            ability: event.ability,
            data: event.data,
          };

          // Add ability info if available
          if (event.abilityGameID && abilities.has(event.abilityGameID)) {
            enhancedEvent.abilityInfo = abilities.get(event.abilityGameID);
          }

          // Add source actor info if available
          if (event.sourceID && actors.has(event.sourceID)) {
            enhancedEvent.sourceInfo = actors.get(event.sourceID);
          }

          // Add target actor info if available (important for deaths)
          if (event.targetID && actors.has(event.targetID)) {
            enhancedEvent.targetInfo = actors.get(event.targetID);
          }

          events.push(enhancedEvent);
        });

        nextPageTimestamp = eventData.nextPageTimestamp;
        pageCount++;
        if (nextPageTimestamp !== null && nextPageTimestamp !== undefined) {
          if (!Number.isFinite(nextPageTimestamp) || nextPageTimestamp <= variables.startTime || nextPageTimestamp > variables.endTime) {
            throw new Error("Warcraft Logs event pagination did not advance. Please retry.");
          }
          if (pageCount >= maxPages) {
            throw new Error("This event range is too large. Select a shorter fight and retry.");
          }
        }
      } while (nextPageTimestamp !== null && nextPageTimestamp !== undefined);

      console.log(`Fetched ${events.length} events for ${reportCode} fight ${fightId || "all"}`);

      // Cache the results if we have fight and time info
      if (cacheKey) {
        try {
          const cacheData = {
            ...cacheKey,
            events,
            lastUpdated: new Date(),
          };

          console.log(`Caching ${events.length} events for ${reportCode} fight ${fightId}`);
          await CachedEvents.findOneAndUpdate(cacheKey, cacheData, { upsert: true, new: true });
          console.log(`✅ Cached events for ${reportCode} fight ${fightId}`);
        } catch (dbError: any) {
          console.error(`❌ Database error saving events for ${reportCode} fight ${fightId}:`, dbError.message);
          // Don't fail the request if database save fails, just log and continue
        }
      }

      return {
        events,
        cached: false,
        lastUpdated: new Date(),
      };
    } catch (error: any) {
      console.error(`Error fetching events for ${reportCode}:`, error.message);
      throw error;
    }
  }
}
