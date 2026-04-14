import { useMemo, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TreeNode } from "../../types/script";
import { Script } from "../../api";
import { useTreeStore } from "../../store/useTreeStore";
import { flattenTree, FlatItem, DEPTH_INDENT } from "../../utils/flattenTree";
import FolderRow from "./FolderRow";
import ScriptRow from "./ScriptRow";

interface FlatTreeViewProps {
  tree: TreeNode;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scrollMargin: number;
  // Callbacks
  toggleFolder: (path: string) => void;
  setFolderExpansionRecursive: (node: TreeNode, expanded: boolean) => void;
  folderRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  allUniqueTags: string[];
  popoverRef: React.MutableRefObject<HTMLDivElement | null>;
  onFolderContextMenu: (e: React.MouseEvent, data: any) => void;
  onScriptContextMenu: (e: React.MouseEvent, s: Script) => void;
  handleCustomMouseDown: (e: React.MouseEvent, script: Script) => void;
  handleToggle: (s: Script, forceStart?: boolean) => void;
  startEditing: (s: Script) => void;
  stopEditing: () => void;
  addTag: (script: Script, tag: string) => void;
  removeTag: (script: Script, tag: string) => void;
  onShowUI: (s: Script) => void;
  onRestart: (s: Script) => void;
  onSelectScript?: (s: Script) => void;
  isActive: boolean;
}

