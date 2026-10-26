// voiceCapture.ts — the voice-recording engine + session lifecycle.
//
// Owns: the live MediaRecorder + analyser (for the waveform), a RecordingClock (ported
// verbatim from desktop src/lib/audio/recorder.ts — duplicated on purpose; the two apps are
// deliberately decoupled, see mediaStore.ts's header), chunked persistence via
// recordingStore.ts, and FINALIZE (session chunks -> a vault media ref -> a `pensieve:audio`
// block appended to the note). Exactly one recording can be active at a time (the UI only ever
// opens one panel), so this is module-level state, not a class instantiated per caller.
//
// Reliability model: every chunk is durably written the instant MediaRecorder hands it over.
// Finalize ALWAYS re-reads chunks from recordingStore (never trusts an in-memory array), so it
// behaves identically whether called from a clean Stop, the visibilitychange hidden-handler
// (phone locked / app backgrounded), or next launch's recovery sweep over an orphaned session.
// iOS Safari gives a home-screen PWA no real background mic capture, so "hidden" is treated as
// an immediate stop+save+notify rather than a pretend-pause — see wiki.md "Platform limits".

import {
  createSession,
  appendChunk,
  readChunksOrdered,
  listSessions,
  deleteSession,
  type RecordingSessionMeta,
} from "./recordingStore";
import { mintAudioRef, putMedia } from "./mediaStore";
import { parseNoteContent, serializeBlocks, type NoteBlock } from "./noteMedia";
import type { Note } from "../../types";

export type VoiceRecorderState = "recording" | "paused" | "stopping";

export interface VoiceCaptureDeps {
  /** Look up a note by id straight from the live vault (not the DOM) — finalize mutates it
   *  directly so it works the same whether or not that note happens to be open right now. */
  getNote: (noteId: string) => Note | undefined;
  /** Persist the vault + re-render the reel after a finalize mutates a note. */
  persistAndRender: () => void;
  /** If `noteId` happens to be the currently OPEN note, patch its live DOM too. No-op (or
   *  omitted) otherwise — the next time that note opens, renderNoteBody reads the same block
   *  from `note.c`. */
  patchLiveNote?: (noteId: string, block: Extract<NoteBlock, { kind: "audio" }>) => void;
  /** Best-effort user feedback. Omit the call entirely when there's nothing worth saying
   *  (e.g. the app wasn't visible to see it). */
  toast?: (msg: string) => void;
  /** Called by the UI panel (never by this engine) right after the mic genuinely starts —
   *  carried on this same deps bag purely so PhoneApp has one seam, not two. */
  onRecordingStarted?: (noteId: string) => void;
  /** A session finalized with ZERO captured chunks (stopped within the first flush interval)
   *  — if the note's content still exactly matches what it was when recording started (nothing
   *  else happened meanwhile), undo the early commit rather than leave an empty note behind. */
  removeIfUntouched?: (noteId: string, placeholderBody: string) => void;
}

// Prefer M4A/AAC (audio/mp4) — Safari/WebKit (both the desktop app's WKWebView and iOS Safari,
// which is what actually runs this PWA) record straight to mp4/aac with correct duration and
// seeking; Chromium-only engines fall back to WebM/Opus. Mirrors desktop's recorder.ts exactly.
const MIME_CANDIDATES = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", ""];

// Crash-safety granularity: every SEGMENT_MS, the live MediaRecorder is cleanly stopped and a
// fresh one started on the same stream, instead of using a timeslice. This is NOT cosmetic —
// WebKit's audio/mp4 MediaRecorder only produces a reliably decodable file when `start()` is
// called with no timeslice and `stop()` is called with no preceding `requestData()`; a
// timesliced recording's chunks are fragments that silently fail to decode once concatenated
// (confirmed independently, not just a hunch — see wiki.md for the write-up and sources). Each
// SEGMENT_MS-sized piece is therefore a fully standalone, independently playable file in its own
// right. A crash/kill loses at most the currently-open segment (worse granularity than the old
// 3s timeslice, but the old scheme produced files that silently never played at all — regardless
// of chunking, undecodable is strictly worse than "lost a bit more on a crash").
const SEGMENT_MS = 30000;

function pickMimeType(): string {
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const m of MIME_CANDIDATES) {
    if (m === "" || MR.isTypeSupported(m)) return m;
  }
  return "";
}

