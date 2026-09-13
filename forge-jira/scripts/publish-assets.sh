#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:?Pass the UT99 or Unreal Gold game directory}"
export SURREAL_ASSET_SOURCE_DIR="${SURREAL_ASSET_SOURCE_DIR:-$APP_DIR/asset-staging/game/}"
export SURREAL_ASSET_MANIFEST_FILE="$SURREAL_ASSET_SOURCE_DIR/manifest.json"
bash "$APP_DIR/scripts/stage-game-assets.sh" "$SOURCE" "$SURREAL_ASSET_SOURCE_DIR"
bash "$APP_DIR/scripts/deploy-assets.sh" "${SURREAL_ASSET_DRY_RUN:-1}"
