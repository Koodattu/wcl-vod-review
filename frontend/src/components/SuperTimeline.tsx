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
}

const ROW_HEIGHT = 40;
const ROWS = 3; // Fights, Abilities, Deaths
const TIMELINE_HEIGHT = ROW_HEIGHT * ROWS;
const PADDING_TOP = 60; // Space for time labels
const PADDING_BOTTOM = 20;
const MIN_ZOOM = 0.1; // Min pixels per second
const MAX_ZOOM = 50; // Max pixels per second

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
}: SuperTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Timeline state
  const [zoom, setZoom] = useState<number>(1); // pixels per second
  const [panOffset, setPanOffset] = useState<number>(0); // pixels from left
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, panOffset: 0 });
  const [hoveredFight, setHoveredFight] = useState<Fight | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<(Event & { x: number; y: number }) | null>(null);

  const reportDuration = (reportEndTime - reportStartTime) / 1000; // in seconds

  // Initialize zoom to fit entire report in view
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40; // padding
      const initialZoom = Math.max(MIN_ZOOM, Math.min(containerWidth / reportDuration, MAX_ZOOM));
      setZoom(initialZoom);
    }
  }, [reportDuration]);

  // Auto-zoom when fight is selected
  useEffect(() => {
    if (selectedFightId && containerRef.current) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        const containerWidth = containerRef.current.clientWidth - 40;
        const fightDuration = (selectedFight.endTime - selectedFight.startTime) / 1000;
        const fightStartOffset = (selectedFight.startTime - reportStartTime) / 1000;

        // Zoom to fit fight width
        const newZoom = Math.max(MIN_ZOOM, Math.min(containerWidth / fightDuration, MAX_ZOOM));
        setZoom(newZoom);

        // Pan to center the fight
        const fightStartX = fightStartOffset * newZoom;
        const centerOffset = fightStartX - containerWidth / 2 + (fightDuration * newZoom) / 2;
        setPanOffset(centerOffset);
      }
    }
  }, [selectedFightId, fights, reportStartTime, reportEndTime]);

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

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
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
    const startTime = Math.floor(xToTime(0) / timeStep) * timeStep;
    const endTime = Math.ceil(xToTime(width) / timeStep) * timeStep;

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
    ctx.fillText("Fights", 10, PADDING_TOP + ROW_HEIGHT / 2);
    ctx.fillText("Abilities", 10, PADDING_TOP + ROW_HEIGHT * 1.5);
    ctx.fillText("Deaths", 10, PADDING_TOP + ROW_HEIGHT * 2.5);

    // Draw row separators
    ctx.strokeStyle = "#35354a";
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(0, PADDING_TOP + ROW_HEIGHT * i);
      ctx.lineTo(width, PADDING_TOP + ROW_HEIGHT * i);
      ctx.stroke();
    }

    // Draw fights
    fights.forEach((fight) => {
      const fightStartSec = (fight.startTime - reportStartTime) / 1000;
      const fightEndSec = (fight.endTime - reportStartTime) / 1000;
      const x = timeToX(fightStartSec);
      const w = (fightEndSec - fightStartSec) * zoom;
      const y = PADDING_TOP + 5;
      const h = ROW_HEIGHT - 10;

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

      // Draw fight name if wide enough
      if (w > 60) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.fillText(fight.name, x + 5, y + h / 2 + 4, w - 10);
      }
    });

    // Draw events for selected fight
    if (selectedFightId && events.length > 0) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        const fightStartSec = (selectedFight.startTime - reportStartTime) / 1000;

        events.forEach((event) => {
          const eventTimeSec = event.timestamp / 1000;
          const eventRelativeTime = eventTimeSec - fightStartSec;
          const x = timeToX(fightStartSec + eventRelativeTime);

          // Only draw if visible
          if (x < 0 || x > width) return;

          const y = event.type === "Casts" ? PADDING_TOP + ROW_HEIGHT + 10 : PADDING_TOP + ROW_HEIGHT * 2 + 10;

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
    if (selectedFightId) {
      const selectedFight = fights.find((f) => f.id === selectedFightId);
      if (selectedFight) {
        const fightStartSec = (selectedFight.startTime - reportStartTime) / 1000;
        const currentTime = currentVideoTime - offset;
        const x = timeToX(fightStartSec + currentTime);

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
          ctx.fillText(formatTime(currentTime), x - 15, PADDING_TOP - 25);
        }
      }
    }
  }, [fights, reportStartTime, selectedFightId, events, zoom, timeToX, xToTime, hoveredFight, currentVideoTime, offset]);

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
      const newZoom = Math.max(MIN_ZOOM, Math.min(zoom * zoomFactor, MAX_ZOOM));

      // Adjust pan to keep mouse position steady
      const newMouseX = timeAtMouse * newZoom - panOffset;
      const panAdjustment = newMouseX - mouseX;

      setZoom(newZoom);
      setPanOffset(panOffset + panAdjustment);
    },
    [zoom, panOffset, xToTime]
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

      // Check if clicking on a fight
      if (y >= PADDING_TOP && y <= PADDING_TOP + ROW_HEIGHT) {
        const clickTime = xToTime(x);
        const clickedFight = fights.find((f) => {
          const fightStartSec = (f.startTime - reportStartTime) / 1000;
          const fightEndSec = (f.endTime - reportStartTime) / 1000;
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
          const fightStartSec = (selectedFight.startTime - reportStartTime) / 1000;

          for (const event of events) {
            const eventTimeSec = event.timestamp / 1000;
            const eventRelativeTime = eventTimeSec - fightStartSec;
            const eventX = timeToX(fightStartSec + eventRelativeTime);
            const eventY = event.type === "Casts" ? PADDING_TOP + ROW_HEIGHT + 10 : PADDING_TOP + ROW_HEIGHT * 2 + 10;

            const distance = Math.sqrt(Math.pow(x - eventX, 2) + Math.pow(y - (eventY + 10), 2));
            if (distance <= 6) {
              // Clicked on event
              onTimelineClick(eventRelativeTime);
              return;
            }
          }
        }
      }

      // Start dragging
      setIsDragging(true);
      setDragStart({ x: e.clientX, panOffset });
    },
    [fights, reportStartTime, xToTime, timeToX, onFightSelect, selectedFightId, events, panOffset, onTimelineClick]
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
      if (y >= PADDING_TOP && y <= PADDING_TOP + ROW_HEIGHT) {
        const hoverTime = xToTime(x);
        const hovered = fights.find((f) => {
          const fightStartSec = (f.startTime - reportStartTime) / 1000;
          const fightEndSec = (f.endTime - reportStartTime) / 1000;
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
          const fightStartSec = (selectedFight.startTime - reportStartTime) / 1000;
          let foundEvent = null;

          for (const event of events) {
            const eventTimeSec = event.timestamp / 1000;
            const eventRelativeTime = eventTimeSec - fightStartSec;
            const eventX = timeToX(fightStartSec + eventRelativeTime);
            const eventY = event.type === "Casts" ? PADDING_TOP + ROW_HEIGHT + 10 : PADDING_TOP + ROW_HEIGHT * 2 + 10;

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

      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      setPanOffset(dragStart.panOffset - deltaX);
    },
    [isDragging, dragStart, xToTime, fights, reportStartTime, timeToX, selectedFightId, events]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
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

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-100 mb-2">Timeline</h3>
        <p className="text-xs text-gray-400">Scroll to zoom • Drag to pan • Click a fight to select and auto-zoom • Click events to seek video</p>
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
