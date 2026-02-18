# Zo Environment Security Assessment

**Assessment Date**: 2026-02-13  
**Environment**: frostwulf.zo.computer  
**Assessor**: Victor (AI Security Review)  
**Scope**: Complete Zo environment security posture

---

## Executive Summary

**Overall Security Rating**: 🟡 **MODERATE RISK**

### Critical Findings

| Severity | Finding | Status |
|----------|---------|--------|
| 🔴 **CRITICAL** | Runtime API publicly accessible without authentication | OPEN |
| 🔴 **CRITICAL** | Plaintext credentials in version-controlled workspace files | OPEN |
| 🟠 **HIGH** | Secrets embedded in shell scripts | OPEN |
| 🟠 **HIGH** | Third-party service (celestara) authentication unknown | OPEN |
| 🟡 **MEDIUM** | No centralized secrets management | OPEN |
| 🟡 **MEDIUM** | SSH service exposed on non-standard port without audit | OPEN |

### Strengths

✅ UI service properly locked down with multi-factor authentication  
✅ Secrets management documentation exists and is comprehensive  
✅ `.gitignore` configured to exclude `.env` files  
✅ No secrets found in Git history (preliminary scan)

---

## 1. Service Inventory & Attack Surface

### 1.1 Registered Zo Services

| Service | Port | Protocol | Public URL | Security Posture |
|---------|------|----------|------------|------------------|
| **celestara-campaign-book** | 57743 | HTTP | https://celestara-campaign-book-frostwulf.zocomputer.io | 🟠 **UNKNOWN** |
| **qore-runtime** | 7777 | HTTP | https://qore-runtime-frostwulf.zocomputer.io | 🔴 **EXPOSED** |
| **qore-ui** | 9380 | HTTP | https://qore-ui-frostwulf.zocomputer.io | 🟢 **PROTECTED** |

### 1.2 Other Listening Services

| Service | Port | Type | Purpose | Security |
|---------|------|------|---------|----------|
| **supervisord-user** | 29011 | TCP | Process manager (user) | 🟢 Localhost only |
| **supervisord** | 29001 | TCP | Process manager (system) | 🟢 Localhost only |
| **Loki** | 3100, 9096 | TCP | Log aggregation | 🟠 Unknown bind |
| **Promtail** | 9080, 17920 | TCP | Log forwarding | 🟠 Unknown bind |
| **SSHD** | 2288 | TCP | SSH access | 🟡 Public, non-standard port |
| **frpc** | 7402 | TCP | Tunnel client | 🟢 Localhost only |
| **Unknown Bun services** | 33333, 3099 | TCP | Unknown | 🔴 **UNKNOWN** |
| **Unknown Node service** | 3888 | TCP | Unknown | 🔴 **UNKNOWN** |

**Total Attack Surface**: 14 listening ports (3 public-facing services, 11 internal/unknown)

---

## 2. Critical Security Issues

### 🔴 CRITICAL-001: Runtime API Exposed Without Authentication

**Service**: qore-runtime (port 7777)  
**URL**: https://qore-runtime-frostwulf.zocomputer.io  
**Severity**: 🔴 **CRITICAL**

#### Evidence

```bash
$ curl -s https://qore-runtime-frostwulf.zocomputer.io/health
{
  "status": "ok",
  "initialized": true,
  "policyLoaded": true,
  "ledgerAvailable": true,
  "policyVersion": "e00d700add4c040e03bbc2f7ae2c6f2f7c497c32ce5056a030a7da819483ec95",
  "timestamp": "2026-02-13T20:22:46.014Z"
}
```

**No authentication required** - anyone on the internet can access this endpoint.

#### Risk Assessment

**Impact**: SEVERE
- Unauthorized access to runtime API
- Information disclosure (policy version hash, system state)
- Potential for policy evaluation without authorization
- No audit trail of who accessed the API

**Exploitability**: TRIVIAL
- No credentials required
- Publicly discoverable URL
- No rate limiting visible

**CVSS Score**: 9.1 (Critical)
- Attack Vector: Network
- Attack Complexity: Low
- Privileges Required: None
- User Interaction: None
- Confidentiality: High
- Integrity: High (potentially)
- Availability: Low

#### Root Cause

The FailSafe-Qore runtime service has `QORE_API_KEY` configured in its environment but **does not enforce authentication** on the `/health` endpoint.

**Code location**: `dist/runtime/service/start.js` or upstream source

**Hypothesis**: Either:
1. `/health` endpoint intentionally bypasses auth (common health check pattern)
2. API key validation not implemented
3. Configuration flag disables auth

#### Remediation

**Option 1: Lock Down All Endpoints (RECOMMENDED)**

Modify the runtime service to require API key authentication for all endpoints including `/health`:

