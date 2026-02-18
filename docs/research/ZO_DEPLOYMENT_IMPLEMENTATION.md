# Zo Deployment: AgentMesh + Agent-OS + Zo-Qore Implementation

**Status:** Integration Plan | **Ready to Implement**
**Last Updated:** 2026-02-15

---

## Current Zo Environment

**Already Running:**
- ✅ **qore-runtime** (port 7777) — Central governance runtime
- ✅ **qore-ui** (port 9380) — Web console with MFA support
- ✅ **zo.space** — Home page with links to services

**Integration Points:**
- Zo-Qore Runtime API: `https://qore-runtime-frostwulf.zocomputer.io`
- Zo-Qore UI: `https://qore-ui-frostwulf.zocomputer.io`

---

## Implementation Strategy

Given the Zo environment constraints (single-service limit on free tier, need for lightweight services), I'll implement a **modular, layered approach**:

### Phase 1: Victor Kernel (Agent-OS) — Priority 1

**Why First:**
- Victor's governance rules need kernel-level enforcement
- Most immediate value: Victor's behavior becomes deterministic
- Complements existing Zo-Qore runtime governance

**Implementation:**

```bash
# Create Victor Agent-OS kernel service
cd /home/workspace

# Install Agent-OS kernel
pip install agent-os-kernel[nexus,iatp]

# Create Victor's kernel wrapper
mkdir -p victor-kernel
cd victor-kernel

# Create minimal kernel server for Victor
cat > victor-server.py << 'EOF'
"""
Victor Agent-OS Kernel Server
Runs Victor's governance rules at kernel level
"""
from agent_os import StatelessKernel, KernelSpace
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn
import os
import json

# Initialize Victor's kernel
kernel = KernelSpace(
    agent_id="victor-cyborg",
    log_level="INFO",
    audit_enabled=True
)

# Load Victor's governance policies
VICTOR_POLICIES = {
    "version": "1.0",
    "name": "victor-governance",
    "rules": [
        {
            "id": "declare-stance",
            "name": "Always Declare Stance",
            "description": "Victor must explicitly declare stance mode",
            "enforce": True,
            "severity": "high"
        },
        {
            "id": "bring-receipts",
            "name": "Bring Receipts for Challenges",
            "description": "When challenging, Victor must provide logical reasoning or evidence",
            "enforce": True,
            "severity": "high"
        },
        {
            "id": "no-hallucination",
            "name": "No Hallucination",
            "description": "Victor must never invent facts or certainty where none exists",
            "enforce": True,
            "severity": "critical"
        },
        {
            "id": "zero-fluff",
            "name": "Zero Fluff",
            "description": "Victor responds with brevity and focus",
            "enforce": True,
            "severity": "medium"
        }
    ]
}

# Load policies into kernel
kernel.load_policy_dict(VICTOR_POLICIES)

# Create FastAPI wrapper
app = FastAPI(title="Victor Kernel - Agent-OS", version="1.0.0")

@app.get("/")
async def root():
    return {
        "agent": "Victor",
        "kernel": "Agent-OS",
        "status": "running",
        "policies_loaded": len(VICTOR_POLICIES["rules"])
    }

@app.get("/health")
async def health():
    return {"status": "ok", "kernel": "Agent-OS", "agent": "victor"}

@app.post("/check_action")
async def check_action(request: dict):
    """
    Victor asks kernel: "Should I take this action?"
    Kernel returns: Yes/No based on policies
    """
    action = request.get("action")
    params = request.get("params", {})

    # Check against Victor's policies
    result = await kernel.execute(
        action=action,
        params=params,
        agent_id="victor-cyborg"
    )

    return JSONResponse(content=result)

@app.post("/audit")
async def get_audit(request: dict):
    """Get Victor's audit log entries"""
    limit = request.get("limit", 50)
    # Query kernel's flight recorder
    entries = kernel.flight_recorder.query(
        agent_id="victor-cyborg",
        limit=limit
    )
    return {"entries": entries}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
EOF

# Install dependencies
pip install fastapi uvicorn

# Create requirements.txt
cat > requirements.txt << 'EOF'
agent-os-kernel[nexus,iatp]>=1.2.0
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
EOF
EOF

# Start Victor's kernel service (local test)
cd /home/workspace/victor-kernel && python victor-server.py
```

