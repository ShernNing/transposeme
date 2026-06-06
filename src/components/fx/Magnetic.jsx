import { useRef } from "react";
import { motion, useReducedMotion, useMotionValue, useSpring } from "motion/react";

const MotionSpan = motion.span;

// Aceternity-style magnetic wrapper: children gently pull toward the cursor.
export default function Magnetic({ children, strength = 0.4, className = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 250, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 250, damping: 18, mass: 0.4 });

  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <MotionSpan
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x, y, display: "inline-flex" }}
      className={className}
    >
      {children}
    </MotionSpan>
  );
}
