#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-../build-wasm}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$APP_DIR/static/surreal/public/wasm"

for file in surreal-engine.js surreal-engine.wasm; do
  if [[ ! -s "$SOURCE_DIR/$file" ]]; then
    echo "Expected non-empty $file in $SOURCE_DIR; refusing to reuse stale output." >&2
    exit 1
  fi
done

mkdir -p "$TARGET_DIR"

for file in surreal-engine.js surreal-engine.wasm surreal-engine.data; do
  if [[ -f "$SOURCE_DIR/$file" ]]; then
    cp "$SOURCE_DIR/$file" "$TARGET_DIR/$file"
  fi
done

if [[ ! -f "$SOURCE_DIR/surreal-engine.data" ]]; then
  rm -f "$TARGET_DIR/surreal-engine.data"
fi

if [[ ! -f "$TARGET_DIR/surreal-engine.js" || ! -f "$TARGET_DIR/surreal-engine.wasm" ]]; then
  echo "Expected surreal-engine.js and surreal-engine.wasm in $SOURCE_DIR" >&2
  exit 1
fi

echo "Staged WASM assets in $TARGET_DIR"

python3 - "$TARGET_DIR" <<'PYCODE'
import sys,gzip
from pathlib import Path
root=Path(sys.argv[1])
p=root/'surreal-engine.wasm'
(root/'surreal-engine.wasm.gz').write_bytes(gzip.compress(p.read_bytes(),compresslevel=9,mtime=0))
p.unlink()
PYCODE
