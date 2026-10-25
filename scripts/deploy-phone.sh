#!/usr/bin/env bash
# Build and deploy the phone PWA to Cloudflare Pages (project "pensieve-phone").
#
# Reuses the Cloudflare account/token already set up for erdman.xyz in the sibling
# project ~/dev/html-posting — Pensieve never gets its own Cloudflare credentials.
set -euo pipefail

HTML_POSTING_ENV="$HOME/dev/html-posting/.env"
if [ ! -f "$HTML_POSTING_ENV" ]; then
  echo "error: $HTML_POSTING_ENV not found — can't source Cloudflare credentials." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
npm run build:phone

set -a
# shellcheck disable=SC1090
source "$HTML_POSTING_ENV"
set +a
npx wrangler pages deploy dist-phone --project-name=pensieve-phone --branch=main
