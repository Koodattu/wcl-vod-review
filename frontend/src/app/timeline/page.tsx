"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import VideoPlayer, { VideoPlayerRef } from "@/components/VideoPlayer";
import SuperTimeline from "@/components/SuperTimeline";
import EventList, { formatTime } from "@/components/EventList";
import ReviewNotebook from "@/components/ReviewNotebook";
import ReviewActions from "@/components/ReviewActions";
import FightNavigator from "@/components/FightNavigator";
import { filterEvents, trackedEvents } from "@/lib/events";
import { readEventView, updateReviewView } from "@/lib/reviewView";
import { isReviewIdentity, isReviewTime, type ReviewMoment, type ReviewSnapshot } from "@/lib/reviews";
import { getWCLReport, getWCLEvents, getVideoMetadata, type Report, type Event, type VideoMetadata } from "@/lib/api";

const EMPTY_EVENTS: Event[] = [];

function LoadingReview() {
  return <main className="page-shell"><Link href="/" className="text-link">New review</Link><p role="status" className="py-12 text-gray-300">Loading report data...</p></main>;
}

export default function TimelinePage() {
  return <Suspense fallback={<LoadingReview />}><TimelineContent /></Suspense>;
}

function TimelineContent() {
  const params = useSearchParams();
  const wclCode = params.get("wclCode");
  const platform = params.get("vodPlatform");
  const vodId = params.get("vodId");
  const start = Number(params.get("startSeconds"));
  const rawOffset = params.get("syncOffset");
  const sharedOffset = rawOffset?.trim() && isReviewTime(Number(rawOffset)) ? Number(rawOffset) : null;
  if (!wclCode || (platform !== "youtube" && platform !== "twitch") || !vodId || !isReviewIdentity(wclCode, platform, vodId)) {
    return <main className="page-shell space-y-4">
      <h1 className="text-2xl font-semibold">This review link is incomplete</h1>
      <p className="text-gray-300">Start a new review with a Warcraft Logs report and a YouTube or Twitch video.</p>
      <Link href="/" className="button button-primary">New review</Link>
    </main>;
  }
  return <TimelineReview key={[wclCode, platform, vodId, start, sharedOffset].join(":")}
    wclCode={wclCode} platform={platform} vodId={vodId}
    startSeconds={isReviewTime(start) && start >= 0 ? start : 0} sharedOffset={sharedOffset} />;
}

