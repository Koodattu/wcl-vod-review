"use client";

import { useState } from "react";
import { reviewPath, saveReview, type ReviewSnapshot } from "@/lib/reviews";
import { withEventView } from "@/lib/reviewView";

export default function ReviewActions({ captureReview, playerReady, hasFights }: {
  captureReview: () => ReviewSnapshot; playerReady: boolean; hasFights: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fallbackLink, setFallbackLink] = useState("");
  const copyMoment = async () => {
    const link = withEventView(reviewPath(captureReview()));
    setError("");
    try {
      await navigator.clipboard.writeText(link);
      setFallbackLink(""); setMessage("Moment link copied. It includes the fight, video position, calibration and event filters.");
    } catch {
      setFallbackLink(link); setMessage("Clipboard unavailable. Select and copy the moment link below.");
    }
  };

  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap gap-2">
      <button className="button" disabled={!playerReady} onClick={() => {
        try { saveReview(captureReview()); setError(""); setMessage("Review saved in this browser."); }
        catch (error) { setError((error as Error).message); setMessage(""); }
      }}>Save review</button>
      <button className="button" disabled={!playerReady} onClick={() => void copyMoment()}>Copy moment link</button>
      {hasFights && <a className="text-link px-2" href="#review-timeline">Adjust sync</a>}
      {hasFights && <a className="text-link px-2" href="#review-events">Find events</a>}
      <a className="text-link px-2" href="#review-notes">Review notes</a>
    </div>
    <p role="status" className="text-sm leading-relaxed text-blue-200">{message}</p>
    {error && <p role="alert" className="text-sm leading-relaxed text-red-200">{error}</p>}
    {fallbackLink && <div className="space-y-2">
      <label htmlFor="moment-link" className="text-sm font-medium">Moment link</label>
      <input id="moment-link" className="field" readOnly value={fallbackLink} onFocus={event => event.currentTarget.select()} />
      <p className="text-sm text-gray-400">Anyone with this link needs access to the original report and video. Your notes are not included.</p>
    </div>}
  </div>;
}
