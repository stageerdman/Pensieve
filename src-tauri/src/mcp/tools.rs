// Pensieve MCP tools — operate directly on the vault filesystem (no SQLite index yet,
// see this update's wiki.md), mirroring the file layout src/lib/store/tauri.ts owns on
// the frontend: notes/<id>.md (frontmatter + Markdown body) + notes/<id>.meta.json
// (title/createdAt/updatedAt/categories/tags — system fields for fast listing).
// Deliberately only the tiny frontmatter subset src/lib/md/frontmatter.ts defines
// (categories/tags/links) — not a general YAML parser.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SNIPPET_RADIUS: usize = 160;
const DEFAULT_MAX_RESULTS: usize = 20;
const DEFAULT_RECENT_LIMIT: usize = 20;

fn notes_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("notes")
}
fn note_path(vault_root: &Path, id: &str) -> PathBuf {
    notes_dir(vault_root).join(format!("{id}.md"))
}
fn meta_path(vault_root: &Path, id: &str) -> PathBuf {
    notes_dir(vault_root).join(format!("{id}.meta.json"))
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct Meta {
    title: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<i64>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<i64>,
    #[serde(rename = "addedAt")]
    added_at: Option<i64>,
    categories: Option<Vec<String>>,
    tags: Option<Vec<String>>,
    pinned: Option<bool>,
    starred: Option<bool>,
    #[serde(rename = "openCount")]
    open_count: Option<u32>,
    #[serde(rename = "lastOpenedAt")]
    last_opened_at: Option<i64>,
}

#[derive(Debug, Default)]
struct Frontmatter {
    categories: Vec<String>,
    tags: Vec<String>,
    links: Vec<String>,
    /// Every other key (icon, forms' form/fromForm/formStatus, legacy `category`, …),
    /// kept verbatim in file order and written back unchanged — mirrors the frontend's
    /// NoteFields.extra so an MCP edit never erases metadata it doesn't model.
    extra: Vec<(String, String)>,
}

// Matches src/lib/md/frontmatter.ts's FENCE regex /^---\n([\s\S]*?)\n---\n?\n?/ and its
// three-key subset — see this file's header comment.
fn parse_frontmatter(raw: &str) -> (Frontmatter, String) {
    let mut fm = Frontmatter::default();
    if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            let block = &rest[..end];
            let mut body_start = end + 5; // len("\n---\n")
            if rest[body_start..].starts_with('\n') {
                body_start += 1;
            }
            for line in block.lines() {
                let Some(idx) = line.find(':') else { continue };
                let key = line[..idx].trim();
                let value = line[idx + 1..].trim();
                let list = |v: &str| -> Vec<String> {
                    v.trim()
                        .trim_start_matches('[')
                        .trim_end_matches(']')
                        .split(',')
                        .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                        .filter(|s| !s.is_empty())
                        .collect()
                };
                match key {
                    "categories" => fm.categories = list(value),
                    "tags" => fm.tags = list(value),
                    "links" => fm.links = list(value),
                    "" => {}
                    _ => fm.extra.push((key.to_string(), value.to_string())),
                }
            }
            return (fm, rest[body_start..].to_string());
        }
    }
    (fm, raw.to_string())
}

// Mirrors src/lib/md/frontmatter.ts's composeFrontmatter exactly (byte-for-byte spacing)
// so a note an MCP write tool touches round-trips through the frontend's own parser.
fn compose_frontmatter(fm: &Frontmatter, body: &str) -> String {
    if fm.categories.is_empty() && fm.tags.is_empty() && fm.links.is_empty() && fm.extra.is_empty() {
        return body.to_string();
    }
    let mut lines = vec!["---".to_string()];
    if !fm.categories.is_empty() {
        lines.push(format!("categories: [{}]", fm.categories.join(", ")));
    }
    lines.push(format!("tags: [{}]", fm.tags.join(", ")));
    lines.push(format!("links: [{}]", fm.links.join(", ")));
    for (k, v) in &fm.extra {
        lines.push(format!("{k}: {v}"));
    }
    lines.push("---".to_string());
    lines.push(String::new());
    format!("{}\n{}", lines.join("\n"), body)
}

