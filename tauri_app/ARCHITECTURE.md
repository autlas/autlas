# Architecture — AHK Manager

## Overview

Desktop app for managing AutoHotkey scripts. Tauri 2 (Rust backend) + React 19 + TypeScript + Tailwind CSS.

```
User clicks button
  → React component
    → invoke("command", { id, ... })
      → Rust Tauri command
        → SQLite (ahkmanager.db)
          → Result back to frontend
```

---

## Data Storage

Single SQLite database: `%AppData%\heavym\ahkmanager\config\ahkmanager.db`

WAL mode, foreign keys ON, busy_timeout 5000ms.

### Schema

```sql
scripts              -- every .ahk file ever discovered
  id            TEXT PRIMARY KEY    -- UUID v4, stable across moves/renames
  path          TEXT UNIQUE         -- current file path (lowercase)
  filename      TEXT                -- for reconciliation matching
  content_hash  TEXT                -- SHA-256, updated on mtime change
  first_seen    TEXT                -- ISO 8601
  last_seen     TEXT                -- updated each scan
  last_run      TEXT                -- set on Run/Restart from app or tray
  is_orphaned   INTEGER DEFAULT 0   -- 1 = file disappeared from disk
  orphaned_at   TEXT
  community_id  TEXT                -- future: marketplace link
  author        TEXT                -- future
  version       TEXT                -- future
  source_url    TEXT                -- future

script_tags          -- many-to-many, FK cascade delete
  script_id     TEXT  → scripts.id
  tag           TEXT
  PRIMARY KEY (script_id, tag)

tag_meta             -- icon and ordering per tag
  tag           TEXT PRIMARY KEY
  icon          TEXT                -- Phosphor/SimpleIcons icon name
  sort_order    INTEGER
  color         TEXT                -- future

icon_svg_cache       -- API-fetched SVG data (Iconify)
  name          TEXT PRIMARY KEY    -- e.g. "alarm" or "si:discord"
  bold          TEXT                -- bold variant SVG path
  fill          TEXT                -- fill variant SVG path

hidden_folders       -- folders user marked as hidden
  path          TEXT PRIMARY KEY

scan_paths           -- root directories to scan for .ahk files
  path          TEXT PRIMARY KEY

settings             -- key-value store
  key           TEXT PRIMARY KEY
  value         TEXT
```

### Indexes

```
idx_scripts_content_hash  ON scripts(content_hash)
idx_scripts_filename      ON scripts(filename)
idx_scripts_orphaned      ON scripts(is_orphaned)
idx_script_tags_tag       ON script_tags(tag)
```

---

## Script Identity

**UUID v4** assigned on first discovery. Stored in DB, NOT in the script file.

Path is a mutable locator, not an identity. Scripts keep their UUID (and tags) when moved or renamed.

### What happens when a script changes

| Changed | Result | Tags |
|---------|--------|------|
| Content only | Hash updated, UUID same | Kept |
| Path only (moved) | Auto-link by hash match | Kept |
| Filename only (renamed) | Auto-link by hash match | Kept |
| Path + filename | Auto-link by hash match | Kept |
| Path + content | User confirmation (filename match) | Kept after confirm |
| Filename + content | New UUID | Lost |
| All three | New UUID | Lost |

---

## Reconciliation

Runs **only on manual Refresh** (not on app startup).

```
Phase 0: Deduplicate scan results (HashSet by lowercase path)
         Resolve symlinks via canonicalize()

Phase 1: Mark orphans
         For each DB script: if path not on disk → is_orphaned = 1

Phase 2: Match new paths
         For each disk path not in DB:
           1. Hash match → auto-link (silent)
           2. Filename match → pending (user confirmation via toast + dialog)
           3. No match → new UUID

No automatic orphan cleanup. User discards manually.
```

### Performance

- Known scripts: only `touch_last_seen` (single UPDATE)
- Rehash only if file mtime > last_seen (skip unchanged files)
- Bulk DB queries: `get_all_active_scripts_full()` loads everything in one SELECT
- Mutex released during disk I/O (scan, hashing, exists checks)

---

## Rust Backend

### Modules

```
src-tauri/src/
  lib.rs        — Tauri commands (thin wrappers), tray, watcher
  db.rs         — SQLite schema, CRUD, helpers
  reconcile.rs  — reconciliation algorithm
  migrate.rs    — one-time INI → SQLite migration
```

### State

```rust
DbState(Mutex<Connection>)         -- single SQLite connection
TraySettingsState(Mutex<TraySettings>)  -- close_to_tray flag
```

### Key Commands

