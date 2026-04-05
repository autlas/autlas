use rusqlite::{Connection, params};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path() -> PathBuf {
    use directories::ProjectDirs;
    if let Some(proj_dirs) = ProjectDirs::from("com", "heavym", "ahkmanager") {
        let config_dir = proj_dirs.config_dir();
        let _ = std::fs::create_dir_all(config_dir);
        config_dir.join("ahkmanager.db")
    } else {
        PathBuf::from("ahkmanager.db")
    }
}

pub fn open_db() -> rusqlite::Result<Connection> {
    let path = get_db_path();
    let is_new = !path.exists();
    println!("[DB] Opening database at {:?} ({})", path, if is_new { "new" } else { "existing" });
    let conn = Connection::open(&path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;
    create_schema(&conn)?;
    // Schema migrations for existing DBs
    let _ = conn.execute_batch("ALTER TABLE scripts ADD COLUMN last_run TEXT;");
    if !is_new {
        let script_count: i64 = conn.query_row("SELECT COUNT(*) FROM scripts WHERE is_orphaned = 0", [], |r| r.get(0)).unwrap_or(0);
        let tag_count: i64 = conn.query_row("SELECT COUNT(*) FROM script_tags", [], |r| r.get(0)).unwrap_or(0);
        let orphan_count: i64 = conn.query_row("SELECT COUNT(*) FROM scripts WHERE is_orphaned = 1", [], |r| r.get(0)).unwrap_or(0);
        println!("[DB] Loaded: {} active scripts, {} tags, {} orphans", script_count, tag_count, orphan_count);
    }
    Ok(conn)
}

fn create_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS scripts (
            id            TEXT PRIMARY KEY,
            path          TEXT UNIQUE NOT NULL,
            filename      TEXT NOT NULL,
            content_hash  TEXT,
            first_seen    TEXT NOT NULL,
            last_seen     TEXT NOT NULL,
            last_run      TEXT,
            is_orphaned   INTEGER NOT NULL DEFAULT 0,
            orphaned_at   TEXT,
            community_id  TEXT,
            author        TEXT,
            version       TEXT,
            source_url    TEXT
        );

        CREATE TABLE IF NOT EXISTS script_tags (
            script_id TEXT NOT NULL,
            tag       TEXT NOT NULL,
            PRIMARY KEY (script_id, tag),
            FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tag_meta (
            tag        TEXT PRIMARY KEY,
            icon       TEXT,
            sort_order INTEGER,
            color      TEXT
        );

        CREATE TABLE IF NOT EXISTS hidden_folders (
            path TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS scan_paths (
            path TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_scripts_content_hash ON scripts(content_hash);
        CREATE INDEX IF NOT EXISTS idx_scripts_filename ON scripts(filename);
        CREATE INDEX IF NOT EXISTS idx_scripts_orphaned ON scripts(is_orphaned);
        CREATE INDEX IF NOT EXISTS idx_script_tags_tag ON script_tags(tag);"
    )?;
    Ok(())
}

// ── Last run ──

pub fn set_last_run(conn: &Connection, path: &str, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE scripts SET last_run = ?2 WHERE path = ?1 AND is_orphaned = 0",
        params![path, now],
    )?;
    Ok(())
}

pub fn get_last_run(conn: &Connection, path: &str) -> Option<String> {
    conn.query_row(
        "SELECT last_run FROM scripts WHERE path = ?1 AND is_orphaned = 0",
        params![path],
        |row| row.get::<_, Option<String>>(0),
    ).ok().flatten()
}

// ── Settings ──

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

// ── Scripts ──

#[allow(dead_code)]
pub fn get_script_by_path(conn: &Connection, path: &str) -> Option<(String, String)> {
    conn.query_row(
        "SELECT id, content_hash FROM scripts WHERE path = ?1 AND is_orphaned = 0",
        params![path],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default())),
    ).ok()
}

