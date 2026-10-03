"use client";

import { useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { Fight } from "@/lib/api";
import { updateReviewView } from "@/lib/reviewView";
import { formatTime } from "./EventList";

export function fightResult(fight: Fight) {
  return fight.kill === true ? "Kill" : fight.kill === false ? "Wipe" : "Unknown result";
}

export default function FightNavigator({ fights, selectedId, onSelect, onJump }: {
  fights: Fight[]; selectedId: number | null; onSelect: (id: number) => void; onJump: () => void;
}) {
  const params = useSearchParams();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const bosses = useMemo(() => [...new Set(fights.map(fight => fight.name))], [fights]);
  const rawBoss = params.get("boss") || "";
  const boss = bosses.includes(rawBoss) ? rawBoss : "";
  const rawResult = params.get("result") || "all";
  const result = ["kill", "wipe", "unknown"].includes(rawResult) ? rawResult : "all";
  const matches = fights.filter(fight => (!boss || fight.name === boss) &&
    (result === "all" || (result === "kill" ? fight.kill === true : result === "wipe" ? fight.kill === false : fight.kill == null)));
  const selectedIndex = fights.findIndex(fight => fight.id === selectedId);
  const selectedFight = fights[selectedIndex];

  return <section aria-label="Fight selection" className="fight-navigation">
    <div className="fight-stepper">
      <div className="min-w-0">
        <label htmlFor="fight" className="sr-only">Fight</label>
        <select ref={selectRef} id="fight" className="field" value={selectedId ?? ""} onChange={event => onSelect(Number(event.target.value))}>
          {selectedId === null && <option value="" disabled>Select a fight</option>}
          {fights.map(fight => <option key={fight.id} value={fight.id}>
            Fight {fight.id} · {fight.name} · {fightResult(fight)} · {formatTime((fight.endTime - fight.startTime) / 1000)}
          </option>)}
        </select>
      </div>
      <button className="button" aria-label="Previous fight" title="Previous fight" disabled={selectedIndex <= 0} onClick={() => onSelect(fights[selectedIndex - 1].id)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m10 3-5 5 5 5" /></svg>
      </button>
      <button className="button" aria-label="Next fight" title="Next fight" disabled={selectedIndex === fights.length - 1} onClick={() => onSelect(fights[selectedIndex + 1].id)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 3 5 5-5 5" /></svg>
      </button>
    </div>
    {selectedFight && <p className="selected-fight-context text-sm text-gray-300">{selectedFight.name} · {fightResult(selectedFight)} · {formatTime((selectedFight.endTime - selectedFight.startTime) / 1000)}</p>}
    <div className="fight-secondary">
      <button className="text-link" disabled={selectedId === null} onClick={onJump}>Jump to fight start</button>
      <details ref={detailsRef}>
      <summary className="disclosure"><span>Browse fights</span>{(boss || result !== "all") && <span className="ml-2 text-gray-400">({matches.length}/{fights.length})</span>}</summary>
      <section aria-label="Browse report fights" className="space-y-3 pb-2 pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-48 space-y-2"><label className="text-sm" htmlFor="boss-filter">Boss</label>
            <select id="boss-filter" className="field" value={boss} onChange={event => updateReviewView({ boss: event.target.value || null })}>
              <option value="">All bosses</option>{bosses.map(name => <option key={name}>{name}</option>)}
            </select>
          </div>
          <div className="space-y-2"><label className="text-sm" htmlFor="result-filter">Result</label>
            <select id="result-filter" className="field" value={result} onChange={event => updateReviewView({ result: event.target.value === "all" ? null : event.target.value })}>
              <option value="all">All results</option><option value="wipe">Wipes</option><option value="kill">Kills</option><option value="unknown">Unknown</option>
            </select>
          </div>
          <p role="status" className="py-3 text-sm text-gray-400">{matches.length} of {fights.length} fights</p>
          {(boss || result !== "all") && <button className="button" onClick={() => updateReviewView({ boss: null, result: null })}>Clear fight filters</button>}
        </div>
        {!matches.length ? <p className="notice">No fights match. Try another boss or result.</p> : <ol className="fight-rows" aria-label="Matching fights" tabIndex={0}>
          {matches.map(fight => <li key={fight.id}>
            <button className="fight-row" aria-current={fight.id === selectedId ? "true" : undefined} onClick={() => {
              onSelect(fight.id);
              if (detailsRef.current) detailsRef.current.open = false;
              selectRef.current?.focus();
            }}>
              <span className="text-sm tabular-nums text-gray-400">Fight {fight.id}</span>
              <span className="min-w-0 break-words font-medium">{fight.name}</span>
              <span className={fight.kill === true ? "text-green-300" : fight.kill === false ? "text-red-300" : "text-gray-400"}>{fightResult(fight)}</span>
              <span className="font-mono text-sm tabular-nums text-gray-300">{formatTime((fight.endTime - fight.startTime) / 1000)}</span>
            </button>
          </li>)}
        </ol>}
      </section>
    </details>
    </div>
  </section>;
}
