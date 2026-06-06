import { useEffect, useRef } from "react";

// Sparse, slow-drifting glowing motes for depth above the aurora.
// Cheap canvas2d. Pauses with `paused`, respects prefers-reduced-motion.
export default function ParticleField({ paused = false, count = 60 }) {
  const canvasRef = useRef(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // deterministic-ish pseudo-random (no Math.random dependency on first frame)
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const COLORS = ["154,230,180", "144,205,244", "183,148,244"];
    const particles = Array.from({ length: count }, () => ({
      x: rnd() * w,
      y: rnd() * h,
      r: 0.6 + rnd() * 1.8,
      vy: 0.08 + rnd() * 0.25,
      drift: (rnd() - 0.5) * 0.25,
      phase: rnd() * Math.PI * 2,
      tw: 0.6 + rnd() * 1.4,
      c: COLORS[Math.floor(rnd() * COLORS.length)],
    }));

    let raf = 0;
    let frame = 0;
    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!pausedRef.current && !reduce) {
          p.y -= p.vy;
          p.x += p.drift + Math.sin((frame * 0.01) + p.phase) * 0.12;
          if (p.y < -5) {
            p.y = h + 5;
            p.x = rnd() * w;
          }
        }
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.02 * p.tw + p.phase));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c},${(0.5 * tw).toFixed(3)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${p.c},0.6)`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
