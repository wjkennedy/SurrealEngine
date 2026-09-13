#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
BUILD_DIR="${SURREAL_WASM_BUILD_DIR:-$REPO_DIR/build-wasm}"
OUTPUT_JS="$BUILD_DIR/surreal-engine.js"
OUTPUT_WASM="$BUILD_DIR/surreal-engine.wasm"
export EM_CACHE="${EM_CACHE:-$REPO_DIR/.emcache}"
mkdir -p "$EM_CACHE"

if [[ -x "$REPO_DIR/build-webgpu-wasm.sh" ]]; then
  "$REPO_DIR/build-webgpu-wasm.sh" "$BUILD_DIR"
elif [[ -f "$REPO_DIR/CMakePresets.json" ]] && cmake --list-presets -S "$REPO_DIR" 2>/dev/null | grep -q 'webgpu-wasm'; then
  emcmake cmake --preset webgpu-wasm -S "$REPO_DIR" -B "$BUILD_DIR"
  cmake --build "$BUILD_DIR" --target surreal-engine --parallel
else
  cat >&2 <<'EOF'
No WebGPU/WASM engine build target exists yet.

Expected one of:
- ./build-webgpu-wasm.sh that produces build-wasm/surreal-engine.js and build-wasm/surreal-engine.wasm
- a CMake preset named "webgpu-wasm" that can be configured with emcmake

The current tree only has native desktop targets. Add the Emscripten/WebGPU target first, then rerun:

  cd forge-jira
  npm run build:engine

EOF
  exit 2
fi

if [[ ! -f "$OUTPUT_JS" || ! -f "$OUTPUT_WASM" ]]; then
  echo "Engine build completed, but expected outputs were not found:" >&2
  echo "  $OUTPUT_JS" >&2
  echo "  $OUTPUT_WASM" >&2
  exit 1
fi

"$APP_DIR/scripts/stage-wasm.sh" "$BUILD_DIR"
