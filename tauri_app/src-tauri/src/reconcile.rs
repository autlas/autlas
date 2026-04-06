use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;

use crate::db;

#[derive(serde::Serialize, Clone)]
pub struct PendingMatch {
    pub orphan_id: String,
    pub old_path: String,
    pub new_path: String,
    pub match_type: String, // "filename"
    pub tags: Vec<String>,
}

/// Run the full reconciliation algorithm.
/// Returns a list of pending matches that need user confirmation.
pub fn reconcile(conn: &Connection, disk_paths: &HashSet<String>) -> Result<Vec<PendingMatch>, String> {
    let start = std::time::Instant::now();
    let now = db::now_iso();
    let mut pending_matches: Vec<PendingMatch> = Vec::new();
    let mut stats = ReconcileStats::default();

    println!("[Reconcile] Starting reconciliation with {} disk paths", disk_paths.len());

    // Phase 1: Mark orphans
    let active_scripts = db::get_all_active_scripts(conn);
    println!("[Reconcile] Phase 1: Checking {} active DB entries for orphans", active_scripts.len());
    for (id, db_path) in &active_scripts {
        if !disk_paths.contains(db_path) {
            let path = Path::new(db_path);
            if !path.exists() {
                db::mark_orphaned(conn, id, &now).map_err(|e| e.to_string())?;
                stats.orphaned += 1;
                println!("[Reconcile]   Orphaned: {}", db_path);
            }
        }
    }
    if stats.orphaned > 0 {
        println!("[Reconcile] Phase 1 done: {} scripts marked as orphaned", stats.orphaned);
    } else {
        println!("[Reconcile] Phase 1 done: no orphans");
    }

    // Phase 2: Match new paths to orphans
    // Bulk-load all active scripts in one query (path → id, hash, last_seen_epoch)
    let known_scripts = db::get_all_active_scripts_full(conn);
    let known_paths: HashSet<String> = known_scripts.keys().cloned().collect();

    println!("[Reconcile] Phase 2: Processing {} disk paths ({} already known)", disk_paths.len(), known_paths.len());

    // Batch update last_seen for all known paths (single SQL statement)
    db::touch_all_last_seen(conn, &known_paths, &now).map_err(|e| e.to_string())?;

    for disk_path in disk_paths {
        if let Some(info) = known_scripts.get(disk_path) {
            // Already known — rehash only if file was modified since last scan
            let path_buf = std::path::PathBuf::from(disk_path);
            let mtime = std::fs::metadata(&path_buf).ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if mtime > info.last_seen_epoch || info.hash.is_empty() {
                let new_hash = db::compute_file_hash(&path_buf).unwrap_or_default();
                let filename = path_buf.file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                db::upsert_script(conn, &info.id, disk_path, &filename, &new_hash, &now).map_err(|e| e.to_string())?;
                stats.rehashed += 1;
            }
            stats.updated += 1;
            continue;
        }

        // New path — try to match with an orphan
        let path_buf = std::path::PathBuf::from(disk_path);
        let new_hash = db::compute_file_hash(&path_buf).unwrap_or_default();
        let filename = path_buf.file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        let mut matched = false;

        // Step 1: Exact hash match
        if !new_hash.is_empty() {
            let hash_matches = db::find_orphans_by_hash(conn, &new_hash);
            if hash_matches.len() == 1 {
                let (orphan_id, old_path, _old_filename) = &hash_matches[0];
                db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now).map_err(|e| e.to_string())?;
                println!("[Reconcile]   Hash match: {} → {}", old_path, disk_path);
                stats.hash_matched += 1;
                matched = true;
            } else if hash_matches.len() > 1 {
                let filename_lower = filename.to_lowercase();
                if let Some((orphan_id, old_path, _)) = hash_matches.iter()
                    .find(|(_, _, old_fn)| old_fn.to_lowercase() == filename_lower)
                {
                    db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now).map_err(|e| e.to_string())?;
                    println!("[Reconcile]   Hash+filename match: {} → {}", old_path, disk_path);
                    stats.hash_matched += 1;
                    matched = true;
                } else {
                    let (orphan_id, old_path, _) = &hash_matches[0];
                    db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now).map_err(|e| e.to_string())?;
                    println!("[Reconcile]   Hash match (first of {}): {} → {}", hash_matches.len(), old_path, disk_path);
                    stats.hash_matched += 1;
                    matched = true;
                }
            }
        }

        // Step 2: Filename match → queue for user confirmation
        if !matched {
            let filename_lower = filename.to_lowercase();
            let filename_matches = db::find_orphans_by_filename(conn, &filename_lower);
            if !filename_matches.is_empty() {
                for (orphan_id, old_path) in &filename_matches {
                    println!("[Reconcile]   Filename match (pending): {} → {} (needs confirmation)", old_path, disk_path);
                    let tags = db::get_tags_for_script(conn, orphan_id);
                    pending_matches.push(PendingMatch {
                        orphan_id: orphan_id.clone(),
                        old_path: old_path.clone(),
                        new_path: disk_path.clone(),
                        match_type: "filename".to_string(),
                        tags,
                    });
                }
                stats.filename_pending += 1;
                matched = true;
            }
        }

        // Step 3: No match — create new script
        if !matched {
            let id = uuid::Uuid::new_v4().to_string();
            db::upsert_script(conn, &id, disk_path, &filename, &new_hash, &now).map_err(|e| e.to_string())?;
            stats.new_scripts += 1;
        }
    }

    // Phase 4: No automatic orphan cleanup — orphans with tags could be on
    // disconnected USB/network drives. User can discard them manually via UI.

    let elapsed = start.elapsed();
    println!("[Reconcile] Done in {:.1?}: {} updated ({} rehashed), {} new, {} hash-matched, {} filename-pending, {} orphaned",
        elapsed, stats.updated, stats.rehashed, stats.new_scripts, stats.hash_matched, stats.filename_pending, stats.orphaned);

    Ok(pending_matches)
}

#[derive(Default)]
struct ReconcileStats {
    updated: usize,
    rehashed: usize,
    new_scripts: usize,
    hash_matched: usize,
    filename_pending: usize,
    orphaned: usize,
}
