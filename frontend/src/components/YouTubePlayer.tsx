"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

// YouTube Player API types
interface YTPlayer {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  destroy: () => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: {
      Player: new (element: HTMLElement, config: Record<string, unknown>) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
  }
}

export interface YouTubePlayerProps {
  videoId: string;
  startSeconds?: number;
  onReady?: (player: YTPlayer) => void;
  onStateChange?: (event: YTPlayerEvent) => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface YouTubePlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  player: YTPlayer | null;
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(({ videoId, startSeconds = 0, onReady, onStateChange, onTimeUpdate }, ref) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (player) {
        player.seekTo(seconds, true);
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
    // Load YouTube IFrame API
    const loadYouTubeAPI = () => {
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.body.appendChild(script);
      }
    };

    // Initialize player when API is ready
    const initializePlayer = () => {
      if (window.YT && playerRef.current && !player) {
        new window.YT.Player(playerRef.current, {
          height: "100%",
          width: "100%",
          videoId: videoId,
          playerVars: {
            start: startSeconds,
            autoplay: 0,
            controls: 1,
            rel: 0,
            showinfo: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event: YTPlayerEvent) => {
              setIsReady(true);
              setPlayer(event.target);
              onReady?.(event.target);
            },
            onStateChange: (event: YTPlayerEvent) => {
              onStateChange?.(event);
            },
          },
        });
      }
    };

    // Set up the callback for when YouTube API is ready
    window.onYouTubeIframeAPIReady = initializePlayer;

    // Load the API if it's not already loaded
    if (!window.YT) {
      loadYouTubeAPI();
    } else {
      initializePlayer();
    }

    // Cleanup
    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [videoId, startSeconds, onReady, onStateChange, player]);

  return (
    <div className="w-full">
      <div ref={playerRef} className="w-full h-full absolute top-0 left-0" />
      {!isReady && (
        <div className="w-full h-full absolute top-0 left-0 bg-gray-200 flex items-center justify-center rounded-lg">
          <div className="text-gray-500">Loading YouTube player...</div>
        </div>
      )}
    </div>
  );
});

YouTubePlayer.displayName = "YouTubePlayer";

export default YouTubePlayer;
