"use client";

import { useState, useRef, useEffect } from "react";

interface TimelineAlignerProps {
  wclDuration: number; // Duration in milliseconds
  wclStartTime: number; // WCL report start timestamp in milliseconds
  videoDuration: number; // Duration in seconds
  videoStartTime: number; // Video publish/create timestamp in milliseconds
  onOffsetChange: (offset: number) => void; // Callback with offset in seconds
  initialOffset?: number; // Initial offset in seconds
}

export default function TimelineAligner({ wclDuration, wclStartTime, videoDuration, videoStartTime, onOffsetChange, initialOffset = 0 }: TimelineAlignerProps) {
  // Convert to seconds for easier handling
  const wclDurationSec = wclDuration / 1000;
  const videoDurationSec = videoDuration;

  // Debug log
  console.log("TimelineAligner props:", {
    wclDuration,
    wclDurationSec,
    videoDuration,
    videoDurationSec,
    wclStartTime,
    videoStartTime,
  });

  // State for bar positions (in pixels from left)
  const [wclOffset, setWclOffset] = useState(0);
  const [videoOffset, setVideoOffset] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Refs for dragging
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingWcl = useRef(false);
  const isDraggingVideo = useRef(false);

  // Calculate the maximum width we need to display both timelines
  const maxDuration = Math.max(wclDurationSec, videoDurationSec);
  const containerWidth = 800; // pixels
  const pixelsPerSecond = containerWidth / maxDuration;

  // Initialize positions to auto-align based on timestamps (only once)
  useEffect(() => {
    if (initialized) return;

    if (initialOffset !== 0) {
      // Use provided initial offset
      setVideoOffset(initialOffset * pixelsPerSecond);
    } else if (wclStartTime && videoStartTime) {
      // Try to auto-align based on timestamps
      const timeDiffSeconds = (wclStartTime - videoStartTime) / 1000;

      // Only auto-align if the timestamps are within a reasonable range (same day)
      const dayInSeconds = 24 * 60 * 60;
      if (Math.abs(timeDiffSeconds) < dayInSeconds) {
        setVideoOffset(timeDiffSeconds * pixelsPerSecond);
      }
    }

    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate the sync offset in seconds and notify parent
  useEffect(() => {
    if (!initialized) return; // Don't notify until initialized

    const offsetSeconds = (videoOffset - wclOffset) / pixelsPerSecond;
    if (isFinite(offsetSeconds)) {
      onOffsetChange(offsetSeconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wclOffset, videoOffset, pixelsPerSecond, initialized]);

  const handleMouseDown = (bar: "wcl" | "video") => (e: React.MouseEvent) => {
    e.preventDefault();
    if (bar === "wcl") {
      isDraggingWcl.current = true;
    } else {
      isDraggingVideo.current = true;
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Constrain to container bounds
    const constrainedX = Math.max(0, Math.min(x, containerWidth));

    if (isDraggingWcl.current) {
      setWclOffset(constrainedX);
    } else if (isDraggingVideo.current) {
      setVideoOffset(constrainedX);
    }
  };

  const handleMouseUp = () => {
    isDraggingWcl.current = false;
    isDraggingVideo.current = false;
  };

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const wclBarWidth = wclDurationSec * pixelsPerSecond;
  const videoBarWidth = videoDurationSec * pixelsPerSecond;

  // Validate durations before rendering
  if (!isFinite(wclDurationSec) || wclDurationSec <= 0 || !isFinite(videoDurationSec) || videoDurationSec <= 0) {
    return (
      <div className="w-full">
        <h3 className="font-semibold text-gray-100 mb-4">Timeline Sync</h3>
        <p className="text-sm text-gray-400">Loading timeline data...</p>
        <p className="text-xs text-gray-500 mt-2">
          WCL Duration: {wclDuration}ms ({wclDurationSec}s) | Video Duration: {videoDuration}s
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="font-semibold text-gray-100 mb-4">Timeline Sync</h3>
      <p className="text-sm text-gray-400 mb-4">Drag the bars to align the WCL report with the video timeline</p>

      <div ref={containerRef} className="relative" style={{ width: `${containerWidth}px`, height: "120px" }}>
        {/* Time markers */}
        <div className="absolute top-0 left-0 right-0 h-4 flex justify-between text-xs text-gray-500">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <span key={fraction}>{formatTime(maxDuration * fraction)}</span>
          ))}
        </div>

        {/* WCL Bar */}
        <div className="absolute top-6" style={{ left: `${wclOffset}px`, width: `${wclBarWidth}px` }}>
          <div
            className="h-12 bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg shadow-lg cursor-move border-2 border-purple-400 hover:border-purple-300 transition-colors flex items-center justify-center"
            onMouseDown={handleMouseDown("wcl")}
          >
            <span className="text-white text-sm font-semibold">WCL Report ({formatTime(wclDurationSec)})</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 text-center">Start: {formatTime(wclOffset / pixelsPerSecond)}</div>
        </div>

        {/* Video Bar */}
        <div className="absolute top-20" style={{ left: `${videoOffset}px`, width: `${videoBarWidth}px` }}>
          <div
            className="h-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-lg cursor-move border-2 border-blue-400 hover:border-blue-300 transition-colors flex items-center justify-center"
            onMouseDown={handleMouseDown("video")}
          >
            <span className="text-white text-sm font-semibold">Video ({formatTime(videoDurationSec)})</span>
          </div>
          <div className="text-xs text-gray-400 mt-1 text-center">Start: {formatTime(videoOffset / pixelsPerSecond)}</div>
        </div>
      </div>

      {/* Sync info */}
      <div className="mt-6 text-sm text-gray-300">
        <p>
          Sync offset: <span className="font-mono text-blue-400">{((videoOffset - wclOffset) / pixelsPerSecond).toFixed(1)}s</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">Positive offset means video starts after WCL report begins</p>
      </div>
    </div>
  );
}
