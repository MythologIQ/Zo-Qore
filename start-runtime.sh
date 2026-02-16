#!/usr/bin/env bash
set -euo pipefail

# Qore Runtime configuration
export QORE_API_PORT=${PORT:-7777}
export QORE_API_HOST=0.0.0.0
export QORE_POLICY_DIR=/home/workspace/MythologIQ/Zo-Qore/policy/definitions

# Enable Agent OS integration with Victor
export QORE_AGENT_OS_ENABLED=true

exec node dist/runtime/service/start.js
