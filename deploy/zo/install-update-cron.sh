#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-$(pwd)}"
SCHEDULE="${SCHEDULE:-17 * * * *}"
LOG_FILE="${LOG_FILE:-/dev/shm/zo-qore-update.log}"
REMOVE="${REMOVE:-false}"

log() {
  printf '[zo-qore-update-cron] %s\n' "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
Install or remove cron scheduler for rollback-safe repo updates.

Usage:
  bash deploy/zo/install-update-cron.sh [options]

Options:
  --workdir <path>      Repo path (default: current directory)
  --schedule "<expr>"   Cron expression (default: "17 * * * *")
  --log-file <path>     Log path (default: /dev/shm/zo-qore-update.log)
  --remove              Remove existing updater cron entry
  --help                Show this help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --workdir)
        [[ $# -ge 2 ]] || die "--workdir requires a path"
        WORKDIR="$2"
        shift 2
        ;;
      --schedule)
        [[ $# -ge 2 ]] || die "--schedule requires an expression"
        SCHEDULE="$2"
        shift 2
        ;;
      --log-file)
        [[ $# -ge 2 ]] || die "--log-file requires a path"
        LOG_FILE="$2"
        shift 2
        ;;
      --remove)
        REMOVE="true"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1"
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  command -v crontab >/dev/null 2>&1 || die "crontab command not found"

  WORKDIR="$(cd "${WORKDIR}" && pwd)"
  [[ -f "${WORKDIR}/deploy/zo/update-from-repo.sh" ]] || die "missing updater script in ${WORKDIR}"

  local marker="# zo-qore-auto-update"
  local cmd="cd ${WORKDIR} && bash deploy/zo/update-from-repo.sh >> ${LOG_FILE} 2>&1"
  local line="${SCHEDULE} ${cmd} ${marker}"
  local current
  current="$(crontab -l 2>/dev/null || true)"
  local filtered
  filtered="$(printf '%s\n' "${current}" | awk -v m="${marker}" 'index($0,m)==0')"

  if [[ "${REMOVE}" == "true" ]]; then
    printf '%s\n' "${filtered}" | crontab -
    log "removed auto-update cron entry"
    exit 0
  fi

  {
    printf '%s\n' "${filtered}"
    printf '%s\n' "${line}"
  } | awk 'NF' | crontab -

  log "installed auto-update cron entry"
  log "schedule: ${SCHEDULE}"
  log "log file: ${LOG_FILE}"
}

main "$@"
