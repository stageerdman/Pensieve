#!/bin/sh
# FAST-LOAD Rust-side benchmark: old serial per-file reads vs the bulk parallel listing.
# Usage: bench-rust.sh <path-to-a-vault-COPY>   (never point it at the live vault)
# Run twice — the first pass warms the OS file cache.
set -e
[ -n "$1" ] || { echo "usage: $0 <vault-copy>"; exit 1; }
cd "$(dirname "$0")/../../../src-tauri"
PENSIEVE_BENCH_VAULT="$1" cargo test --release --lib vault_bulk::tests::bench_listing -- --ignored --nocapture 2>&1 | grep BENCH