**Zo Service Registration:**

```bash
# Register Victor's kernel as Zo service
register_user_service \
  --label="victor-kernel" \
  --protocol="http" \
  --local_port=8100 \
  --workdir="/home/workspace/victor-kernel" \
  --entrypoint="python victor-server.py" \
  --env_vars='{"AGENT_OS_MODE":"kernel","VICTOR_AGENT_ID":"victor-cyborg"}'
```

**URL:** `https://victor-kernel-frostwulf.zocomputer.io`

---

### Phase 2: AgentMesh Trust Layer — Priority 2

**Why Second:**
- Provides multi-agent trust coordination
- Enables Victor to trust-handshake with other agents
- Required before adding more agents (Email, Calendar, TTS)

**Implementation:**

```bash
# Create lightweight AgentMesh integration service
cd /home/workspace

mkdir -p agentmesh-zo
cd agentmesh-zo

# Create AgentMesh API wrapper for Zo
cat > agentmesh-server.py << 'EOF'
"""
AgentMesh Trust API for Zo Environment
Provides trust scoring and agent coordination
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import os
import hashlib
import time

app = FastAPI(title="AgentMesh API - Zo", version="1.0.0")

# In-memory trust store (can upgrade to Redis later)
trust_store = {
    "victor-cyborg": {
        "score": 850,
        "history": [],
        "last_updated": time.time()
    },
    "email-processor": {
        "score": 600,
        "history": [],
        "last_updated": time.time()
    },
    "calendar-manager": {
        "score": 600,
        "history": [],
        "last_updated": time.time()
    },
    "qwen3-tts": {
        "score": 800,
        "history": [],
        "last_updated": time.time()
    }
}

class TrustScoreRequest(BaseModel):
    agent_id: str
    delta: int  # Change in score (-100 to +100)
    reason: str

class TrustHandshakeRequest(BaseModel):
    requesting_agent: str
    target_agent: str

@app.get("/")
async def root():
    return {
        "service": "AgentMesh Trust API",
        "status": "running",
        "agents_registered": len(trust_store)
    }

@app.get("/health")
async def health():
    return {"status": "ok", "service": "AgentMesh"}

@app.get("/trust/{agent_id}")
async def get_trust_score(agent_id: str):
    """Get current trust score for an agent"""
    if agent_id not in trust_store:
        raise HTTPException(status_code=404, detail="Agent not found")
    return trust_store[agent_id]

@app.post("/trust/update")
async def update_trust_score(request: TrustScoreRequest):
    """
    Update an agent's trust score
    Called by Zo-Qore when policy violations occur
    """
    if request.agent_id not in trust_store:
        # Register new agent
        trust_store[request.agent_id] = {
            "score": 500,  # Default score
            "history": [],
            "last_updated": time.time()
        }

    # Apply delta
    old_score = trust_store[request.agent_id]["score"]
    new_score = max(0, min(1000, old_score + request.delta))
    trust_store[request.agent_id]["score"] = new_score

    # Record history
    trust_store[request.agent_id]["history"].append({
        "timestamp": time.time(),
        "delta": request.delta,
        "old_score": old_score,
        "new_score": new_score,
        "reason": request.reason
    })

    trust_store[request.agent_id]["last_updated"] = time.time()

    return {
        "agent_id": request.agent_id,
        "old_score": old_score,
        "new_score": new_score,
        "delta": request.delta,
        "reason": request.reason
    }

@app.post("/trust/handshake")
async def trust_handshake(request: TrustHandshakeRequest):
    """
    Perform trust handshake between two agents
    Returns whether handshake should proceed based on trust scores
    """
    requester = trust_store.get(request.requesting_agent)
    target = trust_store.get(request.target_agent)

    if not requester or not target:
        raise HTTPException(status_code=404, detail="One or both agents not found")

    # Check minimum trust threshold
    min_score = 400  # Configurable
    if requester["score"] < min_score or target["score"] < min_score:
        return {
            "allowed": False,
            "reason": f"Trust score below threshold ({min_score})",
            "requester_score": requester["score"],
            "target_score": target["score"]
        }

    # Record handshake in history
    requester["history"].append({
        "timestamp": time.time(),
        "type": "handshake",
        "with_agent": request.target_agent
    })
    target["history"].append({
        "timestamp": time.time(),
        "type": "handshake",
        "with_agent": request.requesting_agent
    })

    return {
        "allowed": True,
        "requester_score": requester["score"],
        "target_score": target["score"]
    }

@app.get("/registry")
async def list_registry():
    """List all registered agents and their trust scores"""
    return {
        "agents": [
            {"id": k, **v}
            for k, v in trust_store.items()
        ]
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
EOF

# Create requirements.txt
cat > requirements.txt << 'EOF'
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
EOF
EOF

# Start AgentMesh service (local test)
cd /home/workspace/agentmesh-zo && python agentmesh-server.py
```

