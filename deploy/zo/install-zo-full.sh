#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/MythologIQ/failsafe-qore.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/home/workspace/MythologIQ/FailSafe-Qore}"
WORKDIR="${WORKDIR:-}"

RUNTIME_LABEL="${RUNTIME_LABEL:-qore-runtime}"
UI_LABEL="${UI_LABEL:-qore-ui}"
RUNTIME_PORT="${RUNTIME_PORT:-7777}"
UI_PORT="${UI_PORT:-9380}"
RUNTIME_HOST="${RUNTIME_HOST:-0.0.0.0}"
UI_HOST="${UI_HOST:-0.0.0.0}"

QORE_UI_BASIC_AUTH_USER="${QORE_UI_BASIC_AUTH_USER:-admin}"

NON_INTERACTIVE=false
FORCE_RECONFIGURE=false
CONFIG_FILE=""
WRITE_CONFIG_FILE=""

log() {
  printf '[failsafe-qore-zo-install] %s\n' "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "missing required command: $1"
  fi
}

usage() {
  cat <<EOF
FailSafe-Qore complete Zo installer

Usage:
  bash deploy/zo/install-zo-full.sh [options]

Options:
  --non-interactive         Use env/config only, no prompts.
  --force-reconfigure       If service labels already exist, attempt removal then recreate.
  --config <path>           Source configuration env file before install.
  --write-config <path>     Write resolved config to file.
  --help                    Show this help.

Environment override examples:
  REPO_URL, BRANCH, INSTALL_DIR, WORKDIR,
  RUNTIME_LABEL, UI_LABEL, RUNTIME_PORT, UI_PORT,
  QORE_API_KEY, QORE_UI_BASIC_AUTH_USER, QORE_UI_BASIC_AUTH_PASS, QORE_UI_TOTP_SECRET, QORE_UI_ADMIN_TOKEN
EOF
}

prompt_default() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="$3"
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    printf -v "$var_name" '%s' "$default_value"
    return
  fi

  local input
  read -r -p "$prompt_text [$default_value]: " input
  if [[ -z "$input" ]]; then
    input="$default_value"
  fi
  printf -v "$var_name" '%s' "$input"
}

