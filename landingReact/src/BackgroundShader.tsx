import { useEffect, useState } from "react";
import {
  GrainGradient,
  grainGradientPresets,
} from "@paper-design/shaders-react";
import "./background-shader.css";

type Shape = "wave" | "dots" | "truchet" | "corners" | "ripple" | "blob" | "sphere";

interface Params {
  colorCount: number;
  colors: string[];
  colorBack: string;
  softness: number;
  intensity: number;
  noise: number;
  shape: Shape;
  speed: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

const DEFAULT_PARAMS: Params = {
  colorCount: 3,
  colors: ["#7c3aed", "#1fb8e6", "#42ff87", "#fbbf24", "#f472b6", "#9ca3af", "#ffffff"],
  colorBack: "#000000",
  softness: 0.6,
  intensity: 0.5,
  noise: 0.1,
  shape: "corners",
  speed: 0.69,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

// Extra in-house preset — everything except the active colors will be
// applied by applyPreset("autlas") so you can keep a palette override.
const LOCAL_PRESETS: Record<string, Partial<Params>> = {
  autlas: {
    softness: 0.6,
    intensity: 0.5,
    noise: 0.1,
    shape: "corners",
    speed: 0.69,
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
  },
};

// Flip to `true` to bring the live tuner panel back (gear button +
// sliders, color pickers, presets, copy-JSON). Kept around so future
// palette/motion tuning doesn't have to redo the wiring.
const SHOW_TUNER = true;

export default function BackgroundShader() {
  const [p, setP] = useState<Params>(DEFAULT_PARAMS);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [scrollScale, setScrollScale] = useState(1);
  const [introScale, setIntroScale] = useState(3);
  const [introRot, setIntroRot] = useState(-30);
  const [scrollRot, setScrollRot] = useState(0);
  // Scroll-driven softness delta (0 at rest, +0.3 at full scroll); added
  // on top of p.softness so the tuner slider keeps composing cleanly.
  const [scrollSoftDelta, setScrollSoftDelta] = useState(0);
  const [mouseOffX, setMouseOffX] = useState(0);
  const [mouseOffY, setMouseOffY] = useState(0);

  // Scroll-driven scale + rotation — lerp between START..END fractions
  // of viewport height (same curve as the dim overlay). rAF-throttled +
  // delta-gated so we don't re-render per scroll tick.
  useEffect(() => {
    const SCROLL_START = 0.2;
    const SCROLL_END = 1.0;
    const SCALE_FROM = 1;
    const SCALE_TO = 1.4;
    // Softness delta: 0 at rest, +0.3 at full scroll (so 0.6 → 0.9 at
     // default base). Added on top of p.softness so the tuner composes.
    const SOFT_DELTA_MAX = 0.3;
    // Rotation accumulates DEG_PER_SCREEN° for every viewport-height of
    // scroll, starting from 0 — no upper clamp, so the mesh keeps turning.
    const DEG_PER_SCREEN = 15;
    let raf = 0;
    let lastScale = SCALE_FROM;
    let lastRot = 0;
    let lastSoftDelta = 0;
    const tick = () => {
      raf = 0;
      const H = window.innerHeight;
      const y = window.scrollY;
      const t = Math.max(0, Math.min(1, (y - SCROLL_START * H) / ((SCROLL_END - SCROLL_START) * H)));
      const nextScale = SCALE_FROM + t * (SCALE_TO - SCALE_FROM);
      const nextRot = (y / H) * DEG_PER_SCREEN;
      const nextSoftDelta = t * SOFT_DELTA_MAX;
      if (Math.abs(nextScale - lastScale) >= 0.002) { lastScale = nextScale; setScrollScale(nextScale); }
      if (Math.abs(nextRot - lastRot) >= 0.05) { lastRot = nextRot; setScrollRot(nextRot); }
      if (Math.abs(nextSoftDelta - lastSoftDelta) >= 0.002) { lastSoftDelta = nextSoftDelta; setScrollSoftDelta(nextSoftDelta); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Intro sweep on mount — ease-in-out. Scale 3→1 over 1s (mult),
  // rotation -30°→0° over 3s (added). Both compose with scroll-driven
  // values. One rAF loop, separate progress for each track.
  useEffect(() => {
    const SCALE_FROM = 3, SCALE_TO = 1, SCALE_DUR = 3000;
    const ROT_FROM = -30, ROT_TO = 0, ROT_DUR = 3000;
    const easeInOut = (x: number) =>
      x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const dt = now - start;
      const ts = Math.min(1, dt / SCALE_DUR);
      const tr = Math.min(1, dt / ROT_DUR);
      setIntroScale(SCALE_FROM + (SCALE_TO - SCALE_FROM) * easeInOut(ts));
      setIntroRot(ROT_FROM + (ROT_TO - ROT_FROM) * easeInOut(tr));
      if (ts < 1 || tr < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Cursor parallax — linear in pixels: every PIX_PER_UNIT of cursor
  // travel from viewport center = 1 full unit of shader offset.
  // Inverted so mouse-up → offset-down (standard parallax feel).
  // rAF-throttled; eased toward target.
  useEffect(() => {
    const PIX_PER_UNIT = 36000;
    const EASE = 0.12;
    let raf = 0;
    let targetX = 0, targetY = 0;
    let curX = 0, curY = 0;
    const tick = () => {
      curX += (targetX - curX) * EASE;
      curY += (targetY - curY) * EASE;
      setMouseOffX(curX);
      setMouseOffY(curY);
      if (Math.abs(targetX - curX) > 0.0005 || Math.abs(targetY - curY) > 0.0005) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const onMove = (e: MouseEvent) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      targetX = -(e.clientX - W / 2) / PIX_PER_UNIT;
      targetY = -(e.clientY - H / 2) / PIX_PER_UNIT;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const update = (patch: Partial<Params>) => setP((cur) => ({ ...cur, ...patch }));
  const setColor = (i: number, v: string) => setP((cur) => {
    const colors = [...cur.colors]; colors[i] = v; return { ...cur, colors };
  });

  const copyParams = async () => {
    // Only copy the active color slots — trimming the trailing padding
    // makes the output easy to paste straight into DEFAULT_PARAMS.
    const payload: Params = { ...p, colors: p.colors.slice(0, p.colorCount) };
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };

  const reverseColors = () => setP((cur) => ({
    ...cur,
    // Reverse only the active slot (0 .. colorCount-1); leave the rest alone
    // so reversing twice restores the original layout.
    colors: cur.colors.map((c, i) =>
      i < cur.colorCount ? cur.colors[cur.colorCount - 1 - i] : c,
    ),
  }));

  const applyPreset = (name: string) => {
    const key = name.toLowerCase();
    const local = LOCAL_PRESETS[key];
    if (local) { setP((cur) => ({ ...cur, ...local })); return; }
    const preset = grainGradientPresets.find((x) => x.name.toLowerCase() === key);
    if (!preset) return;
    // Keep our brand colors + current colorBack — only pull shape/motion/etc
    // from the preset so every preset always renders with the autlas palette.
    const { colors: _skipColors, colorBack: _skipBack, ...rest } = preset.params as Partial<Params>;
    void _skipColors; void _skipBack;
    setP((cur) => ({ ...cur, ...rest }));
  };

  return (
    <>
      <div className="bg-shader" aria-hidden="true">
        <GrainGradient
          width="100%"
          height="100%"
          colorBack={p.colorBack}
          colors={p.colors.slice(0, p.colorCount)}
          softness={Math.min(1, p.softness + scrollSoftDelta)}
          intensity={p.intensity}
          noise={p.noise}
          shape={p.shape}
          speed={p.speed}
          scale={p.scale * scrollScale * introScale}
          rotation={p.rotation + scrollRot + introRot}
          offsetX={p.offsetX + mouseOffX}
          offsetY={p.offsetY + mouseOffY}
        />
      </div>

      {SHOW_TUNER && (
      <button className="shader-tuner-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle shader controls">
        {open ? "×" : "⚙"}
      </button>
      )}

      {SHOW_TUNER && open && (
        <div className="shader-tuner" onClick={(e) => e.stopPropagation()}>
          <div className="tuner-head">
            Presets
            <button className="copy-params-btn" onClick={copyParams}>
              {copied ? "copied ✓" : "copy JSON"}
            </button>
          </div>
          <div className="tuner-presets">
            {["Default", "Wave", "Dots", "Truchet", "Ripple", "Blob", "Autlas"].map((name) => (
              <button key={name} onClick={() => applyPreset(name)}>{name}</button>
            ))}
          </div>

          <div className="tuner-row">
            <label>colors</label>
            <button className="reverse-btn" onClick={reverseColors}>reverse ↔</button>
          </div>
          <Slider label="colorCount" min={1} max={7} step={1} value={p.colorCount} onChange={(v) => update({ colorCount: v })} />

          {p.colors.slice(0, p.colorCount).map((c, i) => (
            <div key={i} className="tuner-row">
              <label>color{i + 1}</label>
              <div className="color-cell">
                <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} />
                <input type="text" value={c} onChange={(e) => setColor(i, e.target.value)} className="hex" />
              </div>
            </div>
          ))}

          <div className="tuner-row">
            <label>colorBack</label>
            <div className="color-cell">
              <input type="color" value={p.colorBack} onChange={(e) => update({ colorBack: e.target.value })} />
              <input type="text" value={p.colorBack} onChange={(e) => update({ colorBack: e.target.value })} className="hex" />
            </div>
          </div>

          <Slider label="softness" min={0} max={1} step={0.01} value={p.softness} onChange={(v) => update({ softness: v })} />
          <Slider label="intensity" min={0} max={1} step={0.01} value={p.intensity} onChange={(v) => update({ intensity: v })} />
          <Slider label="noise" min={0} max={1} step={0.01} value={p.noise} onChange={(v) => update({ noise: v })} />

          <div className="tuner-row">
            <label>shape</label>
            <select value={p.shape} onChange={(e) => update({ shape: e.target.value as Shape })}>
              {(["wave", "dots", "truchet", "corners", "ripple", "blob", "sphere"] as Shape[]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <Slider label="speed" min={0} max={3} step={0.01} value={p.speed} onChange={(v) => update({ speed: v })} />
          <Slider label="scale" min={0.1} max={4} step={0.01} value={p.scale} onChange={(v) => update({ scale: v })} />
          <Slider label="rotation" min={0} max={360} step={1} value={p.rotation} onChange={(v) => update({ rotation: v })} />
          <Slider label="offsetX" min={-1} max={1} step={0.01} value={p.offsetX} onChange={(v) => update({ offsetX: v })} />
          <Slider label="offsetY" min={-1} max={1} step={0.01} value={p.offsetY} onChange={(v) => update({ offsetY: v })} />
        </div>
      )}
    </>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="tuner-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="num">{step < 1 ? value.toFixed(2) : value}</span>
    </div>
  );
}
