"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import YouTubePlayer, { YouTubePlayerRef } from "@/components/YouTubePlayer";
import Timeline from "@/components/Timeline";

interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  boss?: number;
  difficulty?: number;
  kill?: boolean;
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
  fights: Fight[];
}

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading timeline...</p>
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

  const playerRef = useRef<YouTubePlayerRef>(null);

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

  const handleAlignFightStart = useCallback(() => {
    if (playerRef.current && selectedFight) {
      const currentTime = playerRef.current.getCurrentTime();
      setOffset(currentTime);
    }
  }, [selectedFight]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <h3 className="font-semibold">Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!report || !vodId || vodPlatform !== "youtube") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Missing Data</h2>
          <p className="text-gray-600">Required parameters are missing or invalid.</p>
        </div>
      </div>
    );
  }

  const fightDurationSeconds = selectedFight ? (selectedFight.endTime - selectedFight.startTime) / 1000 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{report.title}</h1>
          <p className="text-gray-600">
            Report: {wclCode} | Fight: {selectedFight?.name} | Duration: {Math.round(fightDurationSeconds / 60)}m {Math.round(fightDurationSeconds % 60)}s
          </p>
        </div>

        {/* Fight Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Fight:</label>
          <select
            value={selectedFight?.id || ""}
            onChange={(e) => {
              const fight = report.fights.find((f) => f.id === parseInt(e.target.value));
              setSelectedFight(fight || null);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {report.fights.map((fight) => (
              <option key={fight.id} value={fight.id}>
                {fight.name} {fight.kill ? "✅" : "❌"}
              </option>
            ))}
          </select>
        </div>

        {/* Video Player */}
        <div className="mb-6">
          <YouTubePlayer ref={playerRef} videoId={vodId} startSeconds={startSecondsParam ? parseInt(startSecondsParam) : 0} onTimeUpdate={setCurrentVideoTime} />
        </div>

        {/* Sync Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">Sync Controls</h3>
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm text-gray-600">Offset (seconds):</label>
              <input
                type="number"
                value={offset}
                onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
                step="0.1"
                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <button onClick={handleAlignFightStart} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
              Align Fight Start to Current Time
            </button>
            <div className="text-sm text-gray-600">Current video time: {Math.round(currentVideoTime)}s</div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Timeline ({events.length} events)</h3>
          <Timeline events={getTimelineEvents()} duration={fightDurationSeconds} onEventClick={handleTimelineClick} currentTime={currentVideoTime - offset} />
        </div>
      </div>
    </div>
  );
}