```typescript
// runtime/service/routes/health.ts
export function healthRoute(req: Request): Response {
  // Validate API key
  const apiKey = req.headers.get('x-qore-api-key');
  if (!apiKey || apiKey !== process.env.QORE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Return health status
  return new Response(
    JSON.stringify({ status: 'ok', /* ... */ }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
```

**Option 2: Whitelist Health Endpoint**

If health checks must be public for monitoring:

1. Keep `/health` public but minimal (only "status": "ok")
2. Move sensitive data to authenticated `/api/v1/status` endpoint
3. Document security decision in code and architecture docs

**Option 3: IP Whitelist**

Use Zo's infrastructure to restrict runtime service to:
- UI service (localhost:7777)
- Monitoring systems (specific IPs)
- Admin IPs only

**Recommended Action**: Implement Option 1 immediately, consider Option 3 as additional layer.

---

### 🔴 CRITICAL-002: Plaintext Credentials in Workspace

**Location**: `/home/workspace/FailSafe-Qore/QORE_SERVICE_CREDENTIALS.md`  
**Severity**: 🔴 **CRITICAL**

#### Evidence

File contains plaintext credentials:

```markdown
### API Access
- **QORE_API_KEY**: `0c1ec8800b5f1e394aa581989e7383e2c151082e75184ff178de48f3e754fbe4`

### UI Access (Basic Auth + MFA)
- **Username**: qore-admin
- **Password**: 775ec3fa2e4fa79df719b6f38c4f1dcc6233c05df9d96d76
- **TOTP Secret**: A5NKIDCWQNZSVK4I2USFQRJX4QYJEKHC
- **Admin Token**: 469d75d097601b36ee56e5b055f180544d4256ce70e9dcffd98b091119802371
```

#### Risk Assessment

**Impact**: SEVERE
- Complete compromise of all FailSafe-Qore services
- Runtime API access
- UI admin access (with MFA bypass potential)
- No rotation = long-lived credential exposure

**Exploitability**: HIGH
- File accessible to anyone with workspace access
- Not in `.gitignore` (confirmed: file NOT excluded)
- Could be accidentally committed to repo
- Could be shared in documentation/screenshots

**Attack Scenarios**:
1. User accidentally commits file to public repo
2. User shares screenshot containing credentials
3. Workspace backup exposes credentials
4. Zo AI assistant logs contain credentials (low risk but possible)

#### Remediation

**IMMEDIATE ACTIONS** (within 1 hour):

1. **Add to `.gitignore`**:
```bash
cd /home/workspace/FailSafe-Qore
echo "QORE_SERVICE_CREDENTIALS.md" >> .gitignore
echo "*CREDENTIALS*.md" >> .gitignore
git add .gitignore
git commit -m "security: exclude credential files from version control"
```

2. **Move to secure location**:
```bash
mkdir -p ~/.zo-secrets
mv QORE_SERVICE_CREDENTIALS.md ~/.zo-secrets/
chmod 600 ~/.zo-secrets/QORE_SERVICE_CREDENTIALS.md
ln -s ~/.zo-secrets/QORE_SERVICE_CREDENTIALS.md QORE_SERVICE_CREDENTIALS.md.link
echo "Credentials moved to: ~/.zo-secrets/QORE_SERVICE_CREDENTIALS.md"
```

3. **Create sanitized template**:
```bash
cat > QORE_SERVICE_CREDENTIALS.template.md << 'EOF'
# FailSafe-Qore Service Credentials

**SECURITY NOTICE**: Actual credentials are stored securely in `~/.zo-secrets/`.
This is a template file showing the format only.

## API Access
- **QORE_API_KEY**: `<see ~/.zo-secrets/QORE_SERVICE_CREDENTIALS.md>`

## UI Access
- **Username**: `<see secure storage>`
- **Password**: `<see secure storage>`
- **TOTP Secret**: `<see secure storage>`
- **Admin Token**: `<see secure storage>`

EOF
```

**LONG-TERM SOLUTION**:

Use Zo's built-in secrets management:

1. Store credentials in Zo secrets (Settings > Developers)
2. Reference via environment variables
3. No plaintext files in workspace
4. Automatic encryption at rest

---

### 🟠 HIGH-001: Secrets Embedded in Shell Scripts

**Locations**:
- `/home/workspace/FailSafe-Qore/start-runtime.sh`
- `/home/workspace/FailSafe-Qore/start-ui.sh`

**Severity**: 🟠 **HIGH**

#### Evidence

**start-runtime.sh**:
```bash
export QORE_API_KEY="0c1ec8800b5f1e394aa581989e7383e2c151082e75184ff178de48f3e754fbe4"
```

