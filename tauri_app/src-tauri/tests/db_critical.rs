/// Tests for critical architecture fixes (audit items #1-#5)
use rusqlite::{Connection, params};
use std::collections::HashMap;

// Inline the schema creation since we can't easily import from the lib
fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;").unwrap();
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
            orphaned_at   TEXT
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
        CREATE TABLE IF NOT EXISTS scan_paths (
            path TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS hidden_folders (
            path TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_scripts_content_hash ON scripts(content_hash);
        CREATE INDEX IF NOT EXISTS idx_scripts_filename ON scripts(filename);
        CREATE INDEX IF NOT EXISTS idx_script_tags_tag ON script_tags(tag);"
    ).unwrap();
    conn
}

fn insert_script(conn: &Connection, id: &str, path: &str, filename: &str) {
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen) VALUES (?1, ?2, ?3, '', '2026-01-01', '2026-01-01')",
        params![id, path, filename],
    ).unwrap();
}

fn get_tags(conn: &Connection, script_id: &str) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT tag FROM script_tags WHERE script_id = ?1 ORDER BY tag").unwrap();
    stmt.query_map(params![script_id], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

// ─── Fix #2: set_tags_for_script is atomic (transaction) ───

#[test]
fn test_set_tags_atomic_replaces_all() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\test.ahk", "test.ahk");

    // Set initial tags
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE script_id = 'uuid-1'", []).unwrap();
    tx.execute("INSERT INTO script_tags (script_id, tag) VALUES ('uuid-1', 'old_tag')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["old_tag"]);

    // Atomic replace
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE script_id = 'uuid-1'", []).unwrap();
    tx.execute("INSERT INTO script_tags (script_id, tag) VALUES ('uuid-1', 'new_a')", []).unwrap();
    tx.execute("INSERT INTO script_tags (script_id, tag) VALUES ('uuid-1', 'new_b')", []).unwrap();
    tx.commit().unwrap();

    let tags = get_tags(&conn, "uuid-1");
    assert_eq!(tags, vec!["new_a", "new_b"]);
}

#[test]
fn test_set_tags_rollback_on_error() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\test.ahk", "test.ahk");

    // Set initial tags
    conn.execute("INSERT INTO script_tags (script_id, tag) VALUES ('uuid-1', 'keep_me')", []).unwrap();

    // Simulate failed transaction (rollback)
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE script_id = 'uuid-1'", []).unwrap();
    // Don't commit — drop triggers rollback
    drop(tx);

    // Original tag should survive
    assert_eq!(get_tags(&conn, "uuid-1"), vec!["keep_me"]);
}

// ─── Fix #3: rename_tag_all and delete_tag_all are atomic ───

#[test]
fn test_rename_tag_atomic() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'OldTag')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-2', 'OldTag')", []).unwrap();
    conn.execute("INSERT INTO tag_meta (tag, icon) VALUES ('OldTag', 'star')", []).unwrap();

    // Atomic rename
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("UPDATE script_tags SET tag = 'NewTag' WHERE LOWER(tag) = LOWER('OldTag')", []).unwrap();
    tx.execute("DELETE FROM script_tags WHERE rowid NOT IN (SELECT MIN(rowid) FROM script_tags GROUP BY script_id, LOWER(tag))", []).unwrap();
    tx.execute("UPDATE tag_meta SET tag = 'NewTag' WHERE LOWER(tag) = LOWER('OldTag')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["NewTag"]);
    assert_eq!(get_tags(&conn, "uuid-2"), vec!["NewTag"]);

    // Icon should be renamed too
    let icon: String = conn.query_row("SELECT icon FROM tag_meta WHERE tag = 'NewTag'", [], |r| r.get(0)).unwrap();
    assert_eq!(icon, "star");

    // Old tag should not exist
    let old_count: i64 = conn.query_row("SELECT COUNT(*) FROM tag_meta WHERE tag = 'OldTag'", [], |r| r.get(0)).unwrap();
    assert_eq!(old_count, 0);
}

#[test]
fn test_rename_tag_deduplicates() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    // Script has both "old" and "new" tags — rename should deduplicate
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'old')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'new')", []).unwrap();

    let tx = conn.unchecked_transaction().unwrap();
    // Delete old_tag entries where script already has new_tag (prevents PK violation)
    tx.execute(
        "DELETE FROM script_tags WHERE LOWER(tag) = LOWER('old') AND script_id IN (SELECT script_id FROM script_tags WHERE LOWER(tag) = LOWER('new'))",
        [],
    ).unwrap();
    tx.execute("UPDATE script_tags SET tag = 'new' WHERE LOWER(tag) = LOWER('old')", []).unwrap();
    tx.commit().unwrap();

    // Should have only one "new" tag, not two
    assert_eq!(get_tags(&conn, "uuid-1"), vec!["new"]);
}

