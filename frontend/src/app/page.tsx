"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseURLs } from "@/lib/api";

export default function Home() {
  const [wclUrl, setWclUrl] = useState("");
  const [vodUrl, setVodUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await parseURLs(wclUrl, vodUrl);

      // Navigate to timeline view with parsed data
      const params = new URLSearchParams({
        wclCode: data.wcl.code,
        vodPlatform: data.vod.platform,
        vodId: data.vod.id,
        ...(data.wcl.fightId !== undefined && { fightId: data.wcl.fightId.toString() }),
        ...(data.vod.startSeconds && { startSeconds: data.vod.startSeconds.toString() }),
      });

      router.push(`/timeline?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#101014] flex items-center justify-center">
      <div className="container mx-auto px-6 py-12 max-w-3xl flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">WoW Logs + VOD Sync</h1>
          <p className="text-lg text-gray-300">Sync Warcraft Logs events with your YouTube or Twitch VOD</p>
        </div>

        <div className="rounded-2xl p-[2.5px] bg-gradient-to-br from-blue-900/80 via-[#232336] to-purple-900/60 shadow-2xl w-full">
          <div className="bg-[#181824] rounded-2xl p-10 border border-[#35354a] shadow-xl w-full">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <label htmlFor="wclUrl" className="block text-sm font-medium text-gray-200 mb-2">
                  Warcraft Logs URL
                </label>
                <input
                  id="wclUrl"
                  type="url"
                  value={wclUrl}
                  onChange={(e) => setWclUrl(e.target.value)}
                  placeholder="https://www.warcraftlogs.com/reports/..."
                  className="w-full px-3 py-2 border border-[#35354a] bg-[#232336] text-white rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#101014] placeholder-gray-400 transition-all duration-150 focus:border-blue-500/80 hover:border-blue-500/60"
                  required
                />
                <p className="text-sm text-gray-400 mt-1">Example: https://www.warcraftlogs.com/reports/8kYwQn2ZxjL6pR7v</p>
              </div>

              <div>
                <label htmlFor="vodUrl" className="block text-sm font-medium text-gray-200 mb-2">
                  VOD URL (YouTube or Twitch)
                </label>
                <input
                  id="vodUrl"
                  type="url"
                  value={vodUrl}
                  onChange={(e) => setVodUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://twitch.tv/videos/..."
                  className="w-full px-3 py-2 border border-[#35354a] bg-[#232336] text-white rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#101014] placeholder-gray-400 transition-all duration-150 focus:border-blue-500/80 hover:border-blue-500/60"
                  required
                />
                <p className="text-sm text-gray-400 mt-1">Paste a YouTube video or Twitch VOD URL.</p>
              </div>

              {error && <div className="bg-[#2a1313] border border-red-700 text-red-300 px-4 py-3 rounded-lg shadow">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md"
              >
                {loading ? "Processing..." : "Create Timeline"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
