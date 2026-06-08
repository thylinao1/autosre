"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media-query hook backed by useSyncExternalStore.
 *
 * Used to gate the demo's desktop and mobile layouts so only ONE subtree mounts.
 * The previous CSS `display: none` toggle kept both subtrees in the tree, which
 * double-mounted AuditTrail (and its 5s /api/ledger poller), ProblemCard, and
 * DemoControls. Gating on the matched query mounts exactly one.
 *
 * The server snapshot returns `false` (no match) so SSR is deterministic; the
 * client reconciles on the first effect tick.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia(query).matches;
    },
    () => false
  );
}
