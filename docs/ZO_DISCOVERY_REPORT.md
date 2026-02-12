# FailSafe-Qore Zo Discovery Report

Report generated: 2026-02-12 19:54 UTC  
Repository: `/home/workspace/MythologIQ/FailSafe-Qore`  
Zo host: `frostwulf.zo.computer`

## A) Environment Facts

### System
- OS: Debian GNU/Linux 12 (bookworm), x86_64
- PID 1: `dumb-init`
- Runtime context: gVisor container, 9p filesystem
- Root privileges: available

### Toolchain
- Node.js: `v22.21.0` (`PASS`)
- npm: `10.9.4` (`PASS`)
- bun: `1.2.21` (`PASS`)
- Git: `2.39.5` (`PASS`)
- Node engine requirement (`>=20`): satisfied (`PASS`)

### Repository Validation
- Type check: `PASS` (`npm run typecheck`)
- Test suite: `PASS` (27 files, 49 tests)
- Build: `PASS` (`npm run build`)
- Zo assumptions check: `PASS`

### Runtime Entrypoints (`dist/`)
- `dist/runtime/service/start.js` (primary runtime API)
- `dist/zo/http-proxy/server.js`
- `dist/zo/mcp-proxy/server.js`
- `dist/zo/fallback/start-watcher.js`
- `dist/runtime/api/index.js`

### Network and Health
- Default bind: `127.0.0.1:7777`
- External bind supported with: `QORE_API_HOST=0.0.0.0`
- Health endpoint verified: `GET /health`
- Policy endpoint verified: `GET /policy/version`

## B) Capability Matrix

### Service Mode (`systemd`)
| Capability | Status | Evidence |
|---|---|---|
| systemd runtime | `unsupported` | `/run/systemd/system` missing, PID 1 is `dumb-init` |
| `systemctl` binary | `present_not_operational` | binary exists, no active systemd runtime |
| systemd unit lifecycle | `unsupported` | cannot connect to service manager bus |

Conclusion: systemd service mode is not available on this Zo host.

### Process and Zo Service Modes
| Capability | Status | Evidence |
|---|---|---|
| direct node process | `supported` | `node dist/runtime/service/start.js` works |
| background process | `supported` | `nohup ... &` works |
| Zo user service | `supported` | `register_user_service` available and validated |
| runtime endpoints | `supported` | `/health` and `/policy/version` return expected responses |

Conclusion: process mode and Zo user-service mode are viable. Zo user service is the preferred production path on this host.

## C) Working Launch Commands

### Foreground
```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
export QORE_API_KEY="your-secure-api-key"
export QORE_API_HOST="127.0.0.1"
export QORE_API_PORT="7777"
node dist/runtime/service/start.js
```

### Background
```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
export QORE_API_KEY="your-secure-api-key"
export QORE_API_HOST="0.0.0.0"
export QORE_API_PORT="7777"
nohup node dist/runtime/service/start.js > /dev/shm/qore-runtime.log 2>&1 &
echo $! > /tmp/qore-runtime.pid
```

Stop:
```bash
kill "$(cat /tmp/qore-runtime.pid)"
rm -f /tmp/qore-runtime.pid
```

### Zo User Service (recommended)
```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
register_user_service \
  --label "qore-runtime" \
  --protocol "http" \
  --local-port 7777 \
  --workdir "/home/workspace/MythologIQ/FailSafe-Qore" \
  --entrypoint "node dist/runtime/service/start.js" \
  --env-vars "QORE_API_HOST=0.0.0.0,QORE_API_PORT=7777"
```

### Health Verification
```bash
curl -H "x-qore-api-key: your-secure-api-key" http://127.0.0.1:7777/health
curl -H "x-qore-api-key: your-secure-api-key" http://127.0.0.1:7777/policy/version
```

## D) Failure Modes and Rollback

### 1) Missing API key
- Symptom: startup fails with auth-required error
- Fix: set `QORE_API_KEY`
- Rollback: not required (process did not start)

### 2) Port conflict (`EADDRINUSE`)
- Symptom: bind failure on `:7777`
- Fix: terminate conflicting process or change `QORE_API_PORT`
- Rollback:
```bash
pkill -f "node dist/runtime/service/start.js"
```

### 3) Missing build artifact
- Symptom: `Cannot find module dist/runtime/service/start.js`
- Fix:
```bash
npm run build
```

### 4) Ledger initialization failure
- Symptom: ledger init runtime error
- Fix: back up and recreate ledger file
- Rollback: restore backed-up ledger

### 5) Policy load failure
- Symptom: runtime cannot load `policy/definitions`
- Fix: verify policy files and pull latest source
- Rollback: return to last known good commit

### Emergency stop
```bash
pkill -f "node dist/runtime/service/start.js"
```

## E) Recommended Deployment for This Host

Primary path: Zo user service (`register_user_service`)

Why:
1. systemd is unavailable in this execution environment.
2. Zo user services provide persistence and restart management.
3. Zo user services integrate with HTTPS exposure and domain routing.
4. Operational logs are available through Zo runtime logging paths.

## Operational Commands

Status and diagnostics:
```bash
service_doctor qore-runtime
list_user_services
```

Logs:
```bash
tail -f /dev/shm/qore-runtime.log
tail -f /dev/shm/qore-runtime_err.log
```

## Summary

| Area | Result |
|---|---|
| systemd mode | unsupported |
| process mode | supported |
| Zo user service mode | supported and recommended |
| runtime health endpoints | verified |
| build/test status | passing |

Final recommendation: deploy with Zo user service for production-style hosting in this environment.
