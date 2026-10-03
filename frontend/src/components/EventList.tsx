"use client";

import { useRef } from "react";
import type { Event } from "@/lib/api";
import { eventName, formatEventTime, type EventFilter } from "@/lib/events";

const PAGE_SIZE = 25;

export function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = String(wholeSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export default function EventList({ events, totalCount, fightStart, filter, query, leadIn, page, activeTimestamp,
  onFilterChange, onQueryChange, onLeadInChange, onPageChange, onClear, onSeek }: {
  events: Event[]; totalCount: number; fightStart: number; filter: EventFilter; query: string; leadIn: number;
  page: number; activeTimestamp: number | null;
  onFilterChange: (type: EventFilter) => void; onQueryChange: (query: string) => void;
  onLeadInChange: (seconds: number) => void; onClear: () => void; onSeek: (seconds: number) => void;
  onPageChange: (page: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const changePage = (next: number) => { onPageChange(next); listRef.current?.scrollTo(0, 0); };

  return (
    <section aria-label="Fight events" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Fight events</h2>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <label htmlFor="event-filter">Show</label>
          <select id="event-filter" className="field field-auto" value={filter} onChange={e => { onFilterChange(e.target.value as EventFilter); listRef.current?.scrollTo(0, 0); }}>
            <option value="all">All events</option>
            <option value="Deaths">Player deaths</option>
            <option value="Casts">NPC abilities</option>
          </select>
        </div>
      </div>
      <div className="event-search-controls">
      <div className="min-w-0 space-y-2">
        <label htmlFor="event-search" className="text-sm font-medium">Search events</label>
        <input ref={searchRef} id="event-search" type="search" className="field" placeholder="Ability, player or NPC" maxLength={160}
          value={query} onChange={e => { onQueryChange(e.target.value); listRef.current?.scrollTo(0, 0); }} />
      </div>
      <div className="space-y-2 text-sm text-gray-300">
        <label htmlFor="event-lead-in">Playback lead-in</label>
        <select id="event-lead-in" className="field" value={leadIn} onChange={e => onLeadInChange(Number(e.target.value))}>
          <option value="0">At the event</option>
          <option value="3">3 seconds before</option>
          <option value="5">5 seconds before</option>
          <option value="10">10 seconds before</option>
        </select>
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status" className="text-gray-300">{events.length} of {totalCount} events</p>
        {(query || filter !== "all") && <button className="text-link" onClick={() => { onClear(); listRef.current?.scrollTo(0, 0); searchRef.current?.focus(); }}>Clear event filters</button>}
      </div>
      <p id="event-time-help" className="text-xs text-gray-400">Time since fight start · select an event to watch{leadIn ? ` from ${leadIn}s before it` : ""}.</p>
      {!events.length ? <p className="notice text-gray-300">No tracked events match this filter.</p> : (
        <ol ref={listRef} aria-label="Matching events" aria-describedby="event-time-help" tabIndex={0} className="event-rows">
          {events.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              <button type="button" aria-current={activeTimestamp === event.timestamp ? "true" : undefined}
                onClick={() => onSeek(event.timestamp / 1000)} className="event-row">
                <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-blue-300">{formatEventTime(event.timestamp - fightStart)}</span>
                <span className="min-w-0 break-words text-sm">
                  <span className={event.type === "Deaths" ? "text-red-300" : "text-orange-300"}>{event.type === "Deaths" ? "Death" : "Cast"}</span>
                  {" · "}{eventName(event)}
                  {event.type === "Casts" && <span className="mt-1 block text-xs text-gray-400">{event.sourceInfo?.name || "Unknown NPC"}
                    {event.targetInfo?.name && event.targetInfo.name !== "Environment" ? ` → ${event.targetInfo.name}` : ""}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button className="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous events</button>
        <span className="text-gray-300">Page {currentPage + 1} of {pageCount}</span>
        <button className="button" disabled={currentPage === pageCount - 1} onClick={() => changePage(currentPage + 1)}>Next events</button>
      </div>}
    </section>
  );
}