const clockNow = (): number => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function mintSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Pure elapsed-time accounting (no DOM) — ported from desktop src/lib/audio/recorder.ts so the
// pause math stays unit-testable there and here without a cross-app import.
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
  elapsedSec(now: number): number {
    const end = this.pauseAtMs ?? now;
    return Math.max(0, (end - this.startedAt - this.pausedAccumMs) / 1000);
  }
}

/** mm:ss, growing to h:mm:ss past an hour — a multi-hour take is exactly what this is built for. */
export function fmtElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function sampleAmplitude(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let k = 0; k < data.length; k++) {
    const v = (data[k] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.max(0, Math.min(1, rms * 3.2));
}

interface ActiveState {
  session: RecordingSessionMeta;
  deps: VoiceCaptureDeps;
  stream: MediaStream;
  /** The CURRENT segment's recorder — replaced wholesale every SEGMENT_MS (or on pause/resume),
   *  never timesliced. See SEGMENT_MS's comment for why. */
  recorder: MediaRecorder;
  seq: number;
  clock: RecordingClock;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  audioCtx: AudioContext | null;
  state: VoiceRecorderState;
  wakeLock: { release: () => Promise<void> } | null;
  /** The most recently scheduled chunk write for the CURRENT segment — awaited before finalize
   *  reads chunks back, so the fire-and-forget IndexedDB write can never lose a race. */
  lastAppend: Promise<void>;
  /** Fires the next segment rotation; cleared on pause/stop (a pause or stop is itself a
   *  checkpoint, no need for the timer to also fire). */
  rotateTimer: ReturnType<typeof setTimeout> | null;
  /** Serializes stop-segment/start-segment operations so a rotation firing mid-pause (or a
   *  rapid pause/resume tap) can never run two MediaRecorder transitions concurrently. */
  opChain: Promise<void>;
}

let active: ActiveState | null = null;
let visibilityInstalled = false;
let notifPermissionAsked = false;

function describeMicError(e: unknown): string {
  const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is off — enable it for Pensieve in Settings.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone found.";
  return "Microphone unavailable.";
}

// Each stored chunk is now a fully standalone, independently finalized segment file (see
// SEGMENT_MS) — NOT a fragment that needs concatenating. A take longer than one segment becomes
// several sequential `pensieve:audio` blocks ("Part 1 of 3", etc.) rather than one glued blob;
// that's what makes every single one of them guaranteed-playable instead of betting the whole
// take on fragile byte-level concatenation. `pensieve:audio` already supports multiple blocks
// per note (you can already record twice into the same note) — this just uses that existing path.
async function finalizeAndCleanup(session: RecordingSessionMeta, deps: VoiceCaptureDeps, toastMsg?: string): Promise<void> {
  const chunks = await readChunksOrdered(session.id);
  if (chunks.length === 0) {
    deps.removeIfUntouched?.(session.noteId, session.placeholderBody);
    await deleteSession(session.id);
    return;
  }
  const note = deps.getNote(session.noteId);
  if (note) {
    const blocks: NoteBlock[] = parseNoteContent(note.c || "");
    const total = chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      const ref = mintAudioRef(session.noteId, session.mimeType);
      await putMedia(ref, chunks[i]);
      const audioBlock: Extract<NoteBlock, { kind: "audio" }> = {
        kind: "audio",
        ref,
        ...(total > 1 ? { caption: `Part ${i + 1} of ${total}` } : {}),
      };
      blocks.push(audioBlock);
      deps.patchLiveNote?.(session.noteId, audioBlock);
    }
    note.c = serializeBlocks(blocks);
    note.updatedAt = Date.now();
    note.d = "Just now";
    deps.persistAndRender();
    if (toastMsg) deps.toast?.(toastMsg);
  }
  await deleteSession(session.id);
}

function teardownStream(a: ActiveState) {
  a.stream.getTracks().forEach((t) => t.stop());
  if (a.audioCtx && a.audioCtx.state !== "closed") void a.audioCtx.close();
  try {
    void a.wakeLock?.release();
  } catch {
    /* already released */
  }
}

