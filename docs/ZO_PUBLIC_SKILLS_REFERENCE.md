# Zo Public Skills Reference

## Purpose

Define how `FailSafe-Qore` references Zo public skills for Zo-native workflows without duplicating or forking external skill content in this repository.

## Source of Truth

- Zo public skills repository: `https://github.com/zocomputer/skills`
- Local status in this repository: `implemented` (reference policy and documentation wiring)

## Policy

1. Zo-specific skill references must point to the public source repository, not copied files.
2. Qore runtime behavior must not depend on local presence of Zo skills files.
3. Any usage of Zo skills must be treated as adapter/workflow input, not core policy logic.
4. If Zo skills behavior is assumed in planning or docs, that assumption must be recorded in `docs/ZO_ASSUMPTION_EVIDENCE.json`.

## Integration Guidance

1. Reference mode (`implemented`): link to skill docs in `https://github.com/zocomputer/skills`.
2. Snapshot mode (`planned`): if offline access is needed, pin a commit hash and track refresh in release gates.
3. Runtime boundary (`implemented`): keep skill execution and prompt content outside `policy/`, `risk/`, `ledger/`, and `runtime/` core modules.

## Companion Repository Alignment

`https://github.com/MythologIQ/failsafe` remains the extension companion repository.
`FailSafe-Qore` remains the Zo-native runtime and governance engine.
Both repositories should reference the same Zo public skills source to avoid drift.
