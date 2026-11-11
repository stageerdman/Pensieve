// Turns one knowledge file into plain text, the only input the rest of the pipeline
// (chunk -> embed -> store) understands. Only .txt/.md/.pdf are supported today —
// anything else fails loudly with a clear reason rather than silently storing nothing.

use std::path::Path;

pub fn extract_text(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "txt" | "md" | "markdown" => {
            std::fs::read_to_string(path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))
        }
        "pdf" => {
            let path_str = path.to_str().ok_or("This file's path isn't valid UTF-8".to_string())?;
            pdf_extract::extract_text(path_str).map_err(|e| format!("Couldn't extract text from this PDF: {e}"))
        }
        other => Err(format!(
            "Unsupported knowledge file type \".{other}\" — only .txt, .md, and .pdf are supported right now."
        )),
    }
}
