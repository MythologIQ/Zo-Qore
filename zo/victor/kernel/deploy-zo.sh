#!/usr/bin/env bash
set -euo pipefail

# Victor Kernel - Zo Deployment Script
# Deploy Victor as a deterministic service in Zo ecosystem

echo "=== Victor Kernel Deployment ==="
echo "Mode: Deterministic (no LLM dependency for core functions)"
echo ""

# Configuration
VICTOR_LABEL="${VICTOR_LABEL:-victor-kernel}"
VICTOR_PORT="${VICTOR_PORT:-9500}"
WORKDIR="$(pwd)"

echo "Configuration:"
echo "  Label: $VICTOR_LABEL"
echo "  Port: $VICTOR_PORT"
echo "  Directory: $WORKDIR"
echo ""

# Install dependencies
echo "Installing dependencies..."
bun install

# Deploy service
echo ""
echo "Registering Victor service with Zo..."
register_user_service \
  --label "$VICTOR_LABEL" \
  --protocol http \
  --local_port "$VICTOR_PORT" \
  --entrypoint "bun run server.ts" \
  --workdir "$WORKDIR"

echo ""
echo "=== Victor Kernel Deployed ==="
echo ""
echo "Service Information:"
echo "  Label: $VICTOR_LABEL"
echo "  Local URL: http://127.0.0.1:$VICTOR_PORT"
echo "  Public URL: https://${VICTOR_LABEL}-frostwulf.zocomputer.io"
echo ""
echo "API Endpoints:"
echo "  Health:  GET  /health"
echo "  Process: POST /api/victor/process"
echo "  Tasks:   GET/POST /api/tasks"
echo "  Stance:  POST /api/victor/stance"
echo "  Audit:   GET /api/audit"
echo ""
echo "Victor operates in deterministic mode - rules are evaluated without LLM"
echo "LLM integration can be added later for complex reasoning tasks"