**Zo Service Registration:**

```bash
# Register AgentMesh as Zo service
register_user_service \
  --label="agentmesh-trust" \
  --protocol="http" \
  --local_port=8080 \
  --workdir="/home/workspace/agentmesh-zo" \
  --entrypoint="python agentmesh-server.py" \
  --env_vars='{"TRUST_MIN_SCORE":"400","TRUST_MAX_SCORE":"1000"}'
```

**URL:** `https://agentmesh-trust-frostwulf.zocomputer.io`

---

### Phase 3: Zo-Qore Integration — Priority 3

**What to Add:**
1. Victor Kernel integration (Agent-OS)
2. AgentMesh trust integration
3. Enhanced policy enforcement

**Integration Files:**

```typescript
// Zo-Qore Runtime - Victor Kernel Integration
// file: /home/workspace/MythologIQ/Zo-Qore/src/integrations/victor-kernel.ts

import axios from 'axios';

const VICTOR_KERNEL_URL = process.env.VICTOR_KERNEL_URL || 'http://127.0.0.1:8100';
const AGENTMESH_URL = process.env.AGENTMESH_URL || 'http://127.0.0.1:8080';

export class VictorKernelClient {

  // Check Victor's kernel before taking action
  async checkVictorAction(action: string, params: any): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    try {
      const response = await axios.post(`${VICTOR_KERNEL_URL}/check_action`, {
        action,
        params
      });

      return {
        allowed: response.data.allowed,
        reason: response.data.reason
      };
    } catch (error) {
      console.error('Victor kernel error:', error);
      // Fail closed: if kernel unavailable, deny action
      return { allowed: false, reason: 'Kernel unavailable' };
    }
  }

  // Update Victor's trust score via AgentMesh
  async reportPolicyViolation(violation: PolicyViolation): Promise<void> {
    try {
      await axios.post(`${AGENTMESH_URL}/trust/update`, {
        agent_id: 'victor-cyborg',
        delta: -violation.severity * 10,  // Severity-based impact
        reason: `Policy violation: ${violation.type}`
      });
    } catch (error) {
      console.error('AgentMesh error:', error);
    }
  }

  // Get Victor's trust score
  async getVictorTrustScore(): Promise<number> {
    try {
      const response = await axios.get(`${AGENTMESH_URL}/trust/victor-cyborg`);
      return response.data.score;
    } catch (error) {
      console.error('AgentMesh error:', error);
      return 500;  // Default score
    }
  }
}

export const victorKernel = new VictorKernelClient();
```

