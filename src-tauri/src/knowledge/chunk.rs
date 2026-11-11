// Splits extracted text into small, overlapping pieces small enough to retrieve
// precisely — a handful of paragraphs each, not a whole document. This is what makes
// retrieval possible at all: a vector search only returns whole rows, so a "row" needs
// to already be a focused-enough unit that returning it answers something specific.

const TARGET_CHUNK_CHARS: usize = 1500;
const OVERLAP_CHARS: usize = 200;

pub fn chunk_text(text: &str) -> Vec<String> {
    let paragraphs: Vec<&str> = text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()).collect();

    let mut chunks = Vec::new();
    let mut current = String::new();

    for paragraph in paragraphs {
        if !current.is_empty() && current.len() + paragraph.len() + 2 > TARGET_CHUNK_CHARS {
            chunks.push(current.clone());
            // Carry the tail of the chunk we just closed forward, so a fact sitting
            // right at a chunk boundary still appears in full in at least one chunk
            // instead of being cut in half. Byte length, not char count, is what String
            // slicing needs, but a non-ASCII character (e.g. "č") can be more than one
            // byte — slicing straight at `len() - OVERLAP_CHARS` can land inside one and
            // panic, so this walks forward to the next real char boundary instead of
            // assuming the arithmetic already landed on one.
            let target = current.len().saturating_sub(OVERLAP_CHARS);
            let overlap_start = (target..=current.len()).find(|&i| current.is_char_boundary(i)).unwrap_or(current.len());
            current = current[overlap_start..].to_string();
        }
        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(paragraph);
    }
    if !current.trim().is_empty() {
        chunks.push(current);
    }

    // A single paragraph longer than the target on its own (no blank lines in the source
    // at all) would otherwise become one giant "chunk" that defeats retrieval entirely —
    // split those further.
    chunks.into_iter().flat_map(|chunk| split_if_oversized(&chunk)).collect()
}

fn split_if_oversized(chunk: &str) -> Vec<String> {
    let chars: Vec<char> = chunk.chars().collect();
    if chars.len() <= TARGET_CHUNK_CHARS * 2 {
        return vec![chunk.to_string()];
    }
    chars.chunks(TARGET_CHUNK_CHARS).map(|slice| slice.iter().collect()).collect()
}
