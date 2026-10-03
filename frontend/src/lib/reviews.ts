export interface ReviewMoment {
  fightId: number | null;
  startSeconds: number;
  syncOffset: number;
}

export interface ReviewSnapshot extends ReviewMoment {
  wclCode: string;
  platform: "youtube" | "twitch";
  vodId: string;
  title: string;
  fightName: string | null;
}

export interface ReviewNote extends ReviewMoment {
  id: string;
  text: string;
  createdAt: number;
  fightName: string | null;
}

export interface SavedReview extends ReviewSnapshot {
  updatedAt: number;
  notes: ReviewNote[];
}

export const REVIEW_STORAGE_KEY = "wcl-vod-review:reviews:v1";
export const MAX_REVIEWS = 20;
export const MAX_NOTES = 100;
export const MAX_NOTE_LENGTH = 2000;
const CHANGE_EVENT = "wcl-reviews-changed";
const UNAVAILABLE = "storage-unavailable";

export function isReviewIdentity(code: unknown, platform: unknown, id: unknown): boolean {
  return typeof code === "string" && /^[A-Za-z0-9]{1,100}$/.test(code) && typeof id === "string" &&
    (platform === "youtube" ? /^[A-Za-z0-9_-]{11}$/.test(id) : platform === "twitch" && /^\d{1,30}$/.test(id));
}

export function isReviewTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMoment(value: Record<string, unknown>): boolean {
  return (value.fightId === null || (Number.isSafeInteger(value.fightId) && Number(value.fightId) > 0)) &&
    isReviewTime(value.startSeconds) && value.startSeconds >= 0 && isReviewTime(value.syncOffset) &&
    (value.fightName === null || (typeof value.fightName === "string" && value.fightName.length <= 500));
}

function isNote(value: unknown): value is ReviewNote {
  return isRecord(value) && isMoment(value) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 100 &&
    typeof value.text === "string" && value.text.trim().length > 0 && value.text.length <= MAX_NOTE_LENGTH &&
    typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0;
}

function isSavedReview(value: unknown): value is SavedReview {
  return isRecord(value) && isReviewIdentity(value.wclCode, value.platform, value.vodId) && isMoment(value) &&
    typeof value.title === "string" && value.title.length <= 500 && Number.isSafeInteger(value.updatedAt) && Number(value.updatedAt) >= 0 &&
    Array.isArray(value.notes) && value.notes.length <= MAX_NOTES && value.notes.every(isNote) &&
    new Set(value.notes.map(note => note.id)).size === value.notes.length;
}

export function reviewKey(review: Pick<ReviewSnapshot, "wclCode" | "platform" | "vodId">): string {
  return [review.wclCode, review.platform, review.vodId].join(":");
}

export function reviewPath(review: Pick<ReviewSnapshot, "wclCode" | "platform" | "vodId"> & ReviewMoment): string {
  const params = new URLSearchParams({ wclCode: review.wclCode, vodPlatform: review.platform, vodId: review.vodId });
  if (review.fightId !== null) params.set("fightId", String(review.fightId));
  params.set("startSeconds", String(Math.round(review.startSeconds * 1000) / 1000));
  params.set("syncOffset", String(Math.round(review.syncOffset * 1000) / 1000));
  return "/timeline?" + params.toString();
}

export function getLibrarySnapshot(): string {
  try { return window.localStorage.getItem(REVIEW_STORAGE_KEY) || ""; } catch { return UNAVAILABLE; }
}

export function readLibrary(raw: string): { reviews: SavedReview[]; error: string } {
  if (!raw) return { reviews: [], error: "" };
  if (raw === UNAVAILABLE) return { reviews: [], error: "Saved reviews and notes cannot be loaded because browser storage is unavailable." };
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.reviews) ||
      data.reviews.length > MAX_REVIEWS || !data.reviews.every(isSavedReview) ||
      new Set(data.reviews.map(reviewKey)).size !== data.reviews.length) throw new Error("Invalid library");
    return { reviews: data.reviews.sort((a, b) => b.updatedAt - a.updatedAt), error: "" };
  } catch {
    return { reviews: [], error: "Saved reviews could not be read. Existing browser data has been left unchanged." };
  }
}

export function subscribeToLibrary(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === REVIEW_STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function changeLibrary(change: (reviews: SavedReview[]) => SavedReview[]): void {
  const library = readLibrary(getLibrarySnapshot());
  if (library.error) throw new Error("Changes could not be saved. " + library.error);
  const reviews = change(library.reviews);
  if (reviews.length > MAX_REVIEWS) throw new Error("Changes could not be saved. You have 20 saved reviews. Remove one from the start page to make room.");
  const raw = JSON.stringify({ version: 1, reviews });
  if (readLibrary(raw).error) throw new Error("Changes could not be saved. The review contains invalid data.");
  try { window.localStorage.setItem(REVIEW_STORAGE_KEY, raw); } catch {
    throw new Error("Changes could not be saved. Browser storage is unavailable or full. Keep your draft and try again.");
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveReview(snapshot: ReviewSnapshot, changeNotes?: (notes: ReviewNote[]) => ReviewNote[]): void {
  changeLibrary(reviews => {
    const existing = reviews.find(review => reviewKey(review) === reviewKey(snapshot));
    const notes = changeNotes ? changeNotes(existing?.notes ?? []) : existing?.notes ?? [];
    if (notes.length > MAX_NOTES) throw new Error("This review has 100 notes. Export your notes and remove one before adding another.");
    return [{ ...snapshot, title: snapshot.title.slice(0, 500), updatedAt: Date.now(), notes },
      ...reviews.filter(review => reviewKey(review) !== reviewKey(snapshot))];
  });
}

export function removeReview(key: string): SavedReview | undefined {
  let removed: SavedReview | undefined;
  changeLibrary(reviews => {
    removed = reviews.find(review => reviewKey(review) === key);
    return reviews.filter(review => reviewKey(review) !== key);
  });
  return removed;
}

export function restoreReview(review: SavedReview): void {
  changeLibrary(reviews => {
    if (reviews.some(item => reviewKey(item) === reviewKey(review))) throw new Error("This review has already been saved again. Its newer notes were kept.");
    return [review, ...reviews];
  });
}

function plainMarkdown(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_{}[\]()#+!|~-]/g, "\\$&");
}

export function exportReviewNotes(review: SavedReview, origin: string): string {
  const lines = ["# " + plainMarkdown(review.title.replace(/[\r\n]/g, " ")), "", "Warcraft Logs: https://www.warcraftlogs.com/reports/" + review.wclCode,
    "", "Video: " + (review.platform === "youtube" ? "https://www.youtube.com/watch?v=" : "https://www.twitch.tv/videos/") + review.vodId,
    "", "Each review link includes its captured video position and calibration. Notes are included only in this export.", ""];
  for (const note of [...review.notes].sort((a, b) => a.startSeconds - b.startSeconds || a.createdAt - b.createdAt)) {
    lines.push("## " + plainMarkdown(note.fightName || "Between fights") + " · video " + note.startSeconds.toFixed(1) + "s", "",
      ...note.text.split(/\r?\n/).map(line => "> " + plainMarkdown(line)), "",
      "[Open this moment](" + origin + reviewPath({ ...review, ...note }) + ")", "");
  }
  return lines.join("\n");
}
