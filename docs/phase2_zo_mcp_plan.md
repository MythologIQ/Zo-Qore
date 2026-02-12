# Phase 2 Detailed Plan: Zo MCP Governance Path

## Objective

Implement Zo MCP interception as the primary governance surface, using Qore runtime decisions as a mandatory preflight gate.

Status: `in_progress`

Prerequisites satisfied from Phase 1 hardening:
- Local API auth boundary (`implemented`)
- Structured API error envelopes (`implemented`)
- Replay conflict detection (`implemented`)

Current implementation snapshot:
- Translator (`zo/mcp-proxy/translator.ts`): `implemented`
- Forwarder (`zo/mcp-proxy/forwarder.ts`): `implemented`
- Proxy server (`zo/mcp-proxy/server.ts`): `implemented` baseline
- Integration tests (`tests/zo.mcp.proxy.integration.test.ts`): `implemented`

## Scope

In scope:
- MCP HTTP proxy in this repository
- Request-to-decision translation
- Allow/deny/escalate enforcement
- Decision + execution evidence logging
- Error contracts and timeouts

Out of scope:
- Zo internal platform changes
- Non-MCP SSH fallback logic (Phase 3)

## Architecture

### Components

1. `zo/mcp-proxy/server.ts`
- Accept MCP JSON-RPC requests over HTTP.
- Validate payload schema.
- Assign `traceId` and proxy `requestId`.

2. `zo/mcp-proxy/translator.ts`
- Convert MCP tool invocation into `DecisionRequest`.
- Map actor/session metadata to `actorId`.

3. `runtime/service/QoreRuntimeService` integration
- Call `evaluate` before forwarding.
- Respect `decision`:
  - `ALLOW`: forward call
  - `ESCALATE`: block default, return structured policy escalation response
  - `DENY`: block and return denial response

4. `zo/mcp-proxy/forwarder.ts`
- Forward allowed calls to Zo MCP upstream (`https://api.zo.computer/mcp`).
- Apply upstream timeout and retry budget for idempotent reads only.

5. `zo/mcp-proxy/audit.ts`
- Persist both preflight decision and execution outcome to ledger.

## Interfaces

### Input
- MCP JSON-RPC request body
- Optional actor/session context headers

### Output
- JSON-RPC response, enriched with:
  - `traceId`
  - governance result (`allowed`, `blocked`, `escalated`)
  - stable error code when blocked

### New Contracts (Phase 2)
- `McpGovernanceDecision`
- `McpForwardResult`
- `McpBlockedError`

## Data Flow

1. Receive MCP request.
2. Validate request structure.
3. Translate to `DecisionRequest`.
4. Evaluate via `QoreRuntimeService`.
5. If blocked/escalated, return structured error and log event.
6. If allowed, forward request to Zo MCP.
7. Log upstream result and return response.

## Failure Modes and Handling

- Invalid MCP payload: 400 + `VALIDATION_ERROR`
- Qore runtime unavailable: 503 + `NOT_INITIALIZED`
- Upstream timeout: 504 + `UPSTREAM_TIMEOUT`
- Upstream auth/permission failure: pass-through mapped as `UPSTREAM_REJECTED`
- Ledger append failure: fail-closed for mutating MCP tools, fail-open only for explicitly configured read-only tools

## Security Controls

- Bind proxy to localhost by default.
- Reject unsigned/unknown actor context by policy (configurable strict mode).
- Redact sensitive fields from logs before persistence.
- Deny list for high-risk tool names until explicit policy rules exist.

## Test Plan

### Unit
- Translator mapping correctness
- Governance decision branching
- Error mapping consistency

### Integration
- Allowed call reaches mocked upstream MCP
- Denied call never reaches upstream
- Escalated call returns deterministic governance payload
- Timeout and retry behavior for read-only tools
- Ledger contains matching preflight + result events

### Adversarial
- Replay of same request ID
- Malformed JSON-RPC with nested payload abuse
- Large payload memory pressure
- Header spoofing of actor identity

## Acceptance Criteria

1. Every MCP tool invocation is evaluated before upstream forwarding.
2. Denied/escalated calls are blocked deterministically.
3. Decision and execution outcomes are both auditable in ledger.
4. Structured error codes are stable and test-covered.
5. Proxy behavior remains stable under malformed or adversarial inputs.

## Rollout

1. Local mock upstream integration.
2. Staging with real Zo MCP endpoint and conservative deny defaults.
3. Controlled enablement by tool category.
4. Metrics and incident review before broad rollout.
