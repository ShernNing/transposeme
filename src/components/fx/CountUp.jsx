import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// Smoothly tweens a number when `value` changes. Supports signed integers
// (e.g. semitones). `format` lets the caller style the output string.
export default function CountUp({
  value,
  duration = 0.5,
  format = (v) => `${Math.round(v)}`,
  className = "",
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const startTime = performance.now();
    const dur = duration * 1000;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}