export default function FlatTreeView({
  tree, scrollContainerRef, scrollMargin,
  toggleFolder, setFolderExpansionRecursive, folderRefs, allUniqueTags, popoverRef,
  onFolderContextMenu, onScriptContextMenu, handleCustomMouseDown, handleToggle,
  startEditing, stopEditing, addTag, removeTag, onShowUI, onRestart, onSelectScript,
  isActive,
}: FlatTreeViewProps) {
  // --- Store subscriptions (cause targeted re-renders) ---
  const expandedFolders = useTreeStore(s => s.expandedFolders);
  const editingScript = useTreeStore(s => s.editingScript);
  const contextMenu = useTreeStore(s => s.contextMenu);
  const pendingScripts = useTreeStore(s => s.pendingScripts);

  // --- Flatten tree ---
  const { items: flatItems, lastDescendantIndex } = useMemo(
    () => flattenTree(tree, expandedFolders),
    [tree, expandedFolders],
  );

  // Key → index map for scroll-to-item
  const keyToIndex = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, i) => map.set(item.key, i));
    return map;
  }, [flatItems]);

  // --- Read on-demand (no subscription, same as old TreeNodeRenderer) ---
  const st = useTreeStore.getState();
  const isDragging = st.isDragging;
  const draggedScriptPath = st.draggedScriptPath;
  const removingTags = st.removingTags;
  const showHidden = st.showHidden;
  const isVimMode = st.isVimMode;

  const contextMenuFolderPath = contextMenu?.type === "folder" ? contextMenu?.data?.fullName : null;

  // --- Virtualizer ---
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 40,
    overscan: 30,
    scrollMargin,
    // Built-in padding: focused item >= 300px from top / 200px from bottom.
    scrollPaddingStart: 300,
    scrollPaddingEnd: 200,
  });

  // --- Scroll-to-focused-item (vim navigation) ---
  // scrollPaddingStart/End on the virtualizer handles the 300/200 padding.
  useEffect(() => {
    if (!isActive) return;
    return useTreeStore.subscribe((state, prev) => {
      if (state.focusedPath === prev.focusedPath) return;
      if (!state.focusedPath || !state.isVimMode) return;
      const idx = keyToIndex.get(state.focusedPath);
      if (idx === undefined) return;
      virtualizer.scrollToIndex(idx, { align: "auto" });
    });
  }, [isActive, keyToIndex, virtualizer]);

  // --- Render helpers ---
  const getSetFocusedPath = useCallback(() => useTreeStore.getState().setFocusedPath, []);
  const setFocusedPath = getSetFocusedPath();

  /** Render vertical connector line segments for ancestor folders.
   *  Lines are positioned absolutely from the LEFT edge of a full-width wrapper.
   *  Extended by 1px top/bottom to bridge gaps between rows. */
  const renderConnectorLines = (item: FlatItem, index: number) =>
    item.ancestors.map((ancestorPath, i) => {
      if (index > lastDescendantIndex[ancestorPath]) return null;
      const left = i * DEPTH_INDENT + 13;
      return (
        <div
          key={ancestorPath}
          data-line-for={ancestorPath}
          className={`connector-line absolute w-5 -ml-2.5 z-20 ${!draggedScriptPath ? "cursor-pointer" : ""}`}
          style={{ left, top: -1, bottom: -1 }}
          onClick={(e) => { e.stopPropagation(); if (!isDragging) toggleFolder(ancestorPath); }}
          onMouseEnter={(e) => {
            const p = (e.currentTarget as HTMLElement).dataset.lineFor!;
            document.querySelectorAll<HTMLElement>(".connector-line").forEach(el => {
              if (el.dataset.lineFor === p) el.classList.add("line-hover");
            });
            document.querySelectorAll<HTMLElement>("[data-folder-arrow]").forEach(el => {
              if (el.dataset.folderArrow === p) el.style.opacity = "1";
            });
          }}
          onMouseLeave={(e) => {
            const p = (e.currentTarget as HTMLElement).dataset.lineFor!;
            document.querySelectorAll<HTMLElement>(".connector-line").forEach(el => {
              if (el.dataset.lineFor === p) el.classList.remove("line-hover");
            });
            document.querySelectorAll<HTMLElement>("[data-folder-arrow]").forEach(el => {
              if (el.dataset.folderArrow === p) el.style.opacity = "";
            });
          }}
        >
          <div className={`absolute left-[9px] top-0 bottom-0 w-[1px] transition-colors duration-150 ${isDragging ? "bg-white/5" : "bg-white/10"}`} />
        </div>
      );
    });

  const renderScriptRow = (item: FlatItem & { type: "script" }, index: number) => {
    const s = item.script;
    const removingTagKeys = Array.from(removingTags as Set<string>).filter(k => k.startsWith(s.path + "-"));
    return (
      <div className="relative">
        {renderConnectorLines(item, index)}
        <div style={{ marginLeft: item.depth * DEPTH_INDENT }}>
          <ScriptRow
            s={s}
            isDragging={isDragging}
            draggedScriptPath={draggedScriptPath}
            isEditing={isActive && editingScript === s.path}
            isPending={!!pendingScripts[s.path]}
            pendingType={pendingScripts[s.path]}
            removingTagKeys={removingTagKeys}
            allUniqueTags={allUniqueTags}
            popoverRef={popoverRef}
            visibilityMode={showHidden}
            isContextMenuOpen={contextMenu?.type === "script" && contextMenu?.data?.path === s.path}
            onMouseDown={handleCustomMouseDown}
            onDoubleClick={handleToggle}
            onToggle={handleToggle}
            onStartEditing={startEditing}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onCloseEditing={stopEditing}
            onScriptContextMenu={onScriptContextMenu}
            onShowUI={onShowUI}
            onRestart={onRestart}
            onSelectScript={onSelectScript}
            setFocusedPath={setFocusedPath}
          />
        </div>
      </div>
    );
  };

  const renderFolderRow = (item: FlatItem & { type: "folder" }, index: number) => (
    <FolderRow
      node={item.node}
      depth={item.depth}
      isExpanded={item.isExpanded}
      ancestors={item.ancestors}
      lastDescendantIndex={lastDescendantIndex}
      itemIndex={index}
      isDragging={isDragging}
      draggedScriptPath={draggedScriptPath}
      isContextMenuOpen={contextMenuFolderPath === item.key}
      contextMenuFolderPath={contextMenuFolderPath}
      isVimMode={isVimMode}
      toggleFolder={toggleFolder}
      onContextMenu={onFolderContextMenu}
      setFolderExpansionRecursive={setFolderExpansionRecursive}
      folderRefs={folderRefs}
    />
  );

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map(vRow => {
        const item = flatItems[vRow.index];
        return (
          <div
            key={item.key}
            data-index={vRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
              height: `${vRow.size}px`,
            }}
          >
            {item.type === "folder"
              ? renderFolderRow(item, vRow.index)
              : renderScriptRow(item as FlatItem & { type: "script" }, vRow.index)
            }
          </div>
        );
      })}
    </div>
  );
}
