// Turns text into a vector that captures its *meaning*, not just its words — this is
// what lets a question match a knowledge chunk that never uses the same words, unlike
// plain keyword/grep search. Runs fully on-device (fastembed, no network call, no API
// key) so this never depends on a server or a paid embeddings API.
//
// The model is process-global and loaded lazily on first real use, not at app startup,
// since most sessions never touch an agent's knowledge files at all. The very first use
// may need to download the model file once (cached to disk after — see
// paths::embedding_model_cache_dir); every call after that is instant.

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

use super::paths::embedding_model_cache_dir;

static MODEL: OnceLock<Mutex<TextEmbedding>> = OnceLock::new();

// AllMiniLML6V2 is fastembed's smallest supported model — plenty of quality for
// grounding one agent's own knowledge files, and the lightest one-time download for a
// desktop app. Its output vectors are always this many numbers long; the vector
// database's table shape depends on this exact value matching at both write and read
// time.
pub const EMBEDDING_DIMENSIONS: usize = 384;

fn load_model(app: &AppHandle) -> Result<&'static Mutex<TextEmbedding>, String> {
    if let Some(model) = MODEL.get() {
        return Ok(model);
    }
    let cache_dir = embedding_model_cache_dir(app)?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("Couldn't create the embedding model cache: {e}"))?;
    let options = TextInitOptions::new(EmbeddingModel::AllMiniLML6V2).with_cache_dir(cache_dir);
    let model = TextEmbedding::try_new(options).map_err(|e| format!("Couldn't load the local embedding model: {e}"))?;
    // If two calls race here, the loser's model is just dropped — no correctness issue,
    // only a little wasted first-run work.
    let _ = MODEL.set(Mutex::new(model));
    Ok(MODEL.get().expect("just set above"))
}

// Embeds a batch of knowledge-chunk texts at ingest time.
pub fn embed_many(app: &AppHandle, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    let model = load_model(app)?;
    let mut guard = model.lock().map_err(|_| "The embedding model lock was poisoned".to_string())?;
    guard.embed(texts, None).map_err(|e| format!("Embedding failed: {e}"))
}

// Embeds a single user question at retrieval time.
pub fn embed_one(app: &AppHandle, text: &str) -> Result<Vec<f32>, String> {
    let mut vectors = embed_many(app, vec![text.to_string()])?;
    vectors.pop().ok_or_else(|| "The embedding model returned nothing".to_string())
}
