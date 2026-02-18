#!/usr/bin/env bash
set -euo pipefail

# Qore UI configuration
export QORE_UI_PORT=${PORT:-9380}
export QORE_UI_HOST=0.0.0.0

# Point to the runtime service
export QORE_RUNTIME_BASE_URL=https://qore-runtime-frostwulf.zocomputer.io

# Use the same API key as runtime
export QORE_API_KEY=qore_dev_53864b4213623eaba716687ebcc28e08

# Timeout for runtime requests
export QORE_UI_TIMEOUT_MS=120000

# Assets directory (Command Center UI with full panels)
export QORE_UI_ASSETS_DIR="/home/workspace/MythologIQ/Zo-Qore/zo/ui-shell/assets"

# Disable auth requirement for public access
export QORE_UI_REQUIRE_AUTH=false

# Model catalog for the Comms pipeline model selector
export QORE_ZO_MODEL_CATALOG_JSON='[{"id":"zo-fast-1","capabilities":["general","fast"],"maxInputTokens":32000,"maxOutputTokens":8000,"inputCostPer1kUsd":0.0005,"outputCostPer1kUsd":0.0015},{"id":"zo-reasoning-1","capabilities":["general","reasoning","coding"],"maxInputTokens":128000,"maxOutputTokens":32000,"inputCostPer1kUsd":0.003,"outputCostPer1kUsd":0.012},{"id":"zo-coder-1","capabilities":["general","coding"],"maxInputTokens":64000,"maxOutputTokens":16000,"inputCostPer1kUsd":0.0018,"outputCostPer1kUsd":0.006}]'

exec node dist/zo/ui-shell/start.js
