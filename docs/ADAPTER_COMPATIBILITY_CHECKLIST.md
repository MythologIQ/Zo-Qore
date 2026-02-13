# Adapter Compatibility Checklist

## Purpose

Prevent contract drift while Zo-Qore UI and FailSafe local IDE adapter evolve independently.

## Required Pass Criteria

1. Contract invariants
- `DecisionRequest` and `DecisionResponse` schemas unchanged or explicitly versioned.
- No adapter-side reinterpretation of decision outcomes.

2. Runtime endpoint invariants
- `GET /health` reachable
- `GET /policy/version` returns expected shape
- `POST /evaluate` returns valid decision payload

3. Security invariants
- API key handling remains enforced where configured.
- Admin/control-plane operations remain token-protected where required.

4. Transparency invariants
- Prompt transparency events remain emitted and renderable.
- Cost/token telemetry fields remain parsable by both UI surfaces.

5. Failure semantics
- Runtime failures do not degrade to implicit `ALLOW`.
- Adapter surfaces deterministic error states.

## Change Review Triggers

Run this checklist when any of the following change:
- `runtime/`
- `policy/`
- `risk/`
- `ledger/`
- `runtime/api/PromptTransparencyView.ts`
- adapter dispatch/gateway code in Zo or IDE integrations

## Release Gate Steps

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. Adapter smoke probes:
   - evaluate path
   - transparency path
   - auth failure path

## Decision Logging Rule

If checklist uncovers architecture-level drift risk:
- add/update `docs/META_LEDGER.md` entry
- link impacted adapter and runtime files
- record mitigation and acceptance state