function bindRecorder(a: ActiveState, recorder: MediaRecorder, seq: number) {
  recorder.ondataavailable = (e: BlobEvent) => {
    if (active !== a || a.recorder !== recorder) return;
    if (e.data && e.data.size > 0) a.lastAppend = appendChunk(a.session.id, seq, e.data);
  };
  recorder.onerror = () => void handleRecorderFailure();
}

/** Cleanly stop the CURRENT segment's MediaRecorder (no `requestData()` beforehand — see
 *  SEGMENT_MS) and wait for its one-and-only `dataavailable` to durably land in IndexedDB.
 *  Resolves even if `onstop` never fires (a stalled mic/device), so callers never hang. */
function stopCurrentSegment(a: ActiveState): Promise<void> {
  return new Promise((resolve) => {
    const recorder = a.recorder;
    if (recorder.state === "inactive") {
      void a.lastAppend.finally(resolve);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      void a.lastAppend.finally(resolve);
    };
    recorder.onstop = finish;
    try {
      recorder.stop();
    } catch {
      finish();
    }
    setTimeout(finish, 4000);
  });
}

function scheduleRotateTimer(a: ActiveState) {
  a.rotateTimer = setTimeout(() => {
    a.opChain = a.opChain.then(() => rotateSegment(a)).catch(() => {});
  }, SEGMENT_MS);
}

/** Start a brand-new segment on the SAME stream — the counterpart to `stopCurrentSegment`.
 *  No-ops if the engine moved on (paused/stopped) while this was queued behind `opChain`. */
function startNewSegment(a: ActiveState): Promise<void> {
  if (active !== a || a.state !== "recording") return Promise.resolve();
  const seq = a.seq++;
  const recorder = new MediaRecorder(a.stream, a.session.mimeType ? { mimeType: a.session.mimeType } : undefined);
  a.recorder = recorder;
  a.lastAppend = Promise.resolve();
  bindRecorder(a, recorder, seq);
  recorder.start(); // deliberately no timeslice — see SEGMENT_MS
  scheduleRotateTimer(a);
  return Promise.resolve();
}

async function rotateSegment(a: ActiveState): Promise<void> {
  if (active !== a || a.state !== "recording") return;
  await stopCurrentSegment(a);
  await startNewSegment(a);
}

function playBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* no-op */
  }
}

function notifyBackgroundStop(elapsedSec: number) {
  playBeep();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("Recording stopped", { body: `Phone locked — saved ${fmtElapsed(elapsedSec)} so far.` });
  } catch {
    /* no-op */
  }
}

async function ensureNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default" || notifPermissionAsked) return;
  notifPermissionAsked = true;
  try {
    await Notification.requestPermission();
  } catch {
    /* no-op */
  }
}

async function onBackgrounded() {
  if (!active || active.state === "stopping") return;
  const a = active;
  const elapsed = a.clock.elapsedSec(clockNow());
  notifyBackgroundStop(elapsed);
  if (a.rotateTimer) clearTimeout(a.rotateTimer);
  a.state = "stopping";
  a.opChain = a.opChain.then(() => stopCurrentSegment(a)).catch(() => {});
  await a.opChain;
  await finalizeAndCleanup(a.session, a.deps); // no toast — the app isn't visible to see it
  teardownStream(a);
  if (active === a) active = null;
}

function installVisibilityHandlerOnce() {
  if (visibilityInstalled) return;
  visibilityInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void onBackgrounded();
  });
}

async function requestWakeLock(a: ActiveState) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) a.wakeLock = await nav.wakeLock.request("screen");
  } catch {
    /* unsupported / denied — wake lock is a best-effort nicety, not a correctness requirement */
  }
}

async function handleRecorderFailure() {
  if (!active) return;
  const a = active;
  if (a.rotateTimer) clearTimeout(a.rotateTimer);
  active = null;
  await finalizeAndCleanup(a.session, a.deps, "Recording stopped — a problem interrupted the mic, saved what we had");
  teardownStream(a);
}

/** True while a recording is active (recording or paused) — the UI uses this to decide whether
 *  reopening the app should show a "recording in progress" panel vs. a plain closed state. */
export function isRecording(): boolean {
  return active !== null;
}

/** Start capturing into `noteId`. `placeholderBody` is the note's untouched content at this
 *  exact moment — stored on the session so a later zero-chunk finalize can tell "still
 *  untouched" apart from "the user added real content while this was running" (see
 *  VoiceCaptureDeps.removeIfUntouched). Resolves `{ok:false}` if the mic can't be opened — the
 *  caller shows that as an inline error, no note mutation happens. */
