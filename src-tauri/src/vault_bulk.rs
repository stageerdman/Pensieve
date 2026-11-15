// FAST-LOAD: bulk vault reads. The TS store used to list the vault with two serial
// `read_text` invokes per note (~4,200 IPC round-trips for 2,090 notes) before the first
// paint. These commands do the same reads in ONE invoke, fanned out across threads.
//
// The derived list fields (excerpt / chars / icon / links) are computed in TS — the one
// definition of those rules lives in lib/text.ts — and cached there (lib/store/listCache).
// So the listing command is a dumb, fast reader: per note it returns the meta sidecar plus
// the `.md` file's stamp (mtime + size), and the `.md` body ONLY when the caller's cached
// stamp for that note is missing or different. A warm start therefore ships no bodies.
//
// Pure-on-a-directory functions (`list_notes_in`, `read_bodies_in`, …) carry the logic so
// they're unit-testable and benchmarkable without an AppHandle; the #[tauri::command]
// wrappers only resolve the vault root.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

/// A `.md` file's change stamp: [mtime in microseconds since the epoch, byte size].
/// Microseconds stay well inside JS's 2^53 safe-integer range; size catches a rewrite
/// that lands inside the same mtime tick.
pub type Stamp = [u64; 2];

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct NoteRecord {
    pub id: String,
    /// The parsed `.meta.json` sidecar, or None when it's missing / unreadable JSON.
    pub meta: Option<serde_json::Value>,
    /// The `.md` stamp, or None when the `.md` vanished mid-listing.
    pub stamp: Option<Stamp>,
    /// The whole `.md` (frontmatter + body) — only when the caller's stamp missed.
    pub md: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct NoteBodyRecord {
    pub id: String,
    pub md: String,
}

fn stamp_of(p: &Path) -> Option<Stamp> {
    let m = fs::metadata(p).ok()?;
    let mtime = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_micros() as u64)
        .unwrap_or(0);
    Some([mtime, m.len()])
}

/// Every note id in `notes_dir` (the `.md` basenames), unordered.
fn note_ids(notes_dir: &Path) -> Vec<String> {
    let Ok(rd) = fs::read_dir(notes_dir) else { return vec![] };
    rd.flatten()
        .filter_map(|e| e.file_name().to_str().map(str::to_string))
        .filter_map(|n| n.strip_suffix(".md").map(str::to_string))
        .collect()
}

/// Run `f` over `items` on up to `available_parallelism` threads, preserving order.
/// std-only (scoped threads) — no rayon dependency for one fan-out.
fn par_map<T: Sync, R: Send>(items: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    if items.is_empty() {
        return vec![];
    }
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(16);
    let chunk = items.len().div_ceil(threads).max(1);
    let f = &f;
    std::thread::scope(|s| {
        let handles: Vec<_> = items
            .chunks(chunk)
            .map(|c| s.spawn(move || c.iter().map(f).collect::<Vec<R>>()))
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    })
}

/// List every note in `notes_dir`. `known` maps id → the stamp the caller has cached; a
/// note whose current stamp equals it comes back without its body. `with_bodies = false`
/// never reads a body (the sync engine only needs ids + meta timestamps).
pub fn list_notes_in(notes_dir: &Path, known: &HashMap<String, Stamp>, with_bodies: bool) -> Vec<NoteRecord> {
    let ids = note_ids(notes_dir);
    par_map(&ids, |id| {
        let md_path = notes_dir.join(format!("{id}.md"));
        let meta = fs::read_to_string(notes_dir.join(format!("{id}.meta.json")))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
        let stamp = stamp_of(&md_path);
        let wants_body = with_bodies && stamp.is_some() && known.get(id) != stamp.as_ref();
        let md = if wants_body { fs::read_to_string(&md_path).ok() } else { None };
        NoteRecord { id: id.clone(), meta, stamp, md }
    })
}

/// Every note's raw `.md` (frontmatter + body), for the full-text search index.
pub fn read_bodies_in(notes_dir: &Path) -> Vec<NoteBodyRecord> {
    let ids = note_ids(notes_dir);
    par_map(&ids, |id| {
        fs::read_to_string(notes_dir.join(format!("{id}.md")))
            .ok()
            .map(|md| NoteBodyRecord { id: id.clone(), md })
    })
    .into_iter()
    .flatten()
    .collect()
}

