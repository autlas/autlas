import { useState } from "react";
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
  colors: ["#7c3aed", "#1fb8e6", "#4ade80", "#fbbf24", "#f472b6", "#9ca3af", "#ffffff"],
  colorBack: "#000000",
  softness: 1,
  intensity: 0.6,
  noise: 0.25,
  shape: "blob",
  speed: 0.4,
  scale: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

export default function BackgroundShader() {
  const [p, setP] = useState<Params>(DEFAULT_PARAMS);
  const [open, setOpen] = useState(true);

  const update = (patch: Partial<Params>) => setP((cur) => ({ ...cur, ...patch }));
  const setColor = (i: number, v: string) => setP((cur) => {
    const colors = [...cur.colors]; colors[i] = v; return { ...cur, colors };
  });

  const reverseColors = () => setP((cur) => ({
    ...cur,
    // Reverse only the active slot (0 .. colorCount-1); leave the rest alone
    // so reversing twice restores the original layout.
    colors: cur.colors.map((c, i) =>
      i < cur.colorCount ? cur.colors[cur.colorCount - 1 - i] : c,
    ),
  }));

  const applyPreset = (name: string) => {
    const preset = grainGradientPresets.find((x) => x.name.toLowerCase() === name.toLowerCase());
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
          softness={p.softness}
          intensity={p.intensity}
          noise={p.noise}
          shape={p.shape}
          speed={p.speed}
          scale={p.scale}
          rotation={p.rotation}
          offsetX={p.offsetX}
          offsetY={p.offsetY}
        />
      </div>

      <button className="shader-tuner-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle shader controls">
        {open ? "×" : "⚙"}
      </button>

      {open && (
        <div className="shader-tuner" onClick={(e) => e.stopPropagation()}>
          <div className="tuner-head">Presets</div>
          <div className="tuner-presets">
            {["Default", "Wave", "Dots", "Truchet", "Ripple", "Blob"].map((name) => (
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
