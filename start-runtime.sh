#!/usr/bin/env bash
set -euo pipefail

# Qore Runtime configuration
export QORE_API_PORT=${PORT:-7777}
export QORE_API_HOST=0.0.0.0
export QORE_POLICY_DIR=/home/workspace/MythologIQ/Zo-Qore/policy/definitions

# Enable Agent OS integration with Victor (disabled until agentos-mcp-server is installed)
export QORE_AGENT_OS_ENABLED=false

# Qore API Key for authentication
export QORE_API_KEY=qore_dev_53864b4213623eaba716687ebcc28e08

# Make health endpoint public
export QORE_API_PUBLIC_HEALTH=true

exec node dist/runtime/service/start.js
