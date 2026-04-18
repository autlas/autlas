import { useMemo } from "react";
import "./hub-live.css";
import { actions, runningCount, tagCount, useHubStore, visibleScripts, type ViewMode } from "./mock/store";
import type { MockScript } from "./mock/data";

const TAG_COLORS = new Map<string, string>();

function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color, color }} />;
}

function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg className="i" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={2}>
      <path d={d} />
    </svg>
  );
}
const I = {
  play: <Icon d="M8 5v14l11-7z" fill />,
  restart: (
    <svg className="i" viewBox="0 0 24 24">
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  ),
  kill: <Icon d="M18 6L6 18M6 6l12 12" />,
  ui: (
    <svg className="i" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M3 9h18" />
    </svg>
  ),
  star: <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  starFill: <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill />,
};

function statusClass(status: MockScript["status"]): string {
  if (status === "running") return "run";
  if (status === "pending-run") return "pending-run";
  if (status === "pending-kill") return "pending-kill";
  if (status === "pending-restart") return "pending-restart";
  return "";
}

function primaryActions(s: MockScript) {
  const isPending = s.status.startsWith("pending-");
  if (s.status === "running" || s.status === "pending-kill" || s.status === "pending-restart") {
    return (
      <>
        {s.has_ui && (
          <button className="act" title="show ui" onClick={(e) => e.stopPropagation()}>
            {I.ui}
          </button>
        )}
        <button
          className={`act restart ${s.status === "pending-restart" ? "pending" : ""}`}
          title="restart"
          disabled={isPending}
          onClick={(e) => { e.stopPropagation(); actions.restart(s.id); }}
        >
          {I.restart}
        </button>
        <button
          className={`act kill ${s.status === "pending-kill" ? "pending" : ""}`}
          title="kill"
          disabled={isPending}
          onClick={(e) => { e.stopPropagation(); actions.kill(s.id); }}
        >
          {I.kill}
        </button>
      </>
    );
  }
  return (
    <button
      className={`act run-btn ${s.status === "pending-run" ? "pending" : ""}`}
      title="run"
      disabled={isPending}
      onClick={(e) => { e.stopPropagation(); actions.run(s.id); }}
    >
      {s.status === "pending-run" ? "igniting…" : I.play}
    </button>
  );
}

