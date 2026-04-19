import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./w98-scene.css";

// Prefix public-asset URLs with Vite's base (`/` in dev, `/autlas-landing/`
// in the GitHub Pages production build). Hardcoded "/assets/..." strings
// would otherwise break in prod since Vite only rewrites absolute paths
// in HTML and CSS imported from JS, not inline string literals.
const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, "")}`;

// Sample-based error sounds. We route the real Windows XP samples
// through a small <audio> pool so concurrent plays during the storm
// don't step on each other.
function playSample(src: string, volume = 0.55) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => { /* autoplay policy — degrade silently */ });
  } catch {
    /* noop */
  }
}
function playErrorDing() {
  playSample(asset("assets/sounds/windows-xp-exclamation.mp3"));
}
function playWindowsErrorSound() {
  playSample(asset("assets/sounds/windows-xp-critical-stop.mp3"), 0.75);
}

// Parse "2 KB" / "24 MB" / "412 B" into a byte count so we can sort the
// size column numerically instead of by string.
function parseSize(s: string): number {
  const m = s.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mul = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : unit === "KB" ? 1024 : 1;
  return n * mul;
}

// Parse "dd.mm.yyyy" into a timestamp so date sort works as expected.
function parseDate(s: string): number {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

// Win98 tray clock: 12h, AM/PM, minute precision.
function formatClock(d: Date): string {
  let h = d.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m} ${suffix}`;
}

/**
 * Faux Windows 98 desktop scene for the "Before" card on the landing.
 * Three draggable Explorer windows + a taskbar full of identical H icons —
 * visual shorthand for "running a pile of .ahk files without a manager."
 */

type FileRow = {
  name: string;
  size: string;
  type: string;
  date: string;
  ahk?: boolean;
};

type Win = {
  id: string;
  title: string;
  path: string;
  /** Starting position as fraction of stage width/height. */
  start: { x: number; y: number };
  /** Window width as fraction of stage width. Height is content-driven. */
  width: number;
  rows: FileRow[];
};

const WINDOWS: Win[] = [
  {
    id: "desktop",
    title: "Desktop",
    path: "C:\\Users\\Max\\Desktop",
    start: { x: 0.02, y: 0.04 },
    width: 0.46,
    rows: [
      { name: "clipboard_v2.ahk", size: "2 KB", type: "AutoHotkey Script", date: "14.03.2024", ahk: true },
      { name: "WinSnap_FIN.ahk", size: "8 KB", type: "AutoHotkey Script", date: "02.09.2024", ahk: true },
      { name: "altdrag_new.ahk", size: "5 KB", type: "AutoHotkey Script", date: "21.11.2023", ahk: true },
      { name: "csgo_crosshair.ahk", size: "1 KB", type: "AutoHotkey Script", date: "07.06.2024", ahk: true },
      { name: "todo.txt", size: "1 KB", type: "Text Document", date: "19.04.2026" },
      { name: "screenshot.png", size: "412 KB", type: "PNG Image", date: "08.04.2026" },
    ],
  },
  {
    id: "tools",
    title: "ahk",
    path: "D:\\tools\\ahk",
    start: { x: 0.27, y: 0.38 },
    width: 0.46,
    rows: [
      { name: "hotkeys.ahk", size: "3 KB", type: "AutoHotkey Script", date: "11.01.2025", ahk: true },
      { name: "old_macro.ahk", size: "12 KB", type: "AutoHotkey Script", date: "03.08.2022", ahk: true },
      { name: "settings.ini", size: "812 B", type: "Configuration Settings", date: "27.02.2024" },
      { name: "CapsToEsc.ahk", size: "410 B", type: "AutoHotkey Script", date: "15.05.2023", ahk: true },
      { name: "QuickLauncher.ahk", size: "12 KB", type: "AutoHotkey Script", date: "30.10.2024", ahk: true },
    ],
  },
  {
    id: "downloads",
    title: "Downloads",
    path: "C:\\Users\\Max\\Downloads",
    start: { x: 0.52, y: 0.04 },
    width: 0.46,
    rows: [
      { name: "setup.exe", size: "24 MB", type: "Application", date: "05.12.2025" },
      { name: "tray_monitor.ahk", size: "3 KB", type: "AutoHotkey Script", date: "18.03.2026", ahk: true },
      { name: "invoice_q4.pdf", size: "182 KB", type: "PDF Document", date: "28.01.2026" },
      { name: "photos.zip", size: "86 MB", type: "Compressed Archive", date: "12.10.2025" },
      { name: "macro_demo.ahk", size: "4 KB", type: "AutoHotkey Script", date: "06.07.2024", ahk: true },
    ],
  },
];

type Pos = { x: number; y: number };

