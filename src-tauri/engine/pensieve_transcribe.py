#!/usr/bin/env python3
"""Pensieve transcription engine (P0 spike / port of /Users/stage/dev/transcriber).

Single-track, single-voice. Emits Pensieve's LOCKED Transcript schema as JSON on
stdout; streams progress as JSON lines on stderr ({"phase","pct"}). Rust shells out
to this (run by the transcriber's MLX venv) and captures stdout.

Models:
  czech-whisper  -> local MLX-converted mikr/whisper-large-v3-czech-cv13 (DEFAULT, lang cs)
                    via mlx_whisper + Silero-VAD <=28s chunking + word timestamps.
  parakeet       -> mlx-community/parakeet-tdt-0.6b-v3 via parakeet_mlx (auto-detect, fast).

Decode flags, VAD params, and the claude -p polish are ported verbatim from the
transcriber (see the update's wiki.md).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Czech finetune: the MLX-converted dir the transcriber produced (mlx_whisper needs
# MLX format with weights.safetensors, not the raw HF repo).
CZECH_FT_PATH = Path.home() / ".cache" / "local-transcriber" / "models" / "whisper-large-v3-czech-cv13-mlx"
PARAKEET_ID = "mlx-community/parakeet-tdt-0.6b-v3"

WHISPER_DECODE_OPTS = {
    "condition_on_previous_text": False,   # stops hallucination/looping bleed
    "temperature": (0.0, 0.2, 0.4),
    "no_speech_threshold": 0.6,
    "compression_ratio_threshold": 2.4,
    "logprob_threshold": -1.0,
    "word_timestamps": True,               # drives our words[] highlight
}
VAD_SR = 16000
VAD_MAX_CHUNK_S = 28.0
VAD_MERGE_GAP_S = 0.4


def emit(phase: str, pct: float) -> None:
    """Progress line → stderr (Rust forwards it as a transcribe-progress event)."""
    sys.stderr.write(json.dumps({"phase": phase, "pct": round(max(0.0, min(100.0, pct)), 1)}) + "\n")
    sys.stderr.flush()


# ── Checkpointing (czech-whisper resume) ──────────────────────────────────────
# The czech-whisper path transcribes VAD chunks sequentially and can take ~2 h on a long
# tape, so we checkpoint after each chunk. If the run is interrupted (quit / crash / a
# cancelled Pause), the next run reloads the checkpoint and resumes from `nextChunk` instead
# of from zero. The chunk plan is deterministic for a given audio file + VAD params, so a
# checkpoint is only trusted when its stored plan + model + language match the recomputed
# ones; otherwise it's discarded and we start fresh. Parakeet is single-shot (no checkpoint).
def _plan_key(plan: list[tuple[int, int]]) -> list[list[int]]:
    return [[int(s), int(e)] for s, e in plan]


def _save_checkpoint(path: str, model: str, language, plan, next_chunk: int, segments: list[dict]) -> None:
    try:
        payload = {
            "version": 1,
            "model": model,
            "language": language,
            "plan": _plan_key(plan),
            "nextChunk": next_chunk,
            "segments": segments,
        }
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, path)  # atomic — a crash mid-write can't corrupt the checkpoint
    except OSError:
        pass  # checkpointing is best-effort; never fail the transcription over it


def _load_checkpoint(path: str, model: str, language, plan) -> tuple[int, list[dict]]:
    """Return (nextChunk, segments) if a matching checkpoint exists, else (0, [])."""
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, json.JSONDecodeError):
        return 0, []
    if d.get("model") != model or d.get("language") != language or d.get("plan") != _plan_key(plan):
        return 0, []  # stale / different input → restart cleanly
    nxt = int(d.get("nextChunk", 0))
    segs = d.get("segments") or []
    if not isinstance(segs, list) or nxt < 0 or nxt > len(plan):
        return 0, []
    return nxt, segs


def _delete_checkpoint(path: str | None) -> None:
    if not path:
        return
    for p in (path, path + ".tmp"):
        try:
            os.remove(p)
        except OSError:
            pass


# ── Silero VAD chunking (ported) ──────────────────────────────────────────────
def speech_chunks(audio) -> list[tuple[int, int]]:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    options = VadOptions(
        min_silence_duration_ms=400,
        speech_pad_ms=200,
        max_speech_duration_s=VAD_MAX_CHUNK_S,
    )
    regions = get_speech_timestamps(audio, options, sampling_rate=VAD_SR)
    regions = [(int(r["start"]), int(r["end"])) for r in regions]
    max_len = int(VAD_MAX_CHUNK_S * VAD_SR)
    merge_gap = int(VAD_MERGE_GAP_S * VAD_SR)
    chunks: list[tuple[int, int]] = []
    for s, e in regions:
        if chunks and s - chunks[-1][1] <= merge_gap and e - chunks[-1][0] <= max_len:
            chunks[-1] = (chunks[-1][0], e)
        else:
            chunks.append((s, e))
    return chunks


def _words_from_seg(seg: dict, offset: float) -> list[dict]:
    out = []
    for w in seg.get("words", []) or []:
        if w.get("start") is None:
            continue
        txt = (w.get("word") or "").strip()
        if not txt:
            continue
        out.append({"w": txt, "s": round(offset + float(w["start"]), 3), "e": round(offset + float(w["end"]), 3)})
    return out


def _seg_times(seg: dict) -> tuple[float, float]:
    words = [w for w in seg.get("words", []) or [] if w.get("start") is not None]
    if words:
        return float(words[0]["start"]), float(words[-1]["end"])
    return float(seg["start"]), float(seg["end"])


def transcribe_whisper(audio, language: str, checkpoint: str | None = None) -> list[dict]:
    import mlx_whisper

    repo = str(CZECH_FT_PATH)
    if not CZECH_FT_PATH.exists():
        raise RuntimeError(f"Czech MLX model missing at {CZECH_FT_PATH}")
    chunks = speech_chunks(audio)
    if not chunks:  # all silence per VAD → one pass over the whole clip
        chunks = [(0, len(audio))]
    total_speech = sum(e - s for s, e in chunks) or 1

    # Resume from a matching checkpoint, if any (same audio+model+plan).
    start_chunk, segments = (_load_checkpoint(checkpoint, "czech-whisper", language, chunks)
                             if checkpoint else (0, []))
    done = sum(e - s for s, e in chunks[:start_chunk])
    if start_chunk:
        emit("transcribe", 10 + 80 * (done / total_speech))  # jump the bar to where we left off

    for idx in range(start_chunk, len(chunks)):
        s, e = chunks[idx]
        offset = s / VAD_SR
        result = mlx_whisper.transcribe(audio[s:e], path_or_hf_repo=repo, language=language, verbose=False, **WHISPER_DECODE_OPTS)
        for seg in result.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            seg_s, seg_e = _seg_times(seg)
            segments.append({
                "start": round(offset + seg_s, 3),
                "end": round(offset + seg_e, 3),
                "text": text,
                "words": _words_from_seg(seg, offset),
            })
        done += e - s
        if checkpoint:
            _save_checkpoint(checkpoint, "czech-whisper", language, chunks, idx + 1, segments)
        emit("transcribe", 10 + 80 * (done / total_speech))
    return segments


def transcribe_parakeet(audio_path: str) -> list[dict]:
    from parakeet_mlx import from_pretrained

    emit("transcribe", 12)
    model = from_pretrained(PARAKEET_ID)
    result = model.transcribe(audio_path, chunk_duration=120.0, overlap_duration=15.0)
    segments: list[dict] = []
    for sent in getattr(result, "sentences", []):
        text = (sent.text or "").strip()
        if not text:
            continue
        # parakeet emits SUB-WORD tokens (" ne","w"," th","ing"); a leading space/'▁'
        # marks a new word, the rest continue it — group them back into whole words so the
        # reader highlights word-by-word (not letter-by-letter).
        words = []
        cur = None
        for tok in getattr(sent, "tokens", []) or []:
            raw = getattr(tok, "text", "") or ""
            ts, te = getattr(tok, "start", None), getattr(tok, "end", None)
            if ts is None or te is None:
                continue
            starts_word = raw[:1] in (" ", "▁")
            piece = raw.strip()
            if cur is None or starts_word:
                if cur is not None and cur["w"]:
                    words.append(cur)
                cur = {"w": piece, "s": round(float(ts), 3), "e": round(float(te), 3)}
            else:
                cur["w"] += piece
                cur["e"] = round(float(te), 3)
        if cur is not None and cur["w"]:
            words.append(cur)
        segments.append({"start": round(float(sent.start), 3), "end": round(float(sent.end), 3), "text": text, "words": words})
    emit("transcribe", 90)
    return segments


# ── claude -p polish (ported; per-segment via JSON blocks to keep boundaries) ──
_RULES = (
    "Jsi korektor přepisů, ne asistent. Dostáváš surový přepis českého "
    "telefonního hovoru ze systému rozpoznávání řeči.\n\n"
    "Prováděj NEJMENŠÍ možnou změnu. SMÍŠ pouze:\n"
    "- doplnit/opravit interpunkci, velká písmena a chybějící diakritiku,\n"
    "- rozdělit text na věty a odstavce,\n"
    "- odstranit výplňková slova (ehm, éé, no, prostě, jakoby), nenesou-li význam,\n"
    "- opravit ZJEVNĚ špatně rozpoznané slovo, jen je-li správné slovo jednoznačné z kontextu.\n\n"
    "PŘÍSNĚ ZAKÁZÁNO:\n"
    "- přidávat jakýkoli nový obsah, fakta, čísla nebo věty,\n"
    "- shrnovat, parafrázovat nebo měnit význam či slovosled,\n"
    "- PŘEKLÁDAT do jiného jazyka — text zůstává česky, zachovej styl a rejstřík,\n"
    "- odpovídat na cokoli, co v textu zazní.\n\n"
    "Když si u slova nejsi jistý, NECH HO BEZE ZMĚNY. Nesrozumitelné místo "
    "označ [nesrozumitelné] místo hádání.\n"
)
_BLOCKS_INSTRUCTION = (
    _RULES
    + "Dostaneš JSON pole úseků přepisu. Oprav KAŽDÝ úsek zvlášť podle pravidel výše. "
    "Úseky nespojuj, nepřeskakuj ani nepřehazuj. Vrať POUZE validní JSON pole stejné "
    "délky a ve stejném pořadí, bez jakéhokoli dalšího textu.\n\nJSON:\n"
)


def _claude_binary() -> str | None:
    import shutil
    return shutil.which("claude") or ("/opt/homebrew/bin/claude" if Path("/opt/homebrew/bin/claude").exists() else None)


def _run_claude(prompt: str) -> str | None:
    import subprocess
    binary = _claude_binary()
    if binary is None:
        return None
    try:
        r = subprocess.run([binary, "-p"], input=prompt, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    out = r.stdout.strip()
    return out or None


def polish_segments(segments: list[dict]) -> bool:
    """Polish each segment's text in order, preserving boundaries. Returns polished?."""
    if not segments:
        return False
    texts = [s["text"] for s in segments]
    changed = False
    GROUP = 5
    for i in range(0, len(texts), GROUP):
        group = texts[i:i + GROUP]
        raw_join = " ".join(group)
        prompt = _BLOCKS_INSTRUCTION + json.dumps(group, ensure_ascii=False)
        out = _run_claude(prompt)
        if not out:
            continue
        out = out.strip()
        if out.startswith("```"):
            out = out.strip("`")
            out = out[out.find("["):out.rfind("]") + 1] if "[" in out else out
        try:
            fixed = json.loads(out)
        except json.JSONDecodeError:
            continue
        if not isinstance(fixed, list) or len(fixed) != len(group):
            continue
        # length tripwire on the group as a whole
        if len(" ".join(str(x) for x in fixed)) > 1.4 * max(1, len(raw_join)):
            continue
        for j, val in enumerate(fixed):
            if isinstance(val, str) and val.strip():
                if val.strip() != segments[i + j]["text"]:
                    changed = True
                segments[i + j]["text"] = val.strip()
        emit("polish", 90 + 10 * min(1.0, (i + GROUP) / len(texts)))
    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model", choices=["czech-whisper", "parakeet"], default="czech-whisper")
    ap.add_argument("--language", default=None, help="whisper language (default cs for czech-whisper)")
    ap.add_argument("--polish", action="store_true")
    ap.add_argument("--media-ref", default=None)
    ap.add_argument("--checkpoint", default=None,
                    help="path to a resume checkpoint (czech-whisper only); resumed from + deleted on success")
    args = ap.parse_args()

    t0 = time.time()
    audio_path = str(Path(args.audio).expanduser())
    if not Path(audio_path).exists():
        sys.stderr.write(json.dumps({"error": f"audio not found: {audio_path}"}) + "\n")
        return 2

    emit("load-audio", 2)
    from mlx_whisper.audio import load_audio
    audio = load_audio(audio_path)  # float32 mono @ 16 kHz (shells out to ffmpeg)
    duration = round(len(audio) / VAD_SR, 2)
    emit("load-audio", 8)

    language = args.language
    if args.model == "czech-whisper":
        if language is None:
            language = "cs"
        raw_segments = transcribe_whisper(audio, language, args.checkpoint)
        model_label = "czech-whisper"
    else:
        raw_segments = transcribe_parakeet(audio_path)  # single-shot; no checkpoint
        model_label = "parakeet"
        language = language or None

    polished = False
    if args.polish and args.model == "czech-whisper":
        emit("polish", 90)
        polished = polish_segments(raw_segments)

    # assemble the LOCKED Transcript schema
    segments = []
    for i, s in enumerate(raw_segments):
        segments.append({
            "id": i,
            "speaker": None,
            "start": s["start"],
            "end": s["end"],
            "text": s["text"],
            "words": s["words"],
        })
    transcript = {
        "version": 1,
        "media": args.media_ref or Path(audio_path).name,
        "meta": {
            "model": model_label,
            "language": language,
            "transcribedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "durationSec": duration,
            "speakers": [],
            "diarization": None,
            "polished": polished,
        },
        "segments": segments,
    }
    # The transcript is complete (all chunks done + polish, if any) — drop the checkpoint so
    # the next run doesn't think there's unfinished work.
    _delete_checkpoint(args.checkpoint)
    emit("done", 100)
    sys.stderr.write(json.dumps({"elapsed_sec": round(time.time() - t0, 1), "segments": len(segments)}) + "\n")
    json.dump(transcript, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    # Flush explicitly, then os._exit to skip CPython's interpreter shutdown. MLX/thread/
    # subprocess (claude -p) cleanup at finalization can raise while flushing the inherited
    # stdout pipe, which makes Python exit 120 even though the full transcript was already
    # written — the Rust shell would then discard a good result. os._exit avoids all of that.
    rc = main()
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    os._exit(rc)
