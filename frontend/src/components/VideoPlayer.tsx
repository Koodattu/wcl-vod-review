"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import YouTubePlayer, { YouTubePlayerRef } from "./YouTubePlayer";
import TwitchPlayer, { TwitchPlayerRef } from "./TwitchPlayer";

export interface VideoPlayerProps {
  platform: "youtube" | "twitch";
  videoId: string;
  startSeconds?: number;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ platform, videoId, startSeconds = 0, onReady, onTimeUpdate }, ref) => {
  const youtubePlayerRef = useRef<YouTubePlayerRef>(null);
  const twitchPlayerRef = useRef<TwitchPlayerRef>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (platform === "youtube" && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(seconds);
      } else if (platform === "twitch" && twitchPlayerRef.current) {
        twitchPlayerRef.current.seekTo(seconds);
      }
    },
    getCurrentTime: () => {
      if (platform === "youtube" && youtubePlayerRef.current) {
        return youtubePlayerRef.current.getCurrentTime();
      } else if (platform === "twitch" && twitchPlayerRef.current) {
        return twitchPlayerRef.current.getCurrentTime();
      }
      return 0;
    },
  }));

  if (platform === "youtube") {
    return <YouTubePlayer ref={youtubePlayerRef} videoId={videoId} startSeconds={startSeconds} onReady={onReady} onTimeUpdate={onTimeUpdate} />;
  }

  if (platform === "twitch") {
    return <TwitchPlayer ref={twitchPlayerRef} videoId={videoId} startSeconds={startSeconds} onReady={onReady} onTimeUpdate={onTimeUpdate} />;
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <p className="text-white">Unsupported platform: {platform}</p>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
