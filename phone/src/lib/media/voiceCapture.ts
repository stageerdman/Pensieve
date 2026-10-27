// voiceCapture.ts — the voice-recording engine + session lifecycle.
//
// Owns: a live Web Audio capture graph + analyser (for the waveform), a RecordingClock (ported
// verbatim from desktop src/lib/audio/recorder.ts — duplicated on purpose; the two apps are
// deliberately decoupled, see mediaStore.ts's header), chunked persistence via
// recordingStore.ts, and FINALIZE (session chunks -> one WAV vault media ref -> a single
// `pensieve:audio` block appended to the note). Exactly one recording can be active at a time
// (the UI only ever opens one panel), so this is module-level state, not a class instantiated
// per caller.
//
// Why no MediaRecorder: WebKit's audio/mp4 MediaRecorder only produces a reliably decodable
// file when started once and stopped once with no timeslice — a timesliced recording's chunks
// are fragments that silently fail to decode once concatenated, and even "fixing" that by
// restarting MediaRecorder every N seconds (VOICE-PLAYBACK-FIX, 2026-10-26) just traded
// undecodable fragments for a take getting split into several standalone "Part N of M" blocks,
// plus a real WebKit data race where the FIRST segment's final `dataavailable` can land after
// the recorder has already been swapped for the next segment and gets silently dropped.
// Recording raw PCM via a ScriptProcessorNode instead sidesteps all of it: PCM chunks have no
// container framing, so writing them to IndexedDB in order and concatenating them at finalize
// time behind one WAV header always yields exactly one playable file — there is no decodability
// boundary to protect, so pause/resume doesn't need to tear down and rebuild anything either; it
// just gates whether incoming samples get written.
//
// Reliability model: every chunk is durably written the instant it's captured. Finalize ALWAYS
// re-reads chunks from recordingStore (never trusts an in-memory array), so it behaves
// identically whether called from a clean Stop, the visibilitychange hidden-handler (phone
// locked / app backgrounded), or next launch's recovery sweep over an orphaned session. iOS
// Safari gives a home-screen PWA no real background mic capture, so "hidden" is treated as an
// immediate stop+save+notify rather than a pretend-pause — see wiki.md "Platform limits".

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
import { TARGET_SAMPLE_RATE, createResampleState, resampleTo, floatTo16BitPCM, buildWavBlob, type ResampleState } from "./pcmWav";
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

// A ScriptProcessorNode callback at a typical mobile buffer size (4096 samples) fires every
// ~85-100ms — plenty fine-grained for crash safety (a kill loses at most one callback's worth
// of audio) without the per-chunk bookkeeping a MediaRecorder timeslice needed.
const PROCESSOR_BUFFER_SIZE = 4096;

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
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  /** Continuous for the WHOLE session — never torn down/rebuilt on pause/resume, since raw PCM
   *  has no decodability boundary to protect (that's what made MediaRecorder's segment dance
   *  necessary). Routed through a zero-gain node to a destination so WebKit keeps delivering
   *  callbacks without the mic being audibly echoed back to the speaker. */
  processor: ScriptProcessorNode;
  silentGain: GainNode;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  resample: ResampleState;
  seq: number;
  clock: RecordingClock;
  state: VoiceRecorderState;
  wakeLock: { release: () => Promise<void> } | null;
  /** Gates whether `onaudioprocess` callbacks get written to IndexedDB — false while paused.
   *  The mic/stream/graph all stay live through a pause (matches the old behavior), only the
   *  write path is gated, so resume needs no setup at all. */
  capturing: boolean;
  /** The most recently scheduled chunk write — awaited before finalize reads chunks back, so
   *  the fire-and-forget IndexedDB write can never lose a race. */
  lastAppend: Promise<void>;
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

/** A session orphaned by a crash that happened on the PREVIOUS (MediaRecorder-segment) build,
 *  still sitting in IndexedDB when this build's recovery sweep runs. Each stored chunk there is
 *  already an independently-playable segment file in its own right (never raw PCM), so it must
 *  be finalized the old way — one block per chunk, "Part N of M" when there's more than one —
 *  NOT run through buildWavBlob, which would silently produce a corrupt file. Drop once enough
 *  time has passed that no pre-upgrade session could still be orphaned (every session this
 *  build creates has mimeType "audio/wav").
 */
async function finalizeLegacySegments(session: RecordingSessionMeta, deps: VoiceCaptureDeps, chunks: Blob[], toastMsg?: string): Promise<void> {
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
}

