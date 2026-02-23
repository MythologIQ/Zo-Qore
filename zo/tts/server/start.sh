#!/usr/bin/env bash
set -euo pipefail

export PYTHONUNBUFFERED=1
export PORT=${PORT:-8000}

cd /home/workspace/victor-tts
exec python3 server.py
