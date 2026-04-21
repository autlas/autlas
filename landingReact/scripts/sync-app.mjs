#!/usr/bin/env node
// Syncs tauri_app/src → landingReact/src/app and applies landing-specific patches.
//
// Why: the landing demo embeds a mock-data clone of the app. Most files are
// identical to the real app, but a handful are tweaked for demo UX (see
// landingReact/patches/). This script keeps everything auto-synced and
// re-applies the patches — like patch-package for node_modules.
//
// Run: `npm run sync-app`. CI invokes it via the `prebuild` hook.
//
// If a patch fails to apply, upstream diverged in the patched region — fix the
// conflict by editing the real file in landingReact/src/app/<path> manually,
// then regenerate the patch with:
//   diff -u tauri_app/src/<path> landingReact/src/app/<path> > landingReact/patches/<path>.patch

import { cpSync, rmSync, readdirSync, statSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch } from "diff";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP_SRC = resolve(ROOT, "../tauri_app/src");
const APP_DST = resolve(ROOT, "src/app");
const PATCHES = resolve(ROOT, "patches");

function log(s) { process.stdout.write(s + "\n"); }
function err(s) { process.stderr.write(s + "\n"); }

// 1. Wipe and copy (exclude tests + main.tsx — landing has its own entry).
log(`sync: tauri_app/src → landingReact/src/app`);
rmSync(APP_DST, { recursive: true, force: true });
cpSync(APP_SRC, APP_DST, {
  recursive: true,
  filter: (src) => {
    const base = src.split(/[\/\\]/).pop();
    if (base === "main.tsx") return false;
    if (base === "test") return false;
    if (/\.test\.(ts|tsx|js|jsx)$/.test(base)) return false;
    return true;
  },
});

// 2. Walk patches/ and apply each *.patch to the mirrored file under src/app/.
// Using jsdiff's applyPatch avoids the CRLF/LF nightmare of the `patch` binary
// on Windows — it normalizes line endings internally.
let applied = 0;
function walk(dir, rel = "") {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relNext = rel ? `${rel}${sep}${entry}` : entry;
    if (statSync(full).isDirectory()) {
      walk(full, relNext);
    } else if (entry.endsWith(".patch")) {
      const targetRel = relNext.replace(/\.patch$/, "");
      const target = join(APP_DST, targetRel);
      if (!existsSync(target)) {
        err(`✗ patch target missing: ${targetRel}`);
        process.exit(1);
      }
      const source = readFileSync(target, "utf8");
      const patch = readFileSync(full, "utf8");
      const patched = applyPatch(source, patch, { fuzzFactor: 2 });
      if (patched === false) {
        err(`✗ patch failed: ${targetRel.replace(/\\/g, "/")}`);
        err(`  upstream diverged in the patched region. see script header for recovery.`);
        process.exit(1);
      }
      writeFileSync(target, patched, "utf8");
      applied++;
      log(`  ✓ ${targetRel.replace(/\\/g, "/")}`);
    }
  }
}

if (existsSync(PATCHES)) walk(PATCHES);

log(`done (${applied} patches applied).`);