/// Read many vault-relative text files at once; None per missing/unreadable file.
/// Paths are pre-validated by the caller (see `read_texts_bulk`).
pub fn read_texts_in(root: &Path, rels: &[String]) -> Vec<Option<String>> {
    par_map(rels, |rel| fs::read_to_string(root.join(rel)).ok())
}

/// Every media ref (`media/<noteId>/<file>`) under `root`, in one walk.
pub fn list_media_in(root: &Path) -> Vec<String> {
    let media = root.join("media");
    let Ok(rd) = fs::read_dir(&media) else { return vec![] };
    let dirs: Vec<String> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| e.file_name().to_str().map(str::to_string))
        .collect();
    par_map(&dirs, |d| {
        let Ok(rd) = fs::read_dir(media.join(d)) else { return vec![] };
        rd.flatten()
            .filter_map(|e| e.file_name().to_str().map(|f| format!("media/{d}/{f}")))
            .collect::<Vec<_>>()
    })
    .into_iter()
    .flatten()
    .collect()
}

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    crate::resolve(app, "notes")
}

// Async commands run on Tauri's thread pool, not the main thread — a cold listing never
// blocks the window's event loop.
#[tauri::command]
pub async fn list_notes_bulk(
    app: AppHandle,
    known: Option<HashMap<String, Stamp>>,
    with_bodies: Option<bool>,
) -> Result<Vec<NoteRecord>, String> {
    let dir = notes_dir(&app)?;
    Ok(list_notes_in(&dir, &known.unwrap_or_default(), with_bodies.unwrap_or(true)))
}

#[tauri::command]
pub async fn read_note_bodies(app: AppHandle) -> Result<Vec<NoteBodyRecord>, String> {
    Ok(read_bodies_in(&notes_dir(&app)?))
}

#[tauri::command]
pub async fn read_texts_bulk(app: AppHandle, rels: Vec<String>) -> Result<Vec<Option<String>>, String> {
    // Same traversal guard as every single-file command, applied per path.
    for rel in &rels {
        crate::resolve(&app, rel)?;
    }
    Ok(read_texts_in(&crate::resolve(&app, "")?, &rels))
}