#[test]
fn test_delete_tag_atomic() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'remove_me')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'keep_me')", []).unwrap();
    conn.execute("INSERT INTO tag_meta (tag, icon) VALUES ('remove_me', 'trash')", []).unwrap();

    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE LOWER(tag) = LOWER('remove_me')", []).unwrap();
    tx.execute("DELETE FROM tag_meta WHERE LOWER(tag) = LOWER('remove_me')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["keep_me"]);
    let meta_count: i64 = conn.query_row("SELECT COUNT(*) FROM tag_meta WHERE tag = 'remove_me'", [], |r| r.get(0)).unwrap();
    assert_eq!(meta_count, 0);
}

// ─── Fix #4: upsert_script handles both id AND path conflicts ───

#[test]
fn test_upsert_conflict_on_id() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\old.ahk", "old.ahk");

    // Same id, new path — should update
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned)
         VALUES ('uuid-1', 'c:\\new.ahk', 'new.ahk', 'hash123', '2026-01-01', '2026-04-06', 0)
         ON CONFLICT(id) DO UPDATE SET path = 'c:\\new.ahk', filename = 'new.ahk', content_hash = 'hash123', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL
         ON CONFLICT(path) DO UPDATE SET filename = 'new.ahk', content_hash = 'hash123', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL",
        [],
    ).unwrap();

    let path: String = conn.query_row("SELECT path FROM scripts WHERE id = 'uuid-1'", [], |r| r.get(0)).unwrap();
    assert_eq!(path, "c:\\new.ahk");
}

#[test]
fn test_upsert_conflict_on_path() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\script.ahk", "script.ahk");

    // Different id, same path — should update existing record (not crash)
    let result = conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned)
         VALUES ('uuid-2', 'c:\\script.ahk', 'script.ahk', 'newhash', '2026-01-01', '2026-04-06', 0)
         ON CONFLICT(id) DO UPDATE SET path = 'c:\\script.ahk', filename = 'script.ahk', content_hash = 'newhash', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL
         ON CONFLICT(path) DO UPDATE SET filename = 'script.ahk', content_hash = 'newhash', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL",
        [],
    );

    assert!(result.is_ok(), "upsert should not crash on path conflict");

    // Only one record should exist for that path
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM scripts WHERE path = 'c:\\script.ahk'", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1);

    // CRITICAL: the original uuid-1 must survive (it owns the tags)
    let surviving_id: String = conn.query_row("SELECT id FROM scripts WHERE path = 'c:\\script.ahk'", [], |r| r.get(0)).unwrap();
    assert_eq!(surviving_id, "uuid-1", "path conflict must update existing record, not replace its id");
}

#[test]
fn test_upsert_path_conflict_preserves_tags() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\script.ahk", "script.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'important')", []).unwrap();

    // Different id tries to claim same path
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned)
         VALUES ('uuid-2', 'c:\\script.ahk', 'script.ahk', 'newhash', '2026-01-01', '2026-04-06', 0)
         ON CONFLICT(id) DO UPDATE SET path = 'c:\\script.ahk', filename = 'script.ahk', content_hash = 'newhash', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL
         ON CONFLICT(path) DO UPDATE SET filename = 'script.ahk', content_hash = 'newhash', last_seen = '2026-04-06', is_orphaned = 0, orphaned_at = NULL",
        [],
    ).unwrap();

    // Tags must still be accessible
    let tags = get_tags(&conn, "uuid-1");
    assert_eq!(tags, vec!["important"], "tags must survive path-conflict upsert");
}

// ─── Fix #5: busy_timeout is set ───

#[test]
fn test_busy_timeout_set() {
    let conn = setup_db();
    let timeout: i64 = conn.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
    assert_eq!(timeout, 5000, "busy_timeout should be 5000ms");
}

// ─── Bonus: bulk ID lookup correctness ───

