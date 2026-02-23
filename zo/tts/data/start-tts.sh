#!/usr/bin/env bash
set -euo pipefail

TTS_PORT=8200
TTS_HOST=127.0.0.1
TTS_LOG=/home/workspace/tts-data/pocket-tts-server.log

# Check if already running
if curl -s "http://${TTS_HOST}:${TTS_PORT}/health" > /dev/null 2>&1; then
  echo "Pocket TTS already running on port ${TTS_PORT}"
  exit 0
fi

echo "Starting Pocket TTS server on ${TTS_HOST}:${TTS_PORT}..."
nohup pocket-tts serve --host "${TTS_HOST}" --port "${TTS_PORT}" > "${TTS_LOG}" 2>&1 &
echo $! > /home/workspace/tts-data/pocket-tts.pid
echo "Pocket TTS started (PID: $(cat /home/workspace/tts-data/pocket-tts.pid))"
