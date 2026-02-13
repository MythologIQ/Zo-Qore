# Local IDE Adapter Contract

## Purpose

Define the stable integration contract between universal QoreLogic runtime and the FailSafe local IDE node adapter.

## Scope

In scope:
- Request and response contract shape for governance evaluation
- Auth and actor identity requirements
- Prompt transparency payload mapping
- Error semantics expected by UI clients

Out of scope:
- Zo-Qore UI rendering details
- IDE-specific UI layout and UX decisions

## Contract Requirements

1. Runtime endpoint compatibility
- Adapter must support:
  - `GET /health`
  - `GET /policy/version`
  - `POST /evaluate`

2. Authentication
- Adapter must supply `x-qore-api-key` when runtime requires API key auth.
- Missing/invalid API key must be treated as a hard adapter fault.

3. Decision request schema
- Adapter must produce valid `DecisionRequest` payloads.
- Required fields:
  - `requestId`
  - `actorId`
  - `action`
  - `targetPath`
- Optional context fields may be added without breaking base contract.

4. Decision response schema
- Adapter must consume `DecisionResponse` without mutating authoritative decision fields.
- Adapter may add display metadata only outside canonical decision payload.

5. Prompt transparency
- Adapter should map prompt transparency events via:
  - `runtime/api/PromptTransparencyView.ts`
- Intent-package output panes may render these events, but must not alter original evidence payload.

6. Failure and fallback behavior
- On runtime unreachable:
  - surface degraded state
  - do not forge `ALLOW` decisions
- On malformed response:
  - fail closed and log adapter fault

## Compatibility Guardrails

1. Core-runtime ownership
- `policy/`, `risk/`, `ledger/`, `runtime/`, and contracts remain canonical.
- Adapter code cannot redefine policy semantics.

2. Divergent UI policy
- Zo-Qore UI and FailSafe IDE UI may diverge in presentation and workflow.
- Divergence cannot change runtime contract semantics.

3. Versioning
- Adapter changes that alter contract expectations require:
  - docs update
  - compatibility checklist pass
  - meta-ledger decision entry if architecture-impacting

## Verification Checklist

Before adapter release:
1. `npm run typecheck`
2. `npm test`
3. Runtime probe:
   - `/health`
   - `/policy/version`
4. Evaluate probe with known request fixture.
5. Prompt transparency mapping smoke test.