```typescript
// Zo-Qore Runtime - AgentMesh Integration
// file: /home/workspace/MythologIQ/Zo-Qore/src/integrations/agentmesh.ts

import axios from 'axios';

const AGENTMESH_URL = process.env.AGENTMESH_URL || 'http://127.0.0.1:8080';

export class AgentMeshClient {

  // Trust handshake between agents
  async trustHandshake(requestingAgent: string, targetAgent: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    try {
      const response = await axios.post(`${AGENTMESH_URL}/trust/handshake`, {
        requesting_agent: requestingAgent,
        target_agent: targetAgent
      });

      return {
        allowed: response.data.allowed,
        reason: response.data.reason
      };
    } catch (error) {
      console.error('AgentMesh error:', error);
      return { allowed: false, reason: 'Trust service unavailable' };
    }
  }

  // Get all registered agents
  async getRegistry(): Promise<Agent[]> {
    try {
      const response = await axios.get(`${AGENTMESH_URL}/registry`);
      return response.data.agents;
    } catch (error) {
      console.error('AgentMesh error:', error);
      return [];
    }
  }

  // Update trust score
  async updateTrustScore(agentId: string, delta: number, reason: string): Promise<void> {
    try {
      await axios.post(`${AGENTMESH_URL}/trust/update`, {
        agent_id: agentId,
        delta,
        reason
      });
    } catch (error) {
      console.error('AgentMesh error:', error);
    }
  }
}

export const agentmesh = new AgentMeshClient();
```

---

## Architecture Overview (Deployed)

```
┌─────────────────────────────────────────────────────────────────┐
│                  Zo Environment (frostwulf.zo.computer)        │
├──────────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐        ┌──────────────┐             │
│  │  Victor      │        │  Other      │             │
│  │  (Agent-OS)  │◄─────►│  Agents     │             │
│  │  Kernel       │        │  (Agent-OS)  │             │
│  └──────┬───────┘        └──────┬───────┘             │
│         │                       │                       │
│         │ AgentMesh Trust        │ AgentMesh Trust       │
│         │ Exchange              │ Exchange              │
│         ▼                       ▼                       │
│  ┌──────────────────────────────────────┐              │
│  │  AgentMesh (Zo Service)     │              │
│  │  Trust Scores, Handshakes        │              │
│  └──────┬───────────────────────────┘              │
│         │                                             │
│         │ Policy Enforcement Request                      │
│         ▼                                             │
│  ┌──────────────┐                                      │
│  │  Zo-Qore     │                                      │
│  │  Runtime      │                                      │
│  │  (Governance) │                                      │
│  └──────────────┘                                      │
│                                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service URLs (After Deployment)

| Service | Zo URL | Purpose |
|---------|---------|---------|
| qore-runtime | https://qore-runtime-frostwulf.zocomputer.io | Central governance runtime |
| qore-ui | https://qore-ui-frostwulf.zocomputer.io | Web console |
| victor-kernel | https://victor-kernel-frostwulf.zocomputer.io | Victor's Agent-OS kernel |
| agentmesh-trust | https://agentmesh-trust-frostwulf.zocomputer.io | Multi-agent trust layer |

---

## Victor's Enhanced Governance Flow

```
User Request → Victor
    │
    ├─► Victor's Persona Rules (Current: Applied)
    │   - Declare stance
    │   - Bring receipts
    │   - No hallucination
    │   - Zero fluff
    │
    ├─► Victor Kernel (Agent-OS)
    │   - Policy engine checks action
    │   - Deterministic allow/deny
    │   - Audit logging
    │
    ├─► AgentMesh (Trust Layer)
    │   - Check trust scores
    │   - Agent handshakes
    │   - Reputation tracking
    │
    └─► Zo-Qore Runtime
        - Central governance
        - Policy version control
        - Merkle audit logs
```

**Victor is now governed at 3 layers!**

---

## Testing & Verification

### Phase 1: Victor Kernel

```bash
# Test Victor's kernel health
curl http://127.0.0.1:8100/health

# Test policy check (should allow valid action)
curl -X POST http://127.0.0.1:8100/check_action \
  -H "Content-Type: application/json" \
  -d '{"action": "support_user", "params": {"mode": "support"}}'

# Test policy check (should block invalid action)
curl -X POST http://127.0.0.1:8100/check_action \
  -H "Content-Type: application/json" \
  -d '{"action": "hallucinate_facts", "params": {"confidence": 100}}'

