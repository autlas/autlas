# Architecture Audit — SQLite + UUID Migration

**Date:** 2026-04-05  
**Scope:** 5 parallel agents audited concurrency, migration, frontend, reconciliation, watcher/tray

---

## CRITICAL

| # | Issue | File | Status |
|---|-------|------|--------|
| 1 | `get_scripts` holds Mutex during file I/O (hashing 176 files blocks ALL commands 200-300ms, HDD = seconds) | `lib.rs:1028` | FIXED |
| 2 | `set_tags_for_script` — DELETE + INSERT without transaction (crash between = tags lost) | `db.rs:245` | FIXED |
| 3 | `rename_tag_all`, `delete_tag_all` — multi-step without transaction | `db.rs:270, 289` | FIXED |
| 4 | `upsert_script` ON CONFLICT(id) but not ON CONFLICT(path) — UNIQUE violation on race | `db.rs:136` | FIXED |
| 5 | No `PRAGMA busy_timeout` — concurrent access = instant failure instead of retry | `db.rs:24` | FIXED |

## HIGH

| # | Issue | File | Status |
|---|-------|------|--------|
| 6 | Tray popup restart/stop don't track `last_run` — no DbState access in callback | `lib.rs:1824` | FIXED |
| 7 | `configparser` in Cargo.toml — unused dead dependency | `Cargo.toml:30` | FIXED |
| 8 | `scripts_cache.txt` and `icon_cache.json` still filesystem, not in SQLite | `lib.rs:733, 1444` | FIXED |

## MEDIUM

| # | Issue | File | Status |
|---|-------|------|--------|
| 9 | 90-day orphan cleanup deletes tags for disconnected USB/network drives | `reconcile.rs:134` | FIXED (disabled auto-cleanup) |
| 10 | Hash computed for EVERY file on EVERY scan — even unchanged files | `reconcile.rs:56` | FIXED |
| 11 | `System::new_all()` every 1.5s in watcher — excessive memory/CPU churn | `lib.rs:649` | FIXED (reuse + refresh_processes) |
| 12 | `get_ini_path()` duplicated in lib.rs and migrate.rs | `lib.rs:709, migrate.rs:9` | FIXED (removed from lib.rs) |

## LOW

| # | Issue | File | Status |
|---|-------|------|--------|
| 13 | Symlinks/junctions create duplicate UUIDs for same file | reconcile.rs | |
| 14 | Errors in reconciliation suppressed via `let _ =` | reconcile.rs | |
| 15 | `.unwrap()` on mutex — panic instead of graceful error | lib.rs:1028 | |
