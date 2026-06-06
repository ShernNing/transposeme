import confetti from "canvas-confetti";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COLORS = ["#9ae6b4", "#66d9a3", "#90cdf4", "#65b8ff", "#b794f4"];

// Celebratory burst — used on successful transpose / download.
export function fireConfetti() {
  if (prefersReduced()) return;
  const defaults = {
    spread: 70,
    ticks: 200,
    gravity: 0.9,
    colors: COLORS,
    disableForReducedMotion: true,
    zIndex: 2000,
  };
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.3, y: 0.7 } });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.7, y: 0.7 } });
  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 40,
      angle: 90,
      spread: 100,
      origin: { x: 0.5, y: 0.65 },
    });
  }, 150);
}
