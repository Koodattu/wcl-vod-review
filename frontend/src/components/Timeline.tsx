"use client";

import { useState } from "react";

export interface TimelineEvent {
  time: number; // Time in seconds from fight start
  type: "Deaths" | "Casts";
  label: string;
  event: unknown; // Full event data
}

interface TimelineProps {
  events: TimelineEvent[];
  duration: number; // Fight duration in seconds
  onEventClick: (eventTime: number) => void;
  currentTime?: number; // Current video time (adjusted for offset)
  className?: string;
}

export default function Timeline({ events, duration, onEventClick, currentTime = 0, className = "" }: TimelineProps) {
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);

  // Calculate timeline width (min 800px, or 10px per second)
  const timelineWidth = Math.max(800, duration * 10);

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get event icon based on type
  const getEventIcon = (event: TimelineEvent) => {
    return event.type === "Deaths" ? "☠️" : "⚔️";
  };

  // Get event color based on type
  const getEventColor = (event: TimelineEvent) => {
    return event.type === "Deaths" ? "bg-red-500" : "bg-orange-500";
  };

  return (
    <div className={`relative ${className}`}>
      {/* Timeline container */}
      <div className="relative overflow-x-auto">
        <div className="relative bg-gray-200 rounded-lg h-16" style={{ width: `${timelineWidth}px` }}>
          {/* Time markers */}
          <div className="absolute top-0 left-0 w-full h-full">
            {Array.from({ length: Math.floor(duration / 30) + 1 }, (_, i) => {
              const time = i * 30;
              const position = (time / duration) * 100;

              return (
                <div key={time} className="absolute top-0 h-full border-l border-gray-300" style={{ left: `${position}%` }}>
                  <div className="absolute -top-6 -left-4 text-xs text-gray-600">{formatTime(time)}</div>
                </div>
              );
            })}
          </div>

          {/* Current time indicator */}
          {currentTime >= 0 && currentTime <= duration && (
            <div className="absolute top-0 h-full w-1 bg-blue-600 z-10" style={{ left: `${(currentTime / duration) * 100}%` }}>
              <div className="absolute -top-6 -left-8 text-xs text-blue-600 font-semibold">{formatTime(currentTime)}</div>
            </div>
          )}

          {/* Events */}
          {events.map((event, index) => {
            const position = (event.time / duration) * 100;

            return (
              <div
                key={index}
                className={`absolute top-2 w-3 h-12 rounded cursor-pointer transform -translate-x-1.5 hover:scale-110 transition-transform ${getEventColor(event)}`}
                style={{ left: `${position}%` }}
                onClick={() => onEventClick(event.time)}
                onMouseEnter={() => setHoveredEvent(event)}
                onMouseLeave={() => setHoveredEvent(null)}
                title={event.label}
              >
                <div className="text-white text-xs text-center leading-3 pt-1">{getEventIcon(event)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event tooltip */}
      {hoveredEvent && (
        <div className="mt-4 p-3 bg-gray-900 text-white rounded-lg text-sm">
          <div className="font-semibold">{hoveredEvent.label}</div>
          <div className="text-gray-300">
            Time: {formatTime(hoveredEvent.time)} | Type: {hoveredEvent.type}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center space-x-6 text-sm text-gray-600">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Deaths</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-orange-500 rounded"></div>
          <span>Boss Abilities</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1 h-3 bg-blue-600"></div>
          <span>Current Time</span>
        </div>
      </div>
    </div>
  );
}
