# P0 engine spike — pensieve_transcribe.py

Standalone port of the `/Users/stage/dev/transcriber` single-track pipeline. Emits
Pensieve's LOCKED `Transcript` schema on stdout; progress JSON lines on stderr.

## Run (reuses the transcriber MLX venv on this Mac)
```
VENV=/Users/stage/dev/transcriber/.venv/bin/python
PYTHONPATH=/Users/stage/dev/transcriber "$VENV" pensieve_transcribe.py \
  --audio <file> --model czech-whisper|parakeet [--language cs] [--polish]
```

## Proven 2026-10-18 (Apple M3)
- czech-whisper: 60s clip → 7 segments, 115 word-timings, 23s. Valid schema.
- parakeet:      60s clip → 7 segments, 170 word-timings, 3.5s. Valid schema.
Both models already in the HF cache; Czech MLX at ~/.cache/local-transcriber/models/.

## Next (real integration, not spike)
Rust `transcribe_audio(ref, model)` spawns this via the venv, captures stdout,
streams `transcribe-progress` from stderr. Then wire into the queue + sidebar drawer.
