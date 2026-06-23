"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768; // px — at/below this we treat the device as "mobile"
const STORAGE_KEY = "pulse_view_mode"; // "mobile" | "desktop" | absent (= auto)

export type ViewMode = "mobile" | "desktop";

/** Tracks whether the viewport is phone-sized. SSR-safe (defaults to false). */
export function useIsNarrow(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return narrow;
}

/**
 * Resolves the effective view mode:
 *  - On wide screens: always "desktop" (the mobile layout is phone-only).
 *  - On narrow screens: "mobile" by default, unless the user has explicitly
 *    chosen "desktop" (persisted in localStorage).
 *
 * Returns the resolved mode, the user's stored override (if any), and a setter
 * that persists the choice.
 */
export function useViewMode(): {
  mode: ViewMode;
  isNarrow: boolean;
  override: ViewMode | null;
  setOverride: (m: ViewMode | null) => void;
} {
  const isNarrow = useIsNarrow();
  const [override, setOverrideState] = useState<ViewMode | null>(null);

  // Hydrate the stored override after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "mobile" || stored === "desktop") setOverrideState(stored);
    } catch {
      /* localStorage unavailable — fall back to auto */
    }
  }, []);

  function setOverride(m: ViewMode | null) {
    setOverrideState(m);
    try {
      if (m) window.localStorage.setItem(STORAGE_KEY, m);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore persistence failure */
    }
  }

  // Wide screens always use the full desktop layout regardless of override.
  const mode: ViewMode = !isNarrow ? "desktop" : override ?? "mobile";

  return { mode, isNarrow, override, setOverride };
}