pub fn upsert_script(conn: &Connection, id: &str, path: &str, filename: &str, content_hash: &str, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0)
         ON CONFLICT(id) DO UPDATE SET path = ?2, filename = ?3, content_hash = ?4, last_seen = ?5, is_orphaned = 0, orphaned_at = NULL
         ON CONFLICT(path) DO UPDATE SET filename = ?3, content_hash = ?4, last_seen = ?5, is_orphaned = 0, orphaned_at = NULL",
        params![id, path, filename, content_hash, now],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn get_last_seen_epoch(conn: &Connection, id: &str) -> Option<u64> {
    let last_seen: String = conn.query_row(
        "SELECT last_seen FROM scripts WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ).ok()?;
    // Parse ISO 8601 "YYYY-MM-DDTHH:MM:SSZ" to epoch
    parse_iso_to_epoch(&last_seen)
}

fn parse_iso_to_epoch(iso: &str) -> Option<u64> {
    // Simple parser for our own format: "2026-04-05T08:05:36Z"
    if iso.len() < 19 { return None; }
    let year: i64 = iso[0..4].parse().ok()?;
    let month: u64 = iso[5..7].parse().ok()?;
    let day: u64 = iso[8..10].parse().ok()?;
    let hour: u64 = iso[11..13].parse().ok()?;
    let min: u64 = iso[14..16].parse().ok()?;
    let sec: u64 = iso[17..19].parse().ok()?;
    // Rough days-from-epoch calculation
    let mut days: i64 = 0;
    for y in 1970..year {
        days += if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
    }
    let month_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    days += month_days[month.saturating_sub(1) as usize] as i64;
    if month > 2 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { days += 1; }
    days += day as i64 - 1;
    Some((days as u64) * 86400 + hour * 3600 + min * 60 + sec)
}

#[allow(dead_code)]
pub fn touch_last_seen(conn: &Connection, path: &str, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE scripts SET last_seen = ?2 WHERE path = ?1 AND is_orphaned = 0",
        params![path, now],
    )?;
    Ok(())
}

pub fn mark_orphaned(conn: &Connection, id: &str, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE scripts SET is_orphaned = 1, orphaned_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    Ok(())
}

pub fn reconcile_orphan(conn: &Connection, orphan_id: &str, new_path: &str, new_filename: &str, new_hash: &str, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE scripts SET path = ?2, filename = ?3, content_hash = ?4, last_seen = ?5, is_orphaned = 0, orphaned_at = NULL WHERE id = ?1",
        params![orphan_id, new_path, new_filename, new_hash, now],
    )?;
    Ok(())
}

/// Find orphans with matching content hash
pub fn find_orphans_by_hash(conn: &Connection, hash: &str) -> Vec<(String, String, String)> {
    let mut stmt = conn.prepare(
        "SELECT id, path, filename FROM scripts WHERE is_orphaned = 1 AND content_hash = ?1"
    ).unwrap();
    stmt.query_map(params![hash], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).unwrap().filter_map(|r| r.ok()).collect()
}

/// Find orphans with matching filename, but ONLY if no active script has that filename.
/// If an active script with the same filename exists, the orphan is stale — not a real move.
pub fn find_orphans_by_filename(conn: &Connection, filename: &str) -> Vec<(String, String)> {
    // Check if any active script already has this filename
    let active_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM scripts WHERE is_orphaned = 0 AND LOWER(filename) = LOWER(?1)",
        params![filename],
        |row| row.get(0),
    ).unwrap_or(0);

    if active_count > 0 {
        // There's already an active script with this filename — orphan is stale
        return Vec::new();
    }

    let mut stmt = conn.prepare(
        "SELECT id, path FROM scripts WHERE is_orphaned = 1 AND LOWER(filename) = LOWER(?1)"
    ).unwrap();
    stmt.query_map(params![filename], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).unwrap().filter_map(|r| r.ok()).collect()
}

pub struct ActiveScriptInfo {
    pub id: String,
    pub hash: String,
    pub last_seen_epoch: u64,
}

/// Bulk-load all active scripts: path → (id, hash, last_seen_epoch)
pub fn get_all_active_scripts_full(conn: &Connection) -> HashMap<String, ActiveScriptInfo> {
    let mut stmt = conn.prepare(
        "SELECT path, id, content_hash, last_seen FROM scripts WHERE is_orphaned = 0"
    ).unwrap();
    let mut map = HashMap::new();
    let rows = stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let id: String = row.get(1)?;
        let hash: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
        let last_seen: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
        let epoch = parse_iso_to_epoch(&last_seen).unwrap_or(0);
        Ok((path, ActiveScriptInfo { id, hash, last_seen_epoch: epoch }))
    }).unwrap();
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    map
}

