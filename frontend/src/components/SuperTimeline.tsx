"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  kill?: boolean;
  iconUrl?: string | null;
}

interface Event {
  timestamp: number;
  type: "Deaths" | "Casts";
  ability?: {
    name: string;
    guid: number;
    type: number;
  };
}

interface SuperTimelineProps {
  reportStartTime: number; // Report start time in ms
  reportEndTime: number; // Report end time in ms
  fights: Fight[];
  selectedFightId: number | null;
  onFightSelect: (fightId: number) => void;
  events: Event[]; // Events for the currently selected fight
  currentVideoTime: number; // Current video playback time in seconds (adjusted for offset)
  offset: number; // Time offset between WCL and video in seconds
  onTimelineClick: (timeInSeconds: number) => void;
  videoDuration: number; // Video duration in seconds
  videoStartTime: number; // Video start timestamp in ms
  onOffsetChange: (offset: number) => void; // Callback when offset changes
}

const SYNC_ROW_HEIGHT = 30;
const FIGHT_ROW_HEIGHT = 40;
const EVENT_ROW_HEIGHT = 40;
const SYNC_ROWS = 2; // Video and WCL
const FIGHT_ROWS = 1;
const EVENT_ROWS = 2; // Abilities, Deaths
const TIMELINE_HEIGHT = SYNC_ROW_HEIGHT * SYNC_ROWS + FIGHT_ROW_HEIGHT * FIGHT_ROWS + EVENT_ROW_HEIGHT * EVENT_ROWS;
const PADDING_TOP = 60; // Space for time labels
const PADDING_BOTTOM = 20;
const MIN_ZOOM = 0.1; // Min pixels per second
const MAX_ZOOM = 50; // Max pixels per second
const EDGE_PADDING_SEC = 60; // Extra seconds padding at edges when max zoomed out

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
}: SuperTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iconImagesRef = useRef<Map<string, HTMLImageElement>>(new Map()); // Cache for boss icons

  // Timeline state
  const [zoom, setZoom] = useState<number>(1); // pixels per second
  const [panOffset, setPanOffset] = useState<number>(0); // pixels from left
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, panOffset: 0 });
  const [hoveredFight, setHoveredFight] = useState<Fight | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<(Event & { x: number; y: number }) | null>(null);

  // Sync timeline state
  const [videoOffsetSec, setVideoOffsetSec] = useState<number>(0); // Video offset in seconds from timeline start
  const [wclOffsetSec, setWclOffsetSec] = useState<number>(0); // WCL offset in seconds from timeline start
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isDraggingSync, setIsDraggingSync] = useState<"video" | "wcl" | null>(null);
  const [autoSynced, setAutoSynced] = useState<boolean>(false);

  const reportDuration = (reportEndTime - reportStartTime) / 1000; // in seconds
  const videoDurationSec = videoDuration;

  // Initialize sync offsets and auto-sync
  useEffect(() => {
    // Always set WCL to start at 0 by default
    setWclOffsetSec(0);

    if (videoStartTime && reportStartTime && videoDurationSec > 0) {
      // Try to auto-align based on timestamps
      const timeDiffSeconds = (reportStartTime - videoStartTime) / 1000;

      // Only auto-align if the timestamps are within a reasonable range (same day)
      const dayInSeconds = 24 * 60 * 60;
      if (Math.abs(timeDiffSeconds) < dayInSeconds) {
        setVideoOffsetSec(timeDiffSeconds);
        setIsLocked(true);
        setAutoSynced(true);

        // Calculate and set the offset
        const offsetSec = timeDiffSeconds;
        onOffsetChange(offsetSec);
      } else {
        // If not auto-syncing, position video bar below WCL for visibility
        setVideoOffsetSec(-videoDurationSec - 60); // Place before WCL with a gap
      }
    } else if (videoDurationSec > 0) {
      // No timestamps available, position video bar before WCL
      setVideoOffsetSec(-videoDurationSec - 60);
    }
  }, [videoStartTime, reportStartTime, onOffsetChange, videoDurationSec]);

  // Update offset when sync positions change
  useEffect(() => {
    if (isLocked) {
      const offsetSec = videoOffsetSec - wclOffsetSec;
      onOffsetChange(offsetSec);
    }
  }, [videoOffsetSec, wclOffsetSec, isLocked, onOffsetChange]);

  // Load boss icons
  useEffect(() => {
    fights.forEach((fight) => {
      if (fight.iconUrl && !iconImagesRef.current.has(fight.iconUrl)) {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Enable CORS for external images
        img.onload = () => {
          iconImagesRef.current.set(fight.iconUrl!, img);
          // Icon loaded - canvas will redraw on next state change
        };
        img.onerror = () => {
          console.warn(`Failed to load icon: ${fight.iconUrl}`);
        };
        img.src = fight.iconUrl;
      }
    });
  }, [fights]);

  // Initialize zoom to fit entire report in view with edge padding
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40; // padding
      const totalDurationWithPadding = reportDuration + EDGE_PADDING_SEC * 2;
      const initialZoom = Math.max(MIN_ZOOM, Math.min(containerWidth / totalDurationWithPadding, MAX_ZOOM));
      setZoom(initialZoom);
      // Center the view
      setPanOffset(-EDGE_PADDING_SEC * initialZoom);
    }
  }, [reportDuration]);

  // Auto-zoom when fight is selected
  useEffect(() => {
    if (selectedFightId && containerRef.current) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        const containerWidth = containerRef.current.clientWidth - 40;
        // Fight times are already relative to report start in milliseconds
        const fightDuration = (selectedFight.endTime - selectedFight.startTime) / 1000;
        const fightStartOffset = selectedFight.startTime / 1000;

        // Zoom to fit fight width
        const newZoom = Math.max(MIN_ZOOM, Math.min(containerWidth / fightDuration, MAX_ZOOM));
        setZoom(newZoom);

        // Pan to center the fight (account for WCL bar offset on timeline)
        const fightStartX = (fightStartOffset + wclOffsetSec) * newZoom;
        const centerOffset = fightStartX - containerWidth / 2 + (fightDuration * newZoom) / 2;
        setPanOffset(centerOffset);
      }
    }
  }, [selectedFightId, fights, wclOffsetSec]);

  // Update parent when offsets change (after dragging stops)
  useEffect(() => {
    if (!isDraggingSync) {
      const offset = videoOffsetSec - wclOffsetSec;
      onOffsetChange?.(offset);
    }
  }, [videoOffsetSec, wclOffsetSec, isDraggingSync, onOffsetChange]);

  // Convert time (in seconds from report start) to X coordinate
  const timeToX = useCallback(
    (timeInSeconds: number) => {
      return timeInSeconds * zoom - panOffset;
    },
    [zoom, panOffset]
  );

  // Convert X coordinate to time (in seconds from report start)
  const xToTime = useCallback(
    (x: number) => {
      return (x + panOffset) / zoom;
    },
    [zoom, panOffset]
  );

  // Auto-pan to keep current time visible when video is playing
  // DISABLED - was causing issues with jumping to wrong positions
  // TODO: Reimplement with correct WCL timeline calculations
  /*
  useEffect(() => {
    if (selectedFightId && containerRef.current) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        const containerWidth = containerRef.current.clientWidth - 40;
        // Fight start time is already relative to report start in milliseconds
        const fightStartSec = selectedFight.startTime / 1000;
        const currentTime = currentVideoTime - offset;
        const currentTimeAbsolute = fightStartSec + currentTime + wclOffsetSec;

        // Calculate the X position of current time
        const currentX = timeToX(currentTimeAbsolute);

        // Check if current time is outside visible area (with some margin)
        const margin = 50; // pixels
        if (currentX < margin || currentX > containerWidth - margin) {
          // Pan to center current time without changing zoom
          const targetX = containerWidth / 2;
          const newPanOffset = currentTimeAbsolute * zoom - targetX;
          setPanOffset(newPanOffset);
        }
      }
    }
  }, [currentVideoTime, selectedFightId, fights, reportStartTime, offset, wclOffsetSec, zoom, timeToX]);
  */

  // Format time for display
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Draw timeline
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = container.clientWidth;
    const height = PADDING_TOP + TIMELINE_HEIGHT + PADDING_BOTTOM;

    // Set canvas size (handle DPI)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "#181824";
    ctx.fillRect(0, 0, width, height);

    // Draw time markers
    ctx.strokeStyle = "#35354a";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.lineWidth = 1;

    const timeStep = calculateTimeStep(zoom);
    const startTime = Math.max(0, Math.floor(xToTime(0) / timeStep) * timeStep);
    const endTime = Math.min(reportDuration, Math.ceil(xToTime(width) / timeStep) * timeStep);

    for (let t = startTime; t <= endTime; t += timeStep) {
      const x = timeToX(t);
      if (x >= 0 && x <= width) {
        ctx.beginPath();
        ctx.moveTo(x, PADDING_TOP);
        ctx.lineTo(x, PADDING_TOP + TIMELINE_HEIGHT);
        ctx.stroke();

        ctx.fillText(formatTime(t), x - 15, PADDING_TOP - 10);
      }
    }

    // Draw row labels
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "12px sans-serif";
    const videoRowY = PADDING_TOP + SYNC_ROW_HEIGHT / 2;
    const wclRowY = PADDING_TOP + SYNC_ROW_HEIGHT + SYNC_ROW_HEIGHT / 2;
    const fightsRowY = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT / 2;
    const abilitiesRowY = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT / 2;
    const deathsRowY = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT + EVENT_ROW_HEIGHT / 2;

    ctx.fillText("Video", 10, videoRowY);
    ctx.fillText("WCL", 10, wclRowY);
    ctx.fillText("Fights", 10, fightsRowY);
    ctx.fillText("Abilities", 10, abilitiesRowY);
    ctx.fillText("Deaths", 10, deathsRowY);

    // Draw row separators
    ctx.strokeStyle = "#35354a";
    const rowYPositions = [
      PADDING_TOP + SYNC_ROW_HEIGHT,
      PADDING_TOP + SYNC_ROW_HEIGHT * 2,
      PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT,
      PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT,
    ];

    rowYPositions.forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });

    // Draw Video sync bar
    const videoX = timeToX(videoOffsetSec);
    const videoW = videoDurationSec * zoom;
    const videoY = PADDING_TOP + 3;
    const videoH = SYNC_ROW_HEIGHT - 6;

    if (videoX + videoW > 0 && videoX < width) {
      ctx.fillStyle = isDraggingSync === "video" ? "#3b82f6" : "#2563eb";
      ctx.fillRect(Math.max(0, videoX), videoY, Math.min(videoW, width - Math.max(0, videoX)), videoH);

      ctx.strokeStyle = isLocked ? "#10b981" : "#1e40af";
      ctx.lineWidth = isLocked ? 2 : 1;
      ctx.strokeRect(Math.max(0, videoX), videoY, Math.min(videoW, width - Math.max(0, videoX)), videoH);

      // Draw label if wide enough
      if (videoW > 80) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.fillText(`Video (${formatTime(videoDurationSec)})`, Math.max(5, videoX + 5), videoY + videoH / 2 + 4);
      }
    }

    // Draw WCL sync bar
    const wclX = timeToX(wclOffsetSec);
    const wclW = reportDuration * zoom;
    const wclY = PADDING_TOP + SYNC_ROW_HEIGHT + 3;
    const wclH = SYNC_ROW_HEIGHT - 6;

    if (wclX + wclW > 0 && wclX < width) {
      ctx.fillStyle = isDraggingSync === "wcl" ? "#a855f7" : "#9333ea";
      ctx.fillRect(Math.max(0, wclX), wclY, Math.min(wclW, width - Math.max(0, wclX)), wclH);

      ctx.strokeStyle = isLocked ? "#10b981" : "#7e22ce";
      ctx.lineWidth = isLocked ? 2 : 1;
      ctx.strokeRect(Math.max(0, wclX), wclY, Math.min(wclW, width - Math.max(0, wclX)), wclH);

      // Draw label if wide enough
      if (wclW > 80) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.fillText(`WCL Report (${formatTime(reportDuration)})`, Math.max(5, wclX + 5), wclY + wclH / 2 + 4);
      }
    }

    // Draw fights
    fights.forEach((fight) => {
      // Fight times from API are already relative to report start in milliseconds
      const fightStartSec = fight.startTime / 1000;
      const fightEndSec = fight.endTime / 1000;
      const x = timeToX(fightStartSec + wclOffsetSec); // Position relative to WCL bar
      const w = (fightEndSec - fightStartSec) * zoom;
      const y = PADDING_TOP + SYNC_ROW_HEIGHT * 2 + 5; // Position in Fights row
      const h = FIGHT_ROW_HEIGHT - 10;

      // Only draw if visible
      if (x + w < 0 || x > width) return;

      const isSelected = fight.id === selectedFightId;
      const isHovered = hoveredFight?.id === fight.id;

      // Draw fight bar
      ctx.fillStyle = fight.kill ? (isSelected ? "#10b981" : "#059669") : isSelected ? "#ef4444" : "#dc2626";
      if (isHovered && !isSelected) {
        ctx.fillStyle = fight.kill ? "#34d399" : "#f87171";
      }
      ctx.fillRect(x, y, Math.max(w, 2), h);

      // Draw border
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#1f2937";
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.strokeRect(x, y, Math.max(w, 2), h);

      // Draw boss icon at the start of the bar if available
      const iconSize = h - 4; // Icon size slightly smaller than bar height
      if (fight.iconUrl) {
        const icon = iconImagesRef.current.get(fight.iconUrl);
        if (icon && icon.complete) {
          try {
            // Draw a small background for the icon
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(x + 2, y + 2, iconSize, iconSize);

            // Draw the icon
            ctx.drawImage(icon, x + 2, y + 2, iconSize, iconSize);

            // Draw icon border
            ctx.strokeStyle = "#35354a";
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 2, y + 2, iconSize, iconSize);
          } catch (e) {
            console.warn("Failed to draw icon:", e);
          }
        }
      }

      // Draw fight name if wide enough (offset if icon exists)
      const textOffset = fight.iconUrl ? iconSize + 7 : 5;
      if (w > 60) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.fillText(fight.name, x + textOffset, y + h / 2 + 4, w - textOffset - 5);
      }
    });

    // Draw events for selected fight
    if (selectedFightId && events.length > 0) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        events.forEach((event) => {
          // Event timestamp from API is already relative to report start in milliseconds
          const eventTimeSec = event.timestamp / 1000;
          const x = timeToX(eventTimeSec + wclOffsetSec); // Position relative to WCL bar

          // Only draw if visible
          if (x < 0 || x > width) return;

          // Position in Abilities or Deaths row
          const y =
            event.type === "Casts" ? PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + 10 : PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT + 10;

          // Draw event marker
          ctx.fillStyle = event.type === "Casts" ? "#f97316" : "#dc2626";
          ctx.beginPath();
          ctx.arc(x, y + 10, 4, 0, Math.PI * 2);
          ctx.fill();

          // Draw icon/text
          ctx.fillStyle = "#ffffff";
          ctx.font = "12px sans-serif";
          const icon = event.type === "Casts" ? "⚔️" : "☠️";
          ctx.fillText(icon, x - 6, y + 5);
        });
      }
    }

    // Draw current time indicator
    // Show current video time mapped to WCL timeline
    if (currentVideoTime !== undefined && offset !== undefined) {
      // Current video time + offset = corresponding WCL time
      const wclTime = currentVideoTime + offset;
      const x = timeToX(wclTime + wclOffsetSec);

      if (x >= 0 && x <= width) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, PADDING_TOP);
        ctx.lineTo(x, PADDING_TOP + TIMELINE_HEIGHT);
        ctx.stroke();

        // Draw time label
        ctx.fillStyle = "#3b82f6";
        ctx.font = "11px sans-serif";
        ctx.fillText(formatTime(wclTime), x - 15, PADDING_TOP - 25);
      }
    }
  }, [
    fights,
    selectedFightId,
    events,
    zoom,
    timeToX,
    xToTime,
    hoveredFight,
    currentVideoTime,
    offset,
    videoOffsetSec,
    wclOffsetSec,
    videoDurationSec,
    reportDuration,
    isDraggingSync,
    isLocked,
  ]);

  // Calculate appropriate time step for markers based on zoom
  const calculateTimeStep = (currentZoom: number) => {
    const minPixelsBetweenMarkers = 100;
    const secondsPerMarker = minPixelsBetweenMarkers / currentZoom;

    if (secondsPerMarker <= 10) return 10;
    if (secondsPerMarker <= 30) return 30;
    if (secondsPerMarker <= 60) return 60;
    if (secondsPerMarker <= 120) return 120;
    if (secondsPerMarker <= 300) return 300;
    return 600;
  };

  // Redraw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const timeAtMouse = xToTime(mouseX);

      // Zoom in/out
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      // Calculate max zoom out to fit report with padding
      const containerWidth = container.clientWidth - 40;
      const totalDurationWithPadding = reportDuration + EDGE_PADDING_SEC * 2;
      const minZoomForReport = containerWidth / totalDurationWithPadding;

      const newZoom = Math.max(Math.max(MIN_ZOOM, minZoomForReport), Math.min(zoom * zoomFactor, MAX_ZOOM));

      // Adjust pan to keep mouse position steady
      const newMouseX = timeAtMouse * newZoom - panOffset;
      const panAdjustment = newMouseX - mouseX;

      setZoom(newZoom);
      setPanOffset(panOffset + panAdjustment);
    },
    [zoom, panOffset, xToTime, reportDuration]
  );

  // Handle mouse down for dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking on sync bars (only if unlocked)
      if (!isLocked) {
        const videoRowTop = PADDING_TOP;
        const videoRowBottom = videoRowTop + SYNC_ROW_HEIGHT;
        const wclRowTop = PADDING_TOP + SYNC_ROW_HEIGHT;
        const wclRowBottom = wclRowTop + SYNC_ROW_HEIGHT;

        // Check Video row
        if (y >= videoRowTop && y <= videoRowBottom) {
          const videoX = timeToX(videoOffsetSec);
          const videoW = videoDurationSec * zoom;
          if (x >= videoX && x <= videoX + videoW) {
            setIsDraggingSync("video");
            setDragStart({ x: e.clientX, panOffset });
            return;
          }
        }

        // Check WCL row
        if (y >= wclRowTop && y <= wclRowBottom) {
          const wclX = timeToX(wclOffsetSec);
          const wclW = reportDuration * zoom;
          if (x >= wclX && x <= wclX + wclW) {
            setIsDraggingSync("wcl");
            setDragStart({ x: e.clientX, panOffset });
            return;
          }
        }
      }

      // Check if clicking on a fight
      const fightsRowTop = PADDING_TOP + SYNC_ROW_HEIGHT * 2;
      const fightsRowBottom = fightsRowTop + FIGHT_ROW_HEIGHT;
      if (y >= fightsRowTop && y <= fightsRowBottom) {
        const clickTime = xToTime(x);
        const clickedFight = fights.find((f) => {
          // Fight times are already relative to report start in milliseconds
          const fightStartSec = f.startTime / 1000 + wclOffsetSec;
          const fightEndSec = f.endTime / 1000 + wclOffsetSec;
          return clickTime >= fightStartSec && clickTime <= fightEndSec;
        });

        if (clickedFight) {
          onFightSelect(clickedFight.id);
          return;
        }
      }

      // Check if clicking on an event to seek video
      if (selectedFightId && events.length > 0) {
        const selectedFight = fights.find((f) => f.id === selectedFightId);
        if (selectedFight) {
          for (const event of events) {
            // Event timestamp is already relative to report start in milliseconds
            const eventTimeSec = event.timestamp / 1000;
            const eventX = timeToX(eventTimeSec + wclOffsetSec);
            const eventY =
              event.type === "Casts" ? PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + 10 : PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT + 10;

            const distance = Math.sqrt(Math.pow(x - eventX, 2) + Math.pow(y - (eventY + 10), 2));
            if (distance <= 6) {
              // Clicked on event - convert WCL time to video time
              // eventTimeSec is in WCL timeline, subtract offset to get video time
              const videoTime = eventTimeSec - offset;
              onTimelineClick(videoTime);
              return;
            }
          }
        }
      }

      // Start dragging
      setIsDragging(true);
      setDragStart({ x: e.clientX, panOffset });
    },
    [
      fights,
      xToTime,
      timeToX,
      onFightSelect,
      selectedFightId,
      events,
      panOffset,
      onTimelineClick,
      isLocked,
      videoOffsetSec,
      videoDurationSec,
      wclOffsetSec,
      reportDuration,
      zoom,
      offset,
    ]
  );

  // Handle mouse move for dragging and hover
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Update hover state for fights
      const fightsRowTop = PADDING_TOP + SYNC_ROW_HEIGHT * 2;
      const fightsRowBottom = fightsRowTop + FIGHT_ROW_HEIGHT;
      if (y >= fightsRowTop && y <= fightsRowBottom) {
        const hoverTime = xToTime(x);
        const hovered = fights.find((f) => {
          // Fight times are already relative to report start in milliseconds
          const fightStartSec = f.startTime / 1000 + wclOffsetSec;
          const fightEndSec = f.endTime / 1000 + wclOffsetSec;
          return hoverTime >= fightStartSec && hoverTime <= fightEndSec;
        });
        setHoveredFight(hovered || null);
      } else {
        setHoveredFight(null);
      }

      // Update hover state for events
      if (selectedFightId && events.length > 0) {
        const selectedFight = fights.find((f) => f.id === selectedFightId);
        if (selectedFight) {
          let foundEvent = null;

          for (const event of events) {
            // Event timestamp is already relative to report start in milliseconds
            const eventTimeSec = event.timestamp / 1000;
            const eventX = timeToX(eventTimeSec + wclOffsetSec);
            const eventY =
              event.type === "Casts" ? PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + 10 : PADDING_TOP + SYNC_ROW_HEIGHT * 2 + FIGHT_ROW_HEIGHT + EVENT_ROW_HEIGHT + 10;

            const distance = Math.sqrt(Math.pow(x - eventX, 2) + Math.pow(y - (eventY + 10), 2));
            if (distance <= 6) {
              foundEvent = { ...event, x: eventX, y: eventY };
              break;
            }
          }
          setHoveredEvent(foundEvent);
        }
      } else {
        setHoveredEvent(null);
      }

      // Handle sync bar dragging
      if (isDraggingSync) {
        const deltaX = e.clientX - dragStart.x;

        if (isDraggingSync === "video") {
          // Calculate the time shift based on pixel delta
          const deltaTime = deltaX / zoom;
          setVideoOffsetSec(videoOffsetSec + deltaTime);
        } else if (isDraggingSync === "wcl") {
          const deltaTime = deltaX / zoom;
          setWclOffsetSec(wclOffsetSec + deltaTime);
        }

        // Update drag start for continuous dragging
        setDragStart({ x: e.clientX, panOffset: dragStart.panOffset });
        return;
      }

      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      setPanOffset(dragStart.panOffset - deltaX);
    },
    [isDragging, isDraggingSync, dragStart, xToTime, fights, timeToX, selectedFightId, events, zoom, videoOffsetSec, wclOffsetSec]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsDraggingSync(null);
  }, []);

  // Attach event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragStart.x;
        setPanOffset(dragStart.panOffset - deltaX);
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Handle global sync bar dragging
  useEffect(() => {
    if (isDraggingSync) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragStart.x;

        if (isDraggingSync === "video") {
          const deltaTime = deltaX / zoom;
          setVideoOffsetSec((prev) => prev + deltaTime);
        } else if (isDraggingSync === "wcl") {
          const deltaTime = deltaX / zoom;
          setWclOffsetSec((prev) => prev + deltaTime);
        }

        setDragStart({ x: e.clientX, panOffset: dragStart.panOffset });
      };

      const handleGlobalMouseUp = () => {
        setIsDraggingSync(null);
      };

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDraggingSync, dragStart, zoom]);

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-100 mb-2">Timeline</h3>
          <p className="text-xs text-gray-400">Scroll to zoom • Drag to pan • Click a fight to select and auto-zoom • Click events to seek video</p>
        </div>

        {/* Lock toggle button */}
        <button
          onClick={() => {
            if (isLocked && autoSynced) {
              // Show warning when unlocking auto-synced timeline
              const confirmed = window.confirm("Unlocking will allow manual adjustment of the sync. This may break the automatic synchronization. Continue?");
              if (confirmed) {
                setIsLocked(false);
                setAutoSynced(false);
              }
            } else {
              setIsLocked(!isLocked);
            }
          }}
          className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            isLocked ? "bg-green-600 border-green-500 text-white hover:bg-green-700" : "bg-[#1a1a2e] border-[#35354a] text-gray-300 hover:bg-[#232337]"
          }`}
          title={isLocked ? "Timeline sync is locked" : "Timeline sync is unlocked - drag Video or WCL bars to adjust"}
        >
          {isLocked ? (
            <>
              <span>🔒</span>
              <span className="text-sm">Locked</span>
            </>
          ) : (
            <>
              <span>🔓</span>
              <span className="text-sm">Unlocked</span>
            </>
          )}
        </button>
      </div>

      <div ref={containerRef} className="relative bg-[#181824] rounded-lg border border-[#35354a] overflow-hidden" style={{ cursor: isDragging ? "grabbing" : "grab" }}>
        <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />

        {/* Tooltip */}
        {hoveredFight && (
          <div className="absolute top-2 left-2 bg-[#1a1a2e] border border-[#35354a] rounded px-3 py-2 text-sm text-white pointer-events-none z-10">
            <div className="font-semibold">{hoveredFight.name}</div>
            <div className="text-xs text-gray-400">
              Duration: {formatTime((hoveredFight.endTime - hoveredFight.startTime) / 1000)} • {hoveredFight.kill ? "Kill 🏆" : "Wipe 💀"}
            </div>
          </div>
        )}

        {hoveredEvent && (
          <div className="absolute top-2 left-2 bg-[#1a1a2e] border border-[#35354a] rounded px-3 py-2 text-sm text-white pointer-events-none z-10">
            <div className="font-semibold">
              {hoveredEvent.type === "Deaths" ? "☠️ Death" : "⚔️ Cast"}
              {hoveredEvent.ability ? `: ${hoveredEvent.ability.name}` : ""}
            </div>
            <div className="text-xs text-gray-400">Click to seek video</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center flex-wrap gap-4 text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-3 bg-blue-600 rounded"></div>
          <span>Video</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-3 bg-purple-600 rounded"></div>
          <span>WCL Report</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-600 rounded"></div>
          <span>Kill</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-600 rounded"></div>
          <span>Wipe</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
          <span>Boss Ability</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-600 rounded-full"></div>
          <span>Death</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1 h-4 bg-blue-500"></div>
          <span>Current Time</span>
        </div>
      </div>
    </div>
  );
}
