"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  kill?: boolean;
  iconUrl?: string | null;
}

interface ActorInfo {
  id: number;
  name: string;
  type: string;
  subType?: string | null;
  icon?: string | null;
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
  abilityInfo?: {
    gameID: number;
    name: string;
    icon?: string | null;
    type?: number;
  };
  sourceInfo?: ActorInfo;
  targetInfo?: ActorInfo;
}

interface EventTrack {
  id: string;
  kind: "cast" | "death";
  label: string;
  detail?: string;
  iconUrl?: string;
  events: Event[];
}

interface TrackMarker {
  events: Event[];
  x: number;
}

interface HoveredEvent {
  event: Event;
  events: Event[];
  track: EventTrack;
  x: number;
  y: number;
}

interface SuperTimelineProps {
  reportStartTime: number;
  reportEndTime: number;
  fights: Fight[];
  selectedFightId: number | null;
  onFightSelect: (fightId: number) => void;
  events: Event[];
  currentVideoTime: number;
  offset: number;
  onTimelineClick: (timeInSeconds: number) => void;
  videoDuration: number;
  videoStartTime: number;
  onOffsetChange: (offset: number) => void;
  onOffsetCommit?: (offset: number) => void;
  onOffsetReset?: () => void;
  initialOffset?: number | null;
  autoSyncLatencySeconds?: number;
}

const LABEL_WIDTH = 210;
const SYNC_ROW_HEIGHT = 30;
const FIGHT_ROW_HEIGHT = 40;
const TRACK_ROW_HEIGHT = 38;
const PADDING_TOP = 60;
const PADDING_BOTTOM = 16;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 50;
const EDGE_PADDING_SEC = 60;
const EVENT_HIT_RADIUS = 12;

const CLASS_COLORS: Record<string, string> = {
  DeathKnight: "#c41f3b",
  DemonHunter: "#a330c9",
  Druid: "#ff7d0a",
  Evoker: "#33937f",
  Hunter: "#abd473",
  Mage: "#69ccf0",
  Monk: "#00ff96",
  Paladin: "#f58cba",
  Priest: "#f5f5f5",
  Rogue: "#fff569",
  Shaman: "#0070de",
  Warlock: "#9482c9",
  Warrior: "#c79c6e",
};