/// Batch update last_seen for all known paths
pub fn touch_all_last_seen(conn: &Connection, paths: &std::collections::HashSet<String>, now: &str) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("UPDATE scripts SET last_seen = ?1 WHERE path = ?2 AND is_orphaned = 0")?;
    for path in paths {
        stmt.execute(params![now, path])?;
    }
    Ok(())
}

/// Get all non-orphaned scripts (id, path)
pub fn get_all_active_scripts(conn: &Connection) -> Vec<(String, String)> {
    let mut stmt = conn.prepare(
        "SELECT id, path FROM scripts WHERE is_orphaned = 0"
    ).unwrap();
    stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).unwrap().filter_map(|r| r.ok()).collect()
}

/// Get orphaned scripts for UI confirmation
pub fn get_orphaned_scripts(conn: &Connection) -> Vec<(String, String, String)> {
    let mut stmt = conn.prepare(
        "SELECT id, path, filename FROM scripts WHERE is_orphaned = 1 ORDER BY orphaned_at DESC"
    ).unwrap();
    stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).unwrap().filter_map(|r| r.ok()).collect()
}

pub fn cleanup_old_orphans_sql(conn: &Connection, days: i64) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM scripts WHERE is_orphaned = 1 AND orphaned_at < datetime('now', ?1)",
        params![format!("-{} days", days)],
    )
}

// ── Tags ──

pub fn get_tags_for_script(conn: &Connection, script_id: &str) -> Vec<String> {
    let mut stmt = conn.prepare(
        "SELECT tag FROM script_tags WHERE script_id = ?1 ORDER BY tag"
    ).unwrap();
    stmt.query_map(params![script_id], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

#[allow(dead_code)]
pub fn get_tags_by_path(conn: &Connection, path: &str) -> Vec<String> {
    let mut stmt = conn.prepare(
        "SELECT st.tag FROM script_tags st JOIN scripts s ON st.script_id = s.id WHERE s.path = ?1 AND s.is_orphaned = 0 ORDER BY st.tag"
    ).unwrap();
    stmt.query_map(params![path], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn set_tags_for_script(conn: &Connection, script_id: &str, tags: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM script_tags WHERE script_id = ?1", params![script_id])?;
    let mut stmt = tx.prepare("INSERT OR IGNORE INTO script_tags (script_id, tag) VALUES (?1, ?2)")?;
    for tag in tags {
        stmt.execute(params![script_id, tag])?;
    }
    drop(stmt);
    tx.commit()
}

pub fn add_tag_to_script(conn: &Connection, script_id: &str, tag: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO script_tags (script_id, tag) VALUES (?1, ?2)",
        params![script_id, tag],
    )?;
    Ok(())
}

pub fn remove_tag_from_script(conn: &Connection, script_id: &str, tag: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM script_tags WHERE script_id = ?1 AND LOWER(tag) = LOWER(?2)",
        params![script_id, tag],
    )?;
    Ok(())
}

pub fn rename_tag_all(conn: &Connection, old_tag: &str, new_tag: &str) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    // First delete old_tag entries where script already has new_tag (prevents PK violation)
    tx.execute(
        "DELETE FROM script_tags WHERE LOWER(tag) = LOWER(?1) AND script_id IN (SELECT script_id FROM script_tags WHERE LOWER(tag) = LOWER(?2))",
        params![old_tag, new_tag],
    )?;
    // Now safely rename remaining
    tx.execute(
        "UPDATE script_tags SET tag = ?2 WHERE LOWER(tag) = LOWER(?1)",
        params![old_tag, new_tag],
    )?;
    tx.execute(
        "UPDATE tag_meta SET tag = ?2 WHERE LOWER(tag) = LOWER(?1)",
        params![old_tag, new_tag],
    )?;
    tx.commit()
}

pub fn delete_tag_all(conn: &Connection, tag: &str) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM script_tags WHERE LOWER(tag) = LOWER(?1)",
        params![tag],
    )?;
    tx.execute(
        "DELETE FROM tag_meta WHERE LOWER(tag) = LOWER(?1)",
        params![tag],
    )?;
    tx.commit()
}

// ── Tag meta (icons, order) ──

pub fn get_tag_icons(conn: &Connection) -> HashMap<String, String> {
    let mut stmt = conn.prepare(
        "SELECT tag, icon FROM tag_meta WHERE icon IS NOT NULL AND icon != ''"
    ).unwrap();
    stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).unwrap().filter_map(|r| r.ok()).collect()
}

