#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-$(pwd)}"

log() {
  printf '[failsafe-qore-services] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

if [[ -z "${QORE_API_KEY:-}" ]]; then
  log "QORE_API_KEY is not set. set it in Zo secrets/environment first."
  exit 1
fi

if [[ -z "${QORE_UI_BASIC_AUTH_USER:-}" || -z "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
  log "QORE_UI_BASIC_AUTH_USER and QORE_UI_BASIC_AUTH_PASS are required."
  exit 1
fi

if [[ -z "${QORE_UI_TOTP_SECRET:-}" ]]; then
  log "QORE_UI_TOTP_SECRET is required."
  exit 1
fi

if [[ -z "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
  log "QORE_UI_ADMIN_TOKEN is required."
  exit 1
fi

require_cmd node
require_cmd npm
require_cmd bash
require_cmd register_user_service

cd "${WORKDIR}"
if [[ ! -d node_modules ]]; then
  log "installing dependencies"
  npm ci
fi

log "syncing full FailSafe UI assets"
npm run ui:sync

log "building project"
npm run build

log "registering runtime service"
bash deploy/zo/register-user-service.sh

log "registering ui service"
bash deploy/zo/register-ui-user-service.sh

log "done. verify with:"
log "  service_doctor qore-runtime"
log "  service_doctor qore-ui"