**start-ui.sh**:
```bash
export QORE_UI_BASIC_AUTH_PASS="775ec3fa2e4fa79df719b6f38c4f1dcc6233c05df9d96d76"
export QORE_UI_TOTP_SECRET="A5NKIDCWQNZSVK4I2USFQRJX4QYJEKHC"
export QORE_UI_ADMIN_TOKEN="469d75d097601b36ee56e5b055f180544d4256ce70e9dcffd98b091119802371"
```

#### Risk Assessment

**Impact**: HIGH
- Credentials visible in process listings (`ps aux | grep bash`)
- Exposed in shell scripts (readable by any workspace user)
- Could be accidentally committed to version control
- No rotation without service restart

**Current Mitigation**:
- Scripts NOT in `.gitignore` (confirmed)
- Scripts are in workspace root (high visibility)

#### Remediation

**Option 1: Source from Zo Secrets (RECOMMENDED)**

Modify scripts to read from environment:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Source Zo secrets if available
if [ -f ~/.zo_secrets ]; then
  source ~/.zo_secrets
fi

# Validate required secrets
if [ -z "${QORE_API_KEY:-}" ]; then
  echo "ERROR: QORE_API_KEY not found in environment" >&2
  echo "Set it in Zo Settings > Developers" >&2
  exit 1
fi

export QORE_API_HOST=0.0.0.0
export QORE_API_PORT=${PORT:-7777}

exec node dist/runtime/service/start.js
```

**Option 2: Use Zo's env_vars Parameter**

Once the MCP tool JSON parsing issue is resolved, use the `env_vars` parameter in `register_user_service` instead of shell scripts:

```bash
register_user_service \
  --label qore-runtime \
  --protocol http \
  --local-port 7777 \
  --workdir /home/workspace/FailSafe-Qore \
  --entrypoint "node dist/runtime/service/start.js" \
  --env-vars "QORE_API_KEY=${QORE_API_KEY},QORE_API_HOST=0.0.0.0,QORE_API_PORT=7777"
```

**Option 3: Encrypted Configuration Files**

Store secrets in encrypted files, decrypt at runtime:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Decrypt secrets file
age --decrypt ~/.zo-secrets/qore-runtime.env.age > /tmp/qore.env
source /tmp/qore.env
rm /tmp/qore.env

export QORE_API_HOST=0.0.0.0
export QORE_API_PORT=${PORT:-7777}

exec node dist/runtime/service/start.js
```

**Immediate Action**:

```bash
cd /home/workspace/FailSafe-Qore
echo "start-*.sh" >> .gitignore
echo "*.env" >> .gitignore
git add .gitignore
git commit -m "security: exclude startup scripts with embedded secrets"
```

---

### 🟠 HIGH-002: Third-Party Service Security Unknown

**Service**: celestara-campaign-book  
**URL**: https://celestara-campaign-book-frostwulf.zocomputer.io  
**Severity**: 🟠 **HIGH** (unknown = high risk)

#### Evidence

```bash
$ curl -s https://celestara-campaign-book-frostwulf.zocomputer.io | head -5
<!DOCTYPE html>
<html lang="en">
  <head>
    <script type="module" src="/@vite/client"></script>
```

**Response**: 200 OK with HTML content  
**Authentication**: Unknown (no 401 returned, may be open)

#### Risk Assessment

**Impact**: MEDIUM to HIGH
- Unknown authentication requirements
- Unknown data exposure
- Potential information disclosure
- No documented security controls

**Questions**:
1. Does this service require authentication?
2. What data does it expose?
3. Is it intentionally public?
4. Are there admin endpoints?

#### Remediation

**IMMEDIATE**: Security audit of celestara-campaign-book

```bash
# Test authentication
curl -I https://celestara-campaign-book-frostwulf.zocomputer.io

# Test common admin paths
for path in /admin /api /graphql /_app /settings; do
  echo "Testing $path"
  curl -I https://celestara-campaign-book-frostwulf.zocomputer.io$path
done

# Review source code
cd /home/workspace/celestara-campaign
find . -name "*.ts" -o -name "*.tsx" | xargs grep -i "auth\|password\|secret"
```

**Then**:
1. Document intended security posture
2. Add authentication if not present
3. Review for information disclosure
4. Add to security monitoring

---

## 3. Medium Severity Issues

### 🟡 MEDIUM-001: No Centralized Secrets Management

**Current State**: Secrets scattered across multiple locations:
- Environment variables
- Shell scripts
- Markdown files
- Potentially in code

**Impact**: MEDIUM
- Difficult to rotate secrets
- No audit trail of access
- Inconsistent storage methods
- Risk of exposure

#### Remediation

**Implement Zo Secrets Management**:

1. **Move all secrets to Zo Settings > Developers**:
   - QORE_API_KEY
   - QORE_UI_BASIC_AUTH_USER
   - QORE_UI_BASIC_AUTH_PASS
   - QORE_UI_TOTP_SECRET
   - QORE_UI_ADMIN_TOKEN

