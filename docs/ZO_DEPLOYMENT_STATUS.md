# FailSafe-Qore Permanent Deployment Status

**Deployed:** 2026-02-12 21:53 UTC  
**Zo Host:** frostwulf.zo.computer  
**Status:** ✅ **PRODUCTION READY**

---

## 🚀 Deployed Services

### 1. Qore Runtime API
- **Service ID:** `svc_O8_0IFhwhAU`
- **Label:** `qore-runtime-api`
- **Status:** ✅ RUNNING
- **Local Port:** 7777
- **HTTPS URL:** https://qore-runtime-api-frostwulf.zocomputer.io
- **TCP Address:** ts3.zocomputer.io:10117
- **Working Directory:** `/home/workspace/MythologIQ/FailSafe-Qore`
- **Entrypoint:** `bash -c 'export QORE_API_KEY=... && node dist/runtime/service/start.js'`

**Health Check:**
```bash
curl -s -H "x-qore-api-key: YOUR_API_KEY" http://127.0.0.1:7777/health
```

**Response:**
```json
{
  "status": "ok",
  "initialized": true,
  "policyLoaded": true,
  "ledgerAvailable": true,
  "policyVersion": "290b0220b7deb8134318e80caaaf875f2ed4808fb769551da5b90e610e11bf27",
  "timestamp": "2026-02-12T21:53:30.168Z"
}
```

**Features:**
- ✅ Auto-restart on crash
- ✅ Persists across Zo reboots
- ✅ HTTPS enabled
- ✅ External binding (0.0.0.0:7777)
- ✅ Policy engine loaded
- ✅ Ledger available

---

### 2. FailSafe-Qore Console (Web UI)
- **Service ID:** `svc_UaYk86_7zEg`
- **Label:** `zo-qore-console`
- **Status:** ✅ RUNNING
- **Local Port:** 9380
- **HTTPS URL:** https://zo-qore-console-frostwulf.zocomputer.io
- **TCP Address:** ts1.zocomputer.io:10188
- **Working Directory:** `/home/workspace/MythologIQ/FailSafe-Qore`
- **Entrypoint:** `node dist/zo/ui-shell/start.js`

**Connected To:** `http://127.0.0.1:7777` (qore-runtime-api)

**Features:**
- ✅ Real-time runtime status dashboard
- ✅ Policy version monitoring
- ✅ Endpoint health tracking
- ✅ Latency metrics
- ✅ No IDE required

---

## 📊 Service Monitoring

### Logs
```bash
# Runtime API logs
tail -f /dev/shm/qore-runtime-api.log
tail -f /dev/shm/qore-runtime-api_err.log

# Console logs
tail -f /dev/shm/zo-qore-console.log
tail -f /dev/shm/zo-qore-console_err.log
```

### Service Status
```bash
# Check individual service
service_doctor qore-runtime-api
service_doctor zo-qore-console

# List all services
list_user_services
```

### Health Monitoring (Loki)
```bash
# Query runtime API logs (last 30 minutes, errors only)
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={filename="/dev/shm/qore-runtime-api.log"} |~ "error"' \
  --data-urlencode "start=$(date -d '30 minutes ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode "limit=50" | jq -r '.data.result[0].values[]? | .[1]'
```

---

## 🔧 Management Commands

### Restart Services
```bash
# Restart via supervisorctl
supervisorctl -c /etc/zo/supervisord-user.conf restart qore-runtime-api
supervisorctl -c /etc/zo/supervisord-user.conf restart zo-qore-console

# Or delete and re-register (for config changes)
delete_user_service svc_O8_0IFhwhAU
register_user_service --label qore-runtime-api ...
```

### Update Deployment (Code Changes)
```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
git pull origin main
npm ci
npm run build

# Services will auto-reload (supervisord detects process changes)
# Or manually restart via supervisorctl
```

### Stop Services
```bash
delete_user_service svc_O8_0IFhwhAU  # qore-runtime-api
delete_user_service svc_UaYk86_7zEg  # zo-qore-console
```

---

## 🌐 Public Access

### Console UI (Web Interface)
**URL:** https://zo-qore-console-frostwulf.zocomputer.io

Access the standalone runtime console directly in your browser. No authentication required for UI (runtime API is protected internally).

### Runtime API (Programmatic Access)
**URL:** https://qore-runtime-api-frostwulf.zocomputer.io