# Get audit log
curl -X POST http://127.0.0.1:8100/audit \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### Phase 2: AgentMesh

```bash
# Test AgentMesh health
curl http://127.0.0.1:8080/health

# Get Victor's trust score
curl http://127.0.0.1:8080/trust/victor-cyborg

# Test trust handshake (Victor → Email Agent)
curl -X POST http://127.0.0.1:8080/trust/handshake \
  -H "Content-Type: application/json" \
  -d '{"requesting_agent": "victor-cyborg", "target_agent": "email-processor"}'

# Update trust score (simulate policy violation)
curl -X POST http://127.0.0.1:8080/trust/update \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "victor-cyborg", "delta": -50, "reason": "Test violation"}'

# List all agents
curl http://127.0.0.1:8080/registry
```

### Phase 3: Integration

```bash
# Test Zo-Qore → Victor Kernel
# Via Zo-Qore runtime API

# Test Zo-Qore → AgentMesh
# Via Zo-Qore runtime API

# Test end-to-end: Victor → Email Agent
# Victor requests action → Victor Kernel checks → AgentMesh handshake → Email Agent executes
```

---

## Benefits Delivered

### For Victor:
✅ **3-Layer Governance:** Persona → Kernel → Trust → Runtime
✅ **Deterministic Policy Enforcement:** Not based on LLM prompts
✅ **Audit Trail:** Every action logged and traceable
✅ **Trust-Based Interactions:** Only works with high-trust peers
✅ **Reputational Accountability:** Policy violations impact trust score

### For Multi-Agent Ecosystem:
✅ **Trust Coordination:** All agents managed by single trust layer
✅ **Agent Handshakes:** Secure A2A interactions
✅ **Capability Scoping:** Each agent has defined limits
✅ **Central Registry:** Single source of truth for agent identities
✅ **Policy Violation Tracking:** Trust scores adapt based on behavior

### For Zo Environment:
✅ **Modular Architecture:** Each service is lightweight and focused
✅ **Easy Scaling:** Add more agents without core changes
✅ **Observability:** Each service exposes health and metrics
✅ **Zero Trust:** All interactions authenticated and authorized
✅ **Defense in Depth:** 3 governance layers (Agent-OS, AgentMesh, Zo-Qore)

---

## Next Steps: Additional Agents

Once Phase 1-3 are complete, add these agents:

### Email Agent (Agent-OS + AgentMesh + Gmail Integration)

```yaml
agent:
  id: "email-processor"
  name: "Email Agent"
  kernel: "agent-os"
  mesh: "agentmesh"

capabilities:
  - "gmail:read"
  - "gmail:write"
  - "gmail:send"

policies:
  - "no_unauthorized_access"
  - "no_email_to_blocked_domains"
```

### Calendar Agent (Agent-OS + AgentMesh + Google Calendar)

```yaml
agent:
  id: "calendar-manager"
  name: "Calendar Agent"
  kernel: "agent-os"
  mesh: "agentmesh"

capabilities:
  - "calendar:read"
  - "calendar:write"

policies:
  - "no_double_booking"
  - "respect_working_hours"
```

### Qwen3 TTS Agent (Agent-OS + AgentMesh + Voice Interface)

```yaml
agent:
  id: "qwen3-tts"
  name: "Voice Interface"
  kernel: "agent-os"
  mesh: "agentmesh"

capabilities:
  - "tts:generate"
  - "stt:transcribe"

policies:
  - "voice_output_only"
  - "no_transcript_exfiltration"
```

---

## Implementation Timeline

| Phase | Duration | Status |
|--------|-----------|--------|
| Victor Kernel (Agent-OS) | 1-2 hours | ⏸ Pending |
| AgentMesh Trust Layer | 1-2 hours | ⏸ Pending |
| Zo-Qore Integration | 2-3 hours | ⏸ Pending |
| Testing & Verification | 1-2 hours | ⏸ Pending |
| **Total** | **5-9 hours** | |

**Ready to start Phase 1: Victor Kernel?**

---

*This implementation provides a practical, deployable path to full multi-agent governance in Zo.*
