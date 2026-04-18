import { TreeNode } from "../types/script";
import type { Script } from "../api";

export const DEPTH_INDENT = 28; // px per depth level

export interface FlatFolderItem {
  type: "folder";
  key: string;          // node.fullName
  depth: number;
  node: TreeNode;
  isExpanded: boolean;
  ancestors: string[];  // parent folder fullNames from shallowest to deepest
}

export interface FlatScriptItem {
  type: "script";
  key: string;          // script.path
  depth: number;
  script: Script;
  ancestors: string[];
}

export type FlatItem = FlatFolderItem | FlatScriptItem;

export interface FlattenResult {
  items: FlatItem[];
  /** folder fullName → index of last descendant in items[] */
  lastDescendantIndex: Record<string, number>;
}

/**
 * Flatten a recursive TreeNode into a linear list, respecting expanded state.
 * Collapsed folders emit only the folder row — children are omitted.
 */
export function flattenTree(
  root: TreeNode,
  expandedFolders: Record<string, boolean>,
): FlattenResult {
  const items: FlatItem[] = [];
  const lastDescendantIndex: Record<string, number> = {};

  const traverse = (node: TreeNode, depth: number, ancestors: string[]) => {
    const isRoot = node.name === "Root";
    const isExpanded = isRoot || expandedFolders[node.fullName] !== false;

    if (!isRoot) {
      items.push({
        type: "folder",
        key: node.fullName,
        depth,
        node,
        isExpanded,
        ancestors,
      });
    }

    if (isExpanded) {
      const childDepth = isRoot ? 0 : depth + 1;
      const childAncestors = isRoot ? ancestors : [...ancestors, node.fullName];

      Object.values(node.children)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(child => traverse(child, childDepth, childAncestors));

      node.scripts.forEach(s => {
        items.push({
          type: "script",
          key: s.path,
          depth: childDepth,
          script: s,
          ancestors: childAncestors,
        });
      });
    }

    // After all descendants are pushed, record last index for this folder
    if (!isRoot && items.length > 0) {
      lastDescendantIndex[node.fullName] = items.length - 1;
    }
  };

  traverse(root, 0, []);
  return { items, lastDescendantIndex };
}
