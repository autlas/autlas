import { useState, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { MutableRefObject } from "react";

type PhysicsRefs = {
  pendingImpulseRef: MutableRefObject<number>;
  momentumRef: MutableRefObject<number>;
  motionImpulseRef: MutableRefObject<number>;
  motionImpulseInitialRef: MutableRefObject<number>;
};

export function useNavigation(userTags: string[], physics: PhysicsRefs) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("ahk_active_tab") || "hub");
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">(() => {
    const tab = localStorage.getItem("ahk_active_tab") || "hub";
    if (tab === "settings") return "settings";
    if (tab === "hub") return "hub";
    return "tree";
  });
  const [displayMode, setDisplayMode] = useState<"tree" | "tiles" | "list">(() => {
    const isHub = (localStorage.getItem("ahk_active_tab") || "hub") === "hub";
    const key = isHub ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    return (localStorage.getItem(key) as "tree" | "tiles" | "list") || (isHub ? "tiles" : "tree");
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [, startTransition] = useTransition();

  const handleTabClick = (tab: string) => {
    // Sidebar highlight updates immediately (high priority)
    localStorage.setItem("ahk_active_tab", tab);

    if (tab === "hub") {
      setViewMode("hub");
      setDisplayMode((localStorage.getItem("ahk_hub_display_mode") as any) || "tiles");
    } else if (tab === "settings") {
      setViewMode("settings");
      const kick = (physics.momentumRef.current + physics.pendingImpulseRef.current) <= 0.05
        ? physics.motionImpulseInitialRef.current
        : physics.motionImpulseRef.current;
      physics.pendingImpulseRef.current += kick;
    } else {
      setViewMode("tree");
      setDisplayMode((localStorage.getItem("ahk_tree_display_mode") as any) || "tree");
    }

    // Tree re-render deferred (low priority) — UI stays responsive
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  const toggleDisplayMode = (mode: "tree" | "tiles" | "list") => {
    setDisplayMode(mode);
    const key = activeTab === "hub" ? "ahk_hub_display_mode" : "ahk_tree_display_mode";
    localStorage.setItem(key, mode);
  };

  const TABS = ["hub", "all", "no_tags", ...userTags, "settings"];

  useHotkeys("shift+alt+j", (e) => {
    e.preventDefault();
    const idx = TABS.indexOf(activeTab);
    handleTabClick(TABS[(idx + 1) % TABS.length]);
  }, { enableOnFormTags: true });

  useHotkeys("shift+alt+k", (e) => {
    e.preventDefault();
    const idx = TABS.indexOf(activeTab);
    handleTabClick(TABS[(idx - 1 + TABS.length) % TABS.length]);
  }, { enableOnFormTags: true });

  return {
    activeTab,
    setActiveTab,
    viewMode,
    displayMode,
    searchQuery,
    setSearchQuery,
    handleTabClick,
    toggleDisplayMode,
  };
}
