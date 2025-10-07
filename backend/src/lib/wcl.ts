import axios from "axios";
import NodeCache from "node-cache";
import { Report, CachedEvents, ReportDocument, CachedEventsDocument } from "../models/index";

// Token cache - expires after 1 hour (tokens are valid for 86400s but we refresh earlier)
const tokenCache = new NodeCache({ stdTTL: 3600 });

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
        nextPageTimestamp?: number;
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
    const cached = tokenCache.get<string>("access_token");
    if (cached) {
      return cached;
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

      const response = await axios.post<WCLAccessTokenResponse>(`${this.apiBase}/oauth/token`, "grant_type=client_credentials", {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const token = response.data.access_token;
      tokenCache.set("access_token", token);

      console.log("WCL access token obtained successfully");
      return token;
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
      return null;
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

      return {
        ...report,
        fights: enhancedFights,
      };
    } catch (error: any) {
      console.error(`Error fetching enhanced report ${reportCode}:`, error.message);
      return null;
    }
  }

  async getEvents(
    reportCode: string,
    fightId?: number,
    startTime?: number,
    endTime?: number,
    eventTypes: string[] = ["Deaths", "Casts"]
  ): Promise<{ events: SimpleEvent[]; cached: boolean; lastUpdated?: Date }> {
    try {
      // Check cache first
      if (fightId && startTime && endTime) {
        const cached = await CachedEvents.findOne({
          reportCode,
          fightId,
          startTime,
          endTime,
        });

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

      // Fetch from WCL API
      const events: SimpleEvent[] = [];
      let nextPageTimestamp: number | undefined;
      let pageCount = 0;
      const maxPages = 10; // Safety limit

      do {
        const query = `
          query GetEvents($code: String!, $startTime: Float!, $endTime: Float!, $filterExpression: String) {
            reportData {
              report(code: $code) {
                events(
                  startTime: $startTime
                  endTime: $endTime
                  filterExpression: $filterExpression
                  limit: 1000
                  ${nextPageTimestamp ? `startingAfterTime: ${nextPageTimestamp}` : ""}
                ) {
                  data
                  nextPageTimestamp
                }
              }
            }
          }
        `;

        const filterExpressions = eventTypes
          .map((type) => {
            if (type === "Deaths") {
              return "type = 'death'";
            } else if (type === "Casts") {
              return "type = 'cast' and source.disposition = 'enemy'";
            }
            return "";
          })
          .filter(Boolean);

        const variables: any = {
          code: reportCode,
          startTime: startTime || 0,
          endTime: endTime || Date.now(),
          filterExpression: filterExpressions.join(" or "),
        };

        const result = await this.executeGraphQLQuery<WCLEventsResponse>(query, variables);
        const eventData = result.reportData?.report?.events;

        if (!eventData || !eventData.data) {
          break;
        }

        // Process events
        eventData.data.forEach((event: any) => {
          const eventType = event.type === "death" ? "Deaths" : "Casts";
          events.push({
            reportCode,
            fightId: fightId || 0,
            timestamp: event.timestamp,
            type: eventType as "Deaths" | "Casts",
            sourceID: event.sourceID,
            targetID: event.targetID,
            abilityGameID: event.abilityGameID,
            ability: event.ability,
            data: event.data,
          });
        });

        nextPageTimestamp = eventData.nextPageTimestamp;
        pageCount++;
      } while (nextPageTimestamp && pageCount < maxPages);

      // Cache the results if we have fight and time info
      if (fightId && startTime && endTime && events.length > 0) {
        try {
          const cacheData = {
            reportCode,
            fightId,
            startTime,
            endTime,
            events,
            lastUpdated: new Date(),
          };

          console.log(`Caching ${events.length} events for ${reportCode} fight ${fightId}`);
          await CachedEvents.findOneAndUpdate({ reportCode, fightId, startTime, endTime }, cacheData, { upsert: true, new: true });
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
      return { events: [], cached: false };
    }
  }
}
