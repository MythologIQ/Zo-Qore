#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-$(pwd)}"
RUNTIME_PORT="${RUNTIME_PORT:-7777}"
UI_PORT="${UI_PORT:-9380}"
RUNTIME_HOST="${RUNTIME_HOST:-127.0.0.1}"
UI_HOST="${UI_HOST:-127.0.0.1}"
RUNTIME_BASE_URL="${RUNTIME_BASE_URL:-http://${RUNTIME_HOST}:${RUNTIME_PORT}}"
RUNTIME_LOG="${RUNTIME_LOG:-/dev/shm/qore-runtime.log}"
UI_LOG="${UI_LOG:-/dev/shm/qore-ui.log}"
RUNTIME_PID_FILE="${RUNTIME_PID_FILE:-/tmp/qore-runtime.pid}"
UI_PID_FILE="${UI_PID_FILE:-/tmp/qore-ui.pid}"
UI_REQUIRE_AUTH="${QORE_UI_REQUIRE_AUTH:-}"
UI_REQUIRE_MFA="${QORE_UI_REQUIRE_MFA:-}"
UI_REQUIRE_ADMIN_TOKEN="${QORE_UI_REQUIRE_ADMIN_TOKEN:-}"

log() {
  printf '[zo-qore-one-click] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

is_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${pid_file}")"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

start_runtime() {
  if is_running "${RUNTIME_PID_FILE}"; then
    log "runtime already running (pid $(cat "${RUNTIME_PID_FILE}"))"
    return
  fi
  log "starting runtime on ${RUNTIME_HOST}:${RUNTIME_PORT}"
  nohup env \
    QORE_API_HOST="${RUNTIME_HOST}" \
    QORE_API_PORT="${RUNTIME_PORT}" \
    node dist/runtime/service/start.js > "${RUNTIME_LOG}" 2>&1 &
  echo $! > "${RUNTIME_PID_FILE}"
}

start_ui() {
  if is_running "${UI_PID_FILE}"; then
    log "ui already running (pid $(cat "${UI_PID_FILE}"))"
    return
  fi
  log "starting standalone ui on ${UI_HOST}:${UI_PORT}"
  nohup env \
    QORE_UI_HOST="${UI_HOST}" \
    QORE_UI_PORT="${UI_PORT}" \
    QORE_RUNTIME_BASE_URL="${RUNTIME_BASE_URL}" \
    QORE_UI_ASSETS_DIR="${WORKDIR}/zo/ui-shell/shared" \
    QORE_UI_REQUIRE_AUTH="${UI_REQUIRE_AUTH}" \
    QORE_UI_REQUIRE_MFA="${UI_REQUIRE_MFA}" \
    QORE_UI_REQUIRE_ADMIN_TOKEN="${UI_REQUIRE_ADMIN_TOKEN}" \
    QORE_UI_BASIC_AUTH_USER="${QORE_UI_BASIC_AUTH_USER:-}" \
    QORE_UI_BASIC_AUTH_PASS="${QORE_UI_BASIC_AUTH_PASS:-}" \
    QORE_UI_TOTP_SECRET="${QORE_UI_TOTP_SECRET:-}" \
    QORE_UI_ADMIN_TOKEN="${QORE_UI_ADMIN_TOKEN:-}" \
    node dist/zo/ui-shell/start.js > "${UI_LOG}" 2>&1 &
  echo $! > "${UI_PID_FILE}"
}

if [[ -z "${QORE_API_KEY:-}" ]]; then
  log "QORE_API_KEY is not set. export it before running this script."
  exit 1
fi

if [[ -z "${UI_REQUIRE_AUTH}" ]]; then
  if [[ "${UI_HOST}" == "0.0.0.0" ]]; then
    UI_REQUIRE_AUTH="true"
  else
    UI_REQUIRE_AUTH="false"
  fi
fi
if [[ -z "${UI_REQUIRE_MFA}" ]]; then
  if [[ "${UI_HOST}" == "0.0.0.0" ]]; then
    UI_REQUIRE_MFA="true"
  else
    UI_REQUIRE_MFA="false"
  fi
fi
if [[ -z "${UI_REQUIRE_ADMIN_TOKEN}" ]]; then
  if [[ "${UI_HOST}" == "0.0.0.0" ]]; then
    UI_REQUIRE_ADMIN_TOKEN="true"
  else
    UI_REQUIRE_ADMIN_TOKEN="false"
  fi
fi

if [[ "${UI_HOST}" == "0.0.0.0" ]]; then
  if [[ -z "${QORE_UI_BASIC_AUTH_USER:-}" || -z "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
    log "public bind requires QORE_UI_BASIC_AUTH_USER and QORE_UI_BASIC_AUTH_PASS"
    exit 1
  fi
  if [[ "${UI_REQUIRE_MFA}" == "true" && -z "${QORE_UI_TOTP_SECRET:-}" ]]; then
    log "public bind with MFA requires QORE_UI_TOTP_SECRET"
    exit 1
  fi
  if [[ "${UI_REQUIRE_ADMIN_TOKEN}" == "true" && -z "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
    log "public bind requires QORE_UI_ADMIN_TOKEN"
    exit 1
  fi
fi

require_cmd node
require_cmd npm
require_cmd nohup
require_cmd curl

cd "${WORKDIR}"
if [[ ! -f package.json ]]; then
  log "package.json not found in ${WORKDIR}"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  log "installing dependencies"
  npm ci
fi

log "syncing full FailSafe UI assets"
npm run ui:sync

if [[ ! -f dist/runtime/service/start.js || ! -f dist/zo/ui-shell/start.js ]]; then
  log "building project"
  npm run build
fi

start_runtime
start_ui

sleep 1
if curl -fsS -H "x-qore-api-key: ${QORE_API_KEY}" "${RUNTIME_BASE_URL}/health" >/dev/null 2>&1; then
  log "runtime health check: OK"
else
  log "runtime health check: FAILED (see ${RUNTIME_LOG})"
fi

log "ui url: http://${UI_HOST}:${UI_PORT}"
log "runtime log: ${RUNTIME_LOG}"
log "ui log: ${UI_LOG}"
log "stop command: bash deploy/zo/stop-standalone.sh"
