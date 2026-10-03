"use client";

import { useMemo, useState } from "react";
import type { Event } from "@/lib/api";

const PAGE_SIZE = 25;

export function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = String(wholeSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export default function EventList({ events, fightStart, onSeek }: {
  events: Event[]; fightStart: number; onSeek: (seconds: number) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => events
    .filter(event => (filter === "all" || event.type === filter) &&
      (event.type !== "Casts" || (event.abilityInfo?.name || event.ability?.name || "").toLowerCase() !== "melee"))
    .sort((a, b) => a.timestamp - b.timestamp), [events, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <section aria-label="Fight events" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Fight events <span className="text-sm font-normal text-gray-400">({filtered.length})</span></h2>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <label htmlFor="event-filter">Show</label>
          <select id="event-filter" className="field w-auto" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>
            <option value="all">All events</option>
            <option value="Deaths">Player deaths</option>
            <option value="Casts">NPC abilities</option>
          </select>
        </div>
      </div>
      <p className="text-sm text-gray-400">Times are relative to the fight start. Select an event to seek the video.</p>
      {!filtered.length ? <p className="py-4 text-gray-300">No tracked events match this filter.</p> : (
        <ol className="divide-y divide-[#35354a] rounded-lg border border-[#35354a]">
          {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              <button type="button" onClick={() => onSeek(event.timestamp / 1000)} className="flex min-h-12 w-full items-start gap-4 px-4 py-3 text-left hover:bg-[#232336]">
                <span className="w-14 shrink-0 font-mono text-sm tabular-nums text-blue-300">{formatTime((event.timestamp - fightStart) / 1000)}</span>
                <span className="min-w-0 break-words text-sm">
                  <span className={event.type === "Deaths" ? "text-red-300" : "text-orange-300"}>{event.type === "Deaths" ? "Death" : "Cast"}</span>
                  {" · "}{event.type === "Deaths" ? event.targetInfo?.name || "Unknown player" : event.abilityInfo?.name || event.ability?.name || `Spell ${event.abilityGameID || "unknown"}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button className="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous events</button>
        <span className="text-gray-300">Page {currentPage + 1} of {pageCount}</span>
        <button className="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next events</button>
      </div>}
    </section>
  );
}
