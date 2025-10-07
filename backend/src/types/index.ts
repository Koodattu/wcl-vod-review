// Database Models
export interface IReport {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner: {
    name: string;
  };
  fights: IFight[];
  lastUpdated: Date;
  lastFightCount: number;
}

export interface IFight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID?: number;
  difficulty?: number;
  kill?: boolean;
  fightPercentage?: number;
  lastPhase?: number;
}

export interface IEnhancedFight extends IFight {
  journalID?: number;
  encounterName?: string;
  zoneName?: string;
}

export interface IEnhancedReport extends Omit<IReport, "fights"> {
  fights: IEnhancedFight[];
}

export interface IEncounterDetails {
  id: number;
  name: string;
  journalID: number;
  zone: {
    id: number;
    name: string;
  };
}

export interface IEvent {
  reportCode: string;
  fightId: number;
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  fight?: number;
  source?: any;
  target?: any;
  ability?: any;
  data?: any;
}

export interface ICachedEvents {
  reportCode: string;
  fightId: number;
  startTime: number;
  endTime: number;
  events: IEvent[];
  lastUpdated: Date;
}

// API Request/Response Types
export interface ParseURLsRequest {
  wclUrl: string;
  vodUrl: string;
}

export interface ParseURLsResponse {
  wcl: {
    code: string;
    fightId?: number;
  };
  vod: {
    platform: "youtube" | "twitch";
    id: string;
    startSeconds?: number;
  };
}

export interface GetEventsRequest {
  fightId?: number;
  startTime: number;
  endTime: number;
  eventTypes?: string[];
}

export interface GetEventsResponse {
  events: IEvent[];
  cached: boolean;
  lastUpdated?: Date;
}

// WCL API Types
export interface WCLAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface WCLGraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: any;
  }>;
}

export interface WCLReportData {
  reportData: {
    report: {
      code: string;
      title: string;
      startTime: number;
      endTime: number;
      owner: {
        name: string;
      };
      fights: WCLFight[];
    };
  };
}

export interface WCLFight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID?: number;
  difficulty?: number;
  kill?: boolean;
  fightPercentage?: number;
  lastPhase?: number;
}

export interface WCLEventsResponse {
  reportData: {
    report: {
      events: {
        data: any[];
        nextPageTimestamp: number | null;
      };
    };
  };
}

// URL Parsing Types
export interface YouTubeData {
  id: string;
  startSeconds: number;
}

export interface TwitchData {
  id: string;
}

export interface WCLData {
  code: string;
  fightId?: number;
}
