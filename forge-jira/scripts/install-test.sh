#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${FORGE_ENV:-development}"
SITE="${FORGE_SITE:-}"
PRODUCT="${FORGE_PRODUCT:-Jira}"
APP_ID="$(sed -n 's/.*ari:cloud:ecosystem::app\///p' manifest.yml | head -n 1 | tr -d '[:space:]')"

if [[ -z "$SITE" ]]; then
  echo "FORGE_SITE is required, for example: FORGE_SITE=example.atlassian.net" >&2
  exit 2
fi

if [[ "$APP_ID" == "11111111-1111-4111-8111-111111111111" || -z "$APP_ID" ]]; then
  echo "manifest.yml still has the placeholder app id. Run forge register and update app.id first." >&2
  exit 2
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "forge CLI is required on PATH." >&2
  exit 2
fi

npm run build:ui
forge deploy --environment "$ENVIRONMENT" --non-interactive

if ! forge install \
  --environment "$ENVIRONMENT" \
  --site "$SITE" \
  --product "$PRODUCT" \
  --upgrade code \
  --confirm-scopes \
  --non-interactive; then
  forge install \
    --environment "$ENVIRONMENT" \
    --site "$SITE" \
    --product "$PRODUCT" \
    --confirm-scopes \
    --non-interactive
fi

forge install list --environment "$ENVIRONMENT"
