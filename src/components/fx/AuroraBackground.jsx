import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

// Lightweight flowing-aurora WebGL background (single fullscreen triangle).
// Pauses its render loop when `paused` is true (e.g. during heavy audio work)
// and respects prefers-reduced-motion.
const VERT = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uBase;
uniform float uIntensity;

vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x - floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v += a*snoise(p); p*=2.0; a*=0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv;
  p.x *= uResolution.x / uResolution.y;
  float t = uTime * 0.07;

  // iq-style domain warping → silky, flowing aurora curtains
  vec2 q = vec2(fbm(p * 1.2 + vec2(0.0, t)),
                fbm(p * 1.2 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.2 + 1.7 * q + vec2(1.7 - t * 0.4, 9.2)),
                fbm(p * 1.2 + 1.7 * q + vec2(8.3, 2.8 + t * 0.5)));
  float n = fbm(p * 1.2 + 1.6 * r);
  float f = clamp(n * 0.5 + 0.5, 0.0, 1.0);

  vec3 col = mix(uColorA, uColorB, smoothstep(0.1, 0.85, f));
  col = mix(col, uColorC, clamp(length(r) * 0.6, 0.0, 1.0));
  col += vec3(0.05, 0.08, 0.10) * pow(f, 3.0); // silky highlights

  // glow concentrated up top, deep dark toward the bottom
  float topGlow = smoothstep(-0.25, 1.05, uv.y);
  col = mix(uBase, col, clamp(0.04 + 0.72 * f * topGlow + 0.12 * topGlow, 0.0, 1.0));
  col *= uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function AuroraBackground({
  paused = false,
  intensity = 1.0,
  colorA = [0.231, 0.122, 0.478], // #3b1f7a violet
  colorB = [0.055, 0.302, 0.549], // #0e4d8c blue
  colorC = [0.059, 0.42, 0.341], // #0f6b57 teal-green accent
  base = [0.024, 0.027, 0.051], // #06070d near-black
}) {
  const ref = useRef(null);
  const ctrl = useRef(null); // { start, stop } — exposed by the setup effect

  // Setup once: create the WebGL context + render loop. Never torn down on
  // pause (which would flicker); pause only stops the rAF loop.
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const container = ref.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new Renderer({
        alpha: false,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      });
    } catch {
      return; // WebGL unavailable — graceful fallback to CSS body gradient
    }
    const gl = renderer.gl;
    gl.clearColor(base[0], base[1], base[2], 1);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uColorC: { value: colorC },
        uBase: { value: base },
        uIntensity: { value: intensity },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = 0; // accumulated time, preserved across pause/resume
    let prevTs = null;
    const loop = (ts) => {
      if (prevTs === null) prevTs = ts;
      last += (ts - prevTs) / 1000;
      prevTs = ts;
      program.uniforms.uTime.value = last;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };

    ctrl.current = {
      start: () => {
        if (raf || reduce) return;
        prevTs = null;
        raf = requestAnimationFrame(loop);
      },
      stop: () => {
        cancelAnimationFrame(raf);
        raf = 0;
      },
    };

    // initial frame so something shows even before start (or if reduced motion)
    renderer.render({ scene: mesh });

    return () => {
      cancelAnimationFrame(raf);
      ctrl.current = null;
      window.removeEventListener("resize", resize);
      try {
        container.removeChild(gl.canvas);
      } catch { /* already removed */ }
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start/stop the loop on pause changes — no context recreation, no flicker.
  useEffect(() => {
    const c = ctrl.current;
    if (!c) return;
    if (paused) c.stop();
    else c.start();
  }, [paused]);

  return (
    <div
      ref={ref}
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