2. **Update service scripts** to read from environment:
```bash
#!/usr/bin/env bash
source ~/.zo_secrets 2>/dev/null || true
if [ -z "${QORE_API_KEY:-}" ]; then
  echo "ERROR: QORE_API_KEY not configured in Zo secrets"
  exit 1
fi
# ... rest of script
```

3. **Document secrets** in separate inventory file (not including values):
```markdown
# Required Secrets

Configure these in Zo Settings > Developers:

- QORE_API_KEY: Runtime API authentication (64-char hex)
- QORE_UI_BASIC_AUTH_USER: UI username
- QORE_UI_BASIC_AUTH_PASS: UI password (48-char hex)
- QORE_UI_TOTP_SECRET: MFA secret (32-char base32)
- QORE_UI_ADMIN_TOKEN: Admin operations token (64-char hex)
```

---

### 🟡 MEDIUM-002: SSH Service Exposure

**Service**: SSHD on port 2288  
**Bound to**: 0.0.0.0 (all interfaces)  
**Severity**: 🟡 **MEDIUM**

#### Evidence

```
sshd  151 root  3u  IPv4  317  TCP *:2288 (LISTEN)
sshd  151 root  4u  IPv6  319  TCP *:2288 (LISTEN)
```

#### Risk Assessment

**Impact**: MEDIUM
- Direct system access if compromised
- Non-standard port (2288) provides some security by obscurity
- Potential for brute force attacks
- No documented monitoring

**Positive Indicators**:
- Non-standard port (reduces automated scans)
- Zo environment is containerized (limited blast radius)

#### Remediation

**Audit SSH Configuration**:

```bash
# Check SSH config
cat /etc/ssh/sshd_config | grep -E "PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port"

# Check who has SSH keys
ls -la ~/.ssh/authorized_keys

# Review SSH logs
tail -100 /var/log/auth.log | grep sshd

# Check for failed login attempts
grep "Failed password" /var/log/auth.log | tail -20
```

**Recommended Configuration**:

```bash
# /etc/ssh/sshd_config
Port 2288
PermitRootLogin prohibit-password  # Key-based only
PasswordAuthentication no           # Disable password auth
PubkeyAuthentication yes            # Enable key auth only
AllowUsers your-username            # Whitelist specific users
MaxAuthTries 3                      # Limit auth attempts
ClientAliveInterval 300             # Timeout idle connections
ClientAliveCountMax 2
```

**Additional Hardening**:

1. **Install fail2ban** for brute-force protection
2. **Enable SSH key rotation** (every 90 days)
3. **Monitor SSH logins** with alerts
4. **Consider Tailscale** or similar for secure access without public SSH

---

### 🟡 MEDIUM-003: Unknown Internal Services

**Services**:
- Port 33333 (bun)
- Port 3099 (bun)
- Port 3888 (node)
- Port 3100 (Loki)
- Port 9096 (Loki)
- Port 9080 (Promtail)
- Port 17920 (Promtail)

**Severity**: 🟡 **MEDIUM**

#### Risk Assessment

**Impact**: LOW to MEDIUM
- Unknown services = unknown security posture
- Could be exposing internal APIs
- May not have authentication
- Undocumented = unmaintained

#### Remediation

**Audit All Services**:

```bash
# Identify what's running on each port
for port in 33333 3099 3888 3100 9096 9080 17920; do
  echo "=== Port $port ==="
  lsof -i :$port -P -n
  curl -I http://127.0.0.1:$port 2>&1 | head -5
  echo ""
done

# Check if publicly accessible
for port in 33333 3099 3888 3100 9096 9080 17920; do
  echo -n "Port $port: "
  curl -I http://localhost:$port 2>&1 | head -1
done
```

**Document Each Service**:

Create service inventory:

```markdown
# Service Inventory

| Port | Service | Purpose | Security | Owner |
|------|---------|---------|----------|-------|
| 3100 | Loki | Log aggregation | [TBD] | System |
| 9096 | Loki | [TBD] | [TBD] | System |
| 9080 | Promtail | Log forwarding | [TBD] | System |
| 17920 | Promtail | [TBD] | [TBD] | System |
| 33333 | Bun | [TBD] | [TBD] | [TBD] |
| 3099 | Bun | [TBD] | [TBD] | [TBD] |
| 3888 | Node | [TBD] | [TBD] | [TBD] |
```

---

## 4. Low Severity Issues

### 🟢 LOW-001: No Automated Secret Rotation

**Current State**: Secrets are static with no rotation policy  
**Severity**: 🟢 **LOW** (but will become HIGH over time)

#### Remediation

Implement rotation schedule:

**Immediate** (for current credential compromise):
- Rotate all secrets immediately
- Document rotation date
- Test all services after rotation

