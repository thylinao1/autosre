"use client";

import { useEffect } from "react";

/**
 * Progressive, accessible scroll-reveal.
 *
 * The pre-reveal hidden state lives in CSS behind
 * `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`,
 * so server HTML, no-JS clients, and reduced-motion users all render fully
 * visible. This effect adds `.is-visible` as each `[data-reveal]` element
 * enters the viewport, then unobserves it. A safety timeout reveals anything
 * still hidden, so content can never get stuck invisible.
 */
export function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (els.length === 0) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const revealAll = () => els.forEach((el) => el.classList.add("is-visible"));

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    els.forEach((el) => observer.observe(el));

    // Safety net: never let content stay hidden (no-scroll contexts, crawlers).
    const safety = window.setTimeout(revealAll, 2000);

    return () => {
      observer.disconnect();
      window.clearTimeout(safety);
    };
  }, []);

  return null;
}