export async function startRecording(
  noteId: string,
  placeholderBody: string,
  deps: VoiceCaptureDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (active) return { ok: false, error: "A recording is already in progress." };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return { ok: false, error: describeMicError(e) };
  }

  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  let audioCtx: AudioContext | null = null;
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

  const requested = pickMimeType();
  const recorder = new MediaRecorder(stream, requested ? { mimeType: requested } : undefined);
  // The blob we eventually build MUST be tagged with what the browser actually encoded, not
  // what we asked for — `recorder.mimeType` is the browser's own negotiated value (it can
  // differ from `requested`, e.g. when requested is "" and it picks its platform default).
  // Stamping a final Blob with the wrong type is a real way to get an undecodable file.
  const mimeType = recorder.mimeType || requested;
  const session: RecordingSessionMeta = { id: mintSessionId(), noteId, mimeType, startedAt: Date.now(), placeholderBody };
  await createSession(session);

  const clock = new RecordingClock();
  const a: ActiveState = {
    session,
    deps,
    stream,
    recorder,
    seq: 0,
    clock,
    analyser,
    data,
    audioCtx,
    state: "recording",
    wakeLock: null,
    lastAppend: Promise.resolve(),
    rotateTimer: null,
    opChain: Promise.resolve(),
  };
  active = a;

  bindRecorder(a, recorder, a.seq++);
  recorder.start(); // deliberately no timeslice — see SEGMENT_MS
  scheduleRotateTimer(a);
  clock.start(clockNow());

  installVisibilityHandlerOnce();
  void requestWakeLock(a);
  void ensureNotificationPermission();
  return { ok: true };
}

/** Pause: cleanly stops the current segment first, so a pause point is itself a safe,
 *  guaranteed-playable checkpoint — "if never resumed, it's just saved just in case." Resume
 *  starts a brand-new segment rather than resuming the old MediaRecorder in place, same reason
 *  as SEGMENT_MS: a resumed recorder behaves like a timeslice for decodability purposes. */
export function pauseRecording(): void {
  if (!active || active.state !== "recording") return;
  const a = active;
  if (a.rotateTimer) {
    clearTimeout(a.rotateTimer);
    a.rotateTimer = null;
  }
  a.clock.pause(clockNow());
  a.state = "paused";
  a.opChain = a.opChain.then(() => stopCurrentSegment(a)).catch(() => {});
}

export function resumeRecording(): void {
  if (!active || active.state !== "paused") return;
  const a = active;
  a.clock.resume(clockNow());
  a.state = "recording";
  a.opChain = a.opChain.then(() => startNewSegment(a)).catch(() => {});
}

/** Manual stop — finalize into the note and tear down. Resolves once the note has the block(s). */
export async function stopRecording(): Promise<void> {
  if (!active) return;
  const a = active;
  if (a.rotateTimer) clearTimeout(a.rotateTimer);
  a.state = "stopping";
  a.opChain = a.opChain.then(() => stopCurrentSegment(a)).catch(() => {});
  await a.opChain;
  await finalizeAndCleanup(a.session, a.deps, "Recording saved");
  teardownStream(a);
  if (active === a) active = null;
}

/** A live snapshot for the panel's rAF loop — null when nothing is recording. */
export function activeSnapshot(): { state: VoiceRecorderState; elapsedSec: number; sampleAmplitude: number } | null {
  if (!active) return null;
  const amp = active.state === "recording" && active.analyser && active.data ? sampleAmplitude(active.analyser, active.data) : 0;
  return { state: active.state, elapsedSec: active.clock.elapsedSec(clockNow()), sampleAmplitude: amp };
}

/** Startup recovery sweep: finalize any session left behind by a harder kill than the
 *  hidden-handler could catch (OS killed the page outright). Cheap no-op when there's nothing
 *  to recover. Never touches whatever session is currently active. */
export async function recoverOrphanedRecordings(deps: VoiceCaptureDeps): Promise<number> {
  const sessions = await listSessions();
  let recovered = 0;
  for (const s of sessions) {
    if (active && active.session.id === s.id) continue;
    await finalizeAndCleanup(s, deps, "Recovered an unfinished recording");
    recovered++;
  }
  return recovered;
}
