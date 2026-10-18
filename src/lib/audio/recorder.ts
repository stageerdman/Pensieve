// The microphone capture engine — DOM/React-free, used by the presentational RecordingBar.
// It wraps getUserMedia + MediaRecorder (for the bytes) and a Web-Audio AnalyserNode (for
// the live amplitude that drives the waveform), and tracks elapsed time with pause support.
// The caller owns the rAF loop: each frame it reads sampleAmplitude() + elapsedSec() and
// repaints. stop() resolves with the recorded Blob (ready for saveAudioFile); cancel()
// discards. Framework-free so the iPhone capture app can reuse it unchanged later.

// Pure elapsed-time accounting (no DOM) — split out so the pause math is unit-testable.
// `now` is injected (performance.now at runtime) to keep it deterministic in tests.
export class RecordingClock {
  private startedAt = 0;
  private pausedAccumMs = 0;
  private pauseAtMs: number | null = null;

  start(now: number): void {
    this.startedAt = now;
    this.pausedAccumMs = 0;
    this.pauseAtMs = null;
  }
  pause(now: number): void {
    if (this.pauseAtMs === null) this.pauseAtMs = now;
  }
  resume(now: number): void {
    if (this.pauseAtMs !== null) {
      this.pausedAccumMs += now - this.pauseAtMs;
      this.pauseAtMs = null;
    }
  }
  get paused(): boolean {
    return this.pauseAtMs !== null;
  }
  /** Seconds of actual recording so far (paused spans excluded). */
  elapsedSec(now: number): number {
    const end = this.pauseAtMs ?? now;
    return Math.max(0, (end - this.startedAt - this.pausedAccumMs) / 1000);
  }
}

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export interface AudioRecorder {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** Stop, release the mic, and resolve with the captured audio. */
  stop(): Promise<Blob>;
  /** Abort and discard — releases the mic, no blob. */
  cancel(): void;
  /** Live input level 0..1 (RMS), or 0 when not actively recording. */
  sampleAmplitude(): number;
  elapsedSec(): number;
  state(): RecorderState;
  /** The MIME the blob will carry (chosen from what MediaRecorder supports). */
  mimeType(): string;
}

// Prefer M4A/AAC (audio/mp4) — the native app runs on macOS WKWebView, which plays mp4/aac
// flawlessly (with a duration + seeking) but handles its OWN MediaRecorder WebM/Opus output
// badly (no duration, glitchy playback — that cost us an hour tape once). Fall back to WebM
// only where mp4 recording isn't offered (e.g. Chromium in `npm run dev`). "" = let it choose.
const MIME_CANDIDATES = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", ""];

function pickMimeType(): string {
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const m of MIME_CANDIDATES) {
    if (m === "" || MR.isTypeSupported(m)) return m;
  }
  return "";
}

const clockNow = (): number =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

export function createRecorder(): AudioRecorder {
  const clock = new RecordingClock();
  let st: RecorderState = "idle";
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mime = "";
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;

  const teardown = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    audioCtx = null;
    analyser = null;
    data = null;
  };

  return {
    async start() {
      if (st !== "idle") return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Live amplitude via an analyser on the same stream (best-effort — failure here must
      // not sink the recording; we just lose the live waveform and fall back to flat).
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
        const srcNode = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        data = new Uint8Array(analyser.fftSize);
        srcNode.connect(analyser);
      } catch {
        analyser = null;
        data = null;
      }
      mime = pickMimeType();
      chunks = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      clock.start(clockNow());
      st = "recording";
    },

    pause() {
      if (st !== "recording" || !recorder) return;
      if (recorder.state === "recording") recorder.pause();
      clock.pause(clockNow());
      st = "paused";
    },

    resume() {
      if (st !== "paused" || !recorder) return;
      if (recorder.state === "paused") recorder.resume();
      clock.resume(clockNow());
      st = "recording";
    },

    stop() {
      return new Promise<Blob>((resolve, reject) => {
        if (!recorder || (st !== "recording" && st !== "paused")) {
          reject(new Error("recorder not active"));
          return;
        }
        const rec = recorder;
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          teardown();
          st = "stopped";
          resolve(blob);
        };
        try {
          rec.stop();
        } catch (e) {
          teardown();
          st = "stopped";
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },

    cancel() {
      if (recorder && (recorder.state === "recording" || recorder.state === "paused")) {
        try {
          recorder.onstop = null;
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      recorder = null;
      chunks = [];
      teardown();
      st = "stopped";
    },

    sampleAmplitude() {
      if (st !== "recording" || !analyser || !data) return 0;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let k = 0; k < data.length; k++) {
        const v = (data[k] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      return Math.max(0, Math.min(1, rms * 3.2)); // scale quiet speech up to a visible range
    },

    elapsedSec() {
      return clock.elapsedSec(clockNow());
    },

    state() {
      return st;
    },

    mimeType() {
      return mime;
    },
  };
}