export default function W98Scene() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 500 });
  const [visible, setVisible] = useState(false);

  // Per-window state.
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<string[]>(["desktop", "downloads", "tools"]);
  const [activeId, setActiveId] = useState<string>("tools");
  const [trayOpen, setTrayOpen] = useState(true);

  // Per-window Explorer column sort state. Click a header to sort asc,
  // click the same header again to flip to desc, click a third time to
  // clear the sort.
  type SortCol = "name" | "size" | "type" | "date";
  type SortDir = "asc" | "desc";
  const [sorts, setSorts] = useState<Record<string, { col: SortCol; dir: SortDir } | null>>({});
  const cycleSort = (winId: string, col: SortCol) => {
    setSorts((prev) => {
      const cur = prev[winId];
      let next: { col: SortCol; dir: SortDir } | null;
      if (!cur || cur.col !== col) next = { col, dir: "asc" };
      else if (cur.dir === "asc") next = { col, dir: "desc" };
      else next = null; // third click clears
      return { ...prev, [winId]: next };
    });
  };
  const sortRows = (rows: FileRow[], state: { col: SortCol; dir: SortDir } | null | undefined): FileRow[] => {
    if (!state) return rows;
    const key = (r: FileRow): string | number =>
      state.col === "size" ? parseSize(r.size) :
      state.col === "date" ? parseDate(r.date) :
      state.col === "type" ? r.type.toLowerCase() :
      r.name.toLowerCase();
    const mul = state.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka < kb) return -1 * mul;
      if (ka > kb) return 1 * mul;
      return 0;
    });
  };
  const [clock, setClock] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  // Nag escalation ladder.
  //   idle       — tracking with low thresholds (5 clicks / 10s)
  //   first      — single dialog visible
  //   post-first — dismissed once, tracking higher thresholds (10 / 20s)
  //   wave       — three dialogs stacked
  //   post-wave  — dismissed wave, tracking clicks only (15)
  //   storm      — twenty dialogs scattered across the stage; after
  //                three dismissals the Cancel buttons start fleeing
  //                from the cursor (chase sub-mode). After 20 frustrated
  //                clicks in chase sub-mode we transition to…
  //   ultimatum  — single final "Just. Install. It." dialog with two
  //                Install buttons and no Cancel at all
  //   done       — quiet
  type Phase = "idle" | "first" | "post-first" | "wave" | "post-wave" | "storm" | "ultimatum" | "done";
  const [phase, setPhase] = useState<Phase>("idle");

  // Advance to the next "dismissed" state when user closes current nag.
  const advancePhase = (current: Phase): Phase => {
    if (current === "first") return "post-first";
    if (current === "wave") return "post-wave";
    if (current === "storm") return "done";
    if (current === "ultimatum") return "done";
    return current;
  };

  useEffect(() => {
    if (phase !== "first" && phase !== "wave" && phase !== "storm" && phase !== "ultimatum") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase((p) => advancePhase(p));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Only track in the "engagement" phases between dialogs.
    if (phase !== "idle" && phase !== "post-first" && phase !== "post-wave") return;

    const hoverThreshold =
      phase === "idle" ? 10_000 :
      phase === "post-first" ? 20_000 :
      Number.POSITIVE_INFINITY; // post-wave: clicks only
    const clickThreshold =
      phase === "idle" ? 5 :
      phase === "post-first" ? 10 :
      15;
    const nextPhase: Phase =
      phase === "idle" ? "first" :
      phase === "post-first" ? "wave" :
      "storm";

    let accumMs = 0;
    let clicks = 0;
    let tickId: number | null = null;
    let lastTick = 0;
    let triggered = false;

    const fire = () => {
      if (triggered) return;
      triggered = true;
      stop();
      setPhase(nextPhase);
      // One ding per dialog, staggered to match each dialog's
      // animation-delay so sound and pop-in land together. Storm dings
      // are handled separately in the storm-spawn effect (30 staggered).
      const dingDelays =
        nextPhase === "storm" ? [] :
        nextPhase === "wave" ? [0, 180, 360] :
        [0];
      dingDelays.forEach((d) => setTimeout(playErrorDing, d));
    };

    const tick = () => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      accumMs += dt;
      if (accumMs >= hoverThreshold) fire();
    };
    const start = () => {
      if (tickId != null || triggered) return;
      lastTick = performance.now();
      tickId = window.setInterval(tick, 200);
    };
    const stop = () => {
      if (tickId != null) window.clearInterval(tickId);
      tickId = null;
    };
    const onClick = () => {
      if (triggered) return;
      clicks += 1;
      if (clicks >= clickThreshold) fire();
    };

    stage.addEventListener("pointerenter", start);
    stage.addEventListener("pointerleave", stop);
    stage.addEventListener("click", onClick);
    return () => {
      stage.removeEventListener("pointerenter", start);
      stage.removeEventListener("pointerleave", stop);
      stage.removeEventListener("click", onClick);
      stop();
    };
  }, [phase]);
  const [startOpen, setStartOpen] = useState(false);
  const startMenuRef = useRef<HTMLDivElement>(null);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  // Drag state kept out of React so pointermove doesn't spam re-renders.
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Measure stage and re-compute initial positions whenever it resizes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      setStageSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Compute window widths whenever the stage resizes. Heights are
  // content-driven and measured directly from the DOM in the layout
  // effect below.
  useEffect(() => {
    if (stageSize.w === 0) return;
    setWidths(() => {
      const next: Record<string, number> = {};
      // Sub-linear width: narrow stages → windows take a larger share,
      // wide stages → they occupy less. width = sqrt(stageW) * 15.
      const w = Math.round(Math.sqrt(stageSize.w) * 15);
      for (const win of WINDOWS) next[win.id] = w;
      return next;
    });
  }, [stageSize.w]);

  // Rule-based placement after layout, using measured heights:
  //   desktop   — top-left, 15/15 from the stage corner
  //   downloads — top-right, 12/18 from the stage corner
  //   tools     — horizontally centered, 15px above the taskbar
  // Runs on stage resize and when widths update. Drag is free to move
  // windows elsewhere; the next stage resize snaps them back to rules.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || stageSize.w === 0) return;
    const taskbarH = 28;
    setPositions((prev) => {
      const next: Record<string, Pos> = { ...prev };
      let changed = false;
      for (const w of WINDOWS) {
        const el = stage.querySelector<HTMLElement>(`[data-win-id="${w.id}"]`);
        if (!el) continue;
        const dw = widths[w.id] ?? el.offsetWidth;
        const dh = el.offsetHeight;
        let target: Pos;
        if (w.id === "desktop") {
          target = { x: 15, y: 12 };
        } else if (w.id === "downloads") {
          target = { x: stageSize.w - dw - 12, y: 21 };
        } else {
          target = {
            x: Math.round((stageSize.w - dw) / 2),
            y: stageSize.h - taskbarH - dh - 15,
          };
        }
        const cur = prev[w.id];
        if (!cur || cur.x !== target.x || cur.y !== target.y) {
          next[w.id] = target;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stageSize.w, stageSize.h, widths]);

  // Close start menu on click outside.
  useEffect(() => {
    if (!startOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (startMenuRef.current?.contains(t)) return;
      if (startBtnRef.current?.contains(t)) return;
      setStartOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [startOpen]);

  // Reveal on scroll into view.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "-10% 0px", threshold: 0.15 },
    );
    io.observe(stage);
    return () => io.disconnect();
  }, []);

  const bringToFront = (id: string) => {
    setOrder((prev) => {
      if (prev[prev.length - 1] === id) return prev;
      return [...prev.filter((x) => x !== id), id];
    });
    setActiveId(id);
  };

  const onTitleBarPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.classList.add("dragging");
    bringToFront(id);

    const pos = positions[id] ?? { x: 0, y: 0 };
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    };

    // Anchor the stage rect at gesture start so we don't re-measure every move.
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    // Translate pointer coords to stage-local.
    dragRef.current.offsetX = (e.clientX - stageRect.left) - pos.x;
    dragRef.current.offsetY = (e.clientY - stageRect.top) - pos.y;
  };

  const onTitleBarPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const w = widths[d.id];
    if (w == null) return;
    let x = (e.clientX - stageRect.left) - d.offsetX;
    let y = (e.clientY - stageRect.top) - d.offsetY;
    // Clamp inside stage (leave room for the taskbar at the bottom).
    const maxX = stageSize.w - w;
    const maxY = stageSize.h - 28 - 18; // taskbar height + at least titlebar visible
    x = Math.max(0, Math.min(maxX, x));
    y = Math.max(0, Math.min(maxY, y));
    setPositions((prev) => ({ ...prev, [d.id]: { x, y } }));
  };

  const onTitleBarPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    target.classList.remove("dragging");
    dragRef.current = null;
  };

  // Popup shows our pile of AHK H-icons plus a handful of real tray regulars
  // (Steam, NVIDIA, PowerToys, Lightshot, Bluetooth) so the "my tray is a
  // mess of tiny icons" vibe lands. AHK icons carry the script filename as a
  // hover tooltip — the honest UX of bare-AHK: hover each H to find your
  // script.
  const trayPopupIcons = useMemo(() => {
    const ahkScripts = [
      "clipboard_v2.ahk",
      "WinSnap_FIN.ahk",
      "altdrag_new.ahk",
      "csgo_crosshair.ahk",
      "hotkeys.ahk",
      "old_macro.ahk",
      "CapsToEsc.ahk",
      "QuickLauncher.ahk",
      "tray_monitor.ahk",
      "macro_demo.ahk",
    ];
    return [
      { src: asset("assets/w98/tray/nvidia.svg"), tip: "MVDIDIA Control Panel" },
      { src: asset("assets/w98/tray/lightshot.ico"), tip: "Lightshut" },
      ...ahkScripts.map((name) => ({ src: asset("assets/ahk/logo.png"), tip: name })),
      { src: asset("assets/w98/tray/steam.svg"), tip: "Scream" },
      { src: asset("assets/w98/tray/powertoys.ico"), tip: "PovverToys" },
      { src: asset("assets/w98/tray/bluetooth.svg"), tip: "Bluetooth Devices" },
    ];
  }, []);

  const taskbarTasks = useMemo(
    () => WINDOWS.map((w) => ({ id: w.id, title: w.title, icon: asset("assets/w98/folder.png") })),
    [],
  );

  // Per-dialog dismissal set — × and Cancel close only that one. Install
  // and Escape close the whole wave (phase advances). When all dialogs of
  // the current phase are dismissed individually we also advance.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // Count of dialogs closed in the current storm — once ≥ 3, the Cancel
  // buttons start running away from the cursor (Farm-Frenzy-style).
  const [stormClosedCount, setStormClosedCount] = useState(0);
  const [cancelOffsets, setCancelOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  useEffect(() => {
    // Ultimatum inherits dismissedIds from the storm — already-closed
    // storm dialogs stay closed, still-open ones keep rendering under
    // the final notice.
    if (phase === "first" || phase === "wave" || phase === "storm") {
      setDismissedIds(new Set());
    }
    if (phase === "storm") {
      setStormClosedCount(0);
      setCancelOffsets({});
    }
    if (phase === "ultimatum") {
      // Heavier "Windows critical stop"-style chord for the final notice
      // instead of the lighter ding used elsewhere.
      playWindowsErrorSound();
    }
  }, [phase]);
  const chaseActive = phase === "storm" && stormClosedCount >= 3;
  // Count ANY click anywhere on the page once chase is active — 20
  // frustrated clicks (backdrop, dialogs, buttons, stage, elsewhere)
  // flip us into the "Just. Install. It." ultimatum.
  useEffect(() => {
    if (phase === "storm") setChaseClickCount(0);
  }, [phase]);
  const [chaseClickCount, setChaseClickCount] = useState(0);
  useEffect(() => {
    if (!chaseActive) return;
    console.log("[chase] active — click counting started");
    const onDocDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      console.log("[chase] pointerdown on", t?.tagName, t?.className);
      setChaseClickCount((c) => {
        const next = c + 1;
        console.log(`[chase] count: ${c} → ${next}`);
        if (next >= 16) {
          console.log("[chase] threshold reached, switching to ultimatum");
          queueMicrotask(() => setPhase("ultimatum"));
        }
        return next;
      });
    };
    // pointerdown fires even when the target element is about to unmount
    // (e.g. Cancel → dismissOne removes the dialog), whereas a click
    // event would never complete.
    document.addEventListener("pointerdown", onDocDown);
    return () => {
      console.log("[chase] listener removed");
      document.removeEventListener("pointerdown", onDocDown);
    };
  }, [chaseActive]);
  const shuffleCancel = (id: string, btn: HTMLElement) => {
    if (!chaseActive) return;
    const stage = stageRef.current;
    if (!stage) return;
    // Derive the button's flow rect (without current offset) and clamp
    // the new random offset so the escaped button stays inside the
    // stage — can't have Cancel fleeing off-screen.
    const sRect = stage.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const cur = cancelOffsets[id] ?? { dx: 0, dy: 0 };
    const flowLeft = bRect.left - cur.dx;
    const flowTop = bRect.top - cur.dy;
    const bw = bRect.width;
    const bh = bRect.height;
    const stageMinDx = sRect.left - flowLeft;
    const stageMaxDx = sRect.right - flowLeft - bw;
    const stageMinDy = sRect.top - flowTop;
    const stageMaxDy = sRect.bottom - flowTop - bh;
    // Each hop is in the range [±30, ±90] on X and [±30, ±60] on Y
    // around the current position — the [0, ±30] dead zone keeps the
    // button from landing nearly under the cursor again, outer bound
    // stops full-stage teleports. Intersected with stage limits.
    const pickDelta = (
      minAbs: number, maxAbs: number,
      stageLo: number, stageHi: number,
    ): number | null => {
      const negLo = Math.max(-maxAbs, stageLo);
      const negHi = Math.min(-minAbs, stageHi);
      const posLo = Math.max(minAbs, stageLo);
      const posHi = Math.min(maxAbs, stageHi);
      const negOk = negLo <= negHi;
      const posOk = posLo <= posHi;
      if (!negOk && !posOk) return null;
      const useNeg = negOk && posOk ? Math.random() < 0.5 : negOk;
      return useNeg
        ? Math.random() * (negHi - negLo) + negLo
        : Math.random() * (posHi - posLo) + posLo;
    };
    const ddx = pickDelta(15, 90, stageMinDx - cur.dx, stageMaxDx - cur.dx);
    const ddy = pickDelta(15, 60, stageMinDy - cur.dy, stageMaxDy - cur.dy);
    if (ddx === null || ddy === null) return;
    const dx = cur.dx + ddx;
    const dy = cur.dy + ddy;
    setCancelOffsets((prev) => ({ ...prev, [id]: { dx, dy } }));
  };

  const activeDialogIds = (): string[] => {
    if (phase === "first") return ["first"];
    if (phase === "wave") return ["wave-1", "wave-2", "wave-3"];
    if (phase === "storm") return stormDialogsRef.current.map((d) => d.id);
    if (phase === "ultimatum") return ["ultimatum"];
    return [];
  };

  const dismissOne = (id: string) => {
    setDismissedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      const active = activeDialogIds();
      if (active.length > 0 && active.every((aid) => next.has(aid))) {
        // Last one closed — advance phase on the next tick.
        queueMicrotask(() => setPhase((p) => advancePhase(p)));
      }
      return next;
    });
    if (phase === "storm") {
      setStormClosedCount((c) => c + 1);
    }
  };
  const dismissAll = () => setPhase((p) => advancePhase(p));

  // 20 aggressive errors for the storm — full message in the body, title
  // is a random-looking hex code so each dialog reads like a distinct
  // system crash rather than a named category.
  const STORM_MESSAGES: Array<{ title: string; msg: ReactNode; variant: "alert" | "critical" | "final" }> = useMemo(() => [
    { title: "autlas.exe — 0x00000001", msg: <>ERROR! INSTALL <b>autlas</b>!</>, variant: "alert" },
    { title: "autlas.exe — 0xC0000005", msg: <>SYSTEM FAILURE! <b>autlas</b> REQUIRED!</>, variant: "critical" },
    { title: "autlas.exe — 0x0000007B", msg: <>CRITICAL! INSTALL <b>autlas</b> IMMEDIATELY!</>, variant: "final" },
    { title: "autlas.exe — 0x0000001E", msg: <>HALT! NO <b>autlas</b> DETECTED!</>, variant: "alert" },
    { title: "autlas.exe — STOP 0x000000FF", msg: <>INSTALL <b>autlas</b>!</>, variant: "critical" },
    { title: "autlas.exe — 0xDEAD0B01", msg: <>FATAL EXCEPTION! MISSING: <b>autlas</b>!</>, variant: "final" },
    { title: "autlas.exe — 0x0000008E", msg: <>KERNEL PANIC! INSTALL <b>autlas</b>!</>, variant: "critical" },
    { title: "autlas.exe — 0xC0000221", msg: <>DATA CORRUPTION! INSTALL <b>autlas</b> TO RECOVER!</>, variant: "final" },
    { title: "autlas.exe — 0xC0000022", msg: <>ACCESS DENIED! <b>autlas</b> REQUIRED!</>, variant: "critical" },
    { title: "autlas.exe — 0x7E", msg: <>DLL NOT FOUND: <b>autlas</b>.dll!</>, variant: "final" },
    { title: "autlas.exe — 0x0000007E", msg: <>DRIVER MISSING: <b>autlas</b>.sys!</>, variant: "alert" },
    { title: "autlas.exe — 0xC0000409", msg: <>BUFFER OVERFLOW! INSTALL <b>autlas</b>!</>, variant: "final" },
    { title: "autlas.exe — 0xC00000FD", msg: <>STACK FULL OF .ahk! INSTALL <b>autlas</b>!</>, variant: "alert" },
    { title: "autlas.exe — 0xBAADF00D", msg: <>FAULT! INSTALL <b>autlas</b> IMMEDIATELY!</>, variant: "critical" },
    { title: "autlas.exe — 0x0000007F", msg: <>BSOD IMMINENT! INSTALL <b>autlas</b>!</>, variant: "final" },
    { title: "autlas.exe — 0xC0000218", msg: <>CORRUPTED REGISTRY! INSTALL <b>autlas</b>!</>, variant: "critical" },
    { title: "autlas.exe — 0x8007000E", msg: <>MEMORY LEAK! INSTALL <b>autlas</b>!</>, variant: "alert" },
    { title: "autlas.exe — 0xC000014C", msg: <>BOOT FAILED! REINSTALL WITH <b>autlas</b>!</>, variant: "final" },
    { title: "autlas.exe — 0x0000002E", msg: <>DEADLOCK DETECTED! INSTALL <b>autlas</b>!</>, variant: "final" },
    { title: "autlas.exe — 0x00000024", msg: <>TIMEOUT! WHY HAVEN'T YOU INSTALLED <b>autlas</b>?!</>, variant: "final" },
  ], []);

  type StormDialog = {
    id: string;
    title: string;
    msg: ReactNode;
    variant: "alert" | "critical" | "final";
    offset: { x: number; y: number };
    delay: number;
  };
  const [stormDialogs, setStormDialogs] = useState<StormDialog[]>([]);
  const stormDialogsRef = useRef<StormDialog[]>([]);
  stormDialogsRef.current = stormDialogs;

  // When phase → 'storm', scatter 30 dialogs across the stage and fire
  // 30 staggered dings to match.
  useEffect(() => {
    if (phase !== "storm") return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dialogW = 340;
    const dialogH = 180;
    const maxX = Math.max(40, (rect.width - dialogW) / 2);
    const maxY = Math.max(40, (rect.height - dialogH - 28) / 2);
    const dialogs: StormDialog[] = STORM_MESSAGES.map((m, i) => ({
      id: `storm-${i}`,
      title: m.title,
      msg: m.msg,
      variant: m.variant,
      offset: {
        x: (Math.random() * 2 - 1) * maxX,
        y: (Math.random() * 2 - 1) * maxY,
      },
      delay: i * 100,
    }));
    setStormDialogs(dialogs);
    dialogs.forEach((d) => setTimeout(playErrorDing, d.delay));
  }, [phase, STORM_MESSAGES]);

  // z-order within the backdrop — last id = on top. Click on a dialog
  // bumps it to the end (same pattern as Explorer windows).
  const [dialogOrder, setDialogOrder] = useState<string[]>(["first", "wave-1", "wave-2", "wave-3"]);
  const bringDialogToFront = (id: string) => {
    setDialogOrder((prev) => {
      if (prev[prev.length - 1] === id) return prev;
      return [...prev.filter((x) => x !== id), id];
    });
  };

  // Per-dialog drag offset (added on top of the static placement offset).
  const [dialogDrag, setDialogDrag] = useState<Record<string, { dx: number; dy: number }>>({});
  const dialogDragRef = useRef<
    | {
        id: string;
        pointerId: number;
        startX: number;
        startY: number;
        baseX: number;
        baseY: number;
        minDx: number;
        maxDx: number;
        minDy: number;
        maxDy: number;
      }
    | null
  >(null);

  const onDialogTitlePointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const dialogEl = target.closest(".w98-error-dialog") as HTMLElement | null;
    const stage = stageRef.current;
    if (!dialogEl || !stage) return;
    target.setPointerCapture(e.pointerId);
    target.classList.add("dragging");
    bringDialogToFront(id);
    const cur = dialogDrag[id] ?? { dx: 0, dy: 0 };
    // Measure where the dialog currently sits relative to the stage so we
    // can compute how far dx/dy may travel before any edge leaves bounds.
    const dRect = dialogEl.getBoundingClientRect();
    const sRect = stage.getBoundingClientRect();
    const curLeft = dRect.left - sRect.left;
    const curTop = dRect.top - sRect.top;
    dialogDragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: cur.dx,
      baseY: cur.dy,
      minDx: cur.dx - curLeft,
      maxDx: cur.dx + (sRect.width - curLeft - dRect.width),
      minDy: cur.dy - curTop,
      maxDy: cur.dy + (sRect.height - curTop - dRect.height),
    };
  };
  const onDialogTitlePointerMove = (e: React.PointerEvent) => {
    const d = dialogDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    let dx = d.baseX + (e.clientX - d.startX);
    let dy = d.baseY + (e.clientY - d.startY);
    dx = Math.max(d.minDx, Math.min(d.maxDx, dx));
    dy = Math.max(d.minDy, Math.min(d.maxDy, dy));
    setDialogDrag((prev) => ({ ...prev, [d.id]: { dx, dy } }));
  };
  const onDialogTitlePointerUp = (e: React.PointerEvent) => {
    const d = dialogDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    dialogDragRef.current = null;
  };

  const renderDialog = (opts: {
    id: string;
    title: string;
    msg: ReactNode;
    cta?: string;
    variant?: "alert" | "critical" | "final";
    offset?: { x: number; y: number };
    animationDelay?: number;
  }) => {
    const { id, title, msg, cta = "Install", variant = "alert", offset, animationDelay } = opts;
    const drag = dialogDrag[id] ?? { dx: 0, dy: 0 };
    const baseX = offset?.x ?? 0;
    const baseY = offset?.y ?? 0;
    const z = dialogOrder.indexOf(id);
    const style: React.CSSProperties = {
      transform: `translate(calc(-50% + ${baseX + drag.dx}px), calc(-50% + ${baseY + drag.dy}px))`,
      zIndex: 10 + (z < 0 ? 0 : z),
    };
    if (animationDelay !== undefined) style.animationDelay = `${animationDelay}ms`;
    return (
      <div
        key={id}
        className={`w98-window w98-error-dialog w98-error-dialog--${variant}`}
        role="alertdialog"
        style={style}
        onPointerDown={() => bringDialogToFront(id)}
      >
        <div
          className="w98-titlebar"
          onPointerDown={onDialogTitlePointerDown(id)}
          onPointerMove={onDialogTitlePointerMove}
          onPointerUp={onDialogTitlePointerUp}
          onPointerCancel={onDialogTitlePointerUp}
        >
          <span className="w98-titlebar-text">{title}</span>
          <div className="w98-titlebar-controls">
            <button
              className="w98-titlebar-btn"
              tabIndex={-1}
              onClick={() => dismissOne(id)}
            >×</button>
          </div>
        </div>
        <div className="w98-error-body">
          <div className="w98-error-icon" aria-hidden="true">✕</div>
          <p className="w98-scope w98-error-msg">{msg}</p>
        </div>
        <div className="w98-error-actions">
          <a
            className="w98-error-btn w98-error-btn--primary"
            href="#install"
            onClick={dismissAll}
          >
            {cta}
          </a>
          <button
            type="button"
            className={`w98-error-btn${chaseActive ? " w98-error-btn--chase" : ""}`}
            style={chaseActive && cancelOffsets[id]
              ? { transform: `translate(${cancelOffsets[id].dx}px, ${cancelOffsets[id].dy}px)` }
              : undefined}
            onPointerEnter={(e) => shuffleCancel(id, e.currentTarget)}
            // In chase mode fire on pointerDown — the button jumps between
            // press and release so a plain click never completes. Outside
            // chase mode stick to the normal click-on-release behaviour.
            onPointerDown={chaseActive ? (() => dismissOne(id)) : undefined}
            onClick={chaseActive ? undefined : (() => dismissOne(id))}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const isHidden = (id: string) => dismissedIds.has(id);

  const errorDialog = phase === "first" ? (
    <div className="w98-error-backdrop" role="presentation">
      {!isHidden("first") && renderDialog({
        id: "first",
        title: "autlas.exe — Error",
        msg: (<>Your scripts are a mess.<br />Install <b>autlas</b> to fix it.</>),
      })}
    </div>
  ) : phase === "wave" ? (
    <div className="w98-error-backdrop w98-error-backdrop--wave" role="presentation">
      {!isHidden("wave-1") && renderDialog({
        id: "wave-1",
        title: "autlas.exe — Error",
        msg: (<>Required component missing: <b>autlas</b>.<br />Install now.</>),
        offset: { x: -72, y: -48 },
      })}
      {!isHidden("wave-2") && renderDialog({
        id: "wave-2",
        title: "autlas.exe — Critical",
        msg: (<>The operation cannot be completed without <b>autlas</b>.</>),
        variant: "critical",
        offset: { x: 64, y: 24 },
      })}
      {!isHidden("wave-3") && renderDialog({
        id: "wave-3",
        title: "autlas.exe — STOP 0x000000E1",
        msg: (<>Script chaos detected.<br />Recommended action: install <b>autlas</b>.</>),
        variant: "final",
        offset: { x: -24, y: 72 },
      })}
    </div>
  ) : (phase === "storm" || phase === "ultimatum") ? (
    <div
      className="w98-error-backdrop w98-error-backdrop--storm"
      role="presentation"
    >
      {stormDialogs.filter((d) => !isHidden(d.id)).map((d) =>
        renderDialog({
          id: d.id,
          title: d.title,
          msg: d.msg,
          variant: d.variant,
          offset: d.offset,
          animationDelay: d.delay,
        }),
      )}
      {phase === "ultimatum" && <div className="w98-ultimatum-veil" aria-hidden="true" />}
      {phase === "ultimatum" && (
        <div
          className="w98-window w98-error-dialog w98-error-dialog--final"
          role="alertdialog"
          style={{
            transform: `translate(calc(-50% + ${dialogDrag["ultimatum"]?.dx ?? 0}px), calc(-50% + ${dialogDrag["ultimatum"]?.dy ?? 0}px))`,
            // Force the final notice above any remaining storm dialogs.
            zIndex: 1000,
          }}
          onPointerDown={() => bringDialogToFront("ultimatum")}
        >
          <div
            className="w98-titlebar"
            onPointerDown={onDialogTitlePointerDown("ultimatum")}
            onPointerMove={onDialogTitlePointerMove}
            onPointerUp={onDialogTitlePointerUp}
            onPointerCancel={onDialogTitlePointerUp}
          >
            <span className="w98-titlebar-text">autlas.exe — Final Notice</span>
            <div className="w98-titlebar-controls">
              <button className="w98-titlebar-btn" tabIndex={-1} onClick={dismissAll}>×</button>
            </div>
          </div>
          <div className="w98-error-body">
            <div className="w98-error-icon" aria-hidden="true">✕</div>
            <p className="w98-scope w98-error-msg">Just. Install. It.</p>
          </div>
          <div className="w98-error-actions">
            <a className="w98-error-btn w98-error-btn--primary" href="#install" onClick={dismissAll}>Install</a>
            <a className="w98-error-btn w98-error-btn--primary" href="#install" onClick={dismissAll}>Install</a>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`w98-scope${visible ? " is-visible" : ""}`}>
      <div
        className="w98-stage"
        ref={stageRef}
        style={{ backgroundImage: `url(${asset("assets/w98/hill.jpg")})` }}
      >
        {WINDOWS.map((w) => {
          const z = order.indexOf(w.id) + 1;
          const pos = positions[w.id] ?? { x: 0, y: 0 };
          const width = widths[w.id] ?? 0;
          const isActive = activeId === w.id;
          return (
            <div
              key={w.id}
              className="w98-window"
              data-win-id={w.id}
              data-reveal={WINDOWS.findIndex((x) => x.id === w.id)}
              data-active={isActive}
              style={{
                left: pos.x,
                top: pos.y,
                width,
                zIndex: z,
              }}
              onPointerDown={() => bringToFront(w.id)}
            >
              <div
                className="w98-titlebar"
                onPointerDown={onTitleBarPointerDown(w.id)}
                onPointerMove={onTitleBarPointerMove}
                onPointerUp={onTitleBarPointerUp}
                onPointerCancel={onTitleBarPointerUp}
              >
                <span className="w98-titlebar-text">{w.title}</span>
                <div className="w98-titlebar-controls">
                  <button className="w98-titlebar-btn" tabIndex={-1}>_</button>
                  <button className="w98-titlebar-btn" tabIndex={-1}>□</button>
                  <button className="w98-titlebar-btn" tabIndex={-1}>×</button>
                </div>
              </div>
              <div className="w98-menu">
                <span><u>F</u>ile</span>
                <span><u>E</u>dit</span>
                <span><u>V</u>iew</span>
                <span><u>H</u>elp</span>
              </div>
              <div className="w98-address">
                <span className="w98-address-label">Address</span>
                <div className="w98-address-input">
                  <img src={asset("assets/w98/folder.png")} alt="" className="w98-pixel-icon" />
                  <span>{w.path}</span>
                </div>
              </div>
              <div className="w98-listview">
                <table>
                  <thead>
                    <tr>
                      {([
                        { col: "name" as SortCol, label: "Name", width: "48%" },
                        { col: "size" as SortCol, label: "Size", width: "16%" },
                        { col: "type" as SortCol, label: "Type", width: "22%" },
                        { col: "date" as SortCol, label: "Modified", width: "14%" },
                      ]).map((h) => {
                        const s = sorts[w.id];
                        const active = s?.col === h.col;
                        const indicator = active ? (s.dir === "asc" ? " ▲" : " ▼") : "";
                        return (
                          <th
                            key={h.col}
                            style={{ width: h.width, cursor: "pointer" }}
                            onClick={() => cycleSort(w.id, h.col)}
                          >
                            {h.label}{indicator}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(w.rows, sorts[w.id]).map((row) => (
                      <tr key={row.name}>
                        <td>
                          <div className="w98-file-cell">
                            {row.ahk
                              ? <img src={asset("assets/ahk/logo.png")} alt="" />
                              : (row.name.endsWith(".txt") || row.name.endsWith(".pdf") || row.name.endsWith(".zip") || row.name.endsWith(".exe") || row.name.endsWith(".png") || row.name.endsWith(".ini"))
                                ? <span className="w98-generic-doc" />
                                : <img src={asset("assets/w98/folder.png")} alt="" className="w98-pixel-icon" />}
                            <span>{row.name}</span>
                          </div>
                        </td>
                        <td>{row.size}</td>
                        <td>{row.type}</td>
                        <td>{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="w98-taskbar">
          <button
            ref={startBtnRef}
            type="button"
            className="w98-start"
            data-active={startOpen}
            onClick={() => setStartOpen((v) => !v)}
          >
            <img src={asset("assets/w98/logo.png")} alt="" className="w98-start-logo" />
            Start
          </button>
          {startOpen && (
            <div ref={startMenuRef} className="w98-start-menu" role="menu">
              <div className="w98-start-menu-side">
                <span>
                  <b>autlas</b>98
                </span>
              </div>
              <div className="w98-start-menu-items">
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">📂</span>
                  <span><u>P</u>rograms</span>
                  <span className="w98-start-menu-chev">▶</span>
                </button>
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">📄</span>
                  <span><u>D</u>ocuments</span>
                  <span className="w98-start-menu-chev">▶</span>
                </button>
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">⚙</span>
                  <span><u>S</u>ettings</span>
                  <span className="w98-start-menu-chev">▶</span>
                </button>
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">🔍</span>
                  <span><u>F</u>ind</span>
                  <span className="w98-start-menu-chev">▶</span>
                </button>
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">❓</span>
                  <span><u>H</u>elp</span>
                </button>
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">▶</span>
                  <span><u>R</u>un…</span>
                </button>
                <div className="w98-start-menu-sep" />
                <a
                  className="w98-start-menu-item w98-start-menu-item--featured"
                  href="#install"
                  onClick={() => setStartOpen(false)}
                >
                  <img
                    src={asset("assets/ahk/logo.png")}
                    alt=""
                    className="w98-start-menu-icon-img"
                  />
                  <span>Download <b>autlas</b></span>
                </a>
                <div className="w98-start-menu-sep" />
                <button type="button" className="w98-start-menu-item">
                  <span className="w98-start-menu-icon">⏻</span>
                  <span>Sh<u>u</u>t Down…</span>
                </button>
              </div>
            </div>
          )}
          <div className="w98-taskbar-divider" />
          <div className="w98-taskbar-tasks">
            {taskbarTasks.map((t) => (
              <button
                type="button"
                className="w98-task"
                data-active={activeId === t.id}
                key={t.id}
                onClick={() => bringToFront(t.id)}
              >
                <img src={t.icon} alt="" className="w98-pixel-icon" />
                <span>{t.title}</span>
              </button>
            ))}
          </div>
          <div className="w98-tray">
            <button
              type="button"
              className="w98-tray-chevron"
              aria-label={trayOpen ? "Hide icons" : "Show hidden icons"}
              aria-expanded={trayOpen}
              onClick={() => setTrayOpen((v) => !v)}
            >
              {trayOpen ? "∨" : "∧"}
            </button>
            <span className="w98-tray-clock">{clock}</span>
            {trayOpen && (
              <div className="w98-tray-popup" role="menu">
                {trayPopupIcons.map((it, i) => (
                  <span key={i} className="w98-tray-popup-item" data-tip={it.tip}>
                    <img src={it.src} alt="" />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {errorDialog}
      </div>
    </div>
  );
}