function Card({ s }: { s: MockScript }) {
  const focusedId = useHubStore((st) => st.focusedId);
  const focused = focusedId === s.id;
  const visibleTags = s.tags.slice(0, 2);
  const overflow = s.tags.length - visibleTags.length;

  return (
    <div
      className={`card ${focused ? "focused" : ""}`}
      onMouseEnter={() => actions.setFocused(s.id)}
      onClick={() => actions.setSelected(s.id)}
    >
      <div className="card-head">
        <div className="card-title">{s.filename}</div>
        <button className={`star ${s.is_hub ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); actions.toggleHub(s.id); }} title={s.is_hub ? "pinned to hub" : "pin to hub"}>
          {s.is_hub ? I.starFill : I.star}
        </button>
        <div className={`status ${statusClass(s.status)}`} />
      </div>
      <div className="tags">
        {visibleTags.map((t) => (
          <span key={t} className="tag">{t}</span>
        ))}
        {overflow > 0 && <span className="tag-count">+{overflow}</span>}
      </div>
      <div className="card-actions">{primaryActions(s)}</div>
    </div>
  );
}

function Row({ s }: { s: MockScript }) {
  const focusedId = useHubStore((st) => st.focusedId);
  const focused = focusedId === s.id;
  const visibleTags = s.tags.slice(0, 3);
  const isPending = s.status.startsWith("pending-");
  const running = s.status === "running" || s.status === "pending-kill" || s.status === "pending-restart";

  return (
    <div
      className={`row ${focused ? "focused" : ""}`}
      onMouseEnter={() => actions.setFocused(s.id)}
      onClick={() => actions.setSelected(s.id)}
    >
      <span className={`status ${statusClass(s.status)}`} />
      <span className="nm">{s.filename}</span>
      <span className="row-tags">
        {visibleTags.map((t) => <span key={t} className="row-tag">{t}</span>)}
        {s.tags.length > visibleTags.length && <span className="row-tag">+{s.tags.length - visibleTags.length}</span>}
      </span>
      <span className="row-actions">
        {running ? (
          <>
            <button className="row-act" title="restart" disabled={isPending} onClick={(e) => { e.stopPropagation(); actions.restart(s.id); }}>{I.restart}</button>
            <button className="row-act" title="kill" disabled={isPending} onClick={(e) => { e.stopPropagation(); actions.kill(s.id); }}>{I.kill}</button>
          </>
        ) : (
          <button className="row-act" title="run" disabled={isPending} onClick={(e) => { e.stopPropagation(); actions.run(s.id); }}>{I.play}</button>
        )}
      </span>
    </div>
  );
}

function Tree({ scripts }: { scripts: MockScript[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, MockScript[]>();
    scripts.forEach((s) => {
      const arr = m.get(s.parent) ?? [];
      arr.push(s);
      m.set(s.parent, arr);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [scripts]);

  return (
    <div className="tree-view">
      {grouped.map(([folder, arr]) => (
        <Folder key={folder} name={folder} scripts={arr} />
      ))}
    </div>
  );
}

function Folder({ name, scripts }: { name: string; scripts: MockScript[] }) {
  const open = true;
  return (
    <>
      <div className="tree-folder" data-open={open}>
        <span className="caret">▸</span>
        <span>{name}</span>
        <span className="fcount">{scripts.length}</span>
      </div>
      {open && (
        <div className="tree-children">
          {scripts.map((s) => <Row key={s.id} s={s} />)}
        </div>
      )}
    </>
  );
}

function SidebarItem({
  tab, label, color, dot, count, kbd,
}: {
  tab: string;
  label: string;
  color?: string;
  dot?: string;
  count?: number | string;
  kbd?: string;
}) {
  const active = useHubStore((s) => s.activeTab === tab);
  return (
    <div
      className={`side-item ${active ? "active" : ""}`}
      style={active && color ? { color } : undefined}
      onClick={() => actions.setActiveTab(tab)}
    >
      {dot && <Dot color={dot} />}
      <span>{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
      {kbd && <span className="kbd-hint">{kbd}</span>}
    </div>
  );
}

function ViewSwitcher() {
  const viewMode = useHubStore((s) => s.viewMode);
  const btn = (value: ViewMode, label: string) => (
    <button className={viewMode === value ? "on" : ""} onClick={() => actions.setViewMode(value)}>
      {label}
    </button>
  );
  return (
    <div className="toggle-group">
      {btn("tiles", "Hub")}
      {btn("list", "List")}
      {btn("tree", "Tree")}
    </div>
  );
}

export default function LiveHub() {
  const scripts = useHubStore(visibleScripts);
  const tags = useHubStore((s) => s.tags);
  const totalScripts = useHubStore((s) => s.scripts.length);
  const running = useHubStore(runningCount);
  const viewMode = useHubStore((s) => s.viewMode);
  const searchQuery = useHubStore((s) => s.searchQuery);
  const untagged = useHubStore((s) => s.scripts.filter((x) => x.tags.length === 0).length);
  const hubCount = useHubStore((s) => s.scripts.filter((x) => x.is_hub).length);

  // cache colors once (sync with tags)
  tags.forEach((t) => TAG_COLORS.set(t.name, t.color));

  return (
    <div className="win" role="img" aria-label="autlas hub view (live)">
      <div className="win-top">
        <div className="win-dots"><span></span><span></span><span></span></div>
        <div className="win-title">
          autlas — hub <span className="kbd-inline">· {totalScripts} scripts · {running} running</span>
        </div>
        <span className="kbd" style={{ marginLeft: "auto" }}>⌘</span>
        <span className="kbd">K</span>
      </div>
      <div className="hub">
        <aside className="sidebar">
          <div className="side-label">Tags</div>
          <SidebarItem tab="hub" label="Hub" color="#fcd34d" dot="#fbbf24" count={hubCount} />
          <SidebarItem tab="all" label="All scripts" color="#c7d2fe" dot="#818cf8" count={totalScripts} />
          <SidebarItem tab="no_tags" label="Untagged" color="#9ca3af" dot="rgba(255,255,255,0.2)" count={untagged} />
          {tags.map((t) => (
            <SidebarItem key={t.name} tab={t.name} label={t.name} color={t.color} dot={t.color} count={tagCount(t.name)} />
          ))}
          <div className="side-label" style={{ marginTop: "12px" }}>View</div>
          <div className={`side-item ${viewMode === "tiles" ? "active" : ""}`} onClick={() => actions.setViewMode("tiles")}>
            <span>Hub</span><span className="kbd-hint">⇧H</span>
          </div>
          <div className={`side-item ${viewMode === "list" ? "active" : ""}`} onClick={() => actions.setViewMode("list")}>
            <span>List</span><span className="kbd-hint">⇧L</span>
          </div>
          <div className={`side-item ${viewMode === "tree" ? "active" : ""}`} onClick={() => actions.setViewMode("tree")}>
            <span>Tree</span><span className="kbd-hint">⇧T</span>
          </div>
        </aside>
        <div className="hub-main">
          <div className="hub-toolbar">
            <div className="search">
              <span className="slash">/</span>
              <input
                placeholder="search scripts"
                value={searchQuery}
                onChange={(e) => actions.setSearch(e.target.value)}
              />
              {searchQuery ? (
                <button className="clear" onClick={() => actions.setSearch("")}>×</button>
              ) : (
                <span className="kbd">esc</span>
              )}
            </div>
            <ViewSwitcher />
          </div>
          <div className="hub-scroll">
            {viewMode === "tiles" ? (
              <div className="hub-grid">
                {scripts.map((s) => <Card key={s.id} s={s} />)}
                {scripts.length === 0 && <EmptyState />}
              </div>
            ) : viewMode === "list" ? (
              <div className="list-view">
                {scripts.map((s) => <Row key={s.id} s={s} />)}
                {scripts.length === 0 && <EmptyState />}
              </div>
            ) : (
              scripts.length === 0 ? <EmptyState /> : <Tree scripts={scripts} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", gridColumn: "1 / -1", fontFamily: "var(--mono)", fontSize: 12 }}>
      no scripts match
    </div>
  );
}