pub fn save_tag_icon(conn: &Connection, tag: &str, icon: &str) -> rusqlite::Result<()> {
    if icon.is_empty() {
        conn.execute("UPDATE tag_meta SET icon = NULL WHERE LOWER(tag) = LOWER(?1)", params![tag])?;
    } else {
        conn.execute(
            "INSERT INTO tag_meta (tag, icon) VALUES (?1, ?2) ON CONFLICT(tag) DO UPDATE SET icon = ?2",
            params![tag, icon],
        )?;
    }
    Ok(())
}

pub fn get_tag_order(conn: &Connection) -> Vec<String> {
    let mut stmt = conn.prepare(
        "SELECT tag FROM tag_meta WHERE sort_order IS NOT NULL ORDER BY sort_order"
    ).unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn save_tag_order(conn: &Connection, order: &[String]) -> rusqlite::Result<()> {
    // Reset all sort orders
    conn.execute("UPDATE tag_meta SET sort_order = NULL", [])?;
    let mut stmt = conn.prepare(
        "INSERT INTO tag_meta (tag, sort_order) VALUES (?1, ?2) ON CONFLICT(tag) DO UPDATE SET sort_order = ?2"
    )?;
    for (i, tag) in order.iter().enumerate() {
        stmt.execute(params![tag, i as i64])?;
    }
    Ok(())
}

// ── Hidden folders ──

pub fn get_hidden_folders(conn: &Connection) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT path FROM hidden_folders").unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn toggle_hidden_folder(conn: &Connection, path: &str) -> rusqlite::Result<bool> {
    let path_lower = path.to_lowercase();
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM hidden_folders WHERE LOWER(path) = ?1",
        params![path_lower],
        |row| row.get::<_, i64>(0),
    ).map(|c| c > 0).unwrap_or(false);

    if exists {
        conn.execute("DELETE FROM hidden_folders WHERE LOWER(path) = ?1", params![path_lower])?;
        Ok(false) // now visible
    } else {
        conn.execute("INSERT INTO hidden_folders (path) VALUES (?1)", params![path])?;
        Ok(true) // now hidden
    }
}

// ── Scan paths ──

pub fn get_scan_paths(conn: &Connection) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT path FROM scan_paths").unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn set_scan_paths(conn: &Connection, paths: &[String]) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM scan_paths", [])?;
    let mut stmt = conn.prepare("INSERT INTO scan_paths (path) VALUES (?1)")?;
    for p in paths {
        stmt.execute(params![p])?;
    }
    Ok(())
}

// ── Script ID lookup ──

#[allow(dead_code)]
pub fn get_script_id_by_path(conn: &Connection, path: &str) -> Option<String> {
    conn.query_row(
        "SELECT id FROM scripts WHERE path = ?1 AND is_orphaned = 0",
        params![path],
        |row| row.get::<_, String>(0),
    ).ok()
}

#[allow(dead_code)]
pub fn get_script_path_by_id(conn: &Connection, id: &str) -> Option<String> {
    conn.query_row(
        "SELECT path FROM scripts WHERE id = ?1",
        params![id],
        |row| row.get::<_, String>(0),
    ).ok()
}

// ── Bulk tags load (for get_scripts enrichment) ──

pub fn get_all_tags_map(conn: &Connection) -> HashMap<String, Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT s.path, st.tag FROM script_tags st JOIN scripts s ON st.script_id = s.id WHERE s.is_orphaned = 0"
    ).unwrap();
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).unwrap();
    for row in rows.flatten() {
        map.entry(row.0).or_default().push(row.1);
    }
    map
}

// ── Helpers ──

pub fn now_iso() -> String {
    // Simple UTC timestamp without chrono
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // Convert to rough ISO 8601 via Unix timestamp
    // For proper formatting we'd need chrono, but this is sufficient
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate date from days since epoch (1970-01-01)
    let (year, month, day) = days_to_date(days as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hours, minutes, seconds)
}

pub fn days_to_date(mut days: i64) -> (i64, i64, i64) {
    // Algorithm from Howard Hinnant
    days += 719468;
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

pub fn compute_file_hash(path: &std::path::Path) -> Option<String> {
    use sha2::{Sha256, Digest};
    let data = std::fs::read(path).ok()?;
    let hash = Sha256::digest(&data);
    Some(format!("{:x}", hash))
}
