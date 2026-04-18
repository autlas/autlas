import React, { memo, useRef, useEffect } from "react";
import { TreeNode } from "../../types/script";
import { useTreeStore } from "../../store/useTreeStore";
import { HighlightText } from "../common/HighlightText";
import { DEPTH_INDENT } from "../../utils/flattenTree";

interface FolderRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  ancestors: string[];
  lastDescendantIndex: Record<string, number>;
  itemIndex: number;
  isDragging: boolean;
  draggedScriptPath: string | null;
  isContextMenuOpen: boolean;
  contextMenuFolderPath: string | null;
  isVimMode: boolean;
  toggleFolder: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, data: any) => void;
  setFolderExpansionRecursive: (node: TreeNode, expanded: boolean) => void;
  folderRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function isSubtreeFullyExpanded(node: TreeNode): boolean {
  const expanded = useTreeStore.getState().expandedFolders;
  const check = (n: TreeNode): boolean => {
    if (n.name !== "Root" && expanded[n.fullName] === false) return false;
    for (const child of Object.values(n.children)) {
      if (!check(child)) return false;
    }
    return true;
  };
  return check(node);
}

const FolderRow = memo(function FolderRow({
  node, depth, isExpanded, ancestors, lastDescendantIndex, itemIndex,
  isDragging, draggedScriptPath, isContextMenuOpen, contextMenuFolderPath,
  isVimMode, toggleFolder, onContextMenu, setFolderExpansionRecursive,
  folderRefs,
}: FolderRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Vim focus via DOM class manipulation — no React re-render
  useEffect(() => {
    const state = useTreeStore.getState();
    let prevFocused = state.focusedPath === node.fullName && state.isVimMode;
    if (prevFocused && rowRef.current) rowRef.current.classList.add("vim-focus-folder");
    return useTreeStore.subscribe((s) => {
      const focused = s.focusedPath === node.fullName && s.isVimMode;
      if (focused !== prevFocused) {
        prevFocused = focused;
        if (rowRef.current) {
          if (focused) rowRef.current.classList.add("vim-focus-folder");
          else rowRef.current.classList.remove("vim-focus-folder");
        }
      }
    });
  }, [node.fullName]);

  const handleContextMenu = (e: React.MouseEvent, partData?: { name: string; fullName: string }) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, {
      ...(partData || node),
      is_hidden: !!node.is_hidden,
      isAllExpanded: isSubtreeFullyExpanded(node),
      onExpandAll: () => setFolderExpansionRecursive(node, true),
      onCollapseAll: () => setFolderExpansionRecursive(node, false),
    });
  };

  const contentLeft = depth * DEPTH_INDENT;

  return (
    <div className="relative">
      {/* Connector lines for ancestor folders */}
      {ancestors.map((ancestorPath, i) => {
        if (itemIndex > lastDescendantIndex[ancestorPath]) return null;
        return (
          <div
            key={ancestorPath}
            data-line-for={ancestorPath}
            className={`connector-line absolute w-5 -ml-2.5 z-20 ${!draggedScriptPath ? "cursor-pointer" : ""}`}
            style={{ left: i * DEPTH_INDENT + 13, top: -1, bottom: -1 }}
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
      })}

      <div
        ref={(el) => {
          if (el) {
            folderRefs.current.set(node.fullName, el);
            (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }
        }}
        onClick={() => { if (!isDragging) toggleFolder(node.fullName); }}
        onMouseEnter={() => {
          if (!isVimMode) useTreeStore.getState().setFocusedPath(node.fullName);
        }}
        onContextMenu={(e) => handleContextMenu(e)}
        id={`folder-${node.fullName}`}
        className={`flex items-center space-x-2 h-[38px] pl-[4px] rounded-lg z-10 relative mb-0.5 border border-transparent hover:z-[50] scroll-mt-[250px] scroll-mb-[250px]
          transition-all duration-300
          ${!draggedScriptPath ? (isVimMode ? "bg-transparent cursor-pointer" : "bg-transparent hover:bg-white/[0.05] cursor-pointer group") : "bg-transparent text-tertiary cursor-default pointer-events-none"}
          ${isContextMenuOpen ? "bg-white/5 border-white/10" : ""}
        `}
        style={{ marginLeft: contentLeft }}
      >
        <div className="vim-focus-indicator absolute left-0 top-1 bottom-1 w-[3.5px] bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.6)] z-20 hidden" />
        <div className={`w-4 h-4 flex items-center justify-center transition-transform duration-300 ${isExpanded ? "rotate-90" : ""}`}>
          <svg
            data-folder-arrow={node.fullName}
            width="10" height="10" viewBox="0 0 24 24"
            className={`transition-all ${!isDragging ? "text-white opacity-20" : "opacity-10"} ${!isDragging ? "group-hover:opacity-100" : ""}`}
            stroke="currentColor" fill="currentColor" strokeWidth="4" strokeLinejoin="round"
          >
            <path d="M5.5 3.5L5.5 20.5L20.2 12L5.5 3.5Z" />
          </svg>
        </div>
        <div className="flex items-center overflow-hidden h-full">
          {(() => {
            const rawParts = node.name.split("|").map(p => p.trim());
            const partFullNames: string[] = [];
            let currentPath = node.fullName;
            for (let i = rawParts.length - 1; i >= 0; i--) {
              partFullNames[i] = currentPath;
              const lastSlash = Math.max(currentPath.lastIndexOf("\\"), currentPath.lastIndexOf("/"));
              if (lastSlash !== -1) currentPath = currentPath.substring(0, lastSlash);
            }

            return rawParts.map((part, i) => {
              const partFullName = partFullNames[i];
              const isActive = contextMenuFolderPath === partFullName;
              return (
                <React.Fragment key={part + i}>
                  {i > 0 && <div className="w-[5px] h-[5px] rounded-full bg-white/10 mx-2 flex-shrink-0" />}
                  <div
                    className={`px-2 py-0.5 rounded-md transition-all duration-200
                      ${!isDragging ? "hover:bg-white/[0.08]" : ""}
                      ${isActive ? "bg-white/10" : ""}
                    `}
                    onContextMenu={(e) => {
                      if (isDragging) return;
                      handleContextMenu(e, { name: part, fullName: partFullName });
                    }}
                  >
                    <span className={`text-base font-medium tracking-tight transition-colors truncate stabilize-text
                      ${!isDragging ? (isActive ? "text-indigo-400" : "text-secondary/90 hover:text-white group-hover:text-primary") : "text-tertiary"}`}>
                      <HighlightText text={part} variant="path" />
                    </span>
                  </div>
                </React.Fragment>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.node === next.node
    && prev.depth === next.depth
    && prev.isExpanded === next.isExpanded
    && prev.isDragging === next.isDragging
    && prev.draggedScriptPath === next.draggedScriptPath
    && prev.isContextMenuOpen === next.isContextMenuOpen
    && prev.contextMenuFolderPath === next.contextMenuFolderPath
    && prev.isVimMode === next.isVimMode
    && prev.lastDescendantIndex === next.lastDescendantIndex;
});

export default FolderRow;
