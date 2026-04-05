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
}

/// Run the full reconciliation algorithm.
/// Returns a list of pending matches that need user confirmation.
pub fn reconcile(conn: &Connection, disk_paths: &HashSet<String>) -> Vec<PendingMatch> {
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
                let _ = db::mark_orphaned(conn, id, &now);
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
    let known_paths: HashSet<String> = db::get_all_active_scripts(conn)
        .into_iter()
        .map(|(_, p)| p)
        .collect();

    println!("[Reconcile] Phase 2: Processing {} disk paths ({} already known)", disk_paths.len(), known_paths.len());

    for disk_path in disk_paths {
        if known_paths.contains(disk_path) {
            // Already known — just update last_seen and hash
            if let Some((id, _old_hash)) = db::get_script_by_path(conn, disk_path) {
                let path_buf = std::path::PathBuf::from(disk_path);
                let new_hash = db::compute_file_hash(&path_buf).unwrap_or_default();
                let filename = path_buf.file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();
                let _ = db::upsert_script(conn, &id, disk_path, &filename, &new_hash, &now);
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
                let _ = db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now);
                println!("[Reconcile]   Hash match: {} → {}", old_path, disk_path);
                stats.hash_matched += 1;
                matched = true;
            } else if hash_matches.len() > 1 {
                let filename_lower = filename.to_lowercase();
                if let Some((orphan_id, old_path, _)) = hash_matches.iter()
                    .find(|(_, _, old_fn)| old_fn.to_lowercase() == filename_lower)
                {
                    let _ = db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now);
                    println!("[Reconcile]   Hash+filename match: {} → {}", old_path, disk_path);
                    stats.hash_matched += 1;
                    matched = true;
                } else {
                    let (orphan_id, old_path, _) = &hash_matches[0];
                    let _ = db::reconcile_orphan(conn, orphan_id, disk_path, &filename, &new_hash, &now);
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
                    pending_matches.push(PendingMatch {
                        orphan_id: orphan_id.clone(),
                        old_path: old_path.clone(),
                        new_path: disk_path.clone(),
                        match_type: "filename".to_string(),
                    });
                }
                stats.filename_pending += 1;
                matched = true;
            }
        }

        // Step 3: No match — create new script
        if !matched {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = db::upsert_script(conn, &id, disk_path, &filename, &new_hash, &now);
            stats.new_scripts += 1;
        }
    }

    // Phase 4: Cleanup old orphans (90 days)
    let cleaned = db::cleanup_old_orphans_sql(conn, 90).unwrap_or(0);
    if cleaned > 0 {
        println!("[Reconcile] Phase 4: Cleaned up {} orphans older than 90 days", cleaned);
    }

    let elapsed = start.elapsed();
    println!("[Reconcile] Done in {:.1?}: {} updated, {} new, {} hash-matched, {} filename-pending, {} orphaned",
        elapsed, stats.updated, stats.new_scripts, stats.hash_matched, stats.filename_pending, stats.orphaned);

    pending_matches
}

#[derive(Default)]
struct ReconcileStats {
    updated: usize,
    new_scripts: usize,
    hash_matched: usize,
    filename_pending: usize,
    orphaned: usize,
}