confirm_yes_no() {
  local prompt_text="$1"
  local default_yes="$2"
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    [[ "$default_yes" == "true" ]]
    return
  fi

  local hint="y/N"
  if [[ "$default_yes" == "true" ]]; then
    hint="Y/n"
  fi
  local answer
  read -r -p "$prompt_text [$hint]: " answer
  answer="${answer,,}"
  if [[ -z "$answer" ]]; then
    [[ "$default_yes" == "true" ]]
    return
  fi
  [[ "$answer" == "y" || "$answer" == "yes" ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --non-interactive)
        NON_INTERACTIVE=true
        shift
        ;;
      --force-reconfigure)
        FORCE_RECONFIGURE=true
        shift
        ;;
      --config)
        [[ $# -ge 2 ]] || die "--config requires a file path"
        CONFIG_FILE="$2"
        shift 2
        ;;
      --write-config)
        [[ $# -ge 2 ]] || die "--write-config requires a file path"
        WRITE_CONFIG_FILE="$2"
        shift 2
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

load_config_file() {
  if [[ -z "${CONFIG_FILE}" ]]; then
    return
  fi
  [[ -f "${CONFIG_FILE}" ]] || die "config file not found: ${CONFIG_FILE}"
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
}

service_exists() {
  local label="$1"
  if ! command -v list_user_services >/dev/null 2>&1; then
    return 1
  fi
  list_user_services 2>/dev/null | grep -E "(^|\s)${label}(\s|$)" >/dev/null 2>&1
}

remove_service_if_supported() {
  local label="$1"
  if command -v unregister_user_service >/dev/null 2>&1; then
    unregister_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v remove_user_service >/dev/null 2>&1; then
    remove_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v delete_user_service >/dev/null 2>&1; then
    delete_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

has_repo() {
  [[ -f "$1/package.json" && -f "$1/deploy/zo/one-click-services.sh" ]]
}

ensure_repo() {
  if [[ -n "${WORKDIR}" ]]; then
    has_repo "${WORKDIR}" || die "WORKDIR=${WORKDIR} does not look like FailSafe-Qore"
    printf '%s' "${WORKDIR}"
    return
  fi

  mkdir -p "$(dirname "${INSTALL_DIR}")"
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "updating repository in ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" fetch --all --prune
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
  elif [[ -d "${INSTALL_DIR}" && "$(ls -A "${INSTALL_DIR}" 2>/dev/null || true)" != "" ]]; then
    if has_repo "${INSTALL_DIR}"; then
      log "using existing repository content in ${INSTALL_DIR}"
    else
      die "INSTALL_DIR exists and is not empty: ${INSTALL_DIR}; choose WORKDIR or clean path"
    fi
  else
    log "cloning ${REPO_URL} (${BRANCH}) into ${INSTALL_DIR}"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi

  printf '%s' "${INSTALL_DIR}"
}

generate_missing_secrets() {
  if [[ -z "${QORE_API_KEY:-}" ]]; then
    QORE_API_KEY="$(openssl rand -hex 32)"
    export QORE_API_KEY
    log "generated QORE_API_KEY"
  fi

  if [[ -z "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
    QORE_UI_BASIC_AUTH_PASS="$(openssl rand -base64 24 | tr -d '\n')"
    export QORE_UI_BASIC_AUTH_PASS
    log "generated QORE_UI_BASIC_AUTH_PASS"
  fi

  if [[ -z "${QORE_UI_TOTP_SECRET:-}" ]]; then
    local mfa_line
    mfa_line="$(npm run -s ui:mfa:secret | grep '^QORE_UI_TOTP_SECRET=' | head -n 1 || true)"
    [[ -n "$mfa_line" ]] || die "failed to generate QORE_UI_TOTP_SECRET"
    QORE_UI_TOTP_SECRET="${mfa_line#QORE_UI_TOTP_SECRET=}"
    export QORE_UI_TOTP_SECRET
    log "generated QORE_UI_TOTP_SECRET"
  fi

  if [[ -z "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
    QORE_UI_ADMIN_TOKEN="$(openssl rand -hex 32)"
    export QORE_UI_ADMIN_TOKEN
    log "generated QORE_UI_ADMIN_TOKEN"
  fi

  export QORE_UI_BASIC_AUTH_USER
}

interactive_config() {
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    return
  fi

  log "configuration wizard"
  prompt_default REPO_URL "Repository URL" "${REPO_URL}"
  prompt_default BRANCH "Git branch" "${BRANCH}"
  prompt_default INSTALL_DIR "Install directory" "${INSTALL_DIR}"
  prompt_default RUNTIME_LABEL "Runtime service label" "${RUNTIME_LABEL}"
  prompt_default UI_LABEL "UI service label" "${UI_LABEL}"
  prompt_default RUNTIME_PORT "Runtime port" "${RUNTIME_PORT}"
  prompt_default UI_PORT "UI port" "${UI_PORT}"
  prompt_default QORE_UI_BASIC_AUTH_USER "UI Basic Auth username" "${QORE_UI_BASIC_AUTH_USER}"

  if [[ -n "${QORE_API_KEY:-}" ]]; then
    if confirm_yes_no "Keep existing QORE_API_KEY from environment" true; then :; else unset QORE_API_KEY; fi
  fi
  if [[ -n "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
    if confirm_yes_no "Keep existing QORE_UI_BASIC_AUTH_PASS from environment" true; then :; else unset QORE_UI_BASIC_AUTH_PASS; fi
  fi
  if [[ -n "${QORE_UI_TOTP_SECRET:-}" ]]; then
    if confirm_yes_no "Keep existing QORE_UI_TOTP_SECRET from environment" true; then :; else unset QORE_UI_TOTP_SECRET; fi
  fi
  if [[ -n "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
    if confirm_yes_no "Keep existing QORE_UI_ADMIN_TOKEN from environment" true; then :; else unset QORE_UI_ADMIN_TOKEN; fi
  fi

  if [[ -z "${WRITE_CONFIG_FILE}" ]]; then
    if confirm_yes_no "Write resolved config file for future installs" true; then
      WRITE_CONFIG_FILE="${INSTALL_DIR}/.failsafe/zo-installer.env"
    fi
  fi
}

write_config_file() {
  if [[ -z "${WRITE_CONFIG_FILE}" ]]; then
    return
  fi

  mkdir -p "$(dirname "${WRITE_CONFIG_FILE}")"
  cat > "${WRITE_CONFIG_FILE}" <<EOF
REPO_URL='${REPO_URL}'
BRANCH='${BRANCH}'
INSTALL_DIR='${INSTALL_DIR}'
RUNTIME_LABEL='${RUNTIME_LABEL}'
UI_LABEL='${UI_LABEL}'
RUNTIME_PORT='${RUNTIME_PORT}'
UI_PORT='${UI_PORT}'
QORE_UI_BASIC_AUTH_USER='${QORE_UI_BASIC_AUTH_USER}'
QORE_API_KEY='${QORE_API_KEY}'
QORE_UI_BASIC_AUTH_PASS='${QORE_UI_BASIC_AUTH_PASS}'
QORE_UI_TOTP_SECRET='${QORE_UI_TOTP_SECRET}'
QORE_UI_ADMIN_TOKEN='${QORE_UI_ADMIN_TOKEN}'
EOF
  chmod 600 "${WRITE_CONFIG_FILE}" || true
  log "wrote config: ${WRITE_CONFIG_FILE}"
}

validate_or_prepare_services() {
  local runtime_exists=false
  local ui_exists=false

  if service_exists "${RUNTIME_LABEL}"; then runtime_exists=true; fi
  if service_exists "${UI_LABEL}"; then ui_exists=true; fi

  if [[ "$runtime_exists" == "false" && "$ui_exists" == "false" ]]; then
    return
  fi

  if [[ "${FORCE_RECONFIGURE}" == "false" ]]; then
    die "service labels already exist (${RUNTIME_LABEL} or ${UI_LABEL}); rerun with --force-reconfigure"
  fi

  log "existing services detected, attempting removal"
  if [[ "$runtime_exists" == "true" ]]; then
    remove_service_if_supported "${RUNTIME_LABEL}" || die "could not remove ${RUNTIME_LABEL}; remove manually in Zo UI"
  fi
  if [[ "$ui_exists" == "true" ]]; then
    remove_service_if_supported "${UI_LABEL}" || die "could not remove ${UI_LABEL}; remove manually in Zo UI"
  fi
}

wait_for_health() {
  if ! command -v curl >/dev/null 2>&1; then
    log "curl not found; skipping health check"
    return
  fi

  local url="http://127.0.0.1:${RUNTIME_PORT}/health"
  for _ in {1..20}; do
    if curl -fsS -H "x-qore-api-key: ${QORE_API_KEY}" "$url" >/dev/null 2>&1; then
      log "runtime health check passed"
      return
    fi
    sleep 1
  done
  log "runtime health check did not pass within timeout (service may still be starting)"
}

print_summary() {
  log "installation complete"
  log ""
  log "credentials (store securely now):"
  log "QORE_API_KEY=${QORE_API_KEY}"
  log "QORE_UI_BASIC_AUTH_USER=${QORE_UI_BASIC_AUTH_USER}"
  log "QORE_UI_BASIC_AUTH_PASS=${QORE_UI_BASIC_AUTH_PASS}"
  log "QORE_UI_TOTP_SECRET=${QORE_UI_TOTP_SECRET}"
  log "QORE_UI_ADMIN_TOKEN=${QORE_UI_ADMIN_TOKEN}"
  log ""
  log "MFA enrollment URL:"
  npm run -s ui:mfa:secret
  log ""
  log "service checks:"
  log "  service_doctor ${RUNTIME_LABEL}"
  log "  service_doctor ${UI_LABEL}"
}

main() {
  parse_args "$@"
  load_config_file

  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd bash
  require_cmd register_user_service
  require_cmd openssl

  interactive_config

  local repo_dir
  repo_dir="$(ensure_repo)"
  cd "${repo_dir}"

  validate_or_prepare_services

  log "installing dependencies"
  npm ci

  log "syncing full FailSafe UI"
  npm run ui:sync

  log "building"
  npm run build

  generate_missing_secrets
  write_config_file

  export SERVICE_LABEL="${RUNTIME_LABEL}"
  export SERVICE_PORT="${RUNTIME_PORT}"
  export QORE_API_HOST="${RUNTIME_HOST}"
  export QORE_API_PORT="${RUNTIME_PORT}"

  export UI_LABEL="${UI_LABEL}"
  export UI_PORT="${UI_PORT}"
  export QORE_UI_HOST="${UI_HOST}"
  export RUNTIME_BASE_URL="http://127.0.0.1:${RUNTIME_PORT}"

  log "registering runtime service"
  bash deploy/zo/register-user-service.sh

  log "registering ui service (Basic Auth + MFA)"
  bash deploy/zo/register-ui-user-service.sh

  wait_for_health
  print_summary
}

main "$@"
