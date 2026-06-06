import { motion } from "motion/react";
import { YT_STEPS } from "./ytSteps";

const MotionSpan = motion.span;

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MultiStepLoader({ steps = YT_STEPS, current = 0 }) {
  return (
    <div className="step-loader" role="list" aria-label="Processing steps">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <div className={`step-row step-${state}`} role="listitem" key={label}>
            <div className="step-dot">
              {state === "done" ? (
                <Check />
              ) : state === "active" ? (
                <MotionSpan
                  className="step-pulse"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.9, 0.3, 0.9] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : (
                <span className="step-num">{i + 1}</span>
              )}
            </div>
            <span className="step-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
