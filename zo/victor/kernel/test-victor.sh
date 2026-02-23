#!/usr/bin/env bash
set -euo pipefail

# Victor Kernel - Integration Test
# Test Victor kernel without Zo service registration

echo "=== Victor Kernel Integration Test ==="
echo ""

# Configuration
VICTOR_PORT="${VICTOR_PORT:-9500}"
WORKDIR="$(pwd)"

echo "Starting Victor kernel on port $VICTOR_PORT..."
cd "$WORKDIR"

# Start Victor in background
bun run dev &
VICTOR_PID=$!
echo "Victor PID: $VICTOR_PID"
echo ""

# Wait for service to start
echo "Waiting for Victor to start..."
sleep 3

# Test 1: Health check
echo "=== Test 1: Health Check ==="
HEALTH_RESPONSE=$(curl -s http://127.0.0.1:$VICTOR_PORT/health)
echo "$HEALTH_RESPONSE" | jq '.'
echo ""

# Test 2: Task creation
echo "=== Test 2: Create Task ==="
TASK_RESPONSE=$(curl -s -X POST http://127.0.0.1:$VICTOR_PORT/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Test task",
    "priority": "high"
  }')
echo "$TASK_RESPONSE" | jq '.'
echo ""

# Test 3: Task listing
echo "=== Test 3: List Tasks ==="
LIST_RESPONSE=$(curl -s http://127.0.0.1:$VICTOR_PORT/api/tasks)
echo "$LIST_RESPONSE" | jq '.'
echo ""

# Test 4: Victor mode
echo "=== Test 4: Victor Mode ==="
MODE_RESPONSE=$(curl -s http://127.0.0.1:$VICTOR_PORT/api/victor/mode)
echo "$MODE_RESPONSE" | jq '.'
echo ""

# Test 5: Stance determination
echo "=== Test 5: Stance Determination ==="
STANCE_RESPONSE=$(curl -s -X POST http://127.0.0.1:$VICTOR_PORT/api/victor/stance \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "deploy.production"
  }')
echo "$STANCE_RESPONSE" | jq '.'
echo ""

# Test 6: Audit log
echo "=== Test 6: Audit Log ==="
AUDIT_RESPONSE=$(curl -s http://127.0.0.1:$VICTOR_PORT/api/audit)
echo "$AUDIT_RESPONSE" | jq '.'
echo ""

# Cleanup
echo "=== Tests Complete ==="
echo "Stopping Victor..."
kill $VICTOR_PID 2>/dev/null || true
echo ""
echo "Victor kernel test finished successfully!"