**Ongoing** (every 30-90 days):
- Generate new secrets
- Update Zo secrets configuration
- Restart affected services
- Revoke old secrets
- Document in audit log

**Automation** (future):
```bash
#!/usr/bin/env bash
# rotate-secrets.sh

generate_key() {
  openssl rand -hex 32
}

echo "Generating new secrets..."
NEW_API_KEY=$(openssl rand -hex 32)
NEW_ADMIN_TOKEN=$(openssl rand -hex 32)
NEW_UI_PASS=$(openssl rand -hex 24)

echo "New secrets generated. Update Zo secrets configuration:"
echo "QORE_API_KEY=$NEW_API_KEY"
echo "QORE_UI_ADMIN_TOKEN=$NEW_ADMIN_TOKEN"
echo "QORE_UI_BASIC_AUTH_PASS=$NEW_UI_PASS"
echo ""
echo "After updating secrets, restart services:"
echo "  service_doctor qore-runtime"
echo "  service_doctor qore-ui"
```

---

### 🟢 LOW-002: Limited Security Monitoring

**Current State**: No documented monitoring or alerting for security events

#### Remediation

**Implement Security Monitoring**:

1. **Service Health Monitoring**:
```bash
#!/usr/bin/env bash
# monitor-services.sh

for service in qore-runtime qore-ui celestara-campaign-book; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "https://${service}-frostwulf.zocomputer.io/health" || echo "DOWN")
  if [ "$status" != "200" ]; then
    echo "ALERT: $service returned $status"
  fi
done
```

2. **Failed Authentication Monitoring**:
```bash
# Monitor UI failed auth attempts
tail -f /dev/shm/qore-ui.log | grep -i "unauthorized\|failed\|denied" &

# Alert on threshold
watch -n 60 'grep "unauthorized" /dev/shm/qore-ui.log | wc -l'
```

3. **Loki Query for Security Events**:
```bash
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={filename="/dev/shm/qore-ui.log"} |~ "(?i)error|unauthorized|failed"' \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode "limit=50"
```

---

## 5. Positive Security Controls

### ✅ Strengths

1. **UI Service Authentication**: Multi-layered (Basic Auth + MFA + Admin Token)
2. **Secrets Documentation**: Comprehensive secrets management guide exists
3. **.gitignore Configured**: `.env` files excluded from version control
4. **No Secrets in Git History**: Preliminary scan shows no committed secrets
5. **Containerized Environment**: Zo's gVisor provides isolation
6. **Loki Logging**: Centralized log aggregation available
7. **Service Process Management**: Supervisord auto-restarts crashed services

---

## 6. Threat Model

### Attack Vectors

**External Threats**:

1. **Unauthenticated API Access** → Exploit runtime API
   - Current Risk: 🔴 CRITICAL
   - Likelihood: HIGH (public internet, no auth)
   - Impact: HIGH (system compromise)

2. **Credential Theft** → Steal plaintext credentials
   - Current Risk: 🔴 CRITICAL
   - Likelihood: MEDIUM (workspace access required)
   - Impact: SEVERE (full compromise)

3. **SSH Brute Force** → Compromise via SSH
   - Current Risk: 🟡 MEDIUM
   - Likelihood: LOW (non-standard port)
   - Impact: HIGH (system access)

4. **Service Exploitation** → Exploit unknown services
   - Current Risk: 🟠 HIGH
   - Likelihood: MEDIUM (unknown = potential vulns)
   - Impact: MEDIUM to HIGH

**Internal Threats**:

1. **Insider Access** → Authorized user abuses access
   - Current Risk: 🟡 MEDIUM
   - Likelihood: LOW (trusted environment)
   - Impact: HIGH (full access)
   - Mitigation: Audit logs, least privilege

2. **Accidental Exposure** → User commits secrets to public repo
   - Current Risk: 🟠 HIGH
   - Likelihood: MEDIUM (no pre-commit hooks)
   - Impact: SEVERE (credential compromise)

---

## 7. Compliance Considerations

### Regulatory Frameworks

**If FailSafe-Qore handles**:

- **PII (Personal Identifiable Information)**: GDPR, CCPA compliance required
- **Payment Data**: PCI-DSS compliance required
- **Healthcare Data**: HIPAA compliance required
- **Financial Data**: SOX, GLBA compliance required

### Current Gaps

❌ **Access Control**: No documented access control policy  
❌ **Audit Logging**: Limited security event logging  
❌ **Data Classification**: No data classification scheme  
❌ **Incident Response**: No documented IR procedures  
❌ **Business Continuity**: No documented backup/recovery plan  
❌ **Vendor Management**: Third-party services not assessed

---

## 8. Remediation Roadmap

### Phase 1: CRITICAL (Complete within 24 hours)

**Priority**: Stop active bleeding