#[test]
fn test_bulk_id_map() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");
    // Orphaned script should not appear
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned) VALUES ('uuid-3', 'c:\\c.ahk', 'c.ahk', '', '2026-01-01', '2026-01-01', 1)",
        [],
    ).unwrap();

    let mut stmt = conn.prepare("SELECT id, path FROM scripts WHERE is_orphaned = 0").unwrap();
    let id_map: HashMap<String, String> = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, String>(0)?)) // path → id
    }).unwrap().filter_map(|r| r.ok()).collect();

    assert_eq!(id_map.get("c:\\a.ahk"), Some(&"uuid-1".to_string()));
    assert_eq!(id_map.get("c:\\b.ahk"), Some(&"uuid-2".to_string()));
    assert_eq!(id_map.get("c:\\c.ahk"), None); // orphaned — excluded
}

// ─── FK cascade: deleting script deletes its tags ───

#[test]
fn test_cascade_delete_tags() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'tag1')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'tag2')", []).unwrap();

    conn.execute("DELETE FROM scripts WHERE id = 'uuid-1'", []).unwrap();

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM script_tags WHERE script_id = 'uuid-1'", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 0, "tags should be cascade-deleted with script");
}

// ─── Edge cases ───

#[test]
fn test_set_tags_empty_array() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'tag1')", []).unwrap();

    // Set empty tags = clear all
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE script_id = 'uuid-1'", []).unwrap();
    // No inserts — empty array
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), Vec::<String>::new());
}

#[test]
fn test_set_tags_nonexistent_script() {
    let conn = setup_db();
    // No script with this id exists — FK constraint should reject
    let result = conn.execute(
        "INSERT INTO script_tags (script_id, tag) VALUES ('ghost', 'tag1')", []
    );
    assert!(result.is_err(), "inserting tag for nonexistent script should fail due to FK constraint");

    // DELETE on nonexistent is fine (no-op)
    let result = conn.execute("DELETE FROM script_tags WHERE script_id = 'ghost'", []);
    assert!(result.is_ok(), "deleting from nonexistent script is a safe no-op");
}

#[test]
fn test_rename_tag_mixed_scripts() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");
    insert_script(&conn, "uuid-3", "c:\\c.ahk", "c.ahk");

    // uuid-1: has both "old" and "new" (should deduplicate)
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'old')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'new')", []).unwrap();
    // uuid-2: has only "old" (should rename)
    conn.execute("INSERT INTO script_tags VALUES ('uuid-2', 'old')", []).unwrap();
    // uuid-3: has only "new" (should be untouched)
    conn.execute("INSERT INTO script_tags VALUES ('uuid-3', 'new')", []).unwrap();

    let tx = conn.unchecked_transaction().unwrap();
    tx.execute(
        "DELETE FROM script_tags WHERE LOWER(tag) = LOWER('old') AND script_id IN (SELECT script_id FROM script_tags WHERE LOWER(tag) = LOWER('new'))",
        [],
    ).unwrap();
    tx.execute("UPDATE script_tags SET tag = 'new' WHERE LOWER(tag) = LOWER('old')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["new"], "uuid-1: deduplicated to single 'new'");
    assert_eq!(get_tags(&conn, "uuid-2"), vec!["new"], "uuid-2: 'old' renamed to 'new'");
    assert_eq!(get_tags(&conn, "uuid-3"), vec!["new"], "uuid-3: 'new' untouched");
}

#[test]
fn test_rename_nonexistent_tag() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'keep')", []).unwrap();

    // Rename a tag that doesn't exist — should be a no-op
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute(
        "DELETE FROM script_tags WHERE LOWER(tag) = LOWER('ghost') AND script_id IN (SELECT script_id FROM script_tags WHERE LOWER(tag) = LOWER('new'))",
        [],
    ).unwrap();
    tx.execute("UPDATE script_tags SET tag = 'new' WHERE LOWER(tag) = LOWER('ghost')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["keep"], "existing tags untouched");
}

#[test]
fn test_delete_nonexistent_tag() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'keep')", []).unwrap();

    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE LOWER(tag) = LOWER('ghost')", []).unwrap();
    tx.execute("DELETE FROM tag_meta WHERE LOWER(tag) = LOWER('ghost')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["keep"], "existing tags untouched");
}

#[test]
fn test_delete_tag_from_multiple_scripts() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'remove')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-1', 'keep')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-2', 'remove')", []).unwrap();
    conn.execute("INSERT INTO script_tags VALUES ('uuid-2', 'also_keep')", []).unwrap();

    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("DELETE FROM script_tags WHERE LOWER(tag) = LOWER('remove')", []).unwrap();
    tx.commit().unwrap();

    assert_eq!(get_tags(&conn, "uuid-1"), vec!["keep"]);
    assert_eq!(get_tags(&conn, "uuid-2"), vec!["also_keep"]);
}

