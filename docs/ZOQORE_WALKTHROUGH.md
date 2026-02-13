# Zo-Qore Walkthrough Guide

This guide is the operational walkthrough for running Zo-Qore in this repository, from first install through daily use.

Audience:
- operators running Zo-Qore in Zo or Linux
- contributors validating runtime and UI behavior
- testers verifying governance and prompt-dispatch workflows

## 1. What You Are Running

Zo-Qore in this repository is a Zo-native control surface and runtime stack for QoreLogic governance.

Core status:
- Runtime and governance engine: `implemented`
- Zo UI shell routes (`/ui/console`, `/ui/monitor`): `implemented`
- Comms package flow (`Generate` then approved `Send`): `implemented`
- Skill Scribe iterative context flow: `implemented`
- Persona, Workflows, Projects panels: UI placeholders `implemented`, feature bodies `planned`

## 2. Prerequisites

1. Install dependencies:
```bash
npm ci
```
2. Build:
```bash
npm run build
```
3. Set runtime API key:
```bash
export QORE_API_KEY="replace-with-strong-secret"
```
PowerShell:
```powershell
$env:QORE_API_KEY="replace-with-strong-secret"
```

## 3. Launch Paths

### Fast local stack

```bash
npm run zo:one-click
```

This starts:
- runtime service on `127.0.0.1:7777`
- UI shell on `127.0.0.1:9380`

### Standard split launch

Terminal 1:
```bash
node dist/runtime/service/start.js
```

Terminal 2:
```bash
npm run ui:sync
node dist/zo/ui-shell/start.js
```

## 4. First Validation

1. Open:
```text
http://127.0.0.1:9380/ui/console
```
2. Open monitor:
```text
http://127.0.0.1:9380/ui/monitor
```
3. Confirm routes endpoint:
```text
http://127.0.0.1:9380/api/ui/routes
```
4. Confirm runtime health:
```text
http://127.0.0.1:9380/api/qore/runtime
```

## 5. Comms Workflow (Generate, Approve, Send)

Use `Comms` for prompt package generation and governed dispatch.

1. Select Template Deck, Intent, Context, Persona, Skill, and model mode.
2. Click `Generate Package`.
3. Review package output.
4. Check `Approve package for send`.
5. Click `Send Package`.

Expected result:
- Send stays disabled until both conditions are true:
  - package has been generated
  - approval checkbox is checked
- On successful dispatch, output includes `# sent`.

## 6. Skill Scribe Workflow (Iterative Context)

Skill Scribe now supports multi-step context building.

1. Enter skill goal and initial guidance.
2. Add additional details in the context box.
3. Click `Add Context` repeatedly until context is complete.
4. Click `Generate Skill Draft`.

Validation behavior:
- If goal is too short, generation is blocked with alert text.
- If context quality is too low, generation is blocked with alert text.
- Draft includes the accumulated context pack once quality gate passes.

## 7. Tab Surface Expectations

Implemented panels:
- Home
- Comms
- Run
- Governance
- Skill Library
- Reports

Placeholder panels:
- Persona (`Coming Soon`)
- Workflows (`Coming Soon`)
- Projects (`Coming Soon`)

These placeholders are intentional so users can see planned navigation without assuming full feature implementation.

## 8. Daily Operations

Common commands:
```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run release:gate
```

Stop local one-click stack:
```bash
npm run zo:stop
```

## Appendix A: Potentially Confusing Scenarios

### A1) Send button is disabled

Cause:
- package not generated yet, or
- approval checkbox not checked

Resolution:
1. Click `Generate Package`
2. Enable `Approve package for send`
3. Click `Send Package`

### A2) Skill Scribe says context is too thin

Cause:
- not enough detail in goal/guidance/context

Resolution:
1. Expand goal with concrete scope and expected output
2. Add additional context entries using `Add Context`
3. Regenerate draft

### A3) `/ui/monitor` returns not found

Cause:
- stale assets or wrong UI route

Resolution:
1. Run `npm run ui:sync`
2. Restart UI shell
3. Open `/ui/monitor` again

### A4) Runtime unreachable at `127.0.0.1:7777`

Cause:
- runtime process not started
- missing `QORE_API_KEY`

Resolution:
1. Export/set `QORE_API_KEY`
2. Start runtime: `node dist/runtime/service/start.js`
3. Recheck `/api/qore/runtime`

### A5) Zo host does not support systemd

Cause:
- expected on Zo containers using non-systemd init

Resolution:
- use one-click or Zo user service registration path
- do not rely on systemd unit startup in that environment

### A6) Favorite skill not selected when multiple skills match

Cause:
- skill not favorited, or no favorite in relevant candidate set

Resolution:
1. Mark preferred skill as favorite in Skill Library
2. Regenerate package
3. Verify selected fallback skill in output

## Appendix B: Claim-to-Source Map

| Claim | Status | Source |
|---|---|---|
| `zo:one-click`, `zo:stop`, `ui:sync`, `release:gate` scripts exist | `implemented` | `package.json:26`, `package.json:32`, `package.json:42`, `package.json:46` |
| Console and monitor routes are served by UI shell | `implemented` | `zo/ui-shell/server.ts:536`, `zo/ui-shell/server.ts:540` |
| Comms UI includes Generate, Approve, and Send controls | `implemented` | `zo/ui-shell/custom/legacy/legacy-index.html:307`, `zo/ui-shell/custom/legacy/legacy-index.html:311`, `zo/ui-shell/custom/legacy/legacy-index.html:314` |
| Send flow blocks unapproved dispatch | `implemented` | `zo/ui-shell/custom/legacy/intent-assistant.js:216`, `zo/ui-shell/custom/legacy/intent-assistant.js:219` |
| Skill Scribe supports iterative context add and alerting | `implemented` | `zo/ui-shell/custom/legacy/legacy-index.html:343`, `zo/ui-shell/custom/legacy/legacy-index.html:347`, `zo/ui-shell/custom/legacy/main.js:592` |
| Favorite-first fallback selection is implemented | `implemented` | `zo/ui-shell/custom/legacy/skill-selection.js:1`, `zo/ui-shell/custom/legacy/main.js:341`, `tests/zo.skill.selection.test.ts:4` |
| Persona, Workflows, Projects panels are present as placeholders | `implemented` | `zo/ui-shell/custom/legacy/legacy-index.html:131`, `zo/ui-shell/custom/legacy/legacy-index.html:132`, `zo/ui-shell/custom/legacy/legacy-index.html:133` |
| Persona, Workflows, Projects full feature bodies are pending | `planned` | `zo/ui-shell/custom/legacy/legacy-index.html:423`, `zo/ui-shell/custom/legacy/legacy-index.html:434`, `zo/ui-shell/custom/legacy/legacy-index.html:445` |