**Authentication:** Requires `x-qore-api-key` header with your API key.

**Endpoints:**
- `GET /health` — Runtime health check
- `GET /policy/version` — Current policy version
- `POST /evaluate` — Submit prompts for governance evaluation

**Example:**
```bash
curl -H "x-qore-api-key: YOUR_API_KEY" \
  https://qore-runtime-api-frostwulf.zocomputer.io/health
```

---

## 🔐 Security Configuration

### API Key Management
The `QORE_API_KEY` is embedded in the service entrypoint command. To rotate:

1. Generate new key:
   ```bash
   openssl rand -hex 32
   ```

2. Update service:
   ```bash
   update_user_service \
     --service-id svc_O8_0IFhwhAU \
     --entrypoint "bash -c 'export QORE_API_KEY=NEW_KEY && ...'"
   ```

3. Restart service:
   ```bash
   supervisorctl -c /etc/zo/supervisord-user.conf restart qore-runtime-api
   ```

**Note:** For production, consider storing the API key in Zo secrets and referencing it via environment variable (requires modifying the entrypoint to read from Zo's secret store).

---

## 📈 Performance & Scaling

### Current Configuration
- **Binding:** `0.0.0.0` (external access enabled)
- **Port:** 7777 (runtime API), 9380 (console)
- **Process Management:** supervisord with auto-restart
- **Uptime Tracking:** Automatic via Zo's service manager

### Scaling Considerations
- **Single Instance:** Currently running one instance per service
- **Load Balancing:** Not configured (single-node deployment)
- **Custom Domain:** Available on paid plans (Basic: 3, Pro: 5, Ultra: 10 domains)

To add custom domain:
1. Navigate to [Services](/?t=sites&s=services)
2. Expand service details
3. Add custom domain in "Custom Domains" section

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────┐
│  Public HTTPS (Zo Reverse Proxy)       │
├─────────────────────────────────────────┤
│                                         │
│  https://zo-qore-console-         │
│    frostwulf.zocomputer.io              │
│          │                              │
│          └─> :9380 Console UI           │
│                 │                       │
│                 └─> :7777 Runtime API   │
│                                         │
│  https://qore-runtime-api-              │
│    frostwulf.zocomputer.io              │
│          │                              │
│          └─> :7777 Runtime API          │
│                                         │
└─────────────────────────────────────────┘
         │                │
         ▼                ▼
┌──────────────┐  ┌──────────────┐
│  Console UI  │  │  Runtime API │
│  (Node.js)   │  │  (Node.js)   │
│  Port 9380   │  │  Port 7777   │
└──────────────┘  └──────────────┘
         │                │
         └────────┬───────┘
                  ▼
         ┌────────────────┐
         │ Policy Engine  │
         │ Ledger Manager │
         │ Risk Evaluator │
         └────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ .failsafe/     │
         │   ledger/      │
         │   soa_ledger   │
         │     .db        │
         └────────────────┘
```

---

## ✅ Deployment Checklist

- [x] Repository cloned
- [x] Dependencies installed (`npm ci`)
- [x] Build successful (`npm run build`)
- [x] Tests passing (27 files, 49 tests)
- [x] Runtime API service registered
- [x] Console UI service registered
- [x] Both services running and healthy
- [x] HTTPS endpoints accessible
- [x] Health checks passing
- [x] Policy engine loaded
- [x] Ledger initialized
- [ ] Custom domain configured (optional, requires paid plan)
- [ ] Monitoring alerts configured (optional)

---

## 🆘 Troubleshooting

### Service Won't Start
```bash
# Check logs
tail -50 /dev/shm/qore-runtime-api_err.log

# Verify port not in use
lsof -i :7777

# Check service status
service_doctor qore-runtime-api
```

### Health Check Fails
```bash
# Test locally first
curl -H "x-qore-api-key: YOUR_KEY" http://127.0.0.1:7777/health

# Check if service is running
supervisorctl -c /etc/zo/supervisord-user.conf status qore-runtime-api
```

### Policy Not Loading
```bash
# Verify policy directory exists
ls -la /home/workspace/MythologIQ/FailSafe-Qore/policy/definitions/

# Check policy version
curl -H "x-qore-api-key: YOUR_KEY" http://127.0.0.1:7777/policy/version
```

---

**Deployment completed successfully. Both services are production-ready and accessible via HTTPS.**
