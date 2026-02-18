#!/usr/bin/env bash
set -euo pipefail

UI_LABEL="${UI_LABEL:-qore-ui}"
UI_PORT="${UI_PORT:-9380}"
RUNTIME_BASE_URL="${RUNTIME_BASE_URL:-http://127.0.0.1:7777}"
WORKDIR="${WORKDIR:-$(pwd)}"
ENTRYPOINT="${ENTRYPOINT:-node dist/zo/ui-shell/start.js}"

log() {
  printf '[zo-qore-ui-service] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

require_cmd register_user_service

if [[ ! -f "${WORKDIR}/dist/zo/ui-shell/start.js" ]]; then
  log "UI build output missing in ${WORKDIR}. run npm run build first."
  exit 1
fi

if [[ -z "${QORE_UI_BASIC_AUTH_USER:-}" || -z "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
  log "QORE_UI_BASIC_AUTH_USER and QORE_UI_BASIC_AUTH_PASS are required for public UI service."
  exit 1
fi

if [[ -z "${QORE_UI_TOTP_SECRET:-}" ]]; then
  log "QORE_UI_TOTP_SECRET is required for MFA."
  exit 1
fi

if [[ -z "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
  log "QORE_UI_ADMIN_TOKEN is required for admin control-plane operations."
  exit 1
fi

log "registering standalone UI service '${UI_LABEL}' on port ${UI_PORT}"
register_user_service \
  --label "${UI_LABEL}" \
  --protocol "http" \
  --local-port "${UI_PORT}" \
  --workdir "${WORKDIR}" \
  --entrypoint "${ENTRYPOINT}" \
  --env-vars "QORE_UI_HOST=0.0.0.0,QORE_UI_PORT=${UI_PORT},QORE_RUNTIME_BASE_URL=${RUNTIME_BASE_URL},QORE_UI_ASSETS_DIR=${WORKDIR}/zo/ui-shell/shared,QORE_UI_REQUIRE_AUTH=true,QORE_UI_REQUIRE_MFA=true,QORE_UI_REQUIRE_ADMIN_TOKEN=true,QORE_UI_BASIC_AUTH_USER=${QORE_UI_BASIC_AUTH_USER},QORE_UI_BASIC_AUTH_PASS=${QORE_UI_BASIC_AUTH_PASS},QORE_UI_TOTP_SECRET=${QORE_UI_TOTP_SECRET},QORE_UI_ADMIN_TOKEN=${QORE_UI_ADMIN_TOKEN}"

log "registered. run:"
log "  service_doctor ${UI_LABEL}"
