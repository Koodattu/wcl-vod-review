# Review workspace

Primary discipline: Interface Design, with End-User UI/UX and visualization accessibility/testing. This is an operational tool for reviewing raid footage. Design decisions below are agent-selected from repository behavior and synthetic browser observation, not user research.

## Task and structure

Choose a pull → find an event → watch its context → capture/share a finding. Video and events are the primary evidence. Notes follow that work; calibration and the session timeline remain directly reachable.

Considered: a three-pane boss/video/event console (too little video width on common laptops); separate video/events/notes pages (breaks synchronized review); a two-column video/event workspace with compact fight navigation and subordinate timeline/notes. Choose the last, preserving existing links, players and canvas.

Desktop: compact report header, fight navigation, video and bounded event results beside one another, action bar, full-width timeline, notes. Mobile: report/fight context, video, actions, event search/results, timeline and notes. The event list is the precise touch/keyboard alternative to dense canvas marks. Scrolling the page remains available outside bounded lists; no new gesture capture, sticky overlays or animation.

## Visual system and component intent

Domain: pulls, casts, player deaths, recordings, alignment, raid debrief. Color world: dark raid-review room, blue recording bar, purple combat-log bar, amber NPC casts, red death events, green confirmed kills. Signature: a synchronized video/log time relationship, repeated in event timestamps, timeline bars, calibration, moment links and note capture.

Keep the existing dark identity. Evolve its primitives into semantic CSS tokens: canvas #101014, panel #181824, inset #14141e, control #202031, border #35354a, control-border #45455e, primary text #f3f4f6, secondary #cbd5e1, muted #a1a1aa, selected/focus #93c5fd. Blue action, purple report, amber cast and red death retain distinct meanings; labels never rely on color alone.

Intent for fight navigation: find the relevant pull without losing the recording. Current selection leads; discovery filters are disclosed. Intent for events: locate exact evidence and watch its lead-up; named events and aligned timestamps lead, counts and source details support. Intent for notes: retain observations after inspection, with browser-only storage explicit.

Use the existing Arial/Helvetica body and Consolas timing numerals. Report title 22–24px/600, section headings 18px/600, body/control 14–16px, metadata 12–14px. Weight, contrast and space establish hierarchy. Four-pixel spacing base: 8px within controls, 12–16px panel padding, 20–24px between work areas. Use subdued boundaries and surface shifts, no decorative shadows or gradients. Controls ≥44px, six-pixel radius; native buttons, select, details and inputs. Preserve visible focus and reduced-motion behavior.

## Data and interaction contract

- One existing Canvas2D timeline plus DOM event/fight lists; no new rendering library. Render at most 25 events in the list at a time; browse result list bounded. Filter all loaded events once, use the same result for list and canvas. Melee stays excluded everywhere.
- Report/fight/event timestamps retain their existing API units: report start/end epoch milliseconds, fight/event times milliseconds from report start. List time is elapsed since selected fight; seeking uses report seconds minus calibration. Lead-in affects playback only, never the event's label or note timestamp, clamps at video start, and rejects events outside the recording before subtracting lead-in.
- Death counts are event occurrences (resurrected players may die again), not unique people. Optional result is Kill/Wipe/Unknown. Do not invent health percentages or cause-of-death claims.
- Selected fight, boss/result browse filters, event type/query/page/lead-in use validated URL state; push discrete fight changes, replace typing/filter preferences. Refresh and Back/Forward restore the view without remounting the player or deleting drafts. Private note text never enters URLs. Shared moment links retain their exact position/calibration contract and include the event view. Save review retains its existing storage format. Previous/Next steps through the full report; browse filters affect discovery only.
- Successful seeks bring the recording into view without animation. Find events returns to the preserved event view; focus is not stolen on seek. Failed seeks keep the last successful event highlighted. A narrow selector has a separate full name/outcome/duration readout.
- Unknown fight IDs fall back visibly to the first available fight. Empty data, no matches, loading and provider errors stay distinct. No automatic live refresh or freshness claims are introduced.
- Desktop/mobile portrait/landscape and 320px checks; keyboard activation, focus, query reset, no results, out-of-order timestamps, repeated deaths, unknown outcomes, reload/history, exact seeking, notes, and failed requests. Synthetic SDK tests do not prove actual provider playback.

No accounts, cloud persistence, sensor capabilities, auth-policy changes, new infrastructure, migrations or production dependencies are required.