// Always exactly ONE `pensieve:audio` block — every stored chunk is raw PCM16 audio at the
// session's sample rate, concatenated behind a single WAV header (see pcmWav.ts). No "Part N of
// M" splitting: that was only ever needed to work around MediaRecorder segment boundaries,
// which don't exist in this pipeline.
async function finalizeAndCleanup(session: RecordingSessionMeta, deps: VoiceCaptureDeps, toastMsg?: string): Promise<void> {
  const chunks = await readChunksOrdered(session.id);
  if (chunks.length === 0) {
    deps.removeIfUntouched?.(session.noteId, session.placeholderBody);
    await deleteSession(session.id);
    return;
  }
  if (session.mimeType !== "audio/wav") {
    // Pre-upgrade orphan — see finalizeLegacySegments.
    await finalizeLegacySegments(session, deps, chunks, toastMsg);
    await deleteSession(session.id);
    return;
  }
  const note = deps.getNote(session.noteId);
  if (note) {
    const blocks: NoteBlock[] = parseNoteContent(note.c || "");
    const wav = buildWavBlob(chunks, session.sampleRate);
    const ref = mintAudioRef(session.noteId, session.mimeType);
    await putMedia(ref, wav);
    const audioBlock: Extract<NoteBlock, { kind: "audio" }> = { kind: "audio", ref };
    blocks.push(audioBlock);
    deps.patchLiveNote?.(session.noteId, audioBlock);
    note.c = serializeBlocks(blocks);
    note.updatedAt = Date.now();
    note.d = "Just now";
    deps.persistAndRender();
    if (toastMsg) deps.toast?.(toastMsg);
  }
  await deleteSession(session.id);
}

function teardownStream(a: ActiveState) {
  a.processor.onaudioprocess = null;
  try {
    a.processor.disconnect();
    a.source.disconnect();
    a.silentGain.disconnect();
    a.analyser?.disconnect();
  } catch {
    /* already disconnected */
  }
  a.stream.getTracks().forEach((t) => t.stop());
  if (a.audioCtx.state !== "closed") void a.audioCtx.close();
  try {
    void a.wakeLock?.release();
  } catch {
    /* already released */
  }
}

function bindProcessor(a: ActiveState) {
  a.processor.onaudioprocess = (e: AudioProcessingEvent) => {
    if (active !== a || !a.capturing) return;
    const input = e.inputBuffer.getChannelData(0);
    const resampled = resampleTo(input, a.audioCtx.sampleRate, TARGET_SAMPLE_RATE, a.resample);
    if (resampled.length === 0) return;
    const pcm16 = floatTo16BitPCM(resampled);
    const seq = a.seq++;
    // pcm16 always owns a fresh, non-shared ArrayBuffer (`new Int16Array(length)` above) —
    // the cast just works around TS's overly-general ArrayBufferLike/BlobPart typing.
    a.lastAppend = appendChunk(a.session.id, seq, new Blob([pcm16.buffer as ArrayBuffer]));
  };
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
  a.state = "stopping";
  a.capturing = false;
  await a.lastAppend;
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

async function handleCaptureFailure() {
  if (!active) return;
  const a = active;
  active = null;
  a.capturing = false;
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

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AC();
  const source = audioCtx.createMediaStreamSource(stream);

  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  try {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    data = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
  } catch {
    analyser = null;
    data = null;
  }

  // `createScriptProcessor` is deprecated in favor of AudioWorklet, but it needs no separate
  // module file to ship/load and runs fine for this: short, foreground-only sessions (iOS gives
  // a backgrounded PWA no real mic capture anyway, so there's no long-running-worklet case to
  // optimize for). Mono in, mono (silent) out.
  const processor = audioCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0; // keep the callback alive without echoing the mic to the speaker
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  const mimeType = "audio/wav";
  const session: RecordingSessionMeta = {
    id: mintSessionId(),
    noteId,
    mimeType,
    sampleRate: TARGET_SAMPLE_RATE,
    startedAt: Date.now(),
    placeholderBody,
  };
  await createSession(session);

  const clock = new RecordingClock();
  const a: ActiveState = {
    session,
    deps,
    stream,
    audioCtx,
    source,
    processor,
    silentGain,
    analyser,
    data,
    resample: createResampleState(),
    seq: 0,
    clock,
    state: "recording",
    wakeLock: null,
    capturing: true,
    lastAppend: Promise.resolve(),
  };
  active = a;
  bindProcessor(a);
  // ScriptProcessorNode has no 'error' event — the one real failure mode worth catching here is
  // the mic track itself dying mid-session (device unplugged, OS revokes permission, etc).
  stream.getAudioTracks()[0]?.addEventListener("ended", () => void handleCaptureFailure());
  clock.start(clockNow());

  installVisibilityHandlerOnce();
  void requestWakeLock(a);
  void ensureNotificationPermission();
  return { ok: true };
}

/** Pause: just stops writing incoming samples — the mic/stream/audio graph stay live so resume
 *  needs no setup. The paused span is silently absent from the output (not recorded as
 *  silence), matching elapsedSec's "actual captured time" accounting. */
export function pauseRecording(): void {
  if (!active || active.state !== "recording") return;
  const a = active;
  a.clock.pause(clockNow());
  a.state = "paused";
  a.capturing = false;
}

export function resumeRecording(): void {
  if (!active || active.state !== "paused") return;
  const a = active;
  a.clock.resume(clockNow());
  a.state = "recording";
  a.capturing = true;
}

/** Manual stop — finalize into the note and tear down. Resolves once the note has the block. */
export async function stopRecording(): Promise<void> {
  if (!active) return;
  const a = active;
  a.state = "stopping";
  a.capturing = false;
  await a.lastAppend;
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
