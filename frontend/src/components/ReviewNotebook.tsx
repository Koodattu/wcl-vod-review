"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Fight } from "@/lib/api";
import { useReviewLibrary } from "@/lib/useReviewLibrary";
import { exportReviewNotes, MAX_NOTE_LENGTH, reviewKey, reviewPath, saveReview, type ReviewMoment, type ReviewNote, type ReviewSnapshot } from "@/lib/reviews";
import { formatTime } from "./EventList";

export default function ReviewNotebook({ identity, fights, captureReview, playerReady, onOpenMoment, onDraftChange }: {
  identity: Pick<ReviewSnapshot, "wclCode" | "platform" | "vodId">;
  fights: Fight[];
  captureReview: () => ReviewSnapshot;
  playerReady: boolean;
  onOpenMoment: (moment: ReviewMoment) => void;
  onDraftChange: (hasDraft: boolean) => void;
}) {
  const { reviews, error: loadError } = useReviewLibrary();
  const saved = reviews.find(review => reviewKey(review) === reviewKey(identity));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ note: ReviewNote; snapshot: ReviewSnapshot; editing: boolean } | null>(null);
  const [removed, setRemoved] = useState<ReviewNote | null>(null);
  const formRef = useRef<HTMLTextAreaElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const hasDraft = !!draft?.note.text.trim();

  useEffect(() => {
    onDraftChange(hasDraft);
    if (!hasDraft) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasDraft, onDraftChange]);

  const focusDraft = () => requestAnimationFrame(() => { formRef.current?.focus(); formRef.current?.scrollIntoView({ block: "nearest" }); });
  const closeDraft = () => { setDraft(null); requestAnimationFrame(() => addButtonRef.current?.focus()); };
  const perform = (action: () => void, success: string) => {
    try { action(); setError(""); setMessage(success); } catch (error) { setError((error as Error).message); setMessage(""); }
  };

  const addNote = () => {
    const snapshot = captureReview();
    const reportTime = (snapshot.startSeconds + snapshot.syncOffset) * 1000;
    const fight = fights.find(fight => fight.startTime <= reportTime && reportTime < fight.endTime);
    setDraft({ snapshot, editing: false, note: {
      id: Date.now().toString(36) + "-" + crypto.getRandomValues(new Uint32Array(2)).join("-"), text: "", createdAt: Date.now(),
      startSeconds: snapshot.startSeconds, syncOffset: snapshot.syncOffset,
      fightId: fight?.id ?? null, fightName: fight ? `Fight ${fight.id} · ${fight.name}`.slice(0, 500) : null,
    } });
    setError(""); setMessage(""); focusDraft();
  };

  return <section id="review-notes" tabIndex={-1} aria-label="Review notes" className="review-notes space-y-3">
    <p role="status" className="text-sm leading-relaxed text-blue-200">{message}</p>
    {error && <p role="alert" className="mt-3 text-sm leading-relaxed text-red-200">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Review notes <span className="text-sm font-normal text-gray-400">({saved?.notes.length ?? 0})</span></h2>
        <div className="flex flex-wrap gap-2">
          <button ref={addButtonRef} className="button" disabled={!playerReady || !!draft} onClick={addNote}>Add note at current time</button>
          {!!saved?.notes.length && <button className="button" onClick={() => {
            const blob = new Blob([exportReviewNotes(saved, window.location.origin)], { type: "text/markdown;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a"); link.href = url; link.download = "review-" + saved.wclCode + "-notes.md";
            link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage("Notes exported with links to their captured moments.");
          }}>Export notes</button>}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-gray-400">Capture an observation for your next pull. Notes also save this review in your browser; export them for your raid debrief.</p>
      {loadError && <p className="text-sm text-amber-200">{loadError}</p>}
      {draft && <form className="space-y-3 rounded-lg border border-[#45455e] bg-[#181824] p-4" onSubmit={event => {
        event.preventDefault();
        const note = { ...draft.note, text: draft.note.text.trim() };
        if (!note.text) { formRef.current?.focus(); return; }
        perform(() => {
          saveReview(draft.snapshot, notes => {
            if (draft.editing && !notes.some(item => item.id === note.id)) throw new Error("This note was removed in another tab. Your draft is still here; copy it before closing.");
            return draft.editing ? notes.map(item => item.id === note.id ? note : item) : [...notes, note];
          });
          closeDraft();
        }, "Note saved in this browser.");
      }}>
        <div>
          <label htmlFor="review-note" className="block font-medium">Review note</label>
          <p id="note-context" className="mt-1 break-words text-sm text-gray-400">Video {formatTime(draft.note.startSeconds)} · {draft.note.fightName || "Between fights"}. This timestamp stays fixed while you write.</p>
        </div>
        <textarea ref={formRef} id="review-note" className="field min-h-24 resize-y" rows={3} maxLength={MAX_NOTE_LENGTH} required
          aria-describedby="note-context" value={draft.note.text} onChange={event => setDraft({ ...draft, note: { ...draft.note, text: event.target.value } })} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="button button-primary" type="submit" disabled={!draft.note.text.trim()}>Save note</button>
          <button className="button" type="button" onClick={() => { closeDraft(); setError(""); }}>Cancel</button>
          <span className="ml-auto text-sm tabular-nums text-gray-400">{draft.note.text.length}/{MAX_NOTE_LENGTH}</span>
        </div>
      </form>}
      {removed && <div className="flex flex-wrap items-center gap-3 text-sm">
        <p role="status">Note deleted.</p>
        <button className="button" onClick={() => perform(() => {
          saveReview(captureReview(), notes => notes.some(note => note.id === removed.id) ? notes : [...notes, removed]); setRemoved(null);
        }, "Note restored.")}>Undo delete</button>
      </div>}
      {!saved?.notes.length && !draft ? <p className="py-2 text-sm text-gray-300">No notes yet. Seek to an event, then add a note.</p> : !!saved?.notes.length &&
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[#35354a]" tabIndex={0} aria-label="Saved notes">
          <ol className="divide-y divide-[#35354a]">
            {[...saved.notes].sort((a, b) => a.startSeconds - b.startSeconds || a.createdAt - b.createdAt).map(note => <li key={note.id} className="px-4 py-3">
              <Link href={reviewPath({ ...saved, ...note })} className="text-link max-w-full gap-2" title="Open this note’s captured video position and calibration"
                onClick={event => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (hasDraft) { event.preventDefault(); setMessage("Save or cancel your draft before opening another note."); focusDraft(); }
                  else if (playerReady) { event.preventDefault(); onOpenMoment(note); }
                }}>
                <span className="shrink-0 font-mono tabular-nums">{formatTime(note.startSeconds)}</span>
                <span className="min-w-0 break-words">{note.fightName || "Between fights"}</span>
              </Link>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{note.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="button" disabled={!!draft} onClick={() => { setDraft({ note, snapshot: captureReview(), editing: true }); setError(""); focusDraft(); }}>Edit note</button>
                <button className="button" disabled={!!draft} onClick={() => perform(() => {
                  saveReview(captureReview(), notes => notes.filter(item => item.id !== note.id)); setRemoved(note);
                }, "")}>Delete note</button>
              </div>
            </li>)}
          </ol>
        </div>}
  </section>;
}
