"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { loadPlayerScript } from "@/lib/playerScript";

interface YTPlayer {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, config: Record<string, unknown>) => YTPlayer };
  }
}

export interface YouTubePlayerProps {
  videoId: string;
  startSeconds?: number;
  onReady?: () => void;
  onError?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface YouTubePlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(({ videoId, startSeconds = 0, onReady, onError, onTimeUpdate }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<YTPlayer | null>(null);
  const callbacks = useRef({ onReady, onError, onTimeUpdate });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { callbacks.current = { onReady, onError, onTimeUpdate }; }, [onReady, onError, onTimeUpdate]);

  useImperativeHandle(ref, () => ({
    seekTo: seconds => instanceRef.current?.seekTo(Math.max(0, seconds), true),
    getCurrentTime: () => instanceRef.current?.getCurrentTime() ?? 0,
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let failed = false;
    let player: YTPlayer | null = null;
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (disposed) return;
      failed = true;
      clearTimeout(timeout);
      clearInterval(interval);
      instanceRef.current = null;
      setStatus("error");
      callbacks.current.onError?.();
    };
    const initialize = async () => {
      setStatus("loading");
      try {
        await loadPlayerScript("https://www.youtube.com/iframe_api", () => !!window.YT?.Player);
        if (disposed || !window.YT) return;
        // The SDK replaces this child, leaving React's host element intact.
        const mount = document.createElement("div");
        host.replaceChildren(mount);
        timeout = setTimeout(fail, 15_000);
        player = new window.YT.Player(mount, {
          height: "100%", width: "100%", videoId,
          playerVars: { start: startSeconds, autoplay: 0, controls: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: (event: { target: YTPlayer }) => {
              if (disposed || failed) return;
              clearTimeout(timeout);
              instanceRef.current = event.target;
              setStatus("ready");
              callbacks.current.onReady?.();
              interval = setInterval(() => callbacks.current.onTimeUpdate?.(event.target.getCurrentTime()), 100);
            },
            onError: fail,
          },
        });
      } catch { fail(); }
    };
    void initialize();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(interval);
      instanceRef.current = null;
      player?.destroy();
      host.replaceChildren();
    };
  }, [videoId, startSeconds, attempt]);

  return <div className="relative h-full w-full">
    <div ref={hostRef} className="absolute inset-0 h-full w-full" />
    {status !== "ready" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900 p-4 text-center text-sm text-gray-200">
      <p role={status === "error" ? "alert" : "status"}>{status === "error" ? "Could not load the YouTube player. Retry or open the original video." : "Loading YouTube player…"}</p>
      {status === "error" && <button className="button" onClick={() => setAttempt(value => value + 1)}>Retry player</button>}
    </div>}
  </div>;
});

YouTubePlayer.displayName = "YouTubePlayer";
export default YouTubePlayer;
