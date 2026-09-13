#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${1:-0}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${SURREAL_ASSET_SOURCE_DIR:-$APP_DIR/asset-staging/unreal-gold/}"
REMOTE_HOST="${SURREAL_ASSET_HOST:-iad1-shared-b8-13.dreamhost.com}"
REMOTE_PATH="${SURREAL_ASSET_REMOTE_PATH:-ut99/}"
SSH_KEY="${SURREAL_ASSET_SSH_KEY:-}"
SSH_USER="${SURREAL_ASSET_USER:-}"
SSH_PORT="${SURREAL_ASSET_SSH_PORT:-22}"
CONNECT_TIMEOUT="${SURREAL_ASSET_CONNECT_TIMEOUT:-10}"
NO_PREFLIGHT="${SURREAL_ASSET_NO_PREFLIGHT:-0}"
MANIFEST_FILE="${SURREAL_ASSET_MANIFEST_FILE:-$APP_DIR/asset-manifests/unreal-gold.manifest.json}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Asset source directory missing: $SOURCE_DIR" >&2
  echo "Run: npm run assets:stage -- /Volumes/UNREAL_GOLD ./asset-staging/unreal-gold" >&2
  exit 2
fi

if [[ -z "$SSH_USER" && "$REMOTE_HOST" != *"@"* ]]; then
  echo "SURREAL_ASSET_USER is required when SURREAL_ASSET_HOST is not user-qualified." >&2
  echo "Example: SURREAL_ASSET_USER=deploy npm run assets:deploy" >&2
  exit 2
fi

TARGET="${REMOTE_HOST}:${REMOTE_PATH}"
if [[ -n "$SSH_USER" ]]; then
  TARGET="${SSH_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
fi

RSYNC_ARGS=(-az --delete --stats)
if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
fi

SSH_ARGS=(
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout="${CONNECT_TIMEOUT}"
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -p "${SSH_PORT}"
)
if [[ -n "$SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$SSH_KEY")
fi

echo "Sync source: $SOURCE_DIR"
echo "Sync target: $TARGET"
echo "SSH port: $SSH_PORT"
echo "Connect timeout: ${CONNECT_TIMEOUT}s"
echo "Manifest file: $MANIFEST_FILE"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "Mode: dry-run"
fi

if [[ "$NO_PREFLIGHT" != "1" ]]; then
  echo "Running SSH preflight..."
  ssh "${SSH_ARGS[@]}" "${TARGET%%:*}" "echo 'ssh-ok'" >/dev/null
  echo "SSH preflight: ok"
fi

rsync "${RSYNC_ARGS[@]}" -e "ssh ${SSH_ARGS[*]}" "$SOURCE_DIR" "$TARGET"

if [[ -f "$MANIFEST_FILE" ]]; then
  manifest_target="${TARGET%/}/manifest.json"
  rsync "${RSYNC_ARGS[@]}" -e "ssh ${SSH_ARGS[*]}" "$MANIFEST_FILE" "$manifest_target"
else
  echo "Warning: manifest file not found, remote manifest.json not updated: $MANIFEST_FILE" >&2
fi
