#!/usr/bin/env bash
set -euo pipefail

BRIDGE_PORT=8201
BRIDGE_HOST=127.0.0.1
BRIDGE_LOG=/home/workspace/tts-data/qwen3-bridge.log

# Check if already running
if curl -s "http://${BRIDGE_HOST}:${BRIDGE_PORT}/health" > /dev/null 2>&1; then
  echo "Qwen3-TTS bridge already running on port ${BRIDGE_PORT}"
  exit 0
fi

echo "Starting Qwen3-TTS bridge on ${BRIDGE_HOST}:${BRIDGE_PORT}..."
nohup python3 /home/workspace/tts-data/qwen3-tts-bridge.py > "${BRIDGE_LOG}" 2>&1 &
echo $! > /home/workspace/tts-data/qwen3-bridge.pid
echo "Qwen3-TTS bridge started (PID: $(cat /home/workspace/tts-data/qwen3-bridge.pid))"
