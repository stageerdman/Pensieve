// Base64 <-> bytes, for shipping image bytes across the Tauri invoke boundary. A JS
// number-array over IPC is slow for image-sized payloads, so write_bytes/read_bytes take
// and return base64 strings and (de)code on the Rust side. These helpers are the JS half.

/** Encode raw bytes to a base64 string. Accepts a Uint8Array or ArrayBuffer. */
export function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Chunk to avoid blowing the argument limit of String.fromCharCode on large images.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode a base64 string back to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
