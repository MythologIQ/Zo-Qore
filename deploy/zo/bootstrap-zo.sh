#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/MythologIQ/Zo-Qore.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/zo-qore}"
SERVICE_USER="${SERVICE_USER:-failsafe}"
SERVICE_GROUP="${SERVICE_GROUP:-failsafe}"
ENV_DIR="${ENV_DIR:-/etc/zo-qore}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/env}"

log() {
  printf '[zo-qore-bootstrap] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

# Security: Validate paths to prevent accidental deletion of critical system directories
validate_install_path() {
  local path="$1"
  local path_name="$2"
  
  # Check if path is empty
  if [[ -z "${path}" ]]; then
    log "ERROR: ${path_name} is empty"
    exit 1
  fi
  
  # Check if path is absolute
  if [[ "${path}" != /* ]]; then
    log "ERROR: ${path_name} must be an absolute path: ${path}"
    exit 1
  fi
  
  # Check for path traversal attempts
  if [[ "${path}" == *".."* ]]; then
    log "ERROR: ${path_name} contains path traversal: ${path}"
    exit 1
  fi
  
  # Check for suspicious patterns
  if [[ "${path}" =~ ^/(bin|boot|dev|etc|lib|lib64|proc|root|run|sbin|srv|sys|usr|var)/?$ ]]; then
    log "ERROR: ${path_name} is a critical system directory: ${path}"
    exit 1
  fi
  
  # Additional safety: prevent deletion of home directory root
  if [[ "${path}" == "/home" ]] || [[ "${path}" == "/home/" ]]; then
    log "ERROR: ${path_name} cannot be /home: ${path}"
    exit 1
  fi
  
  return 0
}

if [[ "${EUID}" -ne 0 ]]; then
  log "run as root (sudo)"
  exit 1
fi

# Security: Validate paths before any operations
validate_install_path "${INSTALL_DIR}" "INSTALL_DIR"
validate_install_path "${ENV_DIR}" "ENV_DIR"

require_cmd git
require_cmd node
require_cmd npm
require_cmd systemctl

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  log "Node 20+ is required. Detected: $(node -v)"
  exit 1
fi

if ! getent group "${SERVICE_GROUP}" >/dev/null; then
  log "creating group ${SERVICE_GROUP}"
  groupadd --system "${SERVICE_GROUP}"
fi

if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  log "creating user ${SERVICE_USER}"
  useradd --system --gid "${SERVICE_GROUP}" --home-dir "${INSTALL_DIR}" --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

mkdir -p "${INSTALL_DIR}"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  log "updating existing repository at ${INSTALL_DIR}"
  git -C "${INSTALL_DIR}" fetch --all --prune
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
else
  log "cloning ${REPO_URL} into ${INSTALL_DIR}"
  # Security: Using validated INSTALL_DIR with :? to prevent empty path
  rm -rf "${INSTALL_DIR:?}/"*
  git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

log "installing dependencies"
cd "${INSTALL_DIR}"
npm ci

log "building runtime"
npm run build

mkdir -p "${ENV_DIR}"
if [[ ! -f "${ENV_FILE}" ]]; then
  log "creating environment file at ${ENV_FILE}"
  install -m 0640 -o root -g "${SERVICE_GROUP}" "${INSTALL_DIR}/deploy/zo/env.example" "${ENV_FILE}"
fi

log "installing systemd units"
install -m 0644 "${INSTALL_DIR}/deploy/systemd/zo-qore.service" /etc/systemd/system/zo-qore.service
install -m 0644 "${INSTALL_DIR}/deploy/systemd/zo-qore-fallback-watcher.service" /etc/systemd/system/zo-qore-fallback-watcher.service

systemctl daemon-reload
systemctl enable zo-qore.service
systemctl enable zo-qore-fallback-watcher.service
systemctl restart zo-qore.service
systemctl restart zo-qore-fallback-watcher.service

chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/.failsafe/ledger"
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}/.failsafe"
chown -R root:"${SERVICE_GROUP}" "${ENV_DIR}"
chmod 0750 "${ENV_DIR}"
chmod 0640 "${ENV_FILE}"

log "bootstrap complete"
log "next: edit ${ENV_FILE} with production keys and allowed models, then run:"
log "  systemctl restart zo-qore.service zo-qore-fallback-watcher.service"