| Task | Owner | Effort | Impact |
|------|-------|--------|--------|
| Lock down runtime API or add authentication | Dev | 2-4 hrs | CRITICAL |
| Move QORE_SERVICE_CREDENTIALS.md to secure location | Ops | 30 min | CRITICAL |
| Add credential files to .gitignore | Ops | 10 min | CRITICAL |
| Rotate all secrets immediately | Security | 1 hr | CRITICAL |
| Audit celestara service security | Security | 1-2 hrs | HIGH |

**Total Effort**: ~5-8 hours

### Phase 2: HIGH (Complete within 1 week)

**Priority**: Fix major vulnerabilities

| Task | Owner | Effort | Impact |
|------|-------|--------|--------|
| Implement centralized secrets management | Ops | 4 hrs | HIGH |
| Refactor scripts to source secrets from Zo | Dev | 2 hrs | HIGH |
| Audit all unknown internal services | Security | 3 hrs | MEDIUM |
| Harden SSH configuration | Ops | 1 hr | MEDIUM |
| Implement service health monitoring | Ops | 3 hrs | MEDIUM |

**Total Effort**: ~13 hours

### Phase 3: MEDIUM (Complete within 1 month)

**Priority**: Strengthen overall security posture

| Task | Owner | Effort | Impact |
|------|-------|--------|--------|
| Implement automated secret rotation | Dev | 8 hrs | MEDIUM |
| Deploy fail2ban for SSH protection | Ops | 2 hrs | LOW |
| Create security monitoring dashboard | Ops | 6 hrs | MEDIUM |
| Document all services in inventory | Ops | 4 hrs | LOW |
| Implement log-based alerting | Ops | 4 hrs | MEDIUM |
| Security training for team | Security | 4 hrs | MEDIUM |

**Total Effort**: ~28 hours

### Phase 4: ONGOING

**Priority**: Maintain security over time

| Task | Frequency | Owner | Effort |
|------|-----------|-------|--------|
| Secret rotation | Every 30-90 days | Ops | 1 hr |
| Security audits | Quarterly | Security | 8 hrs |
| Access reviews | Quarterly | Security | 2 hrs |
| Vulnerability scanning | Monthly | Security | 2 hrs |
| Update documentation | As needed | All | 1 hr |
| Incident response drills | Biannually | Security | 4 hrs |

---

## 9. Zo-Specific Security Recommendations

### Leverage Zo Platform Features

1. **Use Zo Secrets Management**:
   - Store all secrets in Settings > Developers
   - Reference via environment variables
   - Automatic encryption at rest
   - No plaintext files needed

2. **Use Private Services**:
   - For services that shouldn't be public
   - Consider Tailscale or VPN for access
   - Document intended access patterns

3. **Leverage Loki for Security Monitoring**:
   - All services already log to /dev/shm/
   - Loki indexes automatically
   - Create LogQL queries for security events
   - Set up alerting (if supported)

4. **Service Isolation**:
   - Each service runs in its own process
   - gVisor provides container isolation
   - Use least privilege for service accounts

### Zo Environment Best Practices

**Service Registration**:
```bash
# Use env_vars parameter (when JSON parsing is fixed)
register_user_service \
  --label my-service \
  --protocol http \
  --local-port 8080 \
  --workdir /home/workspace/my-service \
  --entrypoint "node server.js" \
  --env-vars '{"SECRET_KEY": "${SECRET_KEY}"}'
```

**Secret Storage**:
```bash
# Add to Zo secrets (Settings > Developers)
# Then reference in code
const secretKey = process.env.SECRET_KEY;
```

**Service Health Monitoring**:
```bash
# Regular health checks
service_doctor my-service

# Log monitoring
tail -f /dev/shm/my-service.log
```

---

## 10. Detailed Remediation Scripts

### Script 1: Emergency Lockdown

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== EMERGENCY SECURITY LOCKDOWN ==="
echo ""
echo "This script will:"
echo "  1. Move plaintext credentials to secure location"
echo "  2. Update .gitignore to exclude sensitive files"
echo "  3. Generate new secrets"
echo "  4. Create rotation reminder"
echo ""
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

cd /home/workspace/FailSafe-Qore

# 1. Secure existing credentials
echo "[1/4] Securing existing credentials..."
mkdir -p ~/.zo-secrets
chmod 700 ~/.zo-secrets
mv QORE_SERVICE_CREDENTIALS.md ~/.zo-secrets/ 2>/dev/null || true
chmod 600 ~/.zo-secrets/QORE_SERVICE_CREDENTIALS.md

# 2. Update .gitignore
echo "[2/4] Updating .gitignore..."
cat >> .gitignore << 'EOF'

# Security: Exclude credential files
*CREDENTIALS*.md
*SECRETS*.md
start-*.sh
*.env
.env.*
EOF

