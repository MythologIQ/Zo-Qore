# Victor Kernel - Deterministic Virtual Collaborator

Victor is a safety-first virtual collaborator built on Agent OS primitives with **zero LLM dependency for core functions**. Victor enforces governance rules through deterministic evaluation, using LLM only when explicitly requested for complex reasoning.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Victor Kernel                        │
│                                                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Rule Engine (Deterministic)             │  │
│  │  ┌──────────┬──────────┬──────────┬────────┐│  │
│  │  │ Honesty   │ Focus    │ Momentum │ Safety ││  │
│  │  └──────────┴──────────┴──────────┴────────┘│  │
│  └─────────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Action Handlers (Deterministic)           │  │
│  │  • Task Management                               │  │
│  │  • Integration Hooks                            │  │
│  │  • Governance                                  │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ↓
                  Agent OS Foundation
```

## Key Principles

### 1. **Deterministic Processing**
- Core functions execute without LLM involvement
- Rule evaluation is a pure function (same input → same output)
- Predictable behavior and fast execution

### 2. **Rule-Based Enforcement**
- Honesty: No hallucination, transparent reasoning
- Focus: Zero fluff, truth over comfort
- Momentum: Sustained action without compromising reality
- Safety: No destructive actions, no secret exposure

### 3. **Clear Boundaries**
- Victor operates within defined constraints
- No autonomous action beyond configured rules
- Human approval for high-risk operations

### 4. **Optional LLM Integration**
- LLM can be added for complex reasoning when requested
- Never enabled by default for core functions
- Always declared when in use

## Quick Start

### Zo Deployment

```bash
cd Victor-Kernel

# Deploy to Zo ecosystem
bash deploy-zo.sh
```

### Local Development

```bash
cd Victor-Kernel

# Install dependencies
bun install

# Run locally
bun run dev

# Or build and run
bun run build
bun run start
```

## API Reference

### Health Check
```bash
GET /health
```

Response:
```json
{
  "service": "victor-kernel",
  "status": "healthy",
  "mode": "deterministic",
  "llm": "disabled",
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

### Process Request
```bash
POST /api/victor/process
```

Request:
```json
{
  "id": "req-001",
  "userId": "frostwulf",
  "action": "task.create",
  "params": {
    "title": "Review Zo-Qore deployment",
    "priority": "high"
  },
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

Response:
```json
{
  "id": "req-001",
  "mode": "support",
  "allowed": true,
  "requiresReview": false,
  "ruleEvaluations": [
    {
      "id": "focus-no-fluff",
      "name": "Zero Fluff Mode",
      "decision": {
        "allowed": true,
        "reason": "Direct, actionable responses only",
        "stance": "support",
        "requiresReview": false
      }
    }
  ],
  "result": {
    "id": "task-1739616000000",
    "userId": "frostwulf",
    "title": "Review Zo-Qore deployment",
    "priority": "high",
    "status": "pending",
    "createdAt": "2026-02-15T12:00:00.000Z",
    "victorDecision": {
      "stance": "support",
      "reason": "Task creation aligned with momentum"
    }
  }
}
```

### Task Management
```bash
# Create task
POST /api/tasks
{
  "title": "Complete implementation plan",
  "priority": "high"
}

# List tasks
GET /api/tasks

# Complete task (via process API)
POST /api/victor/process
{
  "action": "task.complete",
  "params": {
    "id": "task-123"
  }
}
```

### Stance Determination
```bash
POST /api/victor/stance
{
  "action": "deploy.production"
}
```

Response:
```json
{
  "action": "deploy.production",
  "mode": "mixed",
  "stance": "mixed",
  "rulesEvaluated": 3,
  "allowed": true,
  "requiresReview": true,
  "victorDecision": {
    "stance": "mixed",
    "reason": "Evaluated 3 applicable rules"
  }
}
```

### Governance
```bash
# Get Victor's current mode
GET /api/victor/mode

# List all rules
GET /api/audit

# View audit log
GET /api/audit
```

## Victor's Modes

Victor declares his stance for every action:

| Mode | Meaning | When Used |
|-------|---------|-----------|
| **Support** | Encouragement, reinforcement | Safe operations aligned with goals |
| **Challenge** | Skeptical, evidence-based opposition | Actions requiring scrutiny |
| **Mixed** | Strengths and flaws separated | Operations with trade-offs |
| **Red Flag** | Faulty premise, high risk | Blocked or critical issues |

## Integration with Zo-Qore

Victor can be integrated with Zo-Qore for governance:

```bash
# Check Zo-Qore status through Victor
POST /api/victor/process
{
  "action": "zoqore.status"
}
```

This allows Victor to validate Zo-Qore operations against his rules.

## Security & Boundaries

### Protected Actions (Require Review)
- Any action with destructive potential (`rm -rf`, `DROP TABLE`)
- Secret exposure attempts
- Production deployments
- Actions evaluated as "red-flag"

### Blocked Actions
- Explicitly destructive commands
- Secret value exposure
- Actions violating core rules

### Audit Trail
All actions are logged with:
- Timestamp
- User ID
- Action type
- Rule evaluations
- Decision outcome
- Review requirement

## Adding LLM Integration (Future)

When complex reasoning is needed, LLM can be integrated:

```typescript
// Example: Conditional LLM usage
if (requiresComplexReasoning) {
  const llmResponse = await callLLM(context);
  const result = victorKernel.process({
    ...request,
    hasLLM: true
  });
  return result;
}
```

**This is always explicit and never automatic.**

## Development Roadmap

- [ ] Task persistence (database integration)
- [ ] Email integration (Gmail OAuth)
- [ ] Calendar integration (Google Calendar OAuth)
- [ ] Zo-Qore API integration
- [ ] Web UI (borrowing design from Zo-Qore)
- [ ] Optional LLM mode for complex reasoning
- [ ] Speech-to-text interface
- [ ] TTS integration (Qwen 3)

## License

MIT - MythologIQ

## Contact

- Repository: https://github.com/MythologIQ/Victor-Kernel
- Zo Space: https://frostwulf.zo.computer
