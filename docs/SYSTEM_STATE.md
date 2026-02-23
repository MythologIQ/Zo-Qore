# SYSTEM_STATE

Current snapshot of the project structure.

Last updated: 2026-02-20T22:47:16.054Z

```
./
├── policy
│   ├── engine
│   │   └── PolicyEngine.ts
│   └── definitions
│       ├── risk_grading.yaml
│       ├── risk_grading.json
│       ├── citation_policy.json
│       └── trust_dynamics.json
├── package.json
├── deploy
│   ├── zo
│   │   ├── register-user-service.sh
│   │   ├── stop-standalone.sh
│   │   ├── one-click-services.sh
│   │   ├── env.example
│   │   ├── bootstrap-zo.sh
│   │   ├── register-ui-user-service.sh
│   │   ├── install-zo-full.sh
│   │   ├── AGENT_SETUP_PROMPT.md
│   │   ├── TAKE_THIS_AND_GO.md
│   │   ├── install-update-cron.sh
│   │   ├── take-this-and-go.sh
│   │   ├── one-click-standalone.sh
│   │   └── update-from-repo.sh
│   └── systemd
│       ├── zo-qore-fallback-watcher.service
│       └── zo-qore.service
├── META_LEDGER.md
├── vitest.config.ts
├── CLAUDE.md
├── PERFORMANCE_REVIEW.md
├── CHANGELOG.md
├── ledger
│   └── engine
│       ├── LedgerManager.ts
│       └── IntentHistoryLog.ts
├── runtime
│   ├── service
│   │   ├── AgentOSIntegration.ts
│   │   ├── errors.ts
│   │   ├── LocalApiServer.ts
│   │   ├── QoreRuntimeService.ts
│   │   ├── ServiceRegistry.ts
│   │   └── start.ts
│   ├── config
│   │   └── services.json
│   ├── support
│   │   ├── EventBus.ts
│   │   ├── SecureSecretStore.ts
│   │   ├── InMemoryStores.ts
│   │   └── LRUCache.ts
│   └── api
│       ├── QoreLogicManager.ts
│       ├── ShadowGenomeManager.ts
│       ├── index.ts
│       ├── PromptTransparencyView.ts
│       └── TrustEngine.ts
├── start-runtime.sh
├── zo
│   ├── agent-os
│   │   ├── index.ts
│   │   ├── adapter.ts
│   │   ├── victor.ts
│   │   └── qorelogic-gates.ts
│   ├── constellation
│   │   ├── types.ts
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── physics.ts
│   ├── autonomy
│   │   ├── types.ts
│   │   └── checker.ts
│   ├── embeddings
│   │   ├── similarity.ts
│   │   ├── index.ts
│   │   ├── hash.ts
│   │   ├── storage.ts
│   │   ├── local-service.ts
│   │   └── types.ts
│   ├── kanban
│   │   ├── generator.ts
│   │   └── types.ts
│   ├── void
│   │   ├── prompts.ts
│   │   ├── types.ts
│   │   ├── negotiator.ts
│   │   ├── storage.ts
│   │   ├── manager.ts
│   │   └── index.ts
│   ├── http-proxy
│   │   ├── server.ts
│   │   ├── forwarder.ts
│   │   ├── translator.ts
│   │   └── index.ts
│   ├── ui-shell
│   │   ├── assets.bak.1771234475
│   │   │   ├── index.html
│   │   │   ├── monitor.js
│   │   │   ├── mfa.html
│   │   │   ├── monitor.css
│   │   │   └── login.html
│   │   ├── settings.html
│   │   ├── custom
│   │   │   ├── roadmap.css
│   │   │   ├── index.html
│   │   │   ├── roadmap.js
│   │   │   ├── mobile-updated.html
│   │   │   ├── index_utf8.html
│   │   │   ├── mobile-original-themed.css
│   │   │   ├── mobile-original-themed.js
│   │   │   ├── mobile-original-themed.html
│   │   │   └── index-updated.html
│   │   ├── empty-state.js
│   │   ├── constellation-tree.js
│   │   ├── start.ts
│   │   ├── security.ts
│   │   ├── empty-reveal.js
│   │   ├── shared
│   │   │   ├── login.html
│   │   │   ├── mfa.html
│   │   │   ├── failsafe-icon.png
│   │   │   ├── roadmap.css
│   │   │   ├── zoqore-side-banner.png
│   │   │   ├── favicon.png
│   │   │   ├── roadmap.js
│   │   │   └── index.html
│   │   ├── void.css
│   │   ├── void.js
│   │   ├── update-manager.ts
│   │   ├── pages.ts
│   │   ├── server.ts
│   │   ├── runtime.ts
│   │   ├── zo-nav.js
│   │   ├── types.ts
│   │   ├── empty-path.js
│   │   ├── assets-serving.ts
│   │   ├── reveal.css
│   │   ├── assets
│   │   │   ├── login.html
│   │   │   ├── monitor.js
│   │   │   ├── legacy-roadmap.css
│   │   │   ├── voice-lab.html
│   │   │   ├── index.html
│   │   │   ├── monitor.css
│   │   │   ├── mobile.html.bak
│   │   │   ├── constellation-3d.js
│   │   │   ├── victor.html
│   │   │   ├── failsafe-icon.png
│   │   │   ├── mobile.js
│   │   │   ├── mobile.css
│   │   │   ├── mfa.html
│   │   │   ├── zoqore-side-banner.png
│   │   │   ├── legacy
│   │   │   │   ├── projects-panel.js
│   │   │   │   ├── skills-panel.js
│   │   │   │   ├── intent-assistant.js
│   │   │   │   ├── utils.js
│   │   │   │   ├── governance-model.js
│   │   │   │   ├── state-store.js
│   │   │   │   ├── data-client.js
│   │   │   │   ├── insights-panel.js
│   │   │   │   ├── skill-selection.js
│   │   │   │   ├── activity-panel.js
│   │   │   │   └── main.js
│   │   │   ├── favicon.png
│   │   │   ├── mobile.html
│   │   │   ├── victor-dashboard.html
│   │   │   ├── victor-app.js
│   │   │   ├── emails.html
│   │   │   ├── calendar.html
│   │   │   ├── logs.html
│   │   │   └── tasks.html
│   │   ├── constellation.css
│   │   ├── void-stt.css
│   │   ├── updates.html
│   │   ├── reveal.js
│   │   ├── risk-register.css
│   │   ├── zo-nav.css
│   │   ├── empty-risk.js
│   │   ├── risk-register.js
│   │   ├── empty-autonomy.js
│   │   ├── hub.ts
│   │   ├── empty-constellation.js
│   │   ├── index.html
│   │   ├── empty-state.css
│   │   ├── routes
│   │   │   └── index.ts
│   │   ├── constellation-spatial.js
│   │   ├── reveal-drag.js
│   │   ├── mfa.ts
│   │   └── void-stt.js
│   ├── security
│   │   ├── replay-store.ts
│   │   ├── mtls-actor-binding.ts
│   │   ├── actor-proof.ts
│   │   ├── actor-keyring.ts
│   │   └── actor-key-rotation.ts
│   ├── risk
│   │   ├── index.ts
│   │   ├── derivation.ts
│   │   ├── types.ts
│   │   └── service.ts
│   ├── mcp-proxy
│   │   ├── metrics.ts
│   │   ├── metrics-sink.ts
│   │   ├── forwarder.ts
│   │   ├── index.ts
│   │   ├── rate-limit.ts
│   │   ├── server.ts
│   │   └── translator.ts
│   ├── reveal
│   │   ├── layout.ts
│   │   ├── types.ts
│   │   ├── service.ts
│   │   └── index.ts
│   ├── path
│   │   ├── generator.ts
│   │   ├── types.ts
│   │   ├── dependencies.ts
│   │   ├── index.ts
│   │   └── service.ts
│   ├── genesis
│   │   ├── llm-pass.ts
│   │   ├── index.ts
│   │   ├── clusterer.ts
│   │   ├── types.ts
│   │   ├── completeness.ts
│   │   ├── fast-pass.ts
│   │   ├── pipeline.ts
│   │   └── prompts.ts
│   ├── project-tab
│   │   ├── ledger-bridge.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   ├── model-selection.ts
│   ├── gantt
│   │   ├── service.ts
│   │   ├── renderer.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── prompt-transparency.ts
│   ├── storage
│   │   ├── duckdb-schema.sql
│   │   ├── duckdb-client.ts
│   │   └── index.ts
│   ├── prompt-governance
│   │   ├── index.ts
│   │   ├── patterns.ts
│   │   ├── tokenizer.ts
│   │   └── scanners.ts
│   └── fallback
│       ├── watcher.ts
│       ├── index.ts
│       ├── identity.ts
│       ├── start-watcher.ts
│       ├── types.ts
│       ├── pipeline.ts
│       ├── failsafe-run.ts
│       └── cli
│           └── failsafe-run.ts
├── package-lock.json
├── assets
│   ├── branding
│   │   ├── FailSafe-Qore-Zo.png
│   │   ├── ZoQore.png
│   │   ├── ZoQorePoster.png
│   │   ├── ZoQoreLogo.png
│   │   └── ZoQore-SideBanner.png
│   ├── README.md
│   └── screenshots
│       ├── Zo-Qore-Comms.png
│       ├── Zo-Qore-SkillLibrary.png
│       ├── Zo-Qore-Governance.png
│       ├── Zo-Qore-Home.PNG
│       ├── Zo-Qore-Run.png
│       ├── Zo-Qore-ComingSoon.png
│       └── Zo-Qore-Reports.png
├── tsconfig.json
├── docs
│   ├── ADAPTER_COMPATIBILITY_CHECKLIST.md
│   ├── phase3_zo_fallback_setup.md
│   ├── LOCAL_IDE_ADAPTER_CONTRACT.md
│   ├── INCIDENT_RESPONSE.md
│   ├── phase4_zo_production_hardening_plan.md
│   ├── SECRETS_MANAGEMENT.md
│   ├── adversarial_review_phase6_phase9.md
│   ├── extraction_map_failsafe_to_qore.md
│   ├── DOCUMENTATION_STATUS.md
│   ├── phase7_operational_resilience_plan.md
│   ├── zoqore_acceptance_gates.md
│   ├── zoqore_adversarial_sprint1.md
│   ├── phase2_zo_mcp_plan.md
│   ├── security
│   │   └── SECURITY_AUDIT_REPORT.md
│   ├── ZO_ASSUMPTIONS_AND_GATES.md
│   ├── phase5_zo_http_api_release_plan.md
│   ├── phase5_substantiation.md
│   ├── THREAT_MODEL.md
│   ├── ZOQORE_WALKTHROUGH.md
│   ├── zo_native_ai_handoff_security_review.md
│   ├── research
│   │   ├── comparative_architecture_of_aegis.md
│   │   ├── ZO_SECURITY_ASSESSMENT.md
│   │   ├── ZO_DEPLOYMENT_IMPLEMENTATION.md
│   │   ├── aegis_research_foundations_reading_list.md
│   │   ├── RESEARCH_OVERVIEW.md
│   │   ├── aegis_functions_and_compatibility_assessment.md
│   │   ├── research-conjecture.md
│   │   ├── zo-infrastructure-discovery.md
│   │   └── research_synthesis.md
│   ├── plan_qore_zo_architecture.md
│   ├── phase8_release_substantiation_plan.md
│   ├── ZO_DEPLOYMENT_STATUS.md
│   ├── PRIVATE_DOCS_POLICY.md
│   ├── PHASE10_QL_PLAN.md
│   ├── README.md
│   ├── zoqore_adversarial_sprint3.md
│   ├── phase9_handoff_and_governance_closeout.md
│   ├── extraction_manifest.md
│   ├── zoqore_adversarial_sprint4.md
│   ├── phase6_cross_surface_conformance_plan.md
│   ├── zoqore_system_plan.md
│   ├── adversarial_review_phase4_iterations.md
│   ├── adversarial_review_phase5_iterations.md
│   ├── BOOTSTRAP_CHECKLIST.md
│   ├── adversarial_review_phase1_phase2.md
│   ├── ZO_DISCOVERY_REPORT.md
│   ├── ZO_ASSUMPTION_EVIDENCE.json
│   ├── META_LEDGER.md
│   ├── ZOQORE_INTENT.md
│   ├── zoqore_adversarial_sprint2.md
│   ├── ZO_PUBLIC_SKILLS_REFERENCE.md
│   ├── phase4_substantiation.md
│   ├── CONCEPT.md
│   ├── ARCHITECTURE_PLAN.md
│   ├── SYSTEM_STATE.md
│   └── SHADOW_GENOME.md
├── MANAGED_FILE_INDEX.md
├── start-ui.sh
├── eslint.config.cjs
├── LICENSE
├── README.md
├── tests
│   ├── ledger-bridge.test.ts
│   ├── zo.http.proxy.integration.test.ts
│   ├── fixtures
│   │   └── sample.ts
│   ├── risk.derivation.test.ts
│   ├── phase1.integration.test.ts
│   ├── zo.mcp.proxy.hardening.test.ts
│   ├── embedding.types.test.ts
│   ├── qore.logic.manager.test.ts
│   ├── zo.mcp.forwarder.test.ts
│   ├── zo.mcp.translator.test.ts
│   ├── qore.runtime.service.test.ts
│   ├── path.generator.test.ts
│   ├── genesis.integration.test.ts
│   ├── genesis.fast-pass.test.ts
│   ├── zo.resilience.test.ts
│   ├── zo.model.selection.performance.test.ts
│   ├── milestone.storage.test.ts
│   ├── void.prompts.test.ts
│   ├── constellation.physics.test.ts
│   ├── zo.http.proxy.replay.distributed.test.ts
│   ├── empty-state.test.ts
│   ├── gantt.service.test.ts
│   ├── zo.http.proxy.errors.test.ts
│   ├── path.service.test.ts
│   ├── zo.fallback.pipeline.test.ts
│   ├── runtime.eventbus.test.ts
│   ├── embedding.similarity.test.ts
│   ├── path.dependencies.test.ts
│   ├── reveal.types.test.ts
│   ├── security.test.ts
│   ├── kanban.generator.test.ts
│   ├── void-stt.test.ts
│   ├── zo.install.handoff.security.test.ts
│   ├── zo.ui.shell.test.ts
│   ├── zo.model.selection.test.ts
│   ├── sprint.storage.test.ts
│   ├── embedding.hash.test.ts
│   ├── zo-nav.test.ts
│   ├── genesis.completeness.test.ts
│   ├── local.api.server.test.ts
│   ├── zo.mcp.rate-limit.sqlite.test.ts
│   ├── zo.security.replay-store.test.ts
│   ├── void.types.test.ts
│   ├── constellation.service.test.ts
│   ├── zo.security.mtls.binding.test.ts
│   ├── zo.fallback.wrapper.test.ts
│   ├── storage.ledger.test.ts
│   ├── reveal.service.test.ts
│   ├── kanban.storage.test.ts
│   ├── risk.service.test.ts
│   ├── zo.http.translator.test.ts
│   ├── genesis.clusterer.test.ts
│   ├── runtime.api.trust-shadow.test.ts
│   ├── genesis.types.test.ts
│   ├── void.negotiator.test.ts
│   ├── zo.assumptions.check.test.ts
│   ├── policy.engine.test.ts
│   ├── zo.security.actor-key-rotation.test.ts
│   ├── intent.history.test.ts
│   ├── INDEX.json
│   ├── ledger.hashchain.test.ts
│   ├── autonomy.checker.test.ts
│   ├── zo.fallback.identity.test.ts
│   ├── genesis.llm-pass.test.ts
│   ├── evaluation.router.test.ts
│   ├── reveal.layout.test.ts
│   ├── constellation.types.test.ts
│   ├── zo.ui.mfa.test.ts
│   ├── void.storage.test.ts
│   ├── genesis.pipeline.test.ts
│   ├── prompt.transparency.view.test.ts
│   ├── runtime.api.index.test.ts
│   ├── zo.mcp.metrics.sink.test.ts
│   ├── zo.mcp.proxy.integration.test.ts
│   ├── action.classification.test.ts
│   └── embedding.storage.test.ts
├── risk
│   └── engine
│       ├── EvaluationRouter.ts
│       ├── CacheInstrumentation.ts
│       ├── NoveltyAccuracyMonitor.ts
│       ├── CacheSizeMonitor.ts
│       └── fingerprint.ts
├── scripts
│   ├── create-release-artifacts.mjs
│   ├── check-zo-assumptions.mjs
│   ├── generate-mfa-secret.mjs
│   ├── zo-resilience.mjs
│   ├── release-gate.mjs
│   ├── migrate-secrets.mjs
│   ├── rotate-actor-keys.mjs
│   ├── sync-failsafe-ui.mjs
│   ├── create-zo-upload.ps1
│   └── qorectl.mjs
├── PRIVATE
│   └── docs
│       ├── PHASE13_QL_PLAN.md
│       ├── PHASE12_AUDIT_REPORT.md
│       ├── PHASE11_AUDIT_REPORT.md
│       ├── PHASE10_AUDIT_REPORT.md
│       ├── PHASE12_SUBSTANTIATE_REPORT.md
│       ├── PHASE13_AUDIT_REPORT.md
│       ├── PHASE12_QL_PLAN.md
│       ├── PHASE14_AUDIT_REPORT.md
│       ├── PHASE15_SUBSTANTIATE_REPORT.md
│       ├── PHASE13_SUBSTANTIATE_REPORT.md
│       ├── PHASE14_SUBSTANTIATE_REPORT.md
│       ├── PHASE10_QL_PLAN.md
│       ├── PHASE15_QL_PLAN.md
│       ├── PHASE11_SUBSTANTIATE_REPORT.md
│       ├── PHASE10_SUBSTANTIATE_REPORT.md
│       ├── PHASE15_AUDIT_REPORT.md
│       ├── PHASE14_QL_PLAN.md
│       └── PHASE11_QL_PLAN.md
├── TODO_AUDIT.md
└── THOUGHTS_JOURNAL.md
```