fn read_meta(vault_root: &Path, id: &str) -> Meta {
    std::fs::read_to_string(meta_path(vault_root, id))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_meta(vault_root: &Path, id: &str, meta: &Meta) -> Result<(), String> {
    std::fs::create_dir_all(notes_dir(vault_root)).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(meta).map_err(|e| e.to_string())?;
    std::fs::write(meta_path(vault_root, id), json).map_err(|e| e.to_string())
}

fn excerpt(body: &str) -> String {
    let stripped: String = body
        .lines()
        .map(|l| l.trim_start_matches(['#', '*', '-', '>']).trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    stripped.chars().take(140).collect()
}

// A simplified stand-in for src/lib/md's real titleFromMarkdown — good enough for a
// just-created-by-the-AI note's title; the frontend recomputes the authoritative title
// from the body the next time it saves the note anyway.
fn derive_title(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| l.trim_start_matches('#').trim_start_matches(['-', '*', '+']).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

const BASE36: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

fn to_base36(mut n: u128) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(BASE36[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

// No extra `rand` dependency for one id generator — an xorshift seeded from the clock's
// low bits is more than enough entropy for a same-process-unique suffix.
fn fastrand_u128() -> u128 {
    let seed = std::time::Instant::now().elapsed().as_nanos().wrapping_add(std::process::id() as u128).wrapping_add(1);
    let mut x = seed | 1;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

/// Same shape as src/lib/store/tauri.ts's newId(): timestamp in base36 + a short random
/// suffix, so an MCP-created note's id looks exactly like one the app created itself.
fn new_id() -> String {
    let ts = to_base36(now_millis().max(0) as u128);
    let suffix = to_base36(fastrand_u128() % 36u128.pow(6));
    format!("{ts}-{suffix}")
}

fn list_ids(vault_root: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(notes_dir(vault_root)) else { return Vec::new() };
    entries
        .flatten()
        .filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".md").map(|s| s.to_string()))
        .collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub excerpt: String,
}

fn summarize(vault_root: &Path, id: &str) -> Option<NoteSummary> {
    let raw = std::fs::read_to_string(note_path(vault_root, id)).ok()?;
    let (fm, body) = parse_frontmatter(&raw);
    let meta = read_meta(vault_root, id);
    let title = meta.title.filter(|t| !t.is_empty()).unwrap_or_else(|| derive_title(&body));
    Some(NoteSummary {
        id: id.to_string(),
        title,
        created_at: meta.created_at.unwrap_or(0),
        updated_at: meta.updated_at.unwrap_or(0),
        categories: meta.categories.unwrap_or(fm.categories),
        tags: meta.tags.unwrap_or(fm.tags),
        excerpt: excerpt(&body),
    })
}

pub fn list_recent(vault_root: &Path, limit: Option<usize>, untagged_only: bool) -> Vec<NoteSummary> {
    let mut out: Vec<NoteSummary> = list_ids(vault_root)
        .iter()
        .filter_map(|id| summarize(vault_root, id))
        .filter(|n| !untagged_only || n.tags.is_empty())
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out.truncate(limit.unwrap_or(DEFAULT_RECENT_LIMIT).max(1));
    out
}

// ---- Tag vocabulary ------------------------------------------------------------
// A tag in Pensieve is a THREAD — a promise to retrieve (a project like @CANI, a
// practice, a focus to study one day), never a description. <vault>/tags.json holds
// the threads (+ a one-line "what belongs here" definition); the frontend owns the
// same file (src/lib/tags/store.ts) and treats names case/space/#-insensitively —
// tag_key mirrors src/lib/tags/vocab.ts tagKey.

const TAGS_FILE: &str = "tags.json";

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub struct TagDef {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition: Option<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct TagVocabFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    tags: Vec<TagDef>,
}

fn tag_key(name: &str) -> String {
    name.trim().trim_start_matches('#').split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn clean_tag(raw: &str) -> String {
    raw.trim().trim_end_matches(',').trim_start_matches('#').split_whitespace().collect::<Vec<_>>().join(" ")
}

fn read_vocab(vault_root: &Path) -> Vec<TagDef> {
    std::fs::read_to_string(vault_root.join(TAGS_FILE))
        .ok()
        .and_then(|raw| serde_json::from_str::<TagVocabFile>(&raw).ok())
        .map(|f| f.tags)
        .unwrap_or_default()
}

fn write_vocab(vault_root: &Path, tags: Vec<TagDef>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&TagVocabFile { version: 1, tags }).map_err(|e| e.to_string())?;
    std::fs::write(vault_root.join(TAGS_FILE), json).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct TagInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition: Option<String>,
    /// How many notes carry this tag.
    pub uses: usize,
}

/// The thread vocabulary ∪ tags in use (vocabulary spelling wins), most-used first.
pub fn list_tags(vault_root: &Path) -> Vec<TagInfo> {
    let mut out: Vec<TagInfo> = read_vocab(vault_root)
        .into_iter()
        .map(|d| TagInfo { name: d.name, definition: d.definition, uses: 0 })
        .collect();
    for id in list_ids(vault_root) {
        let Some(s) = summarize(vault_root, &id) else { continue };
        let mut seen = std::collections::HashSet::new();
        for t in s.tags {
            let k = tag_key(&t);
            if !seen.insert(k.clone()) {
                continue;
            }
            match out.iter_mut().find(|i| tag_key(&i.name) == k) {
                Some(i) => i.uses += 1,
                None => out.push(TagInfo { name: t, definition: None, uses: 1 }),
            }
        }
    }
    out.sort_by(|a, b| b.uses.cmp(&a.uses).then_with(|| a.name.cmp(&b.name)));
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub snippet: String,
}

fn find_snippet(text: &str, query_lower: &str) -> Option<String> {
    let text_lower = text.to_lowercase();
    let byte_index = text_lower.find(query_lower)?;
    let chars: Vec<char> = text.chars().collect();
    let mut char_index = 0;
    let mut seen_bytes = 0;
    for (i, ch) in chars.iter().enumerate() {
        if seen_bytes >= byte_index {
            char_index = i;
            break;
        }
        seen_bytes += ch.len_utf8();
    }
    let start = char_index.saturating_sub(SNIPPET_RADIUS);
    let end = (char_index + query_lower.chars().count() + SNIPPET_RADIUS).min(chars.len());
    let mut snippet: String = chars[start..end].iter().collect();
    if start > 0 {
        snippet = format!("…{snippet}");
    }
    if end < chars.len() {
        snippet = format!("{snippet}…");
    }
    Some(snippet)
}

/// Plain case-insensitive substring match across title + body — there's no embedding
/// index to search yet. Good enough for "find the note where I wrote about X."
pub fn search_notes(vault_root: &Path, query: &str, max_results: Option<usize>) -> Vec<SearchMatch> {
    let query_lower = query.to_lowercase();
    let mut out = Vec::new();
    for id in list_ids(vault_root) {
        let Ok(raw) = std::fs::read_to_string(note_path(vault_root, &id)) else { continue };
        let (fm, body) = parse_frontmatter(&raw);
        let meta = read_meta(vault_root, &id);
        let title = meta.title.clone().filter(|t| !t.is_empty()).unwrap_or_else(|| derive_title(&body));

        let title_hit = title.to_lowercase().contains(&query_lower);
        let body_hit = body.to_lowercase().contains(&query_lower);
        if !title_hit && !body_hit {
            continue;
        }
        let snippet = if body_hit { find_snippet(&body, &query_lower).unwrap_or_default() } else { excerpt(&body) };
        out.push(SearchMatch {
            id,
            title,
            updated_at: meta.updated_at.unwrap_or(0),
            categories: meta.categories.unwrap_or(fm.categories),
            tags: meta.tags.unwrap_or(fm.tags),
            snippet,
        });
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out.truncate(max_results.unwrap_or(DEFAULT_MAX_RESULTS).max(1));
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    pub body: String,
}

pub fn get_note(vault_root: &Path, id: &str) -> Result<NoteContent, String> {
    let raw = std::fs::read_to_string(note_path(vault_root, id)).map_err(|_| format!("no note with id {id}"))?;
    let (fm, body) = parse_frontmatter(&raw);
    let meta = read_meta(vault_root, id);
    let title = meta.title.clone().filter(|t| !t.is_empty()).unwrap_or_else(|| derive_title(&body));
    Ok(NoteContent {
        id: id.to_string(),
        title,
        created_at: meta.created_at.unwrap_or(0),
        updated_at: meta.updated_at.unwrap_or(0),
        categories: meta.categories.unwrap_or(fm.categories),
        tags: meta.tags.unwrap_or(fm.tags),
        links: fm.links,
        body,
    })
}

// ---------------------------------------------------------------------------
// Write tools — compiled and correct, but NOT in mcp/config.rs's ALLOWED_TOOLS
// yet (see this update's wiki.md). Kept in the same file as the read tools
// rather than split out: there's no bridge/permission system to separate them
// by (Pensieve is single-user, unlike masters-wheel's multi-Space model).
// ---------------------------------------------------------------------------

pub fn create_note(vault_root: &Path, body: String, categories: Vec<String>, tags: Vec<String>) -> Result<String, String> {
    let id = new_id();
    let now = now_millis();
    let fm = Frontmatter { categories: categories.clone(), tags: tags.clone(), links: Vec::new(), extra: Vec::new() };
    let file = compose_frontmatter(&fm, &body);
    std::fs::create_dir_all(notes_dir(vault_root)).map_err(|e| e.to_string())?;
    std::fs::write(note_path(vault_root, &id), file).map_err(|e| e.to_string())?;
    write_meta(
        vault_root,
        &id,
        &Meta {
            title: Some(derive_title(&body)),
            created_at: Some(now),
            updated_at: Some(now),
            added_at: Some(now),
            categories: Some(categories),
            tags: Some(tags),
            ..Default::default()
        },
    )?;
    Ok(id)
}

pub fn edit_note(
    vault_root: &Path,
    id: &str,
    body: Option<String>,
    categories: Option<Vec<String>>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let raw = std::fs::read_to_string(note_path(vault_root, id)).map_err(|_| format!("no note with id {id}"))?;
    let (mut fm, old_body) = parse_frontmatter(&raw);
    let mut meta = read_meta(vault_root, id);

    let new_body = body.unwrap_or(old_body);
    if let Some(c) = categories {
        fm.categories = c.clone();
        meta.categories = Some(c);
    }
    if let Some(t) = tags {
        fm.tags = t.clone();
        meta.tags = Some(t);
    }

    let file = compose_frontmatter(&fm, &new_body);
    std::fs::write(note_path(vault_root, id), file).map_err(|e| e.to_string())?;
    meta.title = Some(derive_title(&new_body));
    meta.updated_at = Some(now_millis());
    write_meta(vault_root, id, &meta)
}

/// Add a tag (thread) to a note. A known tag (vocabulary or in use, matched
/// case/space-insensitively) is written with its existing spelling. An unknown tag is
/// refused unless `create` is set — the AI must ask the owner before starting a new
/// thread — and when created it joins the vocabulary. Returns the spelling written.
pub fn add_tag(vault_root: &Path, id: &str, tag: &str, create: bool) -> Result<String, String> {
    let typed = clean_tag(tag);
    if typed.is_empty() || typed.contains(',') {
        return Err("invalid tag name (empty or contains a comma)".into());
    }
    let known = list_tags(vault_root).into_iter().find(|t| tag_key(&t.name) == tag_key(&typed)).map(|t| t.name);
    let name = match known {
        Some(n) => n,
        None if create => {
            let mut vocab = read_vocab(vault_root);
            vocab.push(TagDef { name: typed.clone(), definition: None });
            write_vocab(vault_root, vocab)?;
            typed
        }
        None => {
            return Err(format!(
                "\"{typed}\" is not an existing tag. Reuse one from list_tags, or ask the owner whether to start this new thread and only then call add_tag again with create: true."
            ))
        }
    };

    let raw = std::fs::read_to_string(note_path(vault_root, id)).map_err(|_| format!("no note with id {id}"))?;
    let (mut fm, body) = parse_frontmatter(&raw);
    if !fm.tags.iter().any(|t| tag_key(t) == tag_key(&name)) {
        fm.tags.push(name.clone());
    }
    let file = compose_frontmatter(&fm, &body);
    std::fs::write(note_path(vault_root, id), file).map_err(|e| e.to_string())?;

    let mut meta = read_meta(vault_root, id);
    meta.tags = Some(fm.tags);
    meta.updated_at = Some(now_millis());
    write_meta(vault_root, id, &meta)?;
    Ok(name)
}

pub fn link_note(vault_root: &Path, id: &str, linked_id: &str) -> Result<(), String> {
    let raw = std::fs::read_to_string(note_path(vault_root, id)).map_err(|_| format!("no note with id {id}"))?;
    let (mut fm, body) = parse_frontmatter(&raw);
    if !fm.links.iter().any(|l| l == linked_id) {
        fm.links.push(linked_id.to_string());
    }
    let file = compose_frontmatter(&fm, &body);
    std::fs::write(note_path(vault_root, id), file).map_err(|e| e.to_string())?;

    let mut meta = read_meta(vault_root, id);
    meta.updated_at = Some(now_millis());
    write_meta(vault_root, id, &meta)
}

#[cfg(test)]
mod tag_tests {
    use super::*;

    fn vault() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pensieve-tag-test-{}", new_id()));
        std::fs::create_dir_all(dir.join("notes")).unwrap();
        dir
    }

    #[test]
    fn add_tag_reuses_spelling_and_refuses_unknown_without_create() {
        let v = vault();
        write_vocab(&v, vec![TagDef { name: "@CANI".into(), definition: Some("daily actions".into()) }]).unwrap();
        let id = create_note(&v, "# Hello".into(), vec![], vec![]).unwrap();

        assert_eq!(add_tag(&v, &id, "@cani", false).unwrap(), "@CANI");
        assert!(add_tag(&v, &id, "@Brand New", false).is_err());
        assert_eq!(read_vocab(&v).len(), 1);

        assert_eq!(add_tag(&v, &id, "#@Brand  New", true).unwrap(), "@Brand New");
        assert_eq!(read_vocab(&v).len(), 2);
        assert_eq!(get_note(&v, &id).unwrap().tags, vec!["@CANI", "@Brand New"]);

        let tags = list_tags(&v);
        assert_eq!(tags[0].uses, 1);
        assert_eq!(list_recent(&v, None, true).len(), 0);
        assert_eq!(list_recent(&v, None, false).len(), 1);
        let _ = std::fs::remove_dir_all(&v);
    }
}

#[cfg(test)]
mod frontmatter_tests {
    use super::*;

    #[test]
    fn unknown_keys_and_icon_survive_a_round_trip() {
        let raw = "---\ncategories: [Journal]\ntags: [x]\nlinks: []\nicon: round-bottom/blue\nform: true\nfromForm: t-1\n---\n\n# Body\n";
        let (fm, body) = parse_frontmatter(raw);
        assert_eq!(fm.extra.len(), 3);
        assert_eq!(compose_frontmatter(&fm, &body), raw);
    }

    #[test]
    fn extra_alone_still_writes_a_block() {
        let (fm, body) = parse_frontmatter("---\nform: true\n---\n\nq");
        assert!(compose_frontmatter(&fm, &body).starts_with("---\n"));
    }
}
