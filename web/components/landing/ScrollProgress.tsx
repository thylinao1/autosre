"use client";

import { useEffect, useState } from "react";

/**
 * A thin reading-progress bar pinned to the top of the viewport. Fills as the
 * page scrolls, using a compositor-friendly scaleX transform driven by a
 * rAF-throttled scroll listener.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      setProgress(Math.min(Math.max(p, 0), 1));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          transformOrigin: "left center",
          transform: `scaleX(${progress})`,
          background:
            "linear-gradient(90deg, var(--color-grad-orange), var(--color-grad-pink), var(--color-grad-purple), var(--color-grad-cyan))",
          boxShadow: "0 0 8px var(--color-accent-glow)",
          transition: "transform 0.08s linear",
          opacity: progress > 0.005 ? 1 : 0,
        }}
      />
    </div>
  );
}
