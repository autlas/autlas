import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { MutableRefObject } from "react";
import { useVimEnabled } from "./useVimEnabled";

type PhysicsRefs = {
  pendingImpulseRef: MutableRefObject<number>;
  momentumRef: MutableRefObject<number>;
  motionImpulseRef: MutableRefObject<number>;
  motionImpulseInitialRef: MutableRefObject<number>;
};

export function useNavigation(userTags: string[], physics: PhysicsRefs) {
  // Landing demo: never remember the tab/view between reloads —
  // always boot into Hub + list view; other tabs default to tree.
  const [activeTab, setActiveTab] = useState("hub");
  const [viewMode, setViewMode] = useState<"tree" | "hub" | "settings">("hub");
  const [displayMode, setDisplayMode] = useState<"tree" | "tiles" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (tab === "hub") {
      setViewMode("hub");
      setDisplayMode("list");
    } else if (tab === "settings") {
      setViewMode("settings");
      const kick = (physics.momentumRef.current + physics.pendingImpulseRef.current) <= 0.05
        ? physics.motionImpulseInitialRef.current
        : physics.motionImpulseRef.current;
      physics.pendingImpulseRef.current += kick;
    } else {
      setViewMode("tree");
      setDisplayMode("tree");
    }
  };

  const toggleDisplayMode = (mode: "tree" | "tiles" | "list") => {
    setDisplayMode(mode);
  };

  const TABS = ["hub", "all", "no_tags", "tags", ...userTags, "settings"];

  // Tab-switch hotkeys are part of the vim flow — disable when vim is off.
  const vimEnabled = useVimEnabled();

  useHotkeys("shift+alt+j", (e) => {
    e.preventDefault();
    const idx = TABS.indexOf(activeTab);
    const next = TABS[(idx + 1) % TABS.length];
    if (localStorage.getItem('ahk_vim_debug') !== 'false') {
      console.log('[tab] Shift+Alt+J →', activeTab, '→', next);
    }
    handleTabClick(next);
  }, { enableOnFormTags: true, enabled: vimEnabled });

  useHotkeys("shift+alt+k", (e) => {
    e.preventDefault();
    const idx = TABS.indexOf(activeTab);
    const next = TABS[(idx - 1 + TABS.length) % TABS.length];
    if (localStorage.getItem('ahk_vim_debug') !== 'false') {
      console.log('[tab] Shift+Alt+K →', activeTab, '→', next);
    }
    handleTabClick(next);
  }, { enableOnFormTags: true, enabled: vimEnabled });

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
