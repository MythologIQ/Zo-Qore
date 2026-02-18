#!/usr/bin/env bash
set -euo pipefail

RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/MythologIQ/Zo-Qore/main/deploy/zo}"
BOOTSTRAP_URL="${BOOTSTRAP_URL:-${RAW_BASE}/bootstrap-zo.sh}"
BOOTSTRAP_PATH="/tmp/zo-qore-bootstrap.sh"

log() {
  printf '[zo-qore-take-this-and-go] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

if [[ "${EUID}" -ne 0 ]]; then
  log "run as root (sudo)"
  exit 1
fi

require_cmd curl
require_cmd bash

log "fetching bootstrap script from: ${BOOTSTRAP_URL}"
curl -fsSL "${BOOTSTRAP_URL}" -o "${BOOTSTRAP_PATH}"
chmod +x "${BOOTSTRAP_PATH}"

log "running bootstrap"
bash "${BOOTSTRAP_PATH}"

log "done"
