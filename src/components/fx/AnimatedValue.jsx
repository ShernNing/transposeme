import { AnimatePresence, motion } from "motion/react";

const MotionSpan = motion.span;

// Flip/slide-in animation when a text value changes (e.g. detected key).
export default function AnimatedValue({ value, className = "" }) {
  return (
    <span className={`anim-value ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <MotionSpan
          key={String(value)}
          initial={{ y: 9, opacity: 0, filter: "blur(5px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -9, opacity: 0, filter: "blur(5px)" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "inline-block" }}
        >
          {value}
        </MotionSpan>
      </AnimatePresence>
    </span>
  );
}
