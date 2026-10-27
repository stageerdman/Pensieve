// pcmWav.ts — pure PCM capture → WAV helpers (no DOM/MediaRecorder dependency, fully testable).
//
// Replaces MediaRecorder for phone voice capture (see voiceCapture.ts's header for why): raw
// PCM16 bytes have no container framing, so chunks written in order concatenate byte-for-byte
// into one continuous stream — unlike MediaRecorder segments, there is no "part" boundary to
// protect and nothing that can fail to decode once joined. Captured at the mic's native rate,
// then decimated to TARGET_SAMPLE_RATE (16kHz — what the local Whisper models already expect,
// and small enough to bound file size: ~1.9MB/min mono 16-bit).

export const TARGET_SAMPLE_RATE = 16000;

export interface ResampleState {
  /** Fractional read position into the CURRENT input buffer, carried across calls so the
   *  decimator's phase stays continuous instead of resetting (and clicking) at every buffer
   *  boundary. Can be negative only in the sense that position 0 may still need `prevSample`
   *  (the last sample of the previous buffer) for interpolation. */
  pos: number;
  /** Last sample of the previous buffer — the "-1" sample for this buffer's interpolation. */
  prevSample: number;
}

export function createResampleState(): ResampleState {
  return { pos: 0, prevSample: 0 };
}

/** Linear-interpolation decimator: cheap, phase-continuous across buffers, good enough for
 *  voice (no separate anti-alias filter — acceptable per VOICE-SINGLE-FILE's trade-off). A
 *  no-op copy when the input is already at the target rate. */
export function resampleTo(input: Float32Array, inputRate: number, targetRate: number, state: ResampleState): Float32Array {
  if (inputRate === targetRate) {
    state.prevSample = input.length > 0 ? input[input.length - 1] : state.prevSample;
    return input.slice();
  }
  const ratio = inputRate / targetRate;
  const n = input.length;
  const sampleAt = (p: number): number => {
    const i0 = Math.floor(p);
    const i1 = i0 + 1;
    const t = p - i0;
    const v0 = i0 < 0 ? state.prevSample : input[i0];
    const v1 = i1 < 0 ? state.prevSample : i1 < n ? input[i1] : input[n - 1];
    return v0 + (v1 - v0) * t;
  };
  const out: number[] = [];
  let p = state.pos;
  while (p <= n - 1) {
    out.push(sampleAt(p));
    p += ratio;
  }
  state.pos = n > 0 ? p - n : p;
  if (n > 0) state.prevSample = input[n - 1];
  return Float32Array.from(out);
}

/** Float32 [-1, 1] samples → signed 16-bit PCM, little-endian (native typed-array byte order
 *  on every platform this runs on). */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function writeAsciiString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/** A standard 44-byte canonical PCM WAV header for mono 16-bit audio. */
export function buildWavHeader(dataSize: number, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  return buffer;
}

/** The whole take, in order, as ONE playable WAV Blob — a single header in front of the raw
 *  PCM chunks exactly as stored, concatenated as-is (no re-reading/copying their bytes). */
export function buildWavBlob(pcmChunks: Blob[], sampleRate: number): Blob {
  const dataSize = pcmChunks.reduce((sum, b) => sum + b.size, 0);
  const header = buildWavHeader(dataSize, sampleRate);
  return new Blob([header, ...pcmChunks], { type: "audio/wav" });
}
