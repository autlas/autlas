import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./w98-scene.css";

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
  /** Fractional size of stage; height is column-count-ish. */
  size: { w: number; h: number };
  rows: FileRow[];
};

const WINDOWS: Win[] = [
  {
    id: "desktop",
    title: "Desktop",
    path: "C:\\Users\\Max\\Desktop",
    start: { x: 0.02, y: 0.04 },
    size: { w: 0.46, h: 0.55 },
    rows: [
      { name: "clipboard_v2.ahk", size: "2 KB", type: "AutoHotkey Script", date: "14.03.2024", ahk: true },
      { name: "WindowSnap_FINAL.ahk", size: "8 KB", type: "AutoHotkey Script", date: "02.09.2024", ahk: true },
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
    size: { w: 0.46, h: 0.48 },
    rows: [
      { name: "hotkeys.ahk", size: "3 KB", type: "AutoHotkey Script", date: "11.01.2025", ahk: true },
      { name: "old_macro.ahk", size: "12 KB", type: "AutoHotkey Script", date: "03.08.2022", ahk: true },
      { name: "test.ahk", size: "1 KB", type: "AutoHotkey Script", date: "27.02.2024", ahk: true },
      { name: "CapsToEsc.ahk", size: "410 B", type: "AutoHotkey Script", date: "15.05.2023", ahk: true },
      { name: "QuickLauncher.ahk", size: "12 KB", type: "AutoHotkey Script", date: "30.10.2024", ahk: true },
    ],
  },
  {
    id: "downloads",
    title: "Downloads",
    path: "C:\\Users\\Max\\Downloads",
    start: { x: 0.52, y: 0.04 },
    size: { w: 0.46, h: 0.52 },
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
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [order, setOrder] = useState<string[]>(["desktop", "downloads", "tools"]);
  const [activeId, setActiveId] = useState<string>("tools");

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

  // Initialize positions/sizes the first time we have real stage dimensions,
  // or when stage size changes and windows would overflow.
  useEffect(() => {
    if (stageSize.w === 0) return;
    setPositions((prev) => {
      const next = { ...prev };
      for (const w of WINDOWS) {
        if (!(w.id in next)) {
          next[w.id] = {
            x: Math.round(w.start.x * stageSize.w),
            y: Math.round(w.start.y * stageSize.h),
          };
        }
      }
      return next;
    });
    setSizes(() => {
      const next: Record<string, { w: number; h: number }> = {};
      for (const w of WINDOWS) {
        next[w.id] = {
          w: Math.round(w.size.w * stageSize.w),
          h: Math.round(w.size.h * stageSize.h),
        };
      }
      return next;
    });
  }, [stageSize.w, stageSize.h]);

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
    const sz = sizes[d.id];
    if (!sz) return;
    let x = (e.clientX - stageRect.left) - d.offsetX;
    let y = (e.clientY - stageRect.top) - d.offsetY;
    // Clamp inside stage (leave room for the taskbar at the bottom).
    const maxX = stageSize.w - sz.w;
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

  const trayCount = 11;

  const taskbarTasks = useMemo(
    () => [
      { title: "Desktop", icon: "/assets/win98folder.png" },
      { title: "ahk", icon: "/assets/win98folder.png" },
      { title: "Downloads", icon: "/assets/win98folder.png" },
    ],
    [],
  );

  return (
    <div className={`w98-scope${visible ? " is-visible" : ""}`}>
      <div className="w98-stage" ref={stageRef}>
        {WINDOWS.map((w) => {
          const z = order.indexOf(w.id) + 1;
          const pos = positions[w.id] ?? { x: 0, y: 0 };
          const sz = sizes[w.id] ?? { w: 0, h: 0 };
          const isActive = activeId === w.id;
          return (
            <div
              key={w.id}
              className="w98-window"
              data-reveal={WINDOWS.findIndex((x) => x.id === w.id)}
              data-active={isActive}
              style={{
                left: pos.x,
                top: pos.y,
                width: sz.w,
                height: sz.h,
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
                  <img src="/assets/win98folder.png" alt="" className="w98-pixel-icon" />
                  <span>{w.path}</span>
                </div>
              </div>
              <div className="w98-listview">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "48%" }}>Name</th>
                      <th style={{ width: "16%" }}>Size</th>
                      <th style={{ width: "22%" }}>Type</th>
                      <th style={{ width: "14%" }}>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.rows.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <div className="w98-file-cell">
                            {row.ahk
                              ? <img src="/assets/autohotkeyLogo.png" alt="" />
                              : (row.name.endsWith(".txt") || row.name.endsWith(".pdf") || row.name.endsWith(".zip") || row.name.endsWith(".exe") || row.name.endsWith(".png"))
                                ? <span className="w98-generic-doc" />
                                : <img src="/assets/win98folder.png" alt="" className="w98-pixel-icon" />}
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
          <div className="w98-start">
            <img src="/assets/win98logo.png" alt="" className="w98-start-logo" />
            Start
          </div>
          <div className="w98-taskbar-divider" />
          <div className="w98-taskbar-tasks">
            {taskbarTasks.map((t, i) => (
              <div className="w98-task" key={i}>
                <img src={t.icon} alt="" className="w98-pixel-icon" />
                <span>{t.title}</span>
              </div>
            ))}
          </div>
          <div className="w98-tray">
            <div className="w98-tray-chevron" aria-label="Show hidden icons">∧</div>
            <span className="w98-tray-clock">4:20 PM</span>
            <div className="w98-tray-popup" role="menu">
              {Array.from({ length: trayCount }).map((_, i) => (
                <img key={i} src="/assets/autohotkeyLogo.png" alt="" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
