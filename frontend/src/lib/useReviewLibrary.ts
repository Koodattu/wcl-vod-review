"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getLibrarySnapshot, readLibrary, subscribeToLibrary } from "./reviews";

const serverSnapshot = () => "";

export function useReviewLibrary() {
  const raw = useSyncExternalStore(subscribeToLibrary, getLibrarySnapshot, serverSnapshot);
  return useMemo(() => readLibrary(raw), [raw]);
}
