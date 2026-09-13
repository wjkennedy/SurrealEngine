#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$APP_DIR/scripts/check-assets.mjs" "${1:?Pass the local game manifest}" "${2:-https://ut.a9group.net/ut99/}"
