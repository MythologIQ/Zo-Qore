#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/MythologIQ/failsafe-qore.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/failsafe-qore}"
SERVICE_USER="${SERVICE_USER:-failsafe}"
SERVICE_GROUP="${SERVICE_GROUP:-failsafe}"
ENV_DIR="${ENV_DIR:-/etc/failsafe-qore}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/env}"

log() {
  printf '[failsafe-qore-bootstrap] %s\n' "$*"
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
install -m 0644 "${INSTALL_DIR}/deploy/systemd/failsafe-qore.service" /etc/systemd/system/failsafe-qore.service
install -m 0644 "${INSTALL_DIR}/deploy/systemd/failsafe-fallback-watcher.service" /etc/systemd/system/failsafe-fallback-watcher.service

systemctl daemon-reload
systemctl enable failsafe-qore.service
systemctl enable failsafe-fallback-watcher.service
systemctl restart failsafe-qore.service
systemctl restart failsafe-fallback-watcher.service

chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/.failsafe/ledger"
chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}/.failsafe"
chown -R root:"${SERVICE_GROUP}" "${ENV_DIR}"
chmod 0750 "${ENV_DIR}"
chmod 0640 "${ENV_FILE}"

log "bootstrap complete"
log "next: edit ${ENV_FILE} with production keys and allowed models, then run:"
log "  systemctl restart failsafe-qore.service failsafe-fallback-watcher.service"
