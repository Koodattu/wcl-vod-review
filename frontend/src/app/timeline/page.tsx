"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import VideoPlayer, { VideoPlayerRef } from "@/components/VideoPlayer";
import SuperTimeline from "@/components/SuperTimeline";
import EventList, { formatTime } from "@/components/EventList";
import ReviewNotebook from "@/components/ReviewNotebook";
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
  const fightId = Number(params.get("fightId"));
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
  return <TimelineReview key={[wclCode, platform, vodId, fightId, start, sharedOffset].join(":")}
    wclCode={wclCode} platform={platform} vodId={vodId}
    initialFightId={Number.isSafeInteger(fightId) && fightId > 0 ? fightId : null}
    startSeconds={isReviewTime(start) && start >= 0 ? start : 0} sharedOffset={sharedOffset} />;
}

function TimelineReview({ wclCode, platform, vodId, initialFightId, startSeconds, sharedOffset }: {
  wclCode: string; platform: "youtube" | "twitch"; vodId: string;
  initialFightId: number | null; startSeconds: number; sharedOffset: number | null;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportAttempt, setReportAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFightId, setSelectedFightId] = useState<number | null>(initialFightId);
  const selectedFight = report?.fights.find(fight => fight.id === selectedFightId) ?? null;
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
  const [playerReady, setPlayerReady] = useState(false);
  const markPlayerReady = useCallback(() => setPlayerReady(true), []);
  const markPlayerUnavailable = useCallback(() => setPlayerReady(false), []);
  const playerRef = useRef<VideoPlayerRef>(null);
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
        setSelectedFightId(current => data.fights.some(fight => fight.id === current) ? current : data.fights[0]?.id ?? null);
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

  const handleSeek = useCallback((reportSeconds: number) => {
    if (!playerReady) {
      setSeekMessage("The video is still loading. Try again when the player is ready.");
      return;
    }
    const videoTime = reportSeconds - offset;
    if (videoTime < 0 || (videoMetadata && videoTime > videoMetadata.duration)) {
      setSeekMessage("This event falls outside the video. Adjust the sync, then try again.");
      return;
    }
    playerRef.current?.seekTo(videoTime);
    setCurrentVideoTime(videoTime);
    setSeekMessage("Video moved to " + formatTime(videoTime) + ".");
  }, [offset, videoMetadata, playerReady]);

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

  const eventsReady = eventResult?.fightId === selectedFightId;
  const events = eventsReady ? eventResult.events : EMPTY_EVENTS;
  const eventError = eventsReady ? eventResult.error : "";
  const eventsStatus = !selectedFight ? "Select a fight to review" : !eventsReady ? "Loading fight events…" : eventError ? "Events unavailable" : events.length ? "" : "No tracked events";
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
    setSelectedFightId(report.fights.some(fight => fight.id === moment.fightId) ? moment.fightId : null);
    setSavedSync(current => ({ ...current, offset: moment.syncOffset }));
    setOffset(moment.syncOffset);
    setUsingSharedOffset(true);
    setSyncRevision(value => value + 1);
    playerRef.current?.seekTo(moment.startSeconds);
    setCurrentVideoTime(moment.startSeconds);
    setSeekMessage("Video moved to " + formatTime(moment.startSeconds) + ". Note calibration restored.");
  };

  return (
    <main className="page-shell space-y-6">
      <header className="space-y-3">
        <Link href="/" className="text-link" onNavigate={event => {
          if (hasNoteDraft && !window.confirm("Leave this review? Your unsaved note will be lost.")) event.preventDefault();
        }}>← New review</Link>
        <h1 className="break-words text-2xl font-semibold sm:text-3xl">{report.title}</h1>
        <p className="text-sm text-gray-400">Report {wclCode} · {report.fights.length} boss fights</p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <section aria-label="Video" className="min-w-0 xl:sticky xl:top-4">
        <div className={"aspect-video w-full rounded-lg bg-black " + (platform === "twitch" ? "min-h-[300px] overflow-x-auto" : "min-h-[200px] overflow-hidden")}>
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
        <ReviewNotebook identity={{ wclCode, platform, vodId }} fights={report.fights} captureReview={captureReview} playerReady={playerReady}
          onOpenMoment={openMoment} onDraftChange={setHasNoteDraft} />
      </section>

      <div className="min-w-0 space-y-5">
      {!report.fights.length ? <section className="notice">
        <h2 className="font-semibold">No boss fights in this report</h2>
        <p className="mt-2 text-gray-300">Choose a report with a recorded boss encounter to review its events.</p>
      </section> : <>
        <section aria-label="Fight selection" className="flex flex-wrap items-end gap-3 border-y border-[#35354a] py-5">
          <div className="min-w-0 basis-64 flex-1 space-y-2 text-sm font-medium">
            <label htmlFor="fight">Fight</label>
            <select id="fight" className="field" value={selectedFightId ?? ""} onChange={event => { setSelectedFightId(Number(event.target.value)); setSeekMessage(""); }}>
              {selectedFightId === null && <option value="" disabled>Select a fight</option>}
              {report.fights.map((fight, index) => <option key={fight.id} value={fight.id}>
                {index + 1}. {fight.name} · {fight.kill ? "Kill" : "Wipe"} · {formatTime((fight.endTime - fight.startTime) / 1000)}
              </option>)}
            </select>
          </div>
          <button className="button" disabled={!selectedFight} onClick={() => selectedFight && handleSeek(selectedFight.startTime / 1000)}>Jump to fight start</button>
        </section>

        {selectedFight && <section aria-label="Event results" aria-busy={!eventsReady}>
          {!eventsReady ? <p role="status" className="text-gray-300">Loading fight events…</p> :
            eventError ? <div className="notice"><p role="alert">{eventError}</p><button className="button mt-3" onClick={() => setEventAttempt(value => value + 1)}>Retry events</button></div> :
            !events.length ? <div className="notice"><h2 className="font-semibold">No tracked events in this fight.</h2><p className="mt-2 text-gray-300">There are no player deaths or NPC casts to show. Try another fight or review the video above.</p></div> :
            <EventList key={selectedFight.id} events={events} fightStart={selectedFight.startTime} onSeek={handleSeek} />}
        </section>}
        <p role="status" className="text-sm text-blue-200">{seekMessage}</p>

      </>}
      </div>
      </div>
      {!!report.fights.length && (
        <section id="review-timeline" tabIndex={-1} aria-label="Review timeline" className="min-w-0 scroll-mt-4 rounded-xl border border-[#35354a] bg-[#181824] p-3 sm:p-5">
          <SuperTimeline key={(videoMetadata?.duration || "pending") + ":" + syncRevision}
            reportStartTime={report.startTime} reportEndTime={report.endTime} fights={report.fights}
            selectedFightId={selectedFightId} onFightSelect={setSelectedFightId} events={events}
            currentVideoTime={currentVideoTime} offset={offset} onTimelineClick={handleSeek}
            videoDuration={videoMetadata?.duration || 0} videoStartTime={Number.isFinite(videoStart) ? videoStart : 0}
            onOffsetChange={setOffset} onOffsetCommit={commitOffset} onOffsetReset={resetOffset}
            initialOffset={savedSync.offset} autoSyncLatencySeconds={platform === "twitch" ? 4.5 : 0}
            eventsStatus={eventsStatus} canAlign={playerReady} />
          {!savedSync.available && <p role="status" className="mt-3 text-sm text-amber-200">Calibration applies for this session. Browser storage is unavailable, so it cannot be saved.</p>}
          {usingSharedOffset && <p className="mt-3 text-sm text-blue-200">Using this moment’s calibration. Your existing browser calibration is kept until you adjust the sync.</p>}
        </section>

      )}
    </main>
  );
}
