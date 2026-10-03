"use client";

import Link from "next/link";
import { useState } from "react";
import { formatTime } from "./EventList";
import { useReviewLibrary } from "@/lib/useReviewLibrary";
import { removeReview, restoreReview, reviewKey, reviewPath, type SavedReview } from "@/lib/reviews";

export default function SavedReviews() {
  const { reviews, error: loadError } = useReviewLibrary();
  const [removed, setRemoved] = useState<SavedReview | null>(null);
  const [error, setError] = useState("");

  return <section aria-label="Saved reviews" className="mt-10 border-t border-[#35354a] pt-6">
    <h2 className="text-xl font-semibold">Saved reviews <span className="text-sm font-normal text-gray-400">{reviews.length > 0 && `(${reviews.length})`}</span></h2>
    <p className="mt-2 text-sm leading-relaxed text-gray-400">Reviews and notes stay in this browser. Save a review while watching to pick up where you left off.</p>
    {loadError && <p className="notice mt-4 text-sm text-amber-200">{loadError}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    {removed && <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <p role="status">Review{removed.notes.length ? ` and ${removed.notes.length} notes` : ""} removed.</p>
      <button className="button" onClick={() => {
        try { restoreReview(removed); setRemoved(null); setError(""); } catch (error) { setError((error as Error).message); }
      }}>Undo removal</button>
    </div>}
    {!reviews.length && !loadError ? <p className="py-5 text-gray-300">No saved reviews yet.</p> : <ul className="mt-4 divide-y divide-[#35354a]">
      {reviews.map(review => <li key={reviewKey(review)} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-4">
        <Link href={reviewPath(review)} className="min-w-0 basis-64 flex-1 rounded py-2 hover:text-blue-200">
          <span className="block break-words font-medium">{review.title}</span>
          <span className="mt-1 block break-words text-sm leading-relaxed text-gray-400">
            {review.platform === "youtube" ? "YouTube" : "Twitch"} · {review.fightName || "No fight selected"} · Video {formatTime(review.startSeconds)} · {review.notes.length} {review.notes.length === 1 ? "note" : "notes"}
          </span>
        </Link>
        <button className="button" aria-label={"Remove saved review" + (review.notes.length ? " and its notes" : "") + ": " + review.title} onClick={() => {
          try { setRemoved(removeReview(reviewKey(review)) ?? null); setError(""); } catch (error) { setError((error as Error).message); }
        }}>Remove{review.notes.length ? " with notes" : ""}</button>
      </li>)}
    </ul>}
  </section>;
}
