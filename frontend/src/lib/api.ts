// API utility functions for communicating with backend

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface WCLData {
  code: string;
  fightId?: number;
}

export interface VODData {
  platform: "youtube" | "twitch";
  id: string;
  startSeconds?: number;
}

export interface ParsedURLs {
  wcl: WCLData;
  vod: VODData;
}

export interface Fight {
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

export interface Report {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  owner: {
    name: string;
  };
  fights: Fight[];
}

export interface Event {
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  // Add more event properties as needed
}

export interface EventsResponse {
  events: Event[];
}

// Parse URLs
export async function parseURLs(wclUrl: string, vodUrl: string): Promise<ParsedURLs> {
  const response = await fetch(`${API_BASE}/api/parse-urls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wclUrl, vodUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to parse URLs");
  }

  return response.json();
}

// Get WCL report summary
export async function getWCLReport(code: string): Promise<Report> {
  const response = await fetch(`${API_BASE}/api/wcl/reports/${code}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch report");
  }

  return response.json();
}

// Get events for a fight
export async function getWCLEvents(
  code: string,
  fightId: number | undefined,
  startTime: number,
  endTime: number,
  eventTypes: string[] = ["Deaths", "Casts"]
): Promise<EventsResponse> {
  const response = await fetch(`${API_BASE}/api/wcl/reports/${code}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fightId,
      startTime,
      endTime,
      eventTypes,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch events");
  }

  return response.json();
}