#[tauri::command]
pub async fn list_media_bulk(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(list_media_in(&crate::resolve(&app, "")?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pensieve-bulk-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("notes")).unwrap();
        d
    }

    fn write(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }

    #[test]
    fn lists_every_note_with_meta_and_body_on_a_cold_start() {
        let root = scratch("cold");
        let n = root.join("notes");
        for i in 0..50 {
            write(&n.join(format!("n{i}.md")), &format!("# Title {i}\nbody"));
            write(&n.join(format!("n{i}.meta.json")), &format!("{{\"title\":\"Title {i}\",\"updatedAt\":{i}}}"));
        }
        let mut recs = list_notes_in(&n, &HashMap::new(), true);
        recs.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(recs.len(), 50); // .meta.json files are not notes
        let r0 = recs.iter().find(|r| r.id == "n7").unwrap();
        assert_eq!(r0.meta.as_ref().unwrap()["updatedAt"], 7);
        assert_eq!(r0.md.as_deref(), Some("# Title 7\nbody"));
        assert_eq!(r0.stamp.unwrap()[1], "# Title 7\nbody".len() as u64);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_matching_stamp_skips_the_body_and_a_changed_file_resends_it() {
        let root = scratch("warm");
        let n = root.join("notes");
        write(&n.join("a.md"), "hello");
        write(&n.join("a.meta.json"), "{}");
        write(&n.join("b.md"), "world");
        let first = list_notes_in(&n, &HashMap::new(), true);
        let known: HashMap<String, Stamp> = first.iter().map(|r| (r.id.clone(), r.stamp.unwrap())).collect();

        let warm = list_notes_in(&n, &known, true);
        assert!(warm.iter().all(|r| r.md.is_none()), "warm start ships no bodies");

        // A rewrite (e.g. a sync pull) changes size → that note's body comes back.
        write(&n.join("a.md"), "hello again");
        let after = list_notes_in(&n, &known, true);
        let a = after.iter().find(|r| r.id == "a").unwrap();
        assert_eq!(a.md.as_deref(), Some("hello again"));
        assert!(after.iter().find(|r| r.id == "b").unwrap().md.is_none());
        // b has no sidecar → meta None, still listed (TS decides to skip it).
        assert!(after.iter().find(|r| r.id == "b").unwrap().meta.is_none());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn without_bodies_never_reads_a_body_and_bad_json_is_none() {
        let root = scratch("nobody");
        let n = root.join("notes");
        write(&n.join("a.md"), "x");
        write(&n.join("a.meta.json"), "{not json");
        let recs = list_notes_in(&n, &HashMap::new(), false);
        assert_eq!(recs.len(), 1);
        assert!(recs[0].md.is_none());
        assert!(recs[0].meta.is_none());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn bodies_texts_and_media_read_in_bulk() {
        let root = scratch("misc");
        write(&root.join("notes/a.md"), "A");
        write(&root.join("notes/b.md"), "B");
        write(&root.join("media/a/x.m4a"), "");
        write(&root.join("media/a/x.m4a.transcript.json"), "{\"t\":1}");
        write(&root.join("media/b/y.png"), "");
        let mut bodies = read_bodies_in(&root.join("notes"));
        bodies.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(bodies, vec![
            NoteBodyRecord { id: "a".into(), md: "A".into() },
            NoteBodyRecord { id: "b".into(), md: "B".into() },
        ]);
        let texts = read_texts_in(&root, &["media/a/x.m4a.transcript.json".into(), "media/nope.json".into()]);
        assert_eq!(texts, vec![Some("{\"t\":1}".into()), None]);
        let mut media = list_media_in(&root);
        media.sort();
        assert_eq!(media, vec!["media/a/x.m4a", "media/a/x.m4a.transcript.json", "media/b/y.png"]);
        assert!(list_media_in(&root.join("missing")).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    /// FAST-LOAD benchmark (ignored by default): old serial per-file reads vs the bulk
    /// parallel listing, against a vault COPY. Run via
    /// `updates/2026-11-15 FAST-LOAD - OPEN/bench/bench-rust.sh <vault-copy>`.
    #[test]
    #[ignore]
    fn bench_listing() {
        let Ok(root) = std::env::var("PENSIEVE_BENCH_VAULT") else { return };
        let n = Path::new(&root).join("notes");
        let t = std::time::Instant::now();
        // Old shape: per note, read meta then the whole .md, one after another.
        let mut bytes = 0usize;
        for id in note_ids(&n) {
            bytes += fs::read_to_string(n.join(format!("{id}.meta.json"))).map(|s| s.len()).unwrap_or(0);
            bytes += fs::read_to_string(n.join(format!("{id}.md"))).map(|s| s.len()).unwrap_or(0);
        }
        let serial = t.elapsed();
        let t = std::time::Instant::now();
        let cold = list_notes_in(&n, &HashMap::new(), true);
        let cold_t = t.elapsed();
        let known: HashMap<String, Stamp> = cold.iter().filter_map(|r| Some((r.id.clone(), r.stamp?))).collect();
        let t = std::time::Instant::now();
        let warm = list_notes_in(&n, &known, true);
        let warm_t = t.elapsed();
        let cold_json = serde_json::to_string(&cold).unwrap().len();
        let warm_json = serde_json::to_string(&warm).unwrap().len();
        let t = std::time::Instant::now();
        let media = list_media_in(Path::new(&root));
        let media_t = t.elapsed();
        println!(
            "BENCH notes={} bytes={bytes} serial_fs={serial:?} bulk_cold={cold_t:?} (payload {cold_json} B) bulk_warm={warm_t:?} (payload {warm_json} B) media_refs={} media_walk={media_t:?}",
            cold.len(),
            media.len()
        );
    }

    #[test]
    fn par_map_preserves_order() {
        let v: Vec<u32> = (0..1000).collect();
        assert_eq!(par_map(&v, |x| x * 2), v.iter().map(|x| x * 2).collect::<Vec<_>>());
        assert!(par_map(&Vec::<u32>::new(), |x| *x).is_empty());
    }
}
