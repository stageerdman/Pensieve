// wavRepair.ts — pure: turn a possibly-broken voice recording back into a playable WAV.
//
// A phone recording is raw PCM16 behind one 44-byte header (pcmWav.ts), so almost any damage
// is repairable: a header whose sizes don't match the bytes (truncated / grown file), a missing
// header (bare PCM), or a ragged last sample. The rule is "keep every byte of audio we have":
// the data runs to the end of the file unless the header's size is a believable, smaller one.
// Anything that is clearly another container (mp4/ogg/webm/mp3) is left alone — re-wrapping
// it in a WAV header would turn a maybe-playable file into certain noise.

import { buildWavHeader } from "./pcmWav";

export interface WavRepair {
  bytes: Uint8Array;
  /** False when the input was already a canonical, consistent WAV — nothing to write back. */
  changed: boolean;
}

interface PcmFormat {
  sampleRate: number;
  channels: number;
  bits: number;
}

const PCM_FORMAT = 1;
const MIN_RATE = 4000;
const MAX_RATE = 192000;

const ascii = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

function looksLikeOtherContainer(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (ascii(b, 4) === "ftyp") return true; // mp4 / m4a
  const head = ascii(b, 0);
  if (head === "OggS" || head.startsWith("ID3")) return true;
  return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3; // webm / matroska
}

const isChunkId = (id: string): boolean => /^[\x20-\x7e]{4}$/.test(id);

function believableFormat(f: PcmFormat): boolean {
  return f.sampleRate >= MIN_RATE && f.sampleRate <= MAX_RATE && f.channels >= 1 && f.channels <= 2 && (f.bits === 8 || f.bits === 16 || f.bits === 24 || f.bits === 32);
}

/** Locate the PCM data inside a RIFF/WAVE file, tolerating wrong sizes. null = not PCM WAV. */
function readRiff(b: Uint8Array, fallback: PcmFormat): { format: PcmFormat; start: number; end: number } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let format = fallback;
  let off = 12;
  while (off + 8 <= b.length) {
    const id = ascii(b, off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= b.length) {
      if (view.getUint16(body, true) !== PCM_FORMAT) return null;
      const parsed = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
      format = believableFormat(parsed) ? parsed : fallback;
    } else if (id === "data") {
      // Trust the declared size only if it ends at EOF or right before another real chunk;
      // otherwise the header is stale and the audio really runs to the end of the file.
      const declaredEnd = body + size;
      const fitsExactly = declaredEnd === b.length || (declaredEnd + 8 <= b.length && isChunkId(ascii(b, declaredEnd)));
      const end = size > 0 && fitsExactly ? declaredEnd : b.length;
      return { format, start: body, end };
    }
    off = body + size + (size % 2); // RIFF chunks are word-aligned
  }
  // No data chunk found: everything after the standard 44-byte header is the best guess.
  return b.length > 44 ? { format, start: 44, end: b.length } : null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A playable WAV built from `input`, or null when there's no audio to save in it.
 *  `fallbackRate` is used for a headerless file or an unbelievable header (the phone always
 *  records at pcmWav.TARGET_SAMPLE_RATE). */
export function repairWav(input: Uint8Array, fallbackRate: number): WavRepair | null {
  const fallback: PcmFormat = { sampleRate: fallbackRate, channels: 1, bits: 16 };
  const isRiff = input.length >= 12 && ascii(input, 0) === "RIFF" && ascii(input, 8) === "WAVE";
  if (!isRiff && looksLikeOtherContainer(input)) return null;
  const found = isRiff ? readRiff(input, fallback) : { format: fallback, start: 0, end: input.length };
  if (!found) return null;

  const { format } = found;
  const blockAlign = (format.channels * format.bits) / 8;
  const dataSize = found.end - found.start - ((found.end - found.start) % blockAlign);
  if (dataSize <= 0) return null;

  const out = new Uint8Array(44 + dataSize);
  out.set(new Uint8Array(buildWavHeader(dataSize, format.sampleRate, format.channels, format.bits)), 0);
  out.set(input.subarray(found.start, found.start + dataSize), 44);
  return { bytes: out, changed: !sameBytes(out, input) };
}
