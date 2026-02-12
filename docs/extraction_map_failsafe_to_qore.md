# FailSafe to Qore Extraction Map

## Purpose

Define what moved from the extension codebase into `FailSafe-Qore` and how that extraction supports Zo-native implementation.

Status:
- Core extraction: `implemented`
- Zo-native adapter layers in this repository: `implemented`

## Extraction Principles

1. Extract governance logic, not UI. `implemented`
2. Extract decision routing, not host-specific event hooks. `implemented`
3. Keep ledger integrity in core runtime. `implemented`
4. Keep policy logic out of adapters. `in_progress`
5. Treat Zo as the primary deployment target for runtime services. `in_progress`

## Components Extracted

### Policy Logic

Extracted:
- Policy definitions
- Risk grading rules
- Rule evaluation engine

Why:
Centralized policy behavior is required for Zo-native enforcement consistency.

Status: `implemented`.

### Risk Scoring

Extracted:
- Evaluation router
- Novelty/fingerprint support
- Cache instrumentation

Why:
Risk decisions must be deterministic across all deployment contexts.

Status: `implemented`.

### Contracts

Extracted:
- Intent contracts
- Shared governance types
- Runtime host interfaces

Why:
Zo-native services and future adapters must share the same decision language.

Status: `implemented` (baseline), `in_progress` (ongoing contract hardening).

### Ledger and Audit Trail

Extracted:
- Append logic
- Hash-chained verification
- Intent history log

Why:
Audit evidence must remain in one canonical runtime.

Status: `implemented`.

## Zo-Native Implementation Model

Canonical implementation location:
- This repository (`FailSafe-Qore`) is the implementation host for Zo-native runtime and Zo-specific governance surfaces.

Implemented internal directories:
- `zo/mcp-proxy/` for MCP interception and forwarding
- `runtime/service/` for daemon/service lifecycle entrypoints
- `zo/fallback/` for SSH wrapper and fallback controls
- `zo/http-proxy/` for Zo HTTP API governance proxying

Status: `implemented`.

## Guardrails

- No UI code inside Qore runtime modules. `implemented`
- No VS Code runtime dependency in core policy/risk/ledger/runtime paths. `implemented`
- No policy duplication in future Zo adapter code. `in_progress`
- Version contracts before external adapter usage. `in_progress`

## Validation Checklist

- Qore builds and tests independently. `implemented`
- Removing extension code does not break Qore runtime. `implemented`
- Zo MCP/SSH governance paths are implemented and tested. `implemented`
- Zo HTTP governance path is implemented and tested. `implemented`