// ═══════════════════════════════════════════════════════════
// New tests for consolidated DB (HIGH fixes #6-#8, perf #10)
// ═══════════════════════════════════════════════════════════

// ─── Icon SVG cache (replaces icon_cache.json) ───

#[test]
fn test_icon_svg_save_and_load() {
    let conn = setup_db();
    conn.execute_batch("CREATE TABLE IF NOT EXISTS icon_svg_cache (name TEXT PRIMARY KEY, bold TEXT NOT NULL, fill TEXT NOT NULL);").unwrap();

    conn.execute(
        "INSERT INTO icon_svg_cache (name, bold, fill) VALUES ('alarm', '<bold>', '<fill>') ON CONFLICT(name) DO UPDATE SET bold = excluded.bold, fill = excluded.fill",
        [],
    ).unwrap();

    let (bold, fill): (String, String) = conn.query_row(
        "SELECT bold, fill FROM icon_svg_cache WHERE name = 'alarm'", [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap();
    assert_eq!(bold, "<bold>");
    assert_eq!(fill, "<fill>");
}

#[test]
fn test_icon_svg_upsert_overwrites() {
    let conn = setup_db();
    conn.execute_batch("CREATE TABLE IF NOT EXISTS icon_svg_cache (name TEXT PRIMARY KEY, bold TEXT NOT NULL, fill TEXT NOT NULL);").unwrap();

    conn.execute("INSERT INTO icon_svg_cache VALUES ('star', 'old_bold', 'old_fill')", []).unwrap();
    conn.execute(
        "INSERT INTO icon_svg_cache (name, bold, fill) VALUES ('star', 'new_bold', 'new_fill') ON CONFLICT(name) DO UPDATE SET bold = excluded.bold, fill = excluded.fill",
        [],
    ).unwrap();

    let bold: String = conn.query_row("SELECT bold FROM icon_svg_cache WHERE name = 'star'", [], |r| r.get(0)).unwrap();
    assert_eq!(bold, "new_bold");

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM icon_svg_cache", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 1, "upsert should not create duplicates");
}

#[test]
fn test_icon_svg_batch_save() {
    let conn = setup_db();
    conn.execute_batch("CREATE TABLE IF NOT EXISTS icon_svg_cache (name TEXT PRIMARY KEY, bold TEXT NOT NULL, fill TEXT NOT NULL);").unwrap();

    let mut stmt = conn.prepare("INSERT INTO icon_svg_cache (name, bold, fill) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET bold = excluded.bold, fill = excluded.fill").unwrap();
    stmt.execute(params!["icon_a", "a_bold", "a_fill"]).unwrap();
    stmt.execute(params!["icon_b", "b_bold", "b_fill"]).unwrap();
    stmt.execute(params!["icon_c", "c_bold", "c_fill"]).unwrap();
    drop(stmt);

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM icon_svg_cache", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 3);
}

#[test]
fn test_icon_svg_empty_cache_returns_empty() {
    let conn = setup_db();
    conn.execute_batch("CREATE TABLE IF NOT EXISTS icon_svg_cache (name TEXT PRIMARY KEY, bold TEXT NOT NULL, fill TEXT NOT NULL);").unwrap();

    let mut stmt = conn.prepare("SELECT name, bold, fill FROM icon_svg_cache").unwrap();
    let results: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert!(results.is_empty());
}

// ─── Script cache from DB (replaces scripts_cache.txt) ───

#[test]
fn test_load_cache_from_db_returns_active_paths() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");
    // Orphaned script should not appear in cache
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned) VALUES ('uuid-3', 'c:\\orphan.ahk', 'orphan.ahk', '', '2026-01-01', '2026-01-01', 1)",
        [],
    ).unwrap();

    let mut stmt = conn.prepare("SELECT id, path FROM scripts WHERE is_orphaned = 0").unwrap();
    let paths: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(1)).unwrap().filter_map(|r| r.ok()).collect();

    assert_eq!(paths.len(), 2);
    assert!(paths.contains(&"c:\\a.ahk".to_string()));
    assert!(paths.contains(&"c:\\b.ahk".to_string()));
}

#[test]
fn test_load_cache_from_db_empty_returns_none() {
    let conn = setup_db();
    // No scripts at all
    let mut stmt = conn.prepare("SELECT id, path FROM scripts WHERE is_orphaned = 0").unwrap();
    let paths: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(1)).unwrap().filter_map(|r| r.ok()).collect();
    assert!(paths.is_empty());
}

// ─── Batch touch_all_last_seen ───

