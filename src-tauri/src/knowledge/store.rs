// One SQLite file per agent holds both its knowledge chunks' text and their vectors, via
// the sqlite-vec extension (a `vec0` virtual table) — matching this app's existing
// "plain file on disk, not a hosted DB" precedent. Brute-force KNN search here is plenty
// fast at the scale one agent's knowledge realistically reaches: even a 1000-page
// document is only a few hundred chunks.

use rusqlite::{ffi::sqlite3_auto_extension, params, Connection};
use sqlite_vec::sqlite3_vec_init;
use std::path::Path;
use std::sync::Once;

use super::embedder::EMBEDDING_DIMENSIONS;

static REGISTER_VEC_EXTENSION: Once = Once::new();

// sqlite3_auto_extension registers the extension process-wide, once — calling it more
// than once (e.g. once per opened connection) is unnecessary and sqlite_vec warns about
// it, so this gate is required, not just tidy.
fn ensure_vec_extension_registered() {
    REGISTER_VEC_EXTENSION.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

pub struct RetrievedChunk {
    pub text: String,
    pub file_name: String,
}

fn f32_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

pub fn open_db(db_path: &Path) -> Result<Connection, String> {
    ensure_vec_extension_registered();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Couldn't create the agent's data folder: {e}"))?;
    }
    let conn = Connection::open(db_path).map_err(|e| format!("Couldn't open the knowledge database: {e}"))?;
    conn.execute_batch(&format!(
        "
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY,
            file_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            text TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
            embedding float[{EMBEDDING_DIMENSIONS}]
        );
        "
    ))
    .map_err(|e| format!("Couldn't prepare the knowledge database: {e}"))?;
    Ok(conn)
}

// Stores one knowledge file's already-chunked, already-embedded content. Each pair is
// one chunk's text alongside its embedding, in order.
pub fn insert_file_chunks(conn: &Connection, file_id: &str, file_name: &str, chunks: &[(String, Vec<f32>)]) -> Result<(), String> {
    for (text, embedding) in chunks {
        conn.execute(
            "INSERT INTO chunks (file_id, file_name, text) VALUES (?1, ?2, ?3)",
            params![file_id, file_name, text],
        )
        .map_err(|e| format!("Couldn't store a knowledge chunk: {e}"))?;
        let row_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO chunk_vectors (rowid, embedding) VALUES (?1, ?2)",
            params![row_id, f32_to_blob(embedding)],
        )
        .map_err(|e| format!("Couldn't index a knowledge chunk: {e}"))?;
    }
    Ok(())
}

pub fn count_chunks_for_file(conn: &Connection, file_id: &str) -> Result<usize, String> {
    conn.query_row("SELECT COUNT(*) FROM chunks WHERE file_id = ?1", params![file_id], |row| {
        row.get::<_, i64>(0)
    })
    .map(|count| count as usize)
    .map_err(|e| format!("Couldn't count stored chunks: {e}"))
}

// Removes every chunk (and its vector) belonging to one knowledge file — used when the
// user deletes it from an agent.
pub fn delete_file_chunks(conn: &Connection, file_id: &str) -> Result<(), String> {
    let mut stmt = conn.prepare("SELECT id FROM chunks WHERE file_id = ?1").map_err(|e| e.to_string())?;
    let ids: Vec<i64> = stmt
        .query_map(params![file_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    for id in ids {
        conn.execute("DELETE FROM chunk_vectors WHERE rowid = ?1", params![id]).map_err(|e| e.to_string())?;
    }
    conn.execute("DELETE FROM chunks WHERE file_id = ?1", params![file_id])
        .map_err(|e| format!("Couldn't remove a knowledge file's stored chunks: {e}"))?;
    Ok(())
}

pub fn has_any_chunks(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(count > 0)
}

// Finds the chunks most semantically relevant to `query_embedding`, across every
// knowledge file this agent has.
pub fn search(conn: &Connection, query_embedding: &[f32], top_k: usize) -> Result<Vec<RetrievedChunk>, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT c.text, c.file_name
            FROM chunk_vectors v
            JOIN chunks c ON c.id = v.rowid
            WHERE v.embedding MATCH ?1
            ORDER BY v.distance
            LIMIT ?2
            ",
        )
        .map_err(|e| format!("Couldn't prepare the knowledge search: {e}"))?;

    let rows = stmt
        .query_map(params![f32_to_blob(query_embedding), top_k as i64], |row| {
            Ok(RetrievedChunk { text: row.get(0)?, file_name: row.get(1)? })
        })
        .map_err(|e| format!("Couldn't run the knowledge search: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Couldn't read knowledge search results: {e}"))
}
