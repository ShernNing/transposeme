import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const MotionH1 = motion.h1;

// Animated gradient title with a sweeping sheen + blur-in entrance.
export function ShinyTitle({ children, className = "" }) {
  const reduce = useReducedMotion();
  return (
    <MotionH1
      className={`app-title shiny-title ${className}`}
      initial={reduce ? false : { opacity: 0, filter: "blur(12px)", y: 14 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionH1>
  );
}

// Typewriter subtitle that types once, with a blinking caret that fades after.
export function Typewriter({ text, className = "", speed = 28, startDelay = 600 }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? text.length : 0);
  const [done, setDone] = useState(reduce);

  useEffect(() => {
    if (reduce) return;
    let i = 0;
    let intervalId = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= text.length) {
          clearInterval(intervalId);
          setTimeout(() => setDone(true), 1400);
        }
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, speed, startDelay, reduce]);

  return (
    <p className={`app-subtitle ${className}`} aria-label={text}>
      <span>{text.slice(0, shown)}</span>
      {!done && <span className="type-caret" aria-hidden="true">|</span>}
    </p>
  );
}