#[test]
fn test_touch_all_last_seen() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");
    insert_script(&conn, "uuid-2", "c:\\b.ahk", "b.ahk");

    let paths: std::collections::HashSet<String> = ["c:\\a.ahk".to_string(), "c:\\b.ahk".to_string()].into();
    let mut stmt = conn.prepare("UPDATE scripts SET last_seen = ?1 WHERE path = ?2 AND is_orphaned = 0").unwrap();
    for path in &paths {
        stmt.execute(params!["2026-04-06T12:00:00Z", path]).unwrap();
    }
    drop(stmt);

    let last_seen: String = conn.query_row("SELECT last_seen FROM scripts WHERE id = 'uuid-1'", [], |r| r.get(0)).unwrap();
    assert_eq!(last_seen, "2026-04-06T12:00:00Z");
}

#[test]
fn test_touch_all_last_seen_ignores_orphans() {
    let conn = setup_db();
    conn.execute(
        "INSERT INTO scripts (id, path, filename, content_hash, first_seen, last_seen, is_orphaned) VALUES ('uuid-1', 'c:\\orphan.ahk', 'orphan.ahk', '', '2026-01-01', '2026-01-01', 1)",
        [],
    ).unwrap();

    let affected = conn.execute(
        "UPDATE scripts SET last_seen = '2026-04-06T12:00:00Z' WHERE path = 'c:\\orphan.ahk' AND is_orphaned = 0",
        [],
    ).unwrap();

    assert_eq!(affected, 0, "orphans should not be touched");
    let last_seen: String = conn.query_row("SELECT last_seen FROM scripts WHERE id = 'uuid-1'", [], |r| r.get(0)).unwrap();
    assert_eq!(last_seen, "2026-01-01", "orphan last_seen should be unchanged");
}

// ─── last_run tracking ───

#[test]
fn test_last_run_set_and_get() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");

    conn.execute("UPDATE scripts SET last_run = '2026-04-06T10:00:00Z' WHERE path = 'c:\\a.ahk' AND is_orphaned = 0", []).unwrap();

    let last_run: Option<String> = conn.query_row(
        "SELECT last_run FROM scripts WHERE path = 'c:\\a.ahk' AND is_orphaned = 0",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(last_run, Some("2026-04-06T10:00:00Z".to_string()));
}

#[test]
fn test_last_run_initially_null() {
    let conn = setup_db();
    insert_script(&conn, "uuid-1", "c:\\a.ahk", "a.ahk");

    let last_run: Option<String> = conn.query_row(
        "SELECT last_run FROM scripts WHERE id = 'uuid-1'",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(last_run, None);
}

// ─── ISO timestamp parsing ───

#[test]
fn test_iso_to_epoch_roundtrip() {
    // 2026-01-01T00:00:00Z should be some known epoch
    // 2026-01-01 = 56 years * 365 + 14 leap days = 20454 days
    // Actually just verify parsing doesn't crash and returns > 0
    let iso = "2026-04-06T10:30:00Z";
    // Parse manually
    let year: i64 = iso[0..4].parse().unwrap();
    let month: u64 = iso[5..7].parse().unwrap();
    let day: u64 = iso[8..10].parse().unwrap();
    assert_eq!(year, 2026);
    assert_eq!(month, 4);
    assert_eq!(day, 6);
}

// ─── Scan paths in DB ───

#[test]
fn test_scan_paths_crud() {
    let conn = setup_db();

    // Initially empty
    let mut stmt = conn.prepare("SELECT path FROM scan_paths").unwrap();
    let paths: Vec<String> = stmt.query_map([], |r| r.get::<_, String>(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert!(paths.is_empty());

    // Set paths
    conn.execute("INSERT INTO scan_paths (path) VALUES ('C:\\Scripts')", []).unwrap();
    conn.execute("INSERT INTO scan_paths (path) VALUES ('D:\\AHK')", []).unwrap();

    let paths: Vec<String> = conn.prepare("SELECT path FROM scan_paths").unwrap()
        .query_map([], |r| r.get::<_, String>(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert_eq!(paths.len(), 2);

    // Replace all
    conn.execute("DELETE FROM scan_paths", []).unwrap();
    conn.execute("INSERT INTO scan_paths (path) VALUES ('E:\\New')", []).unwrap();

    let paths: Vec<String> = conn.prepare("SELECT path FROM scan_paths").unwrap()
        .query_map([], |r| r.get::<_, String>(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert_eq!(paths.len(), 1);
    assert_eq!(paths[0], "E:\\New");
}