| Command | Key param | What it does |
|---------|-----------|--------------|
| `get_scripts` | `force_scan` | false=cache from DB, true=disk scan+reconcile |
| `save_script_tags` | `id, tags` | Replace all tags (transaction) |
| `add_script_tag` | `id, tag` | Add one tag |
| `remove_script_tag` | `id, tag` | Remove one tag |
| `rename_tag` | `old, new` | Rename across all scripts (transaction) |
| `delete_tag` | `tag` | Delete from all scripts + meta (transaction) |
| `resolve_orphan` | `orphan_id, action` | Link or discard orphaned script |
| `get_script_meta` | `path` | Returns hash, created, modified, last_run |
| `run_script` | `path` | Launch + record last_run |
| `restart_script` | `path` | Kill + relaunch + record last_run |

### Process Watcher

Background thread, polls every 1.5s:
- Reuses `System` object, calls `refresh_processes()` only
- Emits `script-status-changed` event (path, is_running, has_ui)
- Updates tray menu and native Win32 popup

### Tray Popup

Native Win32 GDI+ popup (no webview). Shows running scripts with stop/restart/UI buttons.
Restart from tray also records `last_run` via `app_handle.state::<DbState>()`.

---

## Frontend

### Data Flow

```
App startup
  → useScriptTree.fetchData(false)
    → invoke("get_scripts", { forceScan: false })
      → DB: load paths + tags + IDs (no disk scan)
    → scripts rendered immediately

Manual Refresh
  → useScriptTree.fetchData(true)
    → invoke("get_scripts", { forceScan: true })
      → Everything/WalkDir scan → reconciliation → DB update
    → orphan-matches-found event → toast → dialog
```

### Key Files

```
src/
  App.tsx                    — root, toasts (sonner), drag-drop, modals
  api.ts                     — Script interface (id, path, tags, ...)
  hooks/useScriptTree.ts     — data loading, tag ops, vim nav, drag
  store/useTreeStore.ts      — zustand: UI state (pending, editing, focus)
  components/
    OrphanReconcileDialog.tsx — moved scripts review modal
    ScriptDetailPanel.tsx     — detail panel with meta (ID, hash, dates)
    TagIconPicker.tsx         — icon picker (static + Iconify API)
    SettingsPanel.tsx         — settings including auto-refresh toggle
```

### Events (Rust → Frontend)

| Event | Payload | When |
|-------|---------|------|
| `script-status-changed` | `{path, is_running, has_ui}` | Process watcher detects change |
| `script-tags-changed` | `{id, tags}` | Tag operation completed |
| `orphan-matches-found` | `PendingMatch[]` | Reconciliation found filename matches |
| `scan-progress` | `number` | WalkDir scan progress |

### Tag Operations

All tag invocations use **script UUID** (`id`), not path:
```typescript
invoke("add_script_tag", { id: script.id, tag })
invoke("save_script_tags", { id: script.id, tags: [...] })
```

### Toast System

Sonner library. Three toast types with stable IDs (no duplicates):
- `"scan"` — scanning/synced status
- `"orphan"` — moved scripts detected
- `"everything"` — Everything search engine status

---

## Migration

One-time INI → SQLite on first launch (idempotent, transactional):

1. Parse `manager_data.ini` (UTF-16 LE)
2. Migrate [Scripts], [TagIcons], [General], [HiddenFolders], [ScanPaths], [Settings]
3. Compute content_hash for existing files
4. Migrate `icon_cache.json` → `icon_svg_cache` table
5. Set `migration_complete = "1"` flag
6. Backup INI as `.bak`

---

## Concurrency Safety

- All multi-step DB operations wrapped in `unchecked_transaction()`
- `upsert_script` handles both `ON CONFLICT(id)` and `ON CONFLICT(path)`
- `PRAGMA busy_timeout=5000` — retries on lock contention
- Mutex released during disk I/O in `get_scripts` (split into phases)
- Poisoned mutex recovery via `unwrap_or_else(|e| e.into_inner())`
- Reconciliation propagates all errors via `?` (no silent `let _ =`)

---

## Testing

33 tests in `tests/db_critical.rs` (in-memory SQLite):

- Transaction atomicity (set_tags, rename_tag, delete_tag)
- Rollback on failure
- Conflict handling (id vs path)
- Tag deduplication on rename
- FK cascade delete
- Icon SVG cache CRUD
- DB-based script cache
- Batch operations (touch_all_last_seen)
- last_run tracking
- Error propagation on corrupted DB
- Orphan filtering

Run: `cargo test --test db_critical --target-dir target/test`
