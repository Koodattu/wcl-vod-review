"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

// Twitch Player API types
interface TwitchPlayer {
  seek: (timestamp: number) => void;
  getCurrentTime: () => number;
  pause: () => void;
  play: () => void;
  destroy: () => void;
  addEventListener: (event: string, callback: (data?: unknown) => void) => void;
  removeEventListener: (event: string, callback: (data?: unknown) => void) => void;
}

declare global {
  interface Window {
    Twitch: {
      Player: new (element: string, options: Record<string, unknown>) => TwitchPlayer;
    };
  }
}

export interface TwitchPlayerProps {
  videoId: string;
  startSeconds?: number;
  onReady?: (player: TwitchPlayer) => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface TwitchPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  player: TwitchPlayer | null;
}

const TwitchPlayer = forwardRef<TwitchPlayerRef, TwitchPlayerProps>(({ videoId, startSeconds = 0, onReady, onTimeUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<TwitchPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playerIdRef = useRef<string>(`twitch-player-${Math.random().toString(36).substr(2, 9)}`);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (player) {
        player.seek(seconds);
      }
    },
    getCurrentTime: () => {
      return player ? player.getCurrentTime() : 0;
    },
    player,
  }));

  useEffect(() => {
    // Set up time update interval
    if (player && onTimeUpdate) {
      timeUpdateIntervalRef.current = setInterval(() => {
        const currentTime = player.getCurrentTime();
        onTimeUpdate(currentTime);
      }, 100); // Update every 100ms
    }

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, [player, onTimeUpdate]);

  useEffect(() => {
    // Load Twitch Embed API
    const loadTwitchAPI = () => {
      if (!document.querySelector('script[src="https://player.twitch.tv/js/embed/v1.js"]')) {
        const script = document.createElement("script");
        script.src = "https://player.twitch.tv/js/embed/v1.js";
        script.async = true;
        document.body.appendChild(script);
        script.onload = initializePlayer;
      } else if (window.Twitch) {
        initializePlayer();
      }
    };

    // Initialize player when API is ready
    const initializePlayer = () => {
      if (window.Twitch && containerRef.current && !player) {
        const newPlayer = new window.Twitch.Player(playerIdRef.current, {
          video: videoId,
          width: "100%",
          height: "100%",
          autoplay: false,
          time: `${Math.floor(startSeconds)}s`,
        });

        // Wait for player to be ready
        newPlayer.addEventListener("ready", () => {
          setIsReady(true);
          setPlayer(newPlayer);
          onReady?.(newPlayer);
        });

        newPlayer.addEventListener("pause", () => {
          // Handle pause if needed
        });

        newPlayer.addEventListener("play", () => {
          // Handle play if needed
        });
      }
    };

    loadTwitchAPI();

    // Cleanup
    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [videoId, startSeconds, onReady, player]);

  return (
    <div className="w-full h-full relative">
      <div id={playerIdRef.current} ref={containerRef} className="w-full h-full absolute top-0 left-0" />
      {!isReady && (
        <div className="w-full h-full absolute top-0 left-0 bg-gray-200 flex items-center justify-center rounded-lg">
          <div className="text-gray-500">Loading Twitch player...</div>
        </div>
      )}
    </div>
  );
});

TwitchPlayer.displayName = "TwitchPlayer";

export default TwitchPlayer;
