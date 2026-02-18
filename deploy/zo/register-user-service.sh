#!/usr/bin/env bash
set -euo pipefail

SERVICE_LABEL="${SERVICE_LABEL:-qore-runtime}"
SERVICE_PROTOCOL="${SERVICE_PROTOCOL:-http}"
SERVICE_PORT="${SERVICE_PORT:-7777}"
WORKDIR="${WORKDIR:-$(pwd)}"
ENTRYPOINT="${ENTRYPOINT:-node dist/runtime/service/start.js}"
QORE_API_HOST="${QORE_API_HOST:-0.0.0.0}"
QORE_API_PORT="${QORE_API_PORT:-$SERVICE_PORT}"

log() {
  printf '[zo-qore-zo-service] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

require_cmd register_user_service

if [[ ! -f "${WORKDIR}/dist/runtime/service/start.js" ]]; then
  log "runtime build output missing in ${WORKDIR}. run npm run build first."
  exit 1
fi

if [[ -z "${QORE_API_KEY:-}" ]]; then
  log "QORE_API_KEY is not set. configure it in Zo secrets before registration."
  exit 1
fi

log "registering user service '${SERVICE_LABEL}' on port ${SERVICE_PORT}"
register_user_service \
  --label "${SERVICE_LABEL}" \
  --protocol "${SERVICE_PROTOCOL}" \
  --local-port "${SERVICE_PORT}" \
  --workdir "${WORKDIR}" \
  --entrypoint "${ENTRYPOINT}" \
  --env-vars "QORE_API_HOST=${QORE_API_HOST},QORE_API_PORT=${QORE_API_PORT}"

log "registered. next checks:"
log "  service_doctor ${SERVICE_LABEL}"
log "  tail -n 100 /dev/shm/${SERVICE_LABEL}.log || true"
