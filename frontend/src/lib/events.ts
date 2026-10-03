import type { Event } from "./api";

export type EventFilter = "all" | "Deaths" | "Casts";

export function eventName(event: Event) {
  return event.type === "Deaths" ? event.targetInfo?.name || "Unknown player"
    : event.abilityInfo?.name || event.ability?.name || `Spell ${event.abilityGameID || "unknown"}`;
}

export function trackedEvents(events: Event[]) {
  return events.filter(event => event.type === "Deaths" ||
    (event.type === "Casts" && eventName(event).toLowerCase() !== "melee"))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function filterEvents(events: Event[], type: EventFilter, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter(event => {
    if (type !== "all" && event.type !== type) return false;
    const text = [eventName(event), event.sourceInfo?.name, event.targetInfo?.name].join(" ").toLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export function formatEventTime(milliseconds: number) {
  const ms = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(ms / 60000);
  return `${minutes}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