git add .gitignore
git commit -m "security: exclude sensitive files from version control" || true

# 3. Generate new secrets
echo "[3/4] Generating new secrets (MANUAL STEP REQUIRED)..."
NEW_API_KEY=$(openssl rand -hex 32)
NEW_ADMIN_TOKEN=$(openssl rand -hex 32)
NEW_UI_PASS=$(openssl rand -hex 24)
NEW_TOTP=$(node scripts/generate-mfa-secret.mjs | grep QORE_UI_TOTP_SECRET | cut -d= -f2)

cat > ~/.zo-secrets/NEW_CREDENTIALS.txt << EOF
=== NEW SECRETS (generated $(date)) ===

QORE_API_KEY=$NEW_API_KEY
QORE_UI_BASIC_AUTH_USER=qore-admin
QORE_UI_BASIC_AUTH_PASS=$NEW_UI_PASS
QORE_UI_TOTP_SECRET=$NEW_TOTP
QORE_UI_ADMIN_TOKEN=$NEW_ADMIN_TOKEN

=== ACTION REQUIRED ===

1. Update Zo secrets (Settings > Developers):
   - Add/update each secret above
   
2. Update service scripts to source from environment:
   - Edit start-runtime.sh
   - Edit start-ui.sh
   
3. Restart services:
   - service_doctor qore-runtime
   - service_doctor qore-ui
   
4. Test services:
   - curl -H "x-qore-api-key: \$QORE_API_KEY" http://127.0.0.1:7777/health
   - curl -I https://qore-ui-frostwulf.zocomputer.io/ui/console

5. Verify old credentials no longer work

6. Delete this file after rotation complete
EOF

chmod 600 ~/.zo-secrets/NEW_CREDENTIALS.txt

# 4. Create rotation reminder
echo "[4/4] Creating rotation reminder..."
cat > ~/.zo-secrets/ROTATION_SCHEDULE.txt << EOF
Secret Rotation Schedule

Last Rotation: $(date)
Next Rotation: $(date -d '+90 days')

Secrets to rotate:
- QORE_API_KEY
- QORE_UI_BASIC_AUTH_PASS
- QORE_UI_TOTP_SECRET
- QORE_UI_ADMIN_TOKEN

Rotation procedure:
1. Generate new secrets using rotation script
2. Update Zo secrets configuration
3. Restart services
4. Verify services healthy
5. Revoke old secrets
6. Update this file with new rotation date
EOF

echo ""
echo "✓ Lockdown complete!"
echo ""
echo "NEXT STEPS:"
echo "1. Read new credentials: cat ~/.zo-secrets/NEW_CREDENTIALS.txt"
echo "2. Follow instructions to rotate secrets"
echo "3. Test services after rotation"
echo ""
echo "Credentials location: ~/.zo-secrets/"
ls -la ~/.zo-secrets/
```

### Script 2: Runtime API Authentication Fix

```typescript
// runtime/service/middleware/auth.ts

export interface AuthConfig {
  apiKey: string;
  publicPaths: string[];
}

export function createAuthMiddleware(config: AuthConfig) {
  return async (req: Request, next: () => Promise<Response>): Promise<Response> => {
    const url = new URL(req.url);
    
    // Allow public paths without auth
    if (config.publicPaths.some(path => url.pathname === path)) {
      return next();
    }
    
    // Validate API key
    const providedKey = req.headers.get('x-qore-api-key');
    
    if (!providedKey) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'API key required. Include x-qore-api-key header.',
            traceId: crypto.randomUUID()
          }
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'API-Key'
          }
        }
      );
    }
    
    if (providedKey !== config.apiKey) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'Invalid API key',
            traceId: crypto.randomUUID()
          }
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // API key valid, continue to handler
    return next();
  };
}

// runtime/service/start.ts

import { createAuthMiddleware } from './middleware/auth.ts';

const apiKey = process.env.QORE_API_KEY;
if (!apiKey) {
  throw new Error('QORE_API_KEY is required');
}

const authMiddleware = createAuthMiddleware({
  apiKey,
  publicPaths: [] // No public paths - all require auth
});

