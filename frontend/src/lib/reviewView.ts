import type { EventFilter } from "./events";

export function readEventView(params: Pick<URLSearchParams, "get">) {
  const type = params.get("eventType");
  const lead = Number(params.get("leadIn"));
  const page = Number(params.get("eventPage"));
  return {
    filter: (type === "Deaths" || type === "Casts" ? type : "all") as EventFilter,
    query: (params.get("q") || "").slice(0, 160),
    leadIn: [3, 5, 10].includes(lead) ? lead : 0,
    page: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0,
  };
}

export function updateReviewView(updates: Record<string, string | null>, push = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href !== window.location.href) window.history[push ? "pushState" : "replaceState"](null, "", url);
}

export function withEventView(path: string) {
  const url = new URL(path, window.location.origin);
  const view = readEventView(new URLSearchParams(window.location.search));
  if (view.filter !== "all") url.searchParams.set("eventType", view.filter);
  if (view.query) url.searchParams.set("q", view.query);
  if (view.leadIn) url.searchParams.set("leadIn", String(view.leadIn));
  if (view.page) url.searchParams.set("eventPage", String(view.page + 1));
  return url.href;
}
