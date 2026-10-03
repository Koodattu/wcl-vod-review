"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SavedReviews from "@/components/SavedReviews";
import { parseURLs } from "@/lib/api";

export default function Home() {
  const [wclUrl, setWclUrl] = useState("");
  const [vodUrl, setVodUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setLoading(true);
    try {
      const data = await parseURLs(wclUrl, vodUrl);
      const params = new URLSearchParams({
        wclCode: data.wcl.code, vodPlatform: data.vod.platform, vodId: data.vod.id,
        ...(data.wcl.fightId !== undefined && { fightId: String(data.wcl.fightId) }),
        ...(data.vod.startSeconds && { startSeconds: String(data.vod.startSeconds) }),
      });
      router.push("/timeline?" + params.toString());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open this review. Please retry.");
      requestAnimationFrame(() => errorRef.current?.focus());
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-2xl">
        <header className="mb-8 space-y-3">
          <h1 className="text-3xl font-semibold sm:text-4xl">WoW Logs + VOD Sync</h1>
          <p className="max-w-prose text-gray-300">Review raid casts and deaths alongside the exact moment in your recording.</p>
        </header>
        <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-6 rounded-xl border border-[#35354a] bg-[#181824] p-5 sm:p-8">
          <div className="space-y-2">
            <label htmlFor="wclUrl" className="block text-sm font-medium">Warcraft Logs report URL</label>
            <input id="wclUrl" name="wclUrl" type="url" className="field" value={wclUrl}
              onChange={event => setWclUrl(event.target.value)} disabled={loading}
              placeholder="https://www.warcraftlogs.com/reports/…" aria-describedby="wcl-help"
              spellCheck={false} autoCapitalize="none" required />
            <p id="wcl-help" className="text-sm text-gray-400">A report link can include a fight to open directly.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="vodUrl" className="block text-sm font-medium">YouTube video or Twitch VOD URL</label>
            <input id="vodUrl" name="vodUrl" type="url" className="field" value={vodUrl}
              onChange={event => setVodUrl(event.target.value)} disabled={loading}
              placeholder="Paste your video link" aria-describedby="vod-help"
              spellCheck={false} autoCapitalize="none" required />
            <p id="vod-help" className="text-sm text-gray-400">Use the recording of the same raid. Video timestamps in the link are kept.</p>
          </div>
          {error && <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-red-900 bg-[#2a1313] p-4 text-sm text-red-200">{error}</div>}
          <button type="submit" disabled={loading} className="button button-primary w-full">{loading ? "Opening review…" : "Create timeline"}</button>
        </form>
        <p className="mt-5 text-sm text-gray-400">Select a fight, align the video, then jump straight to an event. Calibration is saved in this browser.</p>
        <SavedReviews />
      </div>
    </main>
  );
}
