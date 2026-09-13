#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$APP_DIR/scripts/game-assets.mjs" manifest "${1:?Pass the UT99 or Unreal Gold game directory}" "${2:-$APP_DIR/asset-manifests/game.manifest.json}"
