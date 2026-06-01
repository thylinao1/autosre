"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /** e.g. "30+", "3 AM", "~70%". The first integer is animated; surrounding text is preserved. */
  value: string;
  durationMs?: number;
}

function parse(value: string): { prefix: string; target: number; suffix: string } | null {
  const m = value.match(/^(\D*)(\d+)(.*)$/);
  if (!m) return null;
  return { prefix: m[1], target: parseInt(m[2], 10), suffix: m[3] };
}

/**
 * Counts the number in `value` up from zero when it first scrolls into view,
 * keeping any prefix/suffix (so "~70%" animates the 70). Reduced motion and
 * non-numeric values render the final string immediately.
 */
export function CountUp({ value, durationMs = 1200 }: CountUpProps) {
  const parsed = parse(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!parsed) {
      setDone(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      setN(parsed.target);
      setDone(true);
      return;
    }

    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started) {
            started = true;
            io.unobserve(e.target);
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min((now - start) / durationMs, 1);
              const eased = 1 - Math.pow(1 - t, 5); // ease-out-quint
              setN(Math.round(eased * parsed.target));
              if (t < 1) raf = requestAnimationFrame(tick);
              else setDone(true);
            };
            raf = requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  if (!parsed) return <span ref={ref}>{value}</span>;
  return (
    <span ref={ref}>
      {parsed.prefix}
      {done ? parsed.target : n}
      {parsed.suffix}
    </span>
  );
}
