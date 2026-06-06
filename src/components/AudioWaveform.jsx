import { useEffect, useRef } from "react";

// One AnalyserNode graph per <audio> element (createMediaElementSource can only
// be called once per element). Cached so re-renders / src swaps reuse it.
const graphCache = new WeakMap();

function getGraph(el) {
  let g = graphCache.get(el);
  if (g) return g;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    g = { ctx, source, analyser };
    graphCache.set(el, g);
    return g;
  } catch {
    return null;
  }
}

export default function AudioWaveform({ audioRef, playing, height = 56 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = audioRef?.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const graph = getGraph(el);
    const ctx2d = canvas.getContext("2d");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = height * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let bins = null;
    if (graph) bins = new Uint8Array(graph.analyser.frequencyBinCount);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = height;
      ctx2d.clearRect(0, 0, w, h);

      let data = bins;
      if (graph && playing) {
        graph.analyser.getByteFrequencyData(bins);
      } else if (bins) {
        // idle: gently decay toward zero for a calm resting state
        for (let i = 0; i < bins.length; i++) bins[i] *= 0.9;
      }

      const n = data ? data.length : 32;
      const gap = 2;
      const barW = Math.max(2, (w - gap * (n - 1)) / n);
      const grad = ctx2d.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "#3a9d77");
      grad.addColorStop(0.5, "#66d9a3");
      grad.addColorStop(1, "#90cdf4");
      ctx2d.fillStyle = grad;

      for (let i = 0; i < n; i++) {
        const v = data ? data[i] / 255 : 0;
        const barH = Math.max(2, v * h);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        const r = Math.min(barW / 2, 3);
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, barW, barH, r);
        ctx2d.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    if (!reduce) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      draw(); // single static frame
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [audioRef, playing, height]);

  // Resume the AudioContext on play (browsers start it suspended).
  useEffect(() => {
    const el = audioRef?.current;
    if (!el || !playing) return;
    const g = graphCache.get(el);
    if (g && g.ctx.state === "suspended") g.ctx.resume().catch(() => {});
  }, [audioRef, playing]);

  return (
    <canvas
      ref={canvasRef}
      className="audio-waveform"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    />
  );
}
