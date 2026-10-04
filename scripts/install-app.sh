#!/usr/bin/env bash
# Install the freshly-bundled native app into /Applications and remove the copy left
# under the build tree, so there is only ever ONE Pensieve.app on the machine (the
# one in /Applications). Without this, each `tauri build` leaves a second .app under
# src-tauri/target/.../bundle/macos that Spotlight/Launchpad index as a duplicate.
set -euo pipefail

SRC="src-tauri/target/release/bundle/macos/Pensieve.app"
DEST="/Applications/Pensieve.app"

if [ ! -d "$SRC" ]; then
  echo "install-app: no bundle at $SRC — did 'tauri build' run?" >&2
  exit 1
fi

# If it's currently running, quit it so the overwrite is clean (ignore if not open).
osascript -e 'tell application "Pensieve" to quit' >/dev/null 2>&1 || true

rm -rf "$DEST"
# ditto preserves bundle metadata/signature better than cp -R for .app bundles.
ditto "$SRC" "$DEST"
rm -rf "$SRC"

echo "install-app: installed → $DEST (removed the build-tree copy)"
