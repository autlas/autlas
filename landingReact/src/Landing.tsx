import { useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import "./landing.css";
import "./landing-tokens-freeze.css";
import AutlasFrame from "./AutlasFrame";
import BackgroundShader from "./BackgroundShader";

export default function Landing() {
  useEffect(() => {
    document.body.dataset.variant = "experimental";
    const copyBtns = document.querySelectorAll<HTMLElement>(".copy, .winget .copy");
    const handlers: Array<() => void> = [];
    copyBtns.forEach((btn) => {
      const onClick = async (e: Event) => {
        e.preventDefault();
        const row = btn.closest(".snippet, .winget");
        const codeEl = row ? row.querySelector("code, span:nth-child(2)") : null;
        const txt = codeEl?.textContent?.trim() ?? "";
        try { await navigator.clipboard.writeText(txt); } catch { /* noop */ }
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg class="i" viewBox="0 0 24 24" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1200);
      };
      btn.addEventListener("click", onClick);
      handlers.push(() => btn.removeEventListener("click", onClick));
    });
    return () => { handlers.forEach((fn) => fn()); };
  }, []);

  // Hero rhythm. Keep top/bottom padding around the hero-copy block
  // symmetric, solve for the autlas tile to peek in by APP_REVEAL px
  // below the fold. Clamp to MIN_P; if we can't satisfy that, center
  // the copy in the remaining viewport and push the app out of the
  // first screen entirely. Exposed as --hero-p on .landing-root; the
  // CSS picks it up for .hero padding and .hero-grid gap.
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing-root");
    if (!root) return;

    const APP_REVEAL = 150;
    const MIN_P = 80;
    // When we can't satisfy APP_REVEAL and fall back to hiding autlas
    // below the fold, push it a little further past the fold so the
    // tilt (up to TILT_CAP_DEG) can't poke the top edge back into view.
    const FALLBACK_SAFETY = 50;

    const update = () => {
      const copy = document.querySelector<HTMLElement>(".hero-copy");
      const nav  = document.querySelector<HTMLElement>(".nav-wrap-portaled");
      if (!copy) return;
      const H = window.innerHeight;
      const N = nav?.offsetHeight ?? 0;
      // Measure natural content height without whatever padding CSS
      // currently reports (we may have set it on a previous pass).
      const prevPT = copy.style.paddingTop;
      const prevPB = copy.style.paddingBottom;
      copy.style.paddingTop = "0px";
      copy.style.paddingBottom = "0px";
      const C = copy.offsetHeight;
      copy.style.paddingTop = prevPT;
      copy.style.paddingBottom = prevPB;

      const idealP = (H - N - C - APP_REVEAL) / 2;
      const inNormal = idealP >= MIN_P;
      // Symmetric visible padding around hero-copy. Keep hero-copy
      // centered in the viewport (nav-excluded) in the fallback.
      const P = inNormal ? idealP : Math.max(MIN_P, (H - N - C) / 2);
      // Gap from hero-copy to autlas = P normally. In the fallback
      // we only inflate THIS (not P) so the tile slides down off-screen
      // by FALLBACK_SAFETY without dragging hero-copy along with it.
      const gap = inNormal ? P : P + FALLBACK_SAFETY;
      root.style.setProperty("--hero-p", `${Math.round(P)}px`);
      root.style.setProperty("--hero-gap", `${Math.round(gap)}px`);
      root.style.setProperty("--nav-h", `${Math.round(N)}px`);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    const copy = document.querySelector<HTMLElement>(".hero-copy");
    if (copy) ro.observe(copy);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  // Scroll-triggered dim overlay. Fade from 0 → SCROLL_DIM_MAX between
  // SCROLL_DIM_START and SCROLL_DIM_END (fractions of viewport height).
  useEffect(() => {
    const dim = document.querySelector<HTMLElement>(".scroll-dim");
    if (!dim) return;
    const SCROLL_DIM_START = 0.2;
    const SCROLL_DIM_END = 1.0;
    const SCROLL_DIM_MAX = 0.3;
    let raf = 0;
    const update = () => {
      raf = 0;
      const H = window.innerHeight;
      const y = window.scrollY;
      const start = SCROLL_DIM_START * H;
      const end = SCROLL_DIM_END * H;
      const t = Math.max(0, Math.min(1, (y - start) / (end - start)));
      dim.style.opacity = String(t * SCROLL_DIM_MAX);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
<div className="landing-root" data-variant="experimental">
<BackgroundShader />
<div className="intro-dim" aria-hidden="true" />
<div className="scroll-dim" aria-hidden="true" />
<div className="page">
  <div className="shell">

    {/* ================= NAV ================= */}
    {createPortal(
    <div className="landing-root nav-portal-root" data-variant="experimental">
    <div className="nav-wrap nav-wrap-portaled">
      <nav className="nav" aria-label="Primary">
        <a href="#" className="nav-logo">
          <img src="/assets/logo.png" alt="" className="brand" />
          autlas
          <span className="ver">v0.1.0</span>
        </a>
        <ul>
          <li><a href="#problem">Why</a></li>
          <li><a href="#vim">Vim</a></li>
          <li><a href="#install">Install</a></li>
          <li><a href="#faq">FAQ</a></li>
          <li><a href="#">Docs</a></li>
        </ul>
        <div className="nav-actions">
          <a href="#" className="btn btn-outline btn-sm">
            <svg className="i" viewBox="0 0 24 24"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.33.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.3-.51-1.47.11-3.07 0 0 .96-.31 3.16 1.18a11 11 0 016.16 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.6.23 2.78.11 3.07.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.13v3.15c0 .31.21.67.8.56A11.5 11.5 0 0023.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
            Star
          </a>
          <a href="#install" className="btn btn-primary btn-sm">
            <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>
            Download
          </a>
        </div>
      </nav>
    </div>
    </div>,
    document.body,
    )}

    {/* ================= HERO ================= */}
    <section className="hero" id="hero">
      <div className="hero-grid">
        <div className="hero-copy">
          <h1 className="h1">
            <span className="hero-rise" style={{ animationDelay: "100ms" }}>One hub</span>
            <span className="hero-rise" style={{ animationDelay: "160ms" }}>for all your</span>
            <span className="hero-rise" style={{ animationDelay: "220ms" }}><span className="brand-grad">AutoHotkey</span></span>
            <span className="hero-rise" style={{ animationDelay: "280ms" }}>scripts.</span>
          </h1>
          <p className="lead">
            <span className="hero-rise" style={{ animationDelay: "340ms" }}>Discover, tag, run, and monitor hundreds of yours .ahk scripts —</span>
            <span className="hero-rise" style={{ animationDelay: "400ms" }}>without ever opening Explorer or Task Manager.</span>
          </p>
          <div className="hero-cta">
            <a href="#install" className="btn btn-primary btn-lg hero-rise" style={{ animationDelay: "460ms" }}>
              <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>
              Download for Windows
            </a>
            <a href="#" className="btn btn-ghost btn-lg hero-rise" style={{ animationDelay: "520ms" }}>
              <svg className="i" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Star on GitHub
            </a>
          </div>
          <div className="winget hero-rise" style={{ animationDelay: "580ms" }}>
            <span className="prompt">$</span>
            <span>winget install autlas</span>
            <button className="copy" aria-label="Copy install command">
              <svg className="i" viewBox="0 0 24 24" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              copy
            </button>
          </div>
        </div>

        {/* ============ HERO ART: HUB + TRAY ============ */}
        <div className="hero-art">
          <div className="hub-frame">
            <AutlasFrame />
            {/* --- mock preserved below; TODO: delete once LiveHub is stable --- */}
            {false && (<>
            <div className="win" role="img" aria-label="autlas hub view screenshot">
              <div className="win-top">
                <div className="win-dots"><span></span><span></span><span></span></div>
                <div className="win-title">autlas — hub <span className="kbd-inline">· 47 scripts · 9 running</span></div>
                <span className="kbd" style={{marginLeft: "auto"}}>⌘</span><span className="kbd">K</span>
              </div>
              <div className="hub">
                <aside className="sidebar">
                  <div className="side-label">Tags</div>
                  <div className="side-item active" style={{color: "#c7d2fe"}}><span className="dot" style={{background: "#818cf8"}}></span> All scripts <span className="count">47</span></div>
                  <div className="side-item" style={{color: "#fbbf24"}}><span className="dot" style={{background: "#fbbf24"}}></span> gaming <span className="count">12</span></div>
                  <div className="side-item" style={{color: "#86efac"}}><span className="dot" style={{background: "#86efac"}}></span> productivity <span className="count">18</span></div>
                  <div className="side-item" style={{color: "#93c5fd"}}><span className="dot" style={{background: "#93c5fd"}}></span> window-mgmt <span className="count">6</span></div>
                  <div className="side-item" style={{color: "#f472b6"}}><span className="dot" style={{background: "#f472b6"}}></span> macros <span className="count">8</span></div>
                  <div className="side-item" style={{color: "#fb923c"}}><span className="dot" style={{background: "#fb923c"}}></span> dev <span className="count">3</span></div>
                  <div className="side-label" style={{marginTop: "12px"}}>View</div>
                  <div className="side-item">Hub <span className="count mono">⇧H</span></div>
                  <div className="side-item">Tree <span className="count mono">⇧T</span></div>
                </aside>
                <div className="hub-main">
                  <div className="hub-toolbar">
                    <div className="search">
                      <span className="slash">/</span>
                      <input defaultValue="clipboard" readOnly />
                      <span className="kbd">esc</span>
                    </div>
                    <div className="toggle-group">
                      <button className="on">Hub</button>
                      <button>Grid</button>
                      <button>Tree</button>
                    </div>
                  </div>
                  <div className="hub-grid">
                    {/* card 1: running */}
                    <div className="card">
                      <div className="card-head">
                        <div className="card-title">ClipboardHistory</div>
                        <div className="status run"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">productivity</span>
                        <span className="tag">clip</span>
                        <span className="tag-count">+2</span>
                      </div>
                      <div className="card-actions">
                        <button className="act restart" title="restart">
                          <svg className="i" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                        </button>
                        <button className="act kill" title="kill">
                          <svg className="i" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* card 2: focused (vim) */}
                    <div className="card focused">
                      <div className="card-head">
                        <div className="card-title">WindowSnap</div>
                        <div className="status"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">window-mgmt</span>
                        <span className="tag">tiling</span>
                      </div>
                      <div className="card-actions">
                        <button className="act" style={{flex: "1", background: "rgba(34,197,94,0.12)", color: "#86efac", borderColor: "rgba(34,197,94,0.3)"}}>
                          <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* card 3: running pending */}
                    <div className="card">
                      <div className="card-head">
                        <div className="card-title">AltDragWin</div>
                        <div className="status run"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">window-mgmt</span>
                        <span className="tag">mouse</span>
                      </div>
                      <div className="card-actions">
                        <button className="act">
                          <svg className="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>
                        </button>
                        <button className="act restart">
                          <svg className="i" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                        </button>
                        <button className="act kill">
                          <svg className="i" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* card 4 */}
                    <div className="card">
                      <div className="card-head">
                        <div className="card-title">CapsToEsc</div>
                        <div className="status run"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">vim</span>
                        <span className="tag">keyboard</span>
                      </div>
                      <div className="card-actions">
                        <button className="act restart">
                          <svg className="i" viewBox="0 0 24 24"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                        </button>
                        <button className="act kill">
                          <svg className="i" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* card 5 */}
                    <div className="card">
                      <div className="card-head">
                        <div className="card-title">CSGO-Crosshair</div>
                        <div className="status"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">gaming</span>
                        <span className="tag-count">+3</span>
                      </div>
                      <div className="card-actions">
                        <button className="act" style={{flex: "1"}}>
                          <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* card 6: pending */}
                    <div className="card">
                      <div className="card-head">
                        <div className="card-title">QuickLauncher</div>
                        <div className="status pend"></div>
                      </div>
                      <div className="tags">
                        <span className="tag">productivity</span>
                        <span className="tag">launcher</span>
                      </div>
                      <div className="card-actions">
                        <button className="act" style={{flex: "1", background: "rgba(234,179,8,0.12)", color: "var(--warning)", borderColor: "rgba(234,179,8,0.3)"}}>
                          igniting…
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </>)}
          </div>

          {/* floating tray popup */}
          <div className="tray-pop" aria-hidden="true">
            <div className="win">
              <div className="win-top">
                <div className="win-dots"><span></span><span></span><span></span></div>
                <div className="win-title">tray · running</div>
              </div>
              <div className="tray-list">
                <div className="tray-row"><span className="dot" style={{width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px rgba(34,197,94,0.7)"}}></span><span className="nm">ClipboardHistory</span><span className="hk">⇧⌃V</span></div>
                <div className="tray-row"><span className="dot" style={{width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px rgba(34,197,94,0.7)"}}></span><span className="nm">AltDragWin</span><span className="hk">alt-⇄</span></div>
                <div className="tray-row"><span className="dot" style={{width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 8px rgba(34,197,94,0.7)"}}></span><span className="nm">CapsToEsc</span><span className="hk">⇪</span></div>
                <div className="tray-divider"></div>
                <div className="tray-row" style={{color: "var(--text-tertiary)"}}><span className="nm" style={{color: "var(--text-tertiary)"}}>kill all · restart all</span><span className="hk">⇧Q</span></div>
                <div className="tray-row" style={{color: "var(--text-tertiary)"}}><span className="nm" style={{color: "var(--text-tertiary)"}}>open autlas</span><span className="hk">⌘↵</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ================= PROBLEM / SOLUTION ================= */}
    <section id="problem">
      <div className="section-head">
        <div className="eyebrow"><span className="bar"></span>WHY AUTLAS</div>
        <h2 className="h2">Running 47 .ahk scripts <span style={{color: "var(--text-tertiary)"}}>without autlas</span> is chaos.</h2>
      </div>
      <div className="ps-grid">
        {/* problem */}
        <div className="ps-card problem">
          <h3 style={{color: "#fca5a5"}}>Before</h3>
          <p>Double-click from Explorer. Forget what's running. Kill through Task Manager. Encode tags into filenames. Lose them on rename. Repeat.</p>
          <div className="chaos">
            <div className="chaos-line"><span className="x">✕</span> scripts scattered across 7 folders <span className="arr">→</span></div>
            <div className="chaos-line"><span className="x">✕</span> no way to see what's running <span className="arr">→</span></div>
            <div className="chaos-line"><span className="x">✕</span> kill via Task Manager <span className="arr">→</span></div>
            <div className="chaos-line"><span className="x">✕</span> tags encoded as <span className="mono" style={{opacity: "0.75"}}>_gaming_v2_final.ahk</span></div>
            <div className="chaos-line"><span className="x">✕</span> rename file → tags lost <span className="arr">→</span></div>
          </div>
        </div>
        {/* solution */}
        <div className="ps-card">
          <h3>autlas centralizes everything.</h3>
          <p>Everything in one window. Tags live in a local SQLite, bound to a stable ID — they survive renames and moves. A 1.5s watcher keeps status in sync without Task Manager.</p>
          <div className="rows" aria-label="autlas script rows">
            <div className="row vim-focus">
              <span className="dot run"></span>
              <span className="nm">ClipboardHistory</span>
              <span className="row-tag">productivity</span>
              <span className="row-tag">clip</span>
              <span className="right"><span className="size">2.1 KB</span></span>
            </div>
            <div className="row">
              <span className="dot run"></span>
              <span className="nm">WindowSnap</span>
              <span className="row-tag">window-mgmt</span>
              <span className="right"><span className="size">8.4 KB</span></span>
            </div>
            <div className="row">
              <span className="dot"></span>
              <span className="nm">CSGO-Crosshair</span>
              <span className="row-tag">gaming</span>
              <span className="right"><span className="size">640 B</span></span>
            </div>
            <div className="row">
              <span className="dot run"></span>
              <span className="nm">AltDragWin</span>
              <span className="row-tag">window-mgmt</span>
              <span className="row-tag">mouse</span>
              <span className="right"><span className="size">4.7 KB</span></span>
            </div>
            <div className="row">
              <span className="dot"></span>
              <span className="nm">QuickLauncher</span>
              <span className="row-tag">launcher</span>
              <span className="right"><span className="size">12 KB</span></span>
            </div>
            <div className="row">
              <span className="dot run"></span>
              <span className="nm">CapsToEsc</span>
              <span className="row-tag">vim</span>
              <span className="row-tag">keyboard</span>
              <span className="right"><span className="size">410 B</span></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ================= POWER-USER / VIM ================= */}
    <section id="vim">
      <div className="section-head">
        <div className="eyebrow"><span className="bar"></span>FOR POWER USERS</div>
        <h2 className="h2">Built keyboard-first.</h2>
        <p className="lead" style={{marginTop: "14px"}}>Every action has a key. <span className="mono" style={{color: "var(--text-primary)"}}>hjkl</span> to navigate, <span className="mono" style={{color: "var(--text-primary)"}}>/</span> to search, <span className="mono" style={{color: "var(--text-primary)"}}>Enter</span> to run. Arrow keys and mouse still work — but you won't need them.</p>
      </div>
      <div className="vim-grid">
        <div className="bind-panel">
          <h4>BINDINGS</h4>
          <div className="bind-list">
            <div className="bind"><div className="keys"><span className="kbd">j</span><span className="kbd">k</span></div><div className="desc">move focus down / up</div></div>
            <div className="bind"><div className="keys"><span className="kbd">h</span><span className="kbd">l</span></div><div className="desc">collapse / expand folder</div></div>
            <div className="bind"><div className="keys"><span className="kbd">g</span><span className="kbd">g</span></div><div className="desc">jump to top <span className="mu">·</span> <span className="kbd">G</span> to bottom</div></div>
            <div className="bind"><div className="keys"><span className="kbd">/</span></div><div className="desc">search scripts, tags, paths</div></div>
            <div className="bind"><div className="keys"><span className="kbd">↵</span></div><div className="desc">run <span className="mu">·</span> if running → kill</div></div>
            <div className="bind"><div className="keys"><span className="kbd">r</span></div><div className="desc">restart focused script</div></div>
            <div className="bind"><div className="keys"><span className="kbd">t</span></div><div className="desc">edit tags inline</div></div>
            <div className="bind"><div className="keys"><span className="kbd">i</span></div><div className="desc">show script UI</div></div>
            <div className="bind"><div className="keys"><span className="kbd">:</span></div><div className="desc">command palette</div></div>
            <div className="bind"><div className="keys"><span className="kbd">⇧</span><span className="kbd">Q</span></div><div className="desc">cycle Hub / Grid / Tree</div></div>
            <div className="bind"><div className="keys"><span className="kbd">Esc</span></div><div className="desc">leave vim mode</div></div>
          </div>
        </div>

        <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
          <div className="code">
            <div className="code-head">
              <div className="dots"><span></span><span></span><span></span></div>
              <span className="fname">~/.config/autlas/config.ini</span>
            </div>
<pre dangerouslySetInnerHTML={{__html: "<span class=\"cm\"># autlas config \u2014 Windows, MIT, v0.1.0</span>\n<span class=\"kw\">[scan]</span>\npaths        = <span class=\"str\">\"D:\\ahk\"</span>, <span class=\"str\">\"%USERPROFILE%\\scripts\"</span>\nuse_everything = <span class=\"num\">true</span>     <span class=\"cm\"># voidtools Everything IPC</span>\nwatcher_ms   = <span class=\"num\">1500</span>\n\n<span class=\"kw\">[runtime]</span>\nahk_v1 = <span class=\"str\">\"C:\\Program Files\\AutoHotkey\\AutoHotkey.exe\"</span>\nahk_v2 = <span class=\"str\">\"C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe\"</span>\ndetect = <span class=\"str\">\"file-header\"</span>   <span class=\"cm\"># v1/v2 auto-detect</span>\n\n<span class=\"kw\">[vim]</span>\nenabled = <span class=\"num\">true</span>\nleader  = <span class=\"str\">\" \"</span>"}} />
          </div>
          <div className="code">
            <div className="code-head">
              <div className="dots"><span></span><span></span><span></span></div>
              <span className="fname">src-tauri/src/watcher.rs</span>
            </div>
<pre dangerouslySetInnerHTML={{__html: "<span class=\"kw\">pub async fn</span> <span class=\"fn\">start_watcher</span>(app: AppHandle) -&gt; <span class=\"kw\">Result</span>&lt;()&gt; {\n  <span class=\"kw\">let</span> mut ticker = <span class=\"fn\">interval</span>(Duration::<span class=\"fn\">from_millis</span>(<span class=\"num\">1500</span>));\n<span class=\"hl\">  <span class=\"kw\">loop</span> {\n    ticker.<span class=\"fn\">tick</span>().<span class=\"kw\">await</span>;\n    <span class=\"kw\">let</span> running = <span class=\"fn\">snapshot_ahk_processes</span>()?;\n    <span class=\"fn\">emit_diff</span>(&amp;app, running).<span class=\"kw\">await</span>?;\n  }</span>\n}"}} />
          </div>
        </div>
      </div>
    </section>

    {/* ================= INSTALL ================= */}
    <section id="install">
      <div className="install-card">
        <div className="install-grid">
          <div>
            <div className="eyebrow" style={{marginBottom: "16px"}}><span className="bar"></span>GET AUTLAS</div>
            <h3>Install autlas</h3>
            <p className="sub">Windows 10 or 11. ~8 MB. No account, no telemetry, no network calls.</p>
            <a href="#" className="btn btn-primary btn-lg">
              <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>
              Download autlas-0.1.0.exe
            </a>
            <div className="install-meta">
              <span><strong>requires</strong> AutoHotkey v1.1+ or v2 (either works)</span>
              <span><strong>sha256</strong> 7c3a…e4f1 <a href="#" style={{color: "var(--accent-hover)"}}>· verify</a></span>
              <span><strong>source</strong> github.com/autlas/autlas · MIT</span>
            </div>
          </div>
          <div className="snippets">
            <div className="snippet">
              <span className="label">winget</span>
              <code>winget install autlas</code>
              <button className="copy"><svg className="i" viewBox="0 0 24 24" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            </div>
            <div className="snippet">
              <span className="label">scoop</span>
              <code>scoop install autlas</code>
              <button className="copy"><svg className="i" viewBox="0 0 24 24" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            </div>
            <div className="snippet">
              <span className="label">from&nbsp;source</span>
              <code>git clone github.com/autlas/autlas &amp;&amp; cargo tauri build</code>
              <button className="copy"><svg className="i" viewBox="0 0 24 24" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ================= FAQ ================= */}
    <section id="faq">
      <div className="section-head" style={{textAlign: "center", margin: "0 auto 40px"}}>
        <div className="eyebrow" style={{marginBottom: "14px"}}><span className="bar"></span>QUESTIONS</div>
        <h2 className="h2">Things people ask.</h2>
      </div>
      <div className="faq">
        <details open>
          <summary>Is it safe? Does it send anything to the network? <span className="caret">+</span></summary>
          <div className="ans">Fully open-source under MIT. Zero telemetry, zero analytics, no update pings. autlas works offline — it only talks to the filesystem, AHK processes, and (optionally) a local Everything IPC pipe.</div>
        </details>
        <details>
          <summary>Do I need AutoHotkey installed separately? <span className="caret">+</span></summary>
          <div className="ans">Yes. autlas is a hub, not a bundler — install AHK once (v1.1+, v2, or both) and autlas picks up the runtime automatically from file associations.</div>
        </details>
        <details>
          <summary>Does it work with AHK v1 <em>and</em> v2? <span className="caret">+</span></summary>
          <div className="ans">Both. autlas reads the first few lines of each script and routes to the matching interpreter. You can override per-script from the context menu.</div>
        </details>
        <details>
          <summary>Where do my tags live? <span className="caret">+</span></summary>
          <div className="ans">In a local SQLite DB under <span className="mono">%APPDATA%\autlas\db.sqlite</span>, keyed by a stable script ID — not the path. Rename or move a file and your tags stick.</div>
        </details>
        <details>
          <summary>Does it scan my whole disk? <span className="caret">+</span></summary>
          <div className="ans">Only the paths you add in Settings. If Everything is installed, scans of 10k+ files finish in under a second via its IPC pipe; otherwise an in-process walker does the job.</div>
        </details>
        <details>
          <summary>Can I use it without any Vim knowledge? <span className="caret">+</span></summary>
          <div className="ans">Yes — vim mode is opt-in. Mouse, arrow keys, and a normal context menu cover everything, same as a regular Windows app.</div>
        </details>
        <details>
          <summary>macOS or Linux? <span className="caret">+</span></summary>
          <div className="ans">Not yet. autlas is Windows-only because AutoHotkey itself is Windows-only. A cross-platform <em>script hub</em> (running plain shell/Python/Deno scripts) is on the roadmap.</div>
        </details>
      </div>
    </section>

    {/* ================= FINAL CTA ================= */}
    <section style={{paddingTop: "40px"}}>
      <div className="final">
        <div className="eyebrow" style={{justifyContent: "center", marginBottom: "18px"}}><span className="bar"></span>TAKE CONTROL</div>
        <h2 className="h2">Take control of your AutoHotkey scripts.</h2>
        <p>Free. Open-source. Windows-native. No account, no catch.</p>
        <div className="hero-cta">
          <a href="#" className="btn btn-primary btn-lg">
            <svg className="i" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg>
            Download for Windows
          </a>
          <a href="#" className="btn btn-ghost btn-lg">
            <svg className="i" viewBox="0 0 24 24"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.33.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.3-.51-1.47.11-3.07 0 0 .96-.31 3.16 1.18a11 11 0 016.16 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.6.23 2.78.11 3.07.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.13v3.15c0 .31.21.67.8.56A11.5 11.5 0 0023.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
            Star on GitHub
          </a>
        </div>
      </div>
    </section>

    {/* ================= FOOTER ================= */}
    <footer>
      <div className="foot">
        <div className="foot-left">
          <img src="/assets/logo.png" alt="" className="brand" />
          autlas v0.1.0 · MIT · © 2026
        </div>
        <div className="foot-links">
          <a href="#">GitHub</a>
          <a href="#">Releases</a>
          <a href="#">Issues</a>
          <a href="#">Docs</a>
          <a href="#">Built with Tauri + Rust</a>
        </div>
      </div>
    </footer>

  </div>
</div>
</div>
    </>
  );
}
