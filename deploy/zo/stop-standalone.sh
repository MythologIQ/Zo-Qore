#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PID_FILE="${RUNTIME_PID_FILE:-/tmp/qore-runtime.pid}"
UI_PID_FILE="${UI_PID_FILE:-/tmp/qore-ui.pid}"

stop_from_pid_file() {
  local pid_file="$1"
  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" || true
    fi
    rm -f "${pid_file}"
  fi
}

stop_from_pid_file "${RUNTIME_PID_FILE}"
stop_from_pid_file "${UI_PID_FILE}"

pkill -f "dist/runtime/service/start.js" >/dev/null 2>&1 || true
pkill -f "dist/zo/ui-shell/start.js" >/dev/null 2>&1 || true

echo "stopped standalone runtime + ui"
