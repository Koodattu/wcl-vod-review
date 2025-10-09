"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Image from "next/image";
import VideoPlayer, { VideoPlayerRef } from "@/components/VideoPlayer";
import Timeline from "@/components/Timeline";
import TimelineAligner from "@/components/TimelineAligner";

interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  boss?: number;
  difficulty?: number;
  kill?: boolean;
  iconUrl?: string | null;
}

interface Event {
  timestamp: number;
  type: "Deaths" | "Casts";
  sourceID?: number;
  targetID?: number;
  abilityGameID?: number;
  ability?: {
    name: string;
    guid: number;
    type: number;
  };
  data?: unknown;
}

interface ReportData {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  fights: Fight[];
}

interface VideoMetadata {
  id: string;
  title: string;
  duration: number; // in seconds
  publishedAt?: string;
  createdAt?: string;
}

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#101014] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading timeline...</p>
          </div>
        </div>
      }
    >
      <TimelineContent />
    </Suspense>
  );
}

function TimelineContent() {
  const searchParams = useSearchParams();
  const wclCode = searchParams.get("wclCode");
  const vodPlatform = searchParams.get("vodPlatform");
  const vodId = searchParams.get("vodId");
  const fightIdParam = searchParams.get("fightId");
  const startSecondsParam = searchParams.get("startSeconds");

  const [report, setReport] = useState<ReportData | null>(null);
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState<number>(0);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);

  const playerRef = useRef<VideoPlayerRef>(null);

  // Load report data
  useEffect(() => {
    if (!wclCode) return;

    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:3001/api/wcl/reports/${wclCode}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load report");
        }

        setReport(data);

        // Set initial fight selection
        const initialFightId = fightIdParam ? parseInt(fightIdParam) : data.fights[0]?.id;
        const initialFight = data.fights.find((f: Fight) => f.id === initialFightId) || data.fights[0];
        setSelectedFight(initialFight);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [wclCode, fightIdParam]);

  // Load video metadata
  useEffect(() => {
    if (!vodPlatform || !vodId) return;

    const loadVideoMetadata = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/video-metadata/${vodPlatform}/${vodId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load video metadata");
        }

        setVideoMetadata(data);
      } catch (err) {
        console.error("Failed to load video metadata:", err);
        // Don't set error state, just log it
      }
    };

    loadVideoMetadata();
  }, [vodPlatform, vodId]);

  // Load events for selected fight
  useEffect(() => {
    if (!wclCode || !selectedFight) return;

    const loadEvents = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/wcl/reports/${wclCode}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fightId: selectedFight.id,
            startTime: selectedFight.startTime,
            endTime: selectedFight.endTime,
            eventTypes: ["Deaths", "Casts"],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load events");
        }

        setEvents(data.events || []);
      } catch (err) {
        console.error("Failed to load events:", err);
        setEvents([]);
      }
    };

    loadEvents();
  }, [wclCode, selectedFight]);

  const handleTimelineClick = useCallback(
    (eventTime: number) => {
      if (playerRef.current) {
        const videoTime = eventTime + offset;
        playerRef.current.seekTo(videoTime);
      }
    },
    [offset]
  );

  const handleOffsetChange = useCallback((newOffset: number) => {
    setOffset(newOffset);
  }, []);

  const getTimelineEvents = useCallback(() => {
    if (!selectedFight) return [];

    return events.map((event) => ({
      time: (event.timestamp - selectedFight.startTime) / 1000, // Convert to seconds relative to fight start
      type: event.type,
      label: event.type === "Deaths" ? `☠️ Death${event.ability ? ` (${event.ability.name})` : ""}` : `⚔️ ${event.ability?.name || "Cast"}`,
      event: event,
    }));
  }, [events, selectedFight]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#101014] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#101014] flex items-center justify-center">
        <div className="bg-[#2a1313] border border-red-700 text-red-300 px-6 py-4 rounded-lg shadow">
          <h3 className="font-semibold">Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!report || !vodId || !vodPlatform) {
    return (
      <div className="min-h-screen bg-[#101014] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Missing Data</h2>
          <p className="text-gray-300">Required parameters are missing or invalid.</p>
        </div>
      </div>
    );
  }

  const fightDurationSeconds = selectedFight ? (selectedFight.endTime - selectedFight.startTime) / 1000 : 0;

  return (
    <div className="min-h-screen bg-[#101014] flex justify-center">
      <div className="w-[90vw] px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">{report.title}</h1>
          <p className="text-gray-300">
            Report: {wclCode} | Fight: {selectedFight?.name} | Duration: {Math.round(fightDurationSeconds / 60)}m {Math.round(fightDurationSeconds % 60)}s
          </p>
        </div>

        {/* Fight Selection as Clickable Buttons (no checkbox) */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-200 mb-2">Select Fight:</label>
          <div className="flex flex-wrap gap-3">
            {report.fights.map((fight) => {
              const fightDuration = Math.round((fight.endTime - fight.startTime) / 1000);
              const minutes = Math.floor(fightDuration / 60);
              const seconds = fightDuration % 60;
              return (
                <button
                  key={fight.id}
                  type="button"
                  onClick={() => setSelectedFight(fight)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    selectedFight?.id === fight.id ? "bg-blue-700 border-blue-500" : "bg-[#232336] border-[#35354a] hover:border-blue-400"
                  }`}
                >
                  {/* Boss Icon */}
                  <div className="flex items-center justify-center w-8 h-8 bg-[#1a1a2e] rounded-md border border-[#35354a] flex-shrink-0">
                    {fight.iconUrl ? (
                      <Image
                        src={fight.iconUrl}
                        alt={`${fight.name} icon`}
                        width={24}
                        height={24}
                        className="rounded-sm object-cover"
                        unoptimized={true}
                        onError={(e) => {
                          // Fallback to placeholder if image fails to load
                          e.currentTarget.style.display = "none";
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = "block";
                        }}
                      />
                    ) : null}
                    <span className={`text-lg ${fight.iconUrl ? "hidden" : "block"}`} style={{ display: fight.iconUrl ? "none" : "block" }}>
                      ⚔️
                    </span>
                  </div>

                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-white font-semibold truncate">{fight.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">
                        {minutes}m {seconds}s
                      </span>
                      <span className={`text-lg font-bold ${fight.kill ? "text-green-400" : "text-red-400"}`}>{fight.kill ? "🏆" : "💀"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Video Player (responsive 16:9, no extra space) */}
        <div className="mb-8">
          <div className="w-full max-w-6xl mx-auto bg-black rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: "16 / 9" }}>
            <VideoPlayer
              ref={playerRef}
              platform={vodPlatform as "youtube" | "twitch"}
              videoId={vodId}
              startSeconds={startSecondsParam ? parseInt(startSecondsParam) : 0}
              onTimeUpdate={setCurrentVideoTime}
            />
          </div>
        </div>

        {/* Timeline Aligner */}
        {videoMetadata && report.totalDuration && videoMetadata.duration && (
          <div className="bg-[#181824] rounded-2xl shadow-xl p-6 mb-8 border border-[#35354a]">
            <TimelineAligner
              wclDuration={report.totalDuration}
              wclStartTime={report.startTime}
              videoDuration={videoMetadata.duration}
              videoStartTime={videoMetadata.publishedAt ? new Date(videoMetadata.publishedAt).getTime() : videoMetadata.createdAt ? new Date(videoMetadata.createdAt).getTime() : 0}
              onOffsetChange={handleOffsetChange}
            />
          </div>
        )}

        {/* Timeline */}
        <div className="bg-[#181824] rounded-2xl shadow-xl p-6 border border-[#35354a]">
          <h3 className="font-semibold text-gray-100 mb-3">Timeline ({events.length} events)</h3>
          <Timeline events={getTimelineEvents()} duration={fightDurationSeconds} onEventClick={handleTimelineClick} currentTime={currentVideoTime - offset} />
        </div>
      </div>
    </div>
  );
}