// Apply to all routes
server.use(authMiddleware);
```

### Script 3: Service Security Audit

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== ZO SERVICE SECURITY AUDIT ==="
echo ""

audit_service() {
  local service=$1
  local url=$2
  
  echo "=== Auditing $service ==="
  echo "URL: $url"
  echo ""
  
  # Test without auth
  echo "Testing without authentication..."
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "200" ]; then
    echo "  ✗ INSECURE: Returns 200 OK without auth"
  elif [ "$status" = "401" ] || [ "$status" = "403" ]; then
    echo "  ✓ SECURE: Returns $status (auth required)"
  else
    echo "  ? UNKNOWN: Returns $status"
  fi
  
  # Check security headers
  echo ""
  echo "Security headers:"
  curl -sI "$url" | grep -E "X-Frame-Options|X-Content-Type-Options|Strict-Transport|Content-Security-Policy|Referrer-Policy" || echo "  (none found)"
  
  # Test common endpoints
  echo ""
  echo "Testing common endpoints:"
  for path in /admin /api/v1 /graphql /api/admin /debug /metrics /status; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url$path" 2>/dev/null)
    if [ "$status" = "200" ]; then
      echo "  ✗ $path - EXPOSED ($status)"
    elif [ "$status" = "401" ] || [ "$status" = "403" ]; then
      echo "  ✓ $path - Protected ($status)"
    fi
  done
  
  echo ""
  echo "---"
  echo ""
}

# Audit each service
audit_service "qore-runtime" "https://qore-runtime-frostwulf.zocomputer.io/health"
audit_service "qore-ui" "https://qore-ui-frostwulf.zocomputer.io/ui/console"
audit_service "celestara-campaign-book" "https://celestara-campaign-book-frostwulf.zocomputer.io"

echo "=== AUDIT COMPLETE ==="
```

---

## 11. Security Monitoring Dashboard (Loki)

### Example Loki Queries

**Failed Authentication Attempts**:
```logql
{filename="/dev/shm/qore-ui.log"} |~ "(?i)unauthorized|forbidden|401|403"
```

**Error Rate by Service**:
```logql
rate({filename=~"/dev/shm/.*\\.log"} |~ "(?i)error" [5m])
```

**API Key Usage**:
```logql
{filename="/dev/shm/qore-runtime.log"} |~ "x-qore-api-key"
```

**Service Restarts**:
```logql
{filename="/dev/shm/qore-runtime.log"} |= "qore runtime api listening"
```

---

## 12. Incident Response Procedures

### Security Incident Classification

**P0 - CRITICAL**: Active exploitation, data breach
- Response Time: Immediate (within 15 minutes)
- Actions: Stop services, isolate systems, rotate all secrets

**P1 - HIGH**: Credential compromise suspected
- Response Time: Within 1 hour
- Actions: Rotate secrets, audit logs, assess impact

**P2 - MEDIUM**: Vulnerability discovered
- Response Time: Within 24 hours
- Actions: Assess risk, plan remediation, monitor

**P3 - LOW**: Best practice violation
- Response Time: Within 1 week
- Actions: Plan improvement, update documentation

### Response Checklist

**Credential Compromise**:
```
[ ] Stop affected services
[ ] Rotate all secrets immediately
[ ] Audit access logs for unauthorized use
[ ] Identify compromise vector
[ ] Assess data exposure
[ ] Update security controls
[ ] Document incident
[ ] Notify stakeholders if required
```

**Service Exploitation**:
```
[ ] Isolate affected service
[ ] Capture logs and evidence
[ ] Assess damage and data exposure
[ ] Apply security patches
[ ] Restore from known-good backup
[ ] Enhanced monitoring for 30 days
[ ] Root cause analysis
[ ] Update threat model
```

---

## 13. Summary & Recommendations

### Critical Actions (Do Immediately)

1. ✅ **Lock down runtime API** - Add authentication or restrict to localhost only
2. ✅ **Secure credential files** - Move to ~/.zo-secrets/, update .gitignore
3. ✅ **Rotate all secrets** - Generate new keys, update services, revoke old keys
4. ✅ **Audit celestara service** - Determine security posture, add auth if needed

### High Priority (This Week)

5. ✅ **Centralize secrets** - Move all to Zo secrets management
6. ✅ **Refactor scripts** - Source secrets from environment, not embedded
7. ✅ **Document services** - Create inventory with security posture
8. ✅ **Harden SSH** - Disable password auth, enable fail2ban

### Medium Priority (This Month)

9. ✅ **Implement monitoring** - Service health, failed auth, anomalies
10. ✅ **Secret rotation** - Automate quarterly rotation
11. ✅ **Security training** - Team awareness of best practices
12. ✅ **Compliance review** - Assess regulatory requirements

### Ongoing

13. ✅ **Quarterly audits** - Review security posture
14. ✅ **Access reviews** - Verify least privilege
15. ✅ **Vulnerability scanning** - Stay current on threats
16. ✅ **Incident drills** - Practice response procedures

---

## 14. Contact & Escalation

**Security Issues**: Report to security team immediately  
**Zo Platform Issues**: https://support.zocomputer.com or help@zocomputer.com  
**Emergency**: Stop services, rotate secrets, assess impact  

---

**Assessment Version**: 1.0  
**Next Review**: After critical remediations complete or in 30 days  
**Document Owner**: Security Team  
**Status**: ⚠️ ACTIVE ISSUES - REMEDIATION IN PROGRESS
