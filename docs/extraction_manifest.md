# Extraction Manifest: FailSafe -> FailSafe-Qore

Source repo: `G:\MythologIQ\FailSafe`
Target repo: `G:\MythologIQ\FailSafe-Qore`
Generated: 2026-02-12

## Policy
- `policy/engine/PolicyEngine.ts` <- `FailSafe/extension/src/qorelogic/policies/PolicyEngine.ts`
- `policy/definitions/risk_grading.json` <- `.failsafe/config/policies/risk_grading.json` (local/non-GitHub)
- `policy/definitions/risk_grading.yaml` <- `.failsafe/config/policies/risk_grading.yaml` (local/non-GitHub)
- `policy/definitions/citation_policy.json` <- `.failsafe/config/policies/citation_policy.json` (local/non-GitHub)
- `policy/definitions/trust_dynamics.json` <- `.failsafe/config/policies/trust_dynamics.json` (local/non-GitHub)

## Risk
- `risk/engine/EvaluationRouter.ts` <- `FailSafe/extension/src/governance/EvaluationRouter.ts`
- `risk/engine/fingerprint.ts` <- `FailSafe/extension/src/governance/fingerprint.ts`
- `risk/engine/CacheInstrumentation.ts` <- `FailSafe/extension/src/governance/CacheInstrumentation.ts`
- `risk/engine/CacheSizeMonitor.ts` <- `FailSafe/extension/src/governance/CacheSizeMonitor.ts`
- `risk/engine/NoveltyAccuracyMonitor.ts` <- `FailSafe/extension/src/governance/NoveltyAccuracyMonitor.ts`

## Contracts
- `@mythologiq/qore-contracts/src/schemas/IntentTypes.ts` <- `FailSafe/extension/src/governance/types/IntentTypes.ts`
- `@mythologiq/qore-contracts/src/schemas/shared.types.ts` <- `FailSafe/extension/src/shared/types.ts`
- Note: contracts were externalized from this repository into `https://github.com/MythologIQ/qore-contracts`.

## Ledger
- `ledger/engine/LedgerManager.ts` <- `FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts`
- `ledger/engine/IntentHistoryLog.ts` <- `FailSafe/extension/src/governance/IntentHistoryLog.ts`

## Runtime
- `runtime/api/QoreLogicManager.ts` <- `FailSafe/extension/src/qorelogic/QoreLogicManager.ts`
- `runtime/api/index.ts` <- `FailSafe/extension/src/qorelogic/index.ts`
- `runtime/support/EventBus.ts` <- `FailSafe/extension/src/shared/EventBus.ts`
- `runtime/support/LRUCache.ts` <- `FailSafe/extension/src/shared/LRUCache.ts`