function TimelineReview({ wclCode, platform, vodId, startSeconds, sharedOffset }: {
  wclCode: string; platform: "youtube" | "twitch"; vodId: string;
  startSeconds: number; sharedOffset: number | null;
}) {
  const params = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportAttempt, setReportAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const rawFightId = params.get("fightId");
  const requestedFight = report?.fights.find(fight => fight.id === Number(rawFightId));
  const selectedFight = rawFightId === "none" ? null : requestedFight ?? report?.fights[0] ?? null;
  const selectedFightId = selectedFight?.id ?? null;
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [metadataError, setMetadataError] = useState("");
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [eventResult, setEventResult] = useState<{ fightId: number; events: Event[]; error?: string } | null>(null);
  const eventCache = useRef(new Map<number, Event[]>());
  const [eventAttempt, setEventAttempt] = useState(0);
  const [offset, setOffset] = useState(sharedOffset ?? 0);
  const [usingSharedOffset, setUsingSharedOffset] = useState(sharedOffset !== null);
  const [syncRevision, setSyncRevision] = useState(0);
  const [hasNoteDraft, setHasNoteDraft] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(startSeconds);
  const [seekMessage, setSeekMessage] = useState("");
  const { filter: eventFilter, query: eventQuery, leadIn, page: eventPage } = readEventView(params);
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const markPlayerReady = useCallback(() => setPlayerReady(true), []);
  const markPlayerUnavailable = useCallback(() => setPlayerReady(false), []);
  const playerRef = useRef<VideoPlayerRef>(null);
  const videoViewportRef = useRef<HTMLDivElement>(null);
  const syncStorageKey = "wcl-vod-review:sync:" + wclCode + ":" + platform + ":" + vodId;
  const [savedSync, setSavedSync] = useState(() => {
    try {
      const value = typeof window === "undefined" ? null : window.localStorage.getItem(syncStorageKey);
      return { offset: sharedOffset ?? (value !== null && isReviewTime(Number(value)) ? Number(value) : null), available: true };
    } catch {
      return { offset: sharedOffset, available: false };
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setReportError("");
      try {
        const data = await getWCLReport(wclCode, controller.signal);
        if (controller.signal.aborted) return;
        setReport(data);
      } catch (error) {
        if (!controller.signal.aborted) setReportError(error instanceof Error ? error.message : "Could not load the report.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [wclCode, reportAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setMetadataLoading(true);
      setMetadataError("");
      try {
        const data = await getVideoMetadata(platform, vodId, controller.signal);
        if (!controller.signal.aborted) setVideoMetadata(data);
      } catch (error) {
        if (!controller.signal.aborted) setMetadataError(error instanceof Error ? error.message : "Could not load video details.");
      } finally {
        if (!controller.signal.aborted) setMetadataLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [platform, vodId, metadataAttempt]);

  useEffect(() => {
    if (!selectedFight) return;
    const controller = new AbortController();
    const load = async () => {
      setEventResult(null);
      const cached = eventCache.current.get(selectedFight.id);
      if (cached) {
        setEventResult({ fightId: selectedFight.id, events: cached });
        return;
      }
      try {
        const data = await getWCLEvents(wclCode, selectedFight.id, selectedFight.startTime, selectedFight.endTime, undefined, controller.signal);
        if (controller.signal.aborted) return;
        eventCache.current.set(selectedFight.id, data.events);
        setEventResult({ fightId: selectedFight.id, events: data.events });
      } catch (error) {
        if (!controller.signal.aborted) setEventResult({ fightId: selectedFight.id, events: [], error: error instanceof Error ? error.message : "Could not load events." });
      }
    };
    void load();
    return () => controller.abort();
  }, [wclCode, selectedFight, eventAttempt]);

  const handleSeek = useCallback((reportSeconds: number, beforeSeconds = 0) => {
    if (!playerReady) {
      setSeekMessage("The video is still loading. Try again when the player is ready.");
      return false;
    }
    const eventVideoTime = reportSeconds - offset;
    if (eventVideoTime < 0 || (videoMetadata && eventVideoTime > videoMetadata.duration)) {
      setSeekMessage("This event falls outside the video. Adjust the sync, then try again.");
      return false;
    }
    const videoTime = Math.max(0, eventVideoTime - beforeSeconds);
    playerRef.current?.seekTo(videoTime);
    setCurrentVideoTime(videoTime);
    setSeekMessage("Video moved to " + formatTime(videoTime) + ".");
    videoViewportRef.current?.scrollIntoView({ block: "nearest" });
    return true;
  }, [offset, videoMetadata, playerReady]);

  const handleEventSeek = (reportSeconds: number) => {
    if (handleSeek(reportSeconds, leadIn)) setActiveTimestamp(reportSeconds * 1000);
  };
  const eventsReady = eventResult?.fightId === selectedFightId;
  const rawEvents = eventsReady ? eventResult.events : EMPTY_EVENTS;
  const events = useMemo(() => trackedEvents(rawEvents), [rawEvents]);
  const visibleEvents = useMemo(() => filterEvents(events, eventFilter, eventQuery), [events, eventFilter, eventQuery]);
  const selectFight = (id: number | null) => {
    updateReviewView({ fightId: id === null ? "none" : String(id), eventPage: null }, true);
    setSeekMessage(""); setActiveTimestamp(null);
  };

  const commitOffset = useCallback((value: number) => {
    let available = true;
    try { window.localStorage.setItem(syncStorageKey, String(value)); } catch { available = false; }
    setSavedSync({ offset: value, available });
    setUsingSharedOffset(false);
    setSeekMessage("");
  }, [syncStorageKey]);

  const resetOffset = useCallback(() => {
    let available = true;
    try { window.localStorage.removeItem(syncStorageKey); } catch { available = false; }
    setSavedSync({ offset: null, available });
    setUsingSharedOffset(false);
    setSeekMessage("");
  }, [syncStorageKey]);

  if (loading) return <LoadingReview />;
  if (reportError || !report) return <main className="page-shell space-y-5">
    <Link href="/" className="text-link">New review</Link>
    <h1 className="text-2xl font-semibold">Could not load this report</h1>
    <p role="alert" className="text-red-300">{reportError || "The report is unavailable."}</p>
    <button className="button button-primary" onClick={() => setReportAttempt(value => value + 1)}>Retry report</button>
  </main>;

  const eventError = eventsReady ? eventResult.error : "";
  const eventsStatus = !selectedFight ? "Select a fight to review" : !eventsReady ? "Loading fight events…" : eventError ? "Events unavailable" : visibleEvents.length ? "" : events.length ? "No matching events" : "No tracked events";
  const videoStart = platform === "twitch" ? Date.parse(videoMetadata?.createdAt || "") : 0;
  const captureReview = (): ReviewSnapshot => ({
    wclCode, platform, vodId, title: report.title,
    fightId: selectedFightId, fightName: selectedFight ? `Fight ${selectedFight.id} · ${selectedFight.name}`.slice(0, 500) : null,
    startSeconds: playerRef.current?.getCurrentTime() ?? currentVideoTime, syncOffset: offset,
  });
  const openMoment = (moment: ReviewMoment) => {
    if (videoMetadata && moment.startSeconds > videoMetadata.duration) {
      setSeekMessage("This note falls outside the video. Check the original recording.");
      return;
    }
    selectFight(report.fights.some(fight => fight.id === moment.fightId) ? moment.fightId : null);
    setSavedSync(current => ({ ...current, offset: moment.syncOffset }));
    setOffset(moment.syncOffset);
    setUsingSharedOffset(true);
    setSyncRevision(value => value + 1);
    playerRef.current?.seekTo(moment.startSeconds);
    setCurrentVideoTime(moment.startSeconds);
    setSeekMessage("Video moved to " + formatTime(moment.startSeconds) + ". Note calibration restored.");
    videoViewportRef.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <main className="page-shell review-workspace space-y-5">
      <header className="space-y-2">
        <Link href="/" className="text-link" onNavigate={event => {
          if (hasNoteDraft && !window.confirm("Leave this review? Your unsaved note will be lost.")) event.preventDefault();
        }}>← New review</Link>
        <h1 className="break-words text-2xl font-semibold">{report.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-gray-400">
          <p>{report.fights.length} boss fights</p>
          <a href={`https://www.warcraftlogs.com/reports/${encodeURIComponent(wclCode)}${selectedFightId ? `#fight=${selectedFightId}` : ""}`} target="_blank" rel="noreferrer" className="text-link">Open combat log</a>
        </div>
      </header>
      {!!report.fights.length && <>
        <FightNavigator fights={report.fights} selectedId={selectedFightId} onSelect={selectFight} onJump={() => selectedFight && handleSeek(selectedFight.startTime / 1000)} />
        {rawFightId && rawFightId !== "none" && !requestedFight && <p role="status" className="text-sm text-amber-200">This fight is not in the report. Showing the first available fight.</p>}
      </>}
      <div className="review-evidence">
      <section aria-label="Video" className="min-w-0">
        <div ref={videoViewportRef} className={"aspect-video w-full rounded-lg bg-black " + (platform === "twitch" ? "min-h-[300px] overflow-x-auto" : "min-h-[200px] overflow-hidden")}>
          <VideoPlayer ref={playerRef} platform={platform} videoId={vodId} startSeconds={startSeconds} onTimeUpdate={setCurrentVideoTime} onReady={markPlayerReady} onError={markPlayerUnavailable} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-300">
          <p className="min-w-0 break-words">{videoMetadata?.title || (platform === "youtube" ? "YouTube video" : "Twitch VOD")}</p>
          <a className="text-link" href={platform === "youtube" ? "https://www.youtube.com/watch?v=" + vodId : "https://www.twitch.tv/videos/" + vodId} target="_blank" rel="noreferrer">Open original video ↗</a>
        </div>
        {metadataLoading && <p role="status" className="mt-2 text-sm text-gray-400">Loading video details…</p>}
        {metadataError && <div className="notice mt-3">
          <p role="alert">{metadataError} You can still review events and align the video manually.</p>
          <button className="button mt-3" onClick={() => setMetadataAttempt(value => value + 1)}>Retry video details</button>
        </div>}
        <ReviewActions captureReview={captureReview} playerReady={playerReady} hasFights={!!report.fights.length} />
        <p role="status" className="mt-2 text-sm text-blue-200">{seekMessage}</p>
      </section>

      <div className="min-w-0 space-y-5">
      {!report.fights.length ? <section className="notice">
        <h2 className="font-semibold">No boss fights in this report</h2>
        <p className="mt-2 text-gray-300">Choose a report with a recorded boss encounter to review its events.</p>
      </section> : <>
        <section id="review-events" tabIndex={-1} aria-label="Event results" aria-busy={!!selectedFight && !eventsReady}>
          {!selectedFight ? <p className="notice">Select a fight to see its events.</p> : !eventsReady ? <p role="status" className="text-gray-300">Loading fight events…</p> :
            eventError ? <div className="notice"><p role="alert">{eventError}</p><button className="button mt-3" onClick={() => setEventAttempt(value => value + 1)}>Retry events</button></div> :
            !events.length ? <div className="notice"><h2 className="font-semibold">No tracked events in this fight.</h2><p className="mt-2 text-gray-300">There are no player deaths or NPC casts to show. Try another fight or review the video above.</p></div> :
            <EventList key={selectedFight.id} events={visibleEvents} totalCount={events.length} fightStart={selectedFight.startTime}
              filter={eventFilter} query={eventQuery} leadIn={leadIn} page={eventPage} activeTimestamp={activeTimestamp}
              onFilterChange={filter => updateReviewView({ eventType: filter === "all" ? null : filter, eventPage: null })}
              onQueryChange={query => updateReviewView({ q: query, eventPage: null })} onLeadInChange={value => updateReviewView({ leadIn: value ? String(value) : null })}
              onPageChange={page => updateReviewView({ eventPage: page ? String(page + 1) : null })}
              onClear={() => updateReviewView({ eventType: null, q: null, eventPage: null })} onSeek={handleEventSeek} />}
        </section>
      </>}
      </div>
      </div>
      {!!report.fights.length && (
        <section id="review-timeline" tabIndex={-1} aria-label="Review timeline" className="min-w-0 scroll-mt-4 rounded-xl border border-[#35354a] bg-[#181824] p-3 sm:p-5">
          <SuperTimeline key={(videoMetadata?.duration || "pending") + ":" + syncRevision}
            reportStartTime={report.startTime} reportEndTime={report.endTime} fights={report.fights}
            selectedFightId={selectedFightId} onFightSelect={selectFight} events={visibleEvents}
            currentVideoTime={currentVideoTime} offset={offset} onTimelineClick={handleEventSeek}
            videoDuration={videoMetadata?.duration || 0} videoStartTime={Number.isFinite(videoStart) ? videoStart : 0}
            onOffsetChange={setOffset} onOffsetCommit={commitOffset} onOffsetReset={resetOffset}
            initialOffset={savedSync.offset} autoSyncLatencySeconds={platform === "twitch" ? 4.5 : 0}
            eventsStatus={eventsStatus} canAlign={playerReady} />
          {!savedSync.available && <p role="status" className="mt-3 text-sm text-amber-200">Calibration applies for this session. Browser storage is unavailable, so it cannot be saved.</p>}
          {usingSharedOffset && <p className="mt-3 text-sm text-blue-200">Using this moment’s calibration. Your existing browser calibration is kept until you adjust the sync.</p>}
        </section>

      )}
      <ReviewNotebook identity={{ wclCode, platform, vodId }} fights={report.fights} captureReview={captureReview} playerReady={playerReady}
        onOpenMoment={openMoment} onDraftChange={setHasNoteDraft} />
    </main>
  );
}