const calculateTimeStep = (currentZoom: number) => {
  const secondsPerMarker = 100 / currentZoom;

  if (secondsPerMarker <= 10) return 10;
  if (secondsPerMarker <= 30) return 30;
  if (secondsPerMarker <= 60) return 60;
  if (secondsPerMarker <= 120) return 120;
  if (secondsPerMarker <= 300) return 300;
  return 600;
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatPreciseTime = (seconds: number) => {
  const sign = seconds < 0 ? "−" : "";
  const absoluteSeconds = Math.abs(seconds);
  const hours = Math.floor(absoluteSeconds / 3600);
  const mins = Math.floor((absoluteSeconds % 3600) / 60);
  const secs = (absoluteSeconds % 60).toFixed(1).padStart(4, "0");

  if (hours > 0) return `${sign}${hours}:${mins.toString().padStart(2, "0")}:${secs}`;
  return `${sign}${mins}:${secs}`;
};

const getClassInitials = (className?: string) => {
  if (className === "DeathKnight") return "DK";
  if (className === "DemonHunter") return "DH";
  return className?.slice(0, 2).toUpperCase() || "?";
};

const getSpellIconUrl = (icon?: string | null) =>
  icon ? `https://assets.rpglogs.com/img/warcraft/abilities/${encodeURIComponent(icon)}` : undefined;

function getAutoOffset(videoStartTime: number, reportStartTime: number, videoDuration: number, latencySeconds: number) {
  if (!videoStartTime || !reportStartTime || videoDuration <= 0) return null;

  const timestampOffset = (videoStartTime - reportStartTime) / 1000;
  if (Math.abs(timestampOffset) >= 24 * 60 * 60) return null;

  // Twitch's VOD timestamp marks stream creation, while encoded frames arrive later.
  return timestampOffset - latencySeconds;
}

function getInitialSyncState(
  videoStartTime: number,
  reportStartTime: number,
  videoDuration: number,
  latencySeconds: number,
  initialOffset?: number | null
) {
  if (initialOffset !== null && initialOffset !== undefined && Number.isFinite(initialOffset)) {
    return { videoOffset: initialOffset, locked: true, autoSynced: false };
  }

  const autoOffset = getAutoOffset(videoStartTime, reportStartTime, videoDuration, latencySeconds);
  if (autoOffset !== null) {
    return { videoOffset: autoOffset, locked: true, autoSynced: true };
  }

  return {
    videoOffset: videoDuration > 0 ? -videoDuration - 60 : 0,
    locked: false,
    autoSynced: false,
  };
}

export default function SuperTimeline({
  reportStartTime,
  reportEndTime,
  fights,
  selectedFightId,
  onFightSelect,
  events,
  currentVideoTime,
  offset,
  onTimelineClick,
  videoDuration,
  videoStartTime,
  onOffsetChange,
  onOffsetCommit,
  onOffsetReset,
  initialOffset,
  autoSyncLatencySeconds = 0,
}: SuperTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const failedImagesRef = useRef<Set<string>>(new Set());
  const dragOriginRef = useRef({ x: 0, panOffset: 0, videoOffset: 0, wclOffset: 0, zoom: 1 });
  const reportDuration = (reportEndTime - reportStartTime) / 1000;
  const initialSync = getInitialSyncState(
    videoStartTime,
    reportStartTime,
    videoDuration,
    autoSyncLatencySeconds,
    initialOffset
  );

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredFight, setHoveredFight] = useState<Fight | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<HoveredEvent | null>(null);
  const [videoOffsetSec, setVideoOffsetSec] = useState(initialSync.videoOffset);
  const [wclOffsetSec, setWclOffsetSec] = useState(0);
  const [isLocked, setIsLocked] = useState(initialSync.locked);
  const [isDraggingSync, setIsDraggingSync] = useState<"video" | "wcl" | null>(null);
  const [autoSynced, setAutoSynced] = useState(initialSync.autoSynced);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [imageVersion, setImageVersion] = useState(0);

  const tracks = useMemo<EventTrack[]>(() => {
    const castTracks = new Map<string, EventTrack>();
    const deathEvents: Event[] = [];

    for (const event of events) {
      if (event.type === "Casts") {
        const abilityName = event.abilityInfo?.name || event.ability?.name || `Spell ${event.abilityGameID || "unknown"}`;
        if (abilityName.toLowerCase() === "melee") continue;

        const abilityId = event.abilityInfo?.gameID || event.abilityGameID || event.ability?.guid || abilityName;
        const trackId = `cast-${abilityId}`;
        const existingTrack = castTracks.get(trackId);

        if (existingTrack) {
          existingTrack.events.push(event);
        } else {
          castTracks.set(trackId, {
            id: trackId,
            kind: "cast",
            label: abilityName,
            detail: event.sourceInfo?.name || "NPC cast",
            iconUrl: getSpellIconUrl(event.abilityInfo?.icon),
            events: [event],
          });
        }
      } else if (event.type === "Deaths") {
        deathEvents.push(event);
      }
    }

    const byFirstTimestamp = (a: EventTrack, b: EventTrack) => a.events[0].timestamp - b.events[0].timestamp;
    const deathTrack: EventTrack[] = deathEvents.length
      ? [
          {
            id: "deaths",
            kind: "death",
            label: "Deaths",
            detail: `${deathEvents.length} player${deathEvents.length === 1 ? "" : "s"}`,
            events: deathEvents.sort((a, b) => a.timestamp - b.timestamp),
          },
        ]
      : [];

    return [...Array.from(castTracks.values()).sort(byFirstTimestamp), ...deathTrack];
  }, [events]);

  const visibleTrackCount = Math.max(tracks.length, 1);
  const timelineHeight = SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + TRACK_ROW_HEIGHT * visibleTrackCount;
  const canvasHeight = PADDING_TOP + timelineHeight + PADDING_BOTTOM;
  const tracksTop = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT;
  const autoOffset = getAutoOffset(videoStartTime, reportStartTime, videoDuration, autoSyncLatencySeconds);
  const currentOffset = videoOffsetSec - wclOffsetSec;

  const imageUrls = useMemo(() => {
    const urls = new Set<string>();
    fights.forEach((fight) => {
      if (fight.iconUrl) urls.add(fight.iconUrl);
    });
    tracks.forEach((track) => {
      if (track.iconUrl) urls.add(track.iconUrl);
    });
    return Array.from(urls);
  }, [fights, tracks]);

  useEffect(() => {
    imageUrls.forEach((url) => {
      if (iconImagesRef.current.has(url) || failedImagesRef.current.has(url)) return;

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        iconImagesRef.current.set(url, image);
        setImageVersion((version) => version + 1);
      };
      image.onerror = () => {
        failedImagesRef.current.add(url);
      };
      image.src = url;
    });
  }, [imageUrls]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      setCanvasWidth(Math.round(entries[0].contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const timelineWidth = Math.max(1, container.clientWidth - LABEL_WIDTH - 20);
    const totalDurationWithPadding = reportDuration + EDGE_PADDING_SEC * 2;
    const initialZoom = Math.max(MIN_ZOOM, Math.min(timelineWidth / totalDurationWithPadding, MAX_ZOOM));
    setZoom(initialZoom);
    setPanOffset(-EDGE_PADDING_SEC * initialZoom);
  }, [reportDuration]);

  useEffect(() => {
    if (!selectedFightId || !containerRef.current) return;

    const selectedFight = fights.find((fight) => fight.id === selectedFightId);
    if (!selectedFight) return;

    const timelineWidth = Math.max(1, containerRef.current.clientWidth - LABEL_WIDTH - 20);
    const fightDuration = Math.max(1, (selectedFight.endTime - selectedFight.startTime) / 1000);
    const fightStart = selectedFight.startTime / 1000 + wclOffsetSec;
    const newZoom = Math.max(MIN_ZOOM, Math.min(timelineWidth / fightDuration, MAX_ZOOM));
    setZoom(newZoom);
    setPanOffset(fightStart * newZoom - 10);
  }, [selectedFightId, fights, wclOffsetSec]);

  useEffect(() => {
    if (!isDraggingSync) onOffsetChange(videoOffsetSec - wclOffsetSec);
  }, [videoOffsetSec, wclOffsetSec, isDraggingSync, onOffsetChange]);

  const timeToX = useCallback(
    (timeInSeconds: number) => LABEL_WIDTH + timeInSeconds * zoom - panOffset,
    [zoom, panOffset]
  );

  const xToTime = useCallback(
    (x: number) => (x - LABEL_WIDTH + panOffset) / zoom,
    [zoom, panOffset]
  );

  const trackMarkers = useMemo(
    () =>
      tracks.map((track) => {
        const eventMarkers = track.events
          .map((event) => ({ events: [event], x: timeToX(event.timestamp / 1000 + wclOffsetSec) }))
          .sort((a, b) => a.x - b.x);

        if (track.kind === "cast") return { track, markers: eventMarkers };

        const clusteredMarkers: TrackMarker[] = [];
        eventMarkers.forEach((marker) => {
          const previousMarker = clusteredMarkers.at(-1);
          if (previousMarker && Math.abs(marker.x - previousMarker.x) < 24) {
            previousMarker.events.push(...marker.events);
            previousMarker.x = previousMarker.events.reduce(
              (total, event) => total + timeToX(event.timestamp / 1000 + wclOffsetSec),
              0
            ) / previousMarker.events.length;
          } else {
            clusteredMarkers.push(marker);
          }
        });

        return { track, markers: clusteredMarkers };
      }),
    [tracks, timeToX, wclOffsetSec]
  );

  const drawClassBadge = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, className?: string, size = 22) => {
    ctx.fillStyle = CLASS_COLORS[className || ""] || "#64748b";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = className === "Priest" || className === "Rogue" ? "#111827" : "#ffffff";
    ctx.font = `600 ${Math.max(8, Math.floor(size * 0.42))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(getClassInitials(className), x + size / 2, y + size / 2 + 0.5);
    ctx.textAlign = "left";
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#181824";
    ctx.fillRect(0, 0, width, canvasHeight);

    for (let index = 0; index < visibleTrackCount; index += 1) {
      if (index % 2 === 0) {
        ctx.fillStyle = "#151520";
        ctx.fillRect(0, tracksTop + index * TRACK_ROW_HEIGHT, width, TRACK_ROW_HEIGHT);
      }
    }

    ctx.strokeStyle = "#35354a";
    ctx.lineWidth = 1;
    const separators = [
      PADDING_TOP + SYNC_ROW_HEIGHT,
      PADDING_TOP + SYNC_ROW_HEIGHT * 2,
      PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT,
      ...Array.from({ length: visibleTrackCount - 1 }, (_, index) => tracksTop + (index + 1) * TRACK_ROW_HEIGHT),
    ];
    separators.forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });

    const firstDeathIndex = tracks.findIndex((track) => track.kind === "death");
    if (firstDeathIndex > 0) {
      const y = tracksTop + firstDeathIndex * TRACK_ROW_HEIGHT;
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_WIDTH, 0, Math.max(0, width - LABEL_WIDTH), canvasHeight);
    ctx.clip();

    const timeStep = calculateTimeStep(zoom);
    const startTime = Math.max(0, Math.floor(xToTime(LABEL_WIDTH) / timeStep) * timeStep);
    const endTime = Math.min(reportDuration, Math.ceil(xToTime(width) / timeStep) * timeStep);
    ctx.strokeStyle = "#35354a";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "alphabetic";

    for (let time = startTime; time <= endTime; time += timeStep) {
      const x = timeToX(time);
      if (x < LABEL_WIDTH || x > width) continue;
      ctx.beginPath();
      ctx.moveTo(x, PADDING_TOP);
      ctx.lineTo(x, PADDING_TOP + timelineHeight);
      ctx.stroke();
      ctx.fillText(formatTime(time), x - 15, PADDING_TOP - 10);
    }

    const videoX = timeToX(videoOffsetSec);
    const videoWidth = videoDuration * zoom;
    const videoY = PADDING_TOP + 3;
    const videoHeight = SYNC_ROW_HEIGHT - 6;
    ctx.fillStyle = isDraggingSync === "video" ? "#3b82f6" : "#2563eb";
    ctx.fillRect(videoX, videoY, videoWidth, videoHeight);
    ctx.strokeStyle = isLocked ? "#10b981" : "#1e40af";
    ctx.lineWidth = isLocked ? 2 : 1;
    ctx.strokeRect(videoX, videoY, videoWidth, videoHeight);
    if (videoWidth > 80) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.fillText(`Video (${formatTime(videoDuration)})`, Math.max(LABEL_WIDTH + 5, videoX + 5), videoY + 16);
    }

    const wclX = timeToX(wclOffsetSec);
    const wclWidth = reportDuration * zoom;
    const wclY = PADDING_TOP + SYNC_ROW_HEIGHT + 3;
    const wclHeight = SYNC_ROW_HEIGHT - 6;
    ctx.fillStyle = isDraggingSync === "wcl" ? "#a855f7" : "#9333ea";
    ctx.fillRect(wclX, wclY, wclWidth, wclHeight);
    ctx.strokeStyle = isLocked ? "#10b981" : "#7e22ce";
    ctx.lineWidth = isLocked ? 2 : 1;
    ctx.strokeRect(wclX, wclY, wclWidth, wclHeight);
    if (wclWidth > 80) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.fillText(`WCL report (${formatTime(reportDuration)})`, Math.max(LABEL_WIDTH + 5, wclX + 5), wclY + 16);
    }

    fights.forEach((fight) => {
      const fightStart = fight.startTime / 1000 + wclOffsetSec;
      const fightDuration = (fight.endTime - fight.startTime) / 1000;
      const x = timeToX(fightStart);
      const barWidth = fightDuration * zoom;
      const y = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + 5;
      const barHeight = FIGHT_ROW_HEIGHT - 10;
      if (x + barWidth < LABEL_WIDTH || x > width) return;

      const isSelected = fight.id === selectedFightId;
      const isHovered = hoveredFight?.id === fight.id;
      ctx.fillStyle = fight.kill ? (isSelected ? "#10b981" : isHovered ? "#34d399" : "#059669") : isSelected ? "#ef4444" : isHovered ? "#f87171" : "#dc2626";
      ctx.fillRect(x, y, Math.max(barWidth, 2), barHeight);
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#1f2937";
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.strokeRect(x, y, Math.max(barWidth, 2), barHeight);

      const iconSize = barHeight - 4;
      const icon = fight.iconUrl ? iconImagesRef.current.get(fight.iconUrl) : undefined;
      if (icon?.complete) {
        ctx.drawImage(icon, x + 2, y + 2, iconSize, iconSize);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, iconSize, iconSize);
      }

      const textOffset = icon ? iconSize + 7 : 5;
      if (barWidth > 60) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.fillText(fight.name, x + textOffset, y + barHeight / 2 + 4, barWidth - textOffset - 5);
      }
    });

    trackMarkers.forEach(({ track, markers }, trackIndex) => {
      const centerY = tracksTop + trackIndex * TRACK_ROW_HEIGHT + TRACK_ROW_HEIGHT / 2;
      markers.forEach((marker) => {
        const event = marker.events[0];
        const x = marker.x;
        if (x < LABEL_WIDTH || x > width) return;

        if (track.kind === "cast") {
          ctx.strokeStyle = "rgba(251, 146, 60, 0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, centerY - 13);
          ctx.lineTo(x, centerY + 13);
          ctx.stroke();

          const icon = track.iconUrl ? iconImagesRef.current.get(track.iconUrl) : undefined;
          if (icon?.complete) {
            ctx.drawImage(icon, x - 10, centerY - 10, 20, 20);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
            ctx.strokeRect(x - 10, centerY - 10, 20, 20);
          } else {
            ctx.fillStyle = "#f97316";
            ctx.beginPath();
            ctx.arc(x, centerY, 6, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          if (marker.events.length === 1) {
            drawClassBadge(ctx, x - 10, centerY - 10, event.targetInfo?.subType || undefined, 20);
          } else {
            ctx.fillStyle = "#dc2626";
            ctx.beginPath();
            ctx.arc(x, centerY, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.font = "600 10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(marker.events.length), x, centerY + 0.5);
            ctx.textAlign = "left";
          }
          ctx.strokeStyle = "#f87171";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, centerY + 10);
          ctx.lineTo(x, centerY + 15);
          ctx.stroke();
        }
      });
    });

    const wclTime = currentVideoTime + offset;
    const currentX = timeToX(wclTime + wclOffsetSec);
    if (currentX >= LABEL_WIDTH && currentX <= width) {
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentX, PADDING_TOP);
      ctx.lineTo(currentX, PADDING_TOP + timelineHeight);
      ctx.stroke();
      ctx.fillStyle = "#60a5fa";
      ctx.font = "11px sans-serif";
      ctx.fillText(formatTime(wclTime), currentX - 15, PADDING_TOP - 25);
    }

    ctx.restore();

    ctx.fillStyle = "#1a1a27";
    ctx.fillRect(0, PADDING_TOP, LABEL_WIDTH, timelineHeight);
    ctx.strokeStyle = "#45455e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, PADDING_TOP);
    ctx.lineTo(LABEL_WIDTH, PADDING_TOP + timelineHeight);
    ctx.stroke();

    ctx.fillStyle = "#e5e7eb";
    ctx.font = "600 12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Video", 12, PADDING_TOP + SYNC_ROW_HEIGHT / 2);
    ctx.fillText("WCL", 12, PADDING_TOP + SYNC_ROW_HEIGHT + SYNC_ROW_HEIGHT / 2);
    ctx.fillText("Fights", 12, PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT / 2);

    if (tracks.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px sans-serif";
      ctx.fillText(selectedFightId ? "Loading tracked events…" : "Select a fight to load events", 12, tracksTop + TRACK_ROW_HEIGHT / 2);
    }

    tracks.forEach((track, trackIndex) => {
      const rowTop = tracksTop + trackIndex * TRACK_ROW_HEIGHT;
      const iconY = rowTop + 8;

      if (track.kind === "cast") {
        const icon = track.iconUrl ? iconImagesRef.current.get(track.iconUrl) : undefined;
        if (icon?.complete) {
          ctx.drawImage(icon, 12, iconY, 22, 22);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
          ctx.strokeRect(12, iconY, 22, 22);
        } else {
          ctx.fillStyle = "#f97316";
          ctx.beginPath();
          ctx.arc(23, iconY + 11, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.arc(23, iconY + 11, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("×", 23, iconY + 11);
        ctx.textAlign = "left";
      }

      ctx.fillStyle = "#f3f4f6";
      ctx.font = "600 11px sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(track.label, 42, rowTop + 16, LABEL_WIDTH - 50);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "9px sans-serif";
      ctx.fillText(track.detail || (track.kind === "cast" ? "NPC cast" : "Player"), 42, rowTop + 29, LABEL_WIDTH - 50);
    });

    void imageVersion;
  }, [
    canvasHeight,
    visibleTrackCount,
    tracksTop,
    timelineHeight,
    tracks,
    trackMarkers,
    zoom,
    xToTime,
    reportDuration,
    timeToX,
    videoOffsetSec,
    videoDuration,
    isDraggingSync,
    isLocked,
    wclOffsetSec,
    fights,
    selectedFightId,
    hoveredFight,
    drawClassBadge,
    currentVideoTime,
    offset,
    imageVersion,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = Math.max(LABEL_WIDTH, event.clientX - rect.left);
      const timeAtMouse = xToTime(mouseX);
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const timelineWidth = Math.max(1, container.clientWidth - LABEL_WIDTH - 20);
      const minZoomForReport = timelineWidth / (reportDuration + EDGE_PADDING_SEC * 2);
      const newZoom = Math.max(Math.max(MIN_ZOOM, minZoomForReport), Math.min(zoom * zoomFactor, MAX_ZOOM));
      const newPanOffset = timeAtMouse * newZoom - (mouseX - LABEL_WIDTH);

      setZoom(newZoom);
      setPanOffset(newPanOffset);
    },
    [xToTime, reportDuration, zoom]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (!isLocked) {
        const videoX = timeToX(videoOffsetSec);
        const videoWidth = videoDuration * zoom;
        if (y >= PADDING_TOP && y <= PADDING_TOP + SYNC_ROW_HEIGHT && x >= videoX && x <= videoX + videoWidth) {
          dragOriginRef.current = { x: event.clientX, panOffset, videoOffset: videoOffsetSec, wclOffset: wclOffsetSec, zoom };
          setIsDraggingSync("video");
          return;
        }

        const wclX = timeToX(wclOffsetSec);
        const wclWidth = reportDuration * zoom;
        if (y >= PADDING_TOP + SYNC_ROW_HEIGHT && y <= PADDING_TOP + SYNC_ROW_HEIGHT * 2 && x >= wclX && x <= wclX + wclWidth) {
          dragOriginRef.current = { x: event.clientX, panOffset, videoOffset: videoOffsetSec, wclOffset: wclOffsetSec, zoom };
          setIsDraggingSync("wcl");
          return;
        }
      }

      const fightsTop = PADDING_TOP + SYNC_ROW_HEIGHT * 2;
      if (y >= fightsTop && y <= fightsTop + FIGHT_ROW_HEIGHT && x >= LABEL_WIDTH) {
        const clickedTime = xToTime(x);
        const clickedFight = fights.find((fight) => {
          const start = fight.startTime / 1000 + wclOffsetSec;
          const end = fight.endTime / 1000 + wclOffsetSec;
          return clickedTime >= start && clickedTime <= end;
        });
        if (clickedFight) {
          onFightSelect(clickedFight.id);
          return;
        }
      }

      const trackIndex = Math.floor((y - tracksTop) / TRACK_ROW_HEIGHT);
      const markerTrack = trackMarkers[trackIndex];
      if (markerTrack && x >= LABEL_WIDTH) {
        const clickedMarker = markerTrack.markers.find((marker) => Math.abs(x - marker.x) <= EVENT_HIT_RADIUS);
        if (clickedMarker) {
          onTimelineClick(clickedMarker.events[0].timestamp / 1000);
          return;
        }
      }

      if (x >= LABEL_WIDTH) {
        dragOriginRef.current = { x: event.clientX, panOffset, videoOffset: videoOffsetSec, wclOffset: wclOffsetSec, zoom };
        setIsDragging(true);
      }
    },
    [
      isLocked,
      timeToX,
      videoOffsetSec,
      videoDuration,
      zoom,
      panOffset,
      wclOffsetSec,
      reportDuration,
      xToTime,
      fights,
      onFightSelect,
      tracksTop,
      trackMarkers,
      onTimelineClick,
    ]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const container = containerRef.current;
      if (!container || isDragging || isDraggingSync) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const fightsTop = PADDING_TOP + SYNC_ROW_HEIGHT * 2;

      if (y >= fightsTop && y <= fightsTop + FIGHT_ROW_HEIGHT && x >= LABEL_WIDTH) {
        const hoverTime = xToTime(x);
        const fight = fights.find((candidate) => {
          const start = candidate.startTime / 1000 + wclOffsetSec;
          const end = candidate.endTime / 1000 + wclOffsetSec;
          return hoverTime >= start && hoverTime <= end;
        });
        setHoveredFight(fight || null);
      } else {
        setHoveredFight(null);
      }

      const trackIndex = Math.floor((y - tracksTop) / TRACK_ROW_HEIGHT);
      const markerTrack = trackMarkers[trackIndex];
      if (!markerTrack || x < LABEL_WIDTH) {
        setHoveredEvent(null);
        return;
      }

      let nearestMarker: TrackMarker | null = null;
      let nearestDistance = EVENT_HIT_RADIUS + 1;
      for (const marker of markerTrack.markers) {
        const distance = Math.abs(x - marker.x);
        if (distance <= EVENT_HIT_RADIUS && distance < nearestDistance) {
          nearestMarker = marker;
          nearestDistance = distance;
        }
      }

      setHoveredEvent(
        nearestMarker
          ? {
              event: nearestMarker.events[0],
              events: nearestMarker.events,
              track: markerTrack.track,
              x: nearestMarker.x,
              y: tracksTop + trackIndex * TRACK_ROW_HEIGHT + TRACK_ROW_HEIGHT / 2,
            }
          : null
      );
    },
    [isDragging, isDraggingSync, xToTime, fights, wclOffsetSec, tracksTop, trackMarkers]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: MouseEvent) => {
      const origin = dragOriginRef.current;
      setPanOffset(origin.panOffset - (event.clientX - origin.x));
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isDraggingSync) return;

    const handleMove = (event: MouseEvent) => {
      const origin = dragOriginRef.current;
      const deltaSeconds = (event.clientX - origin.x) / origin.zoom;
      if (isDraggingSync === "video") setVideoOffsetSec(origin.videoOffset + deltaSeconds);
      else setWclOffsetSec(origin.wclOffset + deltaSeconds);
    };
    const handleUp = (event: MouseEvent) => {
      const origin = dragOriginRef.current;
      const deltaSeconds = (event.clientX - origin.x) / origin.zoom;
      const finalVideoOffset = isDraggingSync === "video" ? origin.videoOffset + deltaSeconds : origin.videoOffset;
      const finalWclOffset = isDraggingSync === "wcl" ? origin.wclOffset + deltaSeconds : origin.wclOffset;
      const finalOffset = finalVideoOffset - finalWclOffset;
      setIsDraggingSync(null);
      setAutoSynced(false);
      onOffsetChange(finalOffset);
      onOffsetCommit?.(finalOffset);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingSync, onOffsetChange, onOffsetCommit]);

  const adjustOffset = useCallback(
    (deltaSeconds: number) => {
      const nextOffset = currentOffset + deltaSeconds;
      setVideoOffsetSec(nextOffset + wclOffsetSec);
      setIsLocked(true);
      setAutoSynced(false);
      onOffsetChange(nextOffset);
      onOffsetCommit?.(nextOffset);
    },
    [currentOffset, wclOffsetSec, onOffsetChange, onOffsetCommit]
  );

  const resetAutoSync = useCallback(() => {
    if (autoOffset === null) return;
    setVideoOffsetSec(autoOffset);
    setWclOffsetSec(0);
    setIsLocked(true);
    setAutoSynced(true);
    onOffsetChange(autoOffset);
    onOffsetReset?.();
  }, [autoOffset, onOffsetChange, onOffsetReset]);

  const selectedFight = fights.find((fight) => fight.id === selectedFightId);
  const hoveredEventFightTime = hoveredEvent && selectedFight ? (hoveredEvent.event.timestamp - selectedFight.startTime) / 1000 : null;
  const tooltipLeft = hoveredEvent ? Math.max(LABEL_WIDTH + 8, Math.min(hoveredEvent.x + 12, Math.max(LABEL_WIDTH + 8, canvasWidth - 260))) : 0;

  return (
    <div className="w-full antialiased">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="mb-1 font-semibold text-gray-100">Timeline</h3>
          <p className="max-w-2xl text-pretty text-xs text-gray-400">
            Scroll to zoom, drag to pan, and click a cast or death to seek the VOD. Each fight gets one row per ability and one combined death row.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <div className="mr-1 text-right text-gray-400">
            <div className="font-medium tabular-nums text-gray-200">Offset {formatPreciseTime(currentOffset)}</div>
            <div>{autoSyncLatencySeconds > 0 ? `Twitch delay compensation ${autoSyncLatencySeconds.toFixed(1)}s` : autoSynced ? "Timestamp auto-sync" : "Saved calibration"}</div>
          </div>
          <button
            type="button"
            onClick={() => adjustOffset(0.5)}
            className="h-10 rounded-md border border-[#45455e] bg-[#202031] px-3 text-gray-200 transition-[color,background-color,border-color,transform] active:scale-[0.96] hover:bg-[#29293d]"
            title="Move WCL events 0.5 seconds earlier in the video"
          >
            Earlier 0.5s
          </button>
          <button
            type="button"
            onClick={() => adjustOffset(-0.5)}
            className="h-10 rounded-md border border-[#45455e] bg-[#202031] px-3 text-gray-200 transition-[color,background-color,border-color,transform] active:scale-[0.96] hover:bg-[#29293d]"
            title="Move WCL events 0.5 seconds later in the video"
          >
            Later 0.5s
          </button>
          <button
            type="button"
            onClick={resetAutoSync}
            disabled={autoOffset === null}
            className="h-10 rounded-md border border-[#45455e] bg-[#202031] px-3 text-gray-200 transition-[color,background-color,border-color,transform] active:scale-[0.96] enabled:hover:bg-[#29293d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset auto
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLocked((locked) => !locked);
              if (isLocked) setAutoSynced(false);
            }}
            className={`h-10 rounded-md border px-3 transition-[color,background-color,border-color,transform] active:scale-[0.96] ${
              isLocked ? "border-green-500 bg-green-700 text-white hover:bg-green-800" : "border-[#45455e] bg-[#202031] text-gray-200 hover:bg-[#29293d]"
            }`}
            title={isLocked ? "Unlock the Video and WCL bars for dragging" : "Lock the Video and WCL bars"}
          >
            {isLocked ? "Locked" : "Unlocked"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-[#35354a] bg-[#181824]"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoveredFight(null);
            setHoveredEvent(null);
          }}
        />

        {hoveredFight && (
          <div className="pointer-events-none absolute left-[218px] top-2 z-10 rounded-md border border-[#45455e] bg-[#1a1a2e] px-3 py-2 text-sm text-white shadow-lg">
            <div className="font-semibold">{hoveredFight.name}</div>
            <div className="text-xs tabular-nums text-gray-400">
              {formatTime((hoveredFight.endTime - hoveredFight.startTime) / 1000)} · {hoveredFight.kill ? "Kill" : "Wipe"}
            </div>
          </div>
        )}

        {hoveredEvent && (
          <div
            className="pointer-events-none absolute z-10 max-w-80 rounded-md border border-[#45455e] bg-[#1a1a2e] px-3 py-2 text-sm text-white shadow-lg"
            style={{ left: tooltipLeft, top: Math.max(8, hoveredEvent.y - 24) }}
          >
            <div className="font-semibold">
              {hoveredEvent.track.kind === "death"
                ? hoveredEvent.events.length > 1
                  ? `${hoveredEvent.events.length} player deaths`
                  : hoveredEvent.event.targetInfo?.name || "Player death"
                : hoveredEvent.event.abilityInfo?.name || hoveredEvent.track.label}
            </div>
            <div className="text-xs text-gray-400">
              {hoveredEvent.track.kind === "death"
                ? hoveredEvent.events
                    .map((event) => `${event.targetInfo?.name || "Player"} (${event.targetInfo?.subType || "Unknown"})`)
                    .join(", ")
                : `${hoveredEvent.event.sourceInfo?.name || "NPC"}${hoveredEvent.event.targetInfo?.name && hoveredEvent.event.targetInfo.name !== "Environment" ? ` → ${hoveredEvent.event.targetInfo.name}` : ""}`}
            </div>
            <div className="mt-1 text-xs tabular-nums text-gray-400">
              {hoveredEventFightTime !== null ? `${formatPreciseTime(hoveredEventFightTime)} into fight · ` : ""}Click to seek
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-blue-600" />Video</span>
        <span className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-purple-600" />WCL report</span>
        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-sm bg-orange-500" />NPC ability</span>
        <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-red-600" />Player death</span>
        <span className="flex items-center gap-2"><span className="h-4 w-0.5 bg-blue-400" />Current time</span>
      </div>
    </div>
  );
}
