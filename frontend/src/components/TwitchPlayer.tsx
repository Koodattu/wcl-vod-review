"use client";

import { useEffect, useRef, useState, useId, forwardRef, useImperativeHandle } from "react";
import { loadPlayerScript } from "@/lib/playerScript";

interface TwitchPlayer {
  seek: (timestamp: number) => void;
  getCurrentTime: () => number;
  pause: () => void;
  addEventListener: (event: string, callback: () => void) => void;
  removeEventListener?: (event: string, callback: () => void) => void;
}

declare global {
  interface Window {
    Twitch?: { Player: { new (element: string, options: Record<string, unknown>): TwitchPlayer; READY: string } };
  }
}

export interface TwitchPlayerProps {
  videoId: string;
  startSeconds?: number;
  onReady?: () => void;
  onError?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface TwitchPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

const TwitchPlayer = forwardRef<TwitchPlayerRef, TwitchPlayerProps>(({ videoId, startSeconds = 0, onReady, onError, onTimeUpdate }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<TwitchPlayer | null>(null);
  const playerId = useId();
  const callbacks = useRef({ onReady, onError, onTimeUpdate });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { callbacks.current = { onReady, onError, onTimeUpdate }; }, [onReady, onError, onTimeUpdate]);

  useImperativeHandle(ref, () => ({
    seekTo: seconds => instanceRef.current?.seek(Math.max(0, seconds)),
    getCurrentTime: () => instanceRef.current?.getCurrentTime() ?? 0,
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let failed = false;
    let player: TwitchPlayer | null = null;
    let readyEvent = "ready";
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (disposed) return;
      failed = true;
      instanceRef.current = null;
      clearTimeout(timeout);
      clearInterval(interval);
      setStatus("error");
      callbacks.current.onError?.();
    };
    const ready = () => {
      if (disposed || failed || !player) return;
      clearTimeout(timeout);
      instanceRef.current = player;
      setStatus("ready");
      callbacks.current.onReady?.();
      interval = setInterval(() => callbacks.current.onTimeUpdate?.(player!.getCurrentTime()), 100);
    };
    const initialize = async () => {
      setStatus("loading");
      try {
        await loadPlayerScript("https://player.twitch.tv/js/embed/v1.js", () => !!window.Twitch?.Player);
        if (disposed || !window.Twitch) return;
        readyEvent = window.Twitch.Player.READY;
        player = new window.Twitch.Player(playerId, {
          video: videoId.startsWith("v") ? videoId : "v" + videoId,
          width: "100%", height: "100%", autoplay: false,
          time: Math.floor(startSeconds) + "s", parent: [window.location.hostname],
        });
        timeout = setTimeout(fail, 15_000);
        player.addEventListener(readyEvent, ready);
      } catch { fail(); }
    };
    void initialize();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (instanceRef.current) player?.pause();
      instanceRef.current = null;
      player?.removeEventListener?.(readyEvent, ready);
      // Twitch has no documented destroy method; removing the iframe stops playback.
      host.replaceChildren();
    };
  }, [videoId, startSeconds, playerId, attempt]);

  return <div className="relative h-full min-h-[300px] w-full min-w-[400px]">
    <div id={playerId} ref={hostRef} className="absolute inset-0 h-full w-full" />
    {status !== "ready" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900 p-4 text-center text-sm text-gray-200">
      <p role={status === "error" ? "alert" : "status"}>{status === "error" ? "Could not load the Twitch player. Retry or open the original video." : "Loading Twitch player…"}</p>
      {status === "error" && <button className="button" onClick={() => setAttempt(value => value + 1)}>Retry player</button>}
    </div>}
  </div>;
});

TwitchPlayer.displayName = "TwitchPlayer";
export default TwitchPlayer;
