export const API_BASE = "/api";

export interface ParsedURLs {
  wcl: { code: string; fightId?: number };
  vod: { platform: "youtube" | "twitch"; id: string; startSeconds?: number };
}

export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  encounterID?: number;
  difficulty?: number;
  kill?: boolean;
  iconUrl?: string | null;
}

export interface Report {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  fights: Fight[];
}

export interface ActorInfo {
  id: number;
  name: string;
  type: string;
  subType?: string | null;
  icon?: string | null;
}

export interface Event {
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  ability?: { name: string; guid: number; type: number };
  abilityInfo?: { gameID: number; name: string; icon?: string | null; type?: number };
  sourceInfo?: ActorInfo;
  targetInfo?: ActorInfo;
}

export interface VideoMetadata {
  id: string;
  title: string;
  duration: number;
  publishedAt?: string;
  createdAt?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(45_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "The service is unavailable. Please retry.");
    }
    if (data === null) throw new Error("The service returned an unreadable response. Please retry.");
    return data as T;
  } catch (error) {
    if (timeout.aborted) throw new Error("The request took too long. Please retry.");
    if (error instanceof TypeError) throw new Error("Could not connect. Check your connection and retry.");
    throw error;
  }
}

export function parseURLs(wclUrl: string, vodUrl: string): Promise<ParsedURLs> {
  return request("/parse-urls", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wclUrl: wclUrl.trim(), vodUrl: vodUrl.trim() }),
  });
}

export function getWCLReport(code: string, signal?: AbortSignal): Promise<Report> {
  return request(`/wcl/reports/${encodeURIComponent(code)}`, { signal });
}

export function getWCLEvents(code: string, fightId: number | undefined, startTime: number, endTime: number,
  eventTypes: string[] = ["Deaths", "Casts"], signal?: AbortSignal): Promise<{ events: Event[] }> {
  return request(`/wcl/reports/${encodeURIComponent(code)}/events`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ fightId, startTime, endTime, eventTypes }),
  });
}

export function getVideoMetadata(platform: "youtube" | "twitch", videoId: string, signal?: AbortSignal): Promise<VideoMetadata> {
  return request(`/video-metadata/${platform}/${encodeURIComponent(videoId)}`, { signal });
}
