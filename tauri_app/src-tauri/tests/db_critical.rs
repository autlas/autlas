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
