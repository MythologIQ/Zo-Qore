# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-02-13

### Added
- Zo full installer path for one-command setup in Zo environments (`deploy/zo/install-zo-full.sh`).
- MFA, session controls, and admin security tooling for UI access hardening.
- Monitor and command-center dual UI routing (`/ui/monitor`, `/ui/console`) with theme-aware monitor rendering.
- Agent-assisted setup prompt for less technical operators (`deploy/zo/AGENT_SETUP_PROMPT.md`).
- Expanded security and operational documentation set:
  - `docs/THREAT_MODEL.md`
  - `docs/SECRETS_MANAGEMENT.md`
  - `docs/INCIDENT_RESPONSE.md`
  - `docs/ZOQORE_WALKTHROUGH.md`

### Changed
- External product naming standardized to `Zo-Qore` in release-facing documentation and UI labels.
- Package version advanced from `0.1.0` to `1.0.0`.
- Legacy UI status label updated from `v3.0.1-RC` to `v1.0.0`.

### Security
- Authentication posture tightened for internet-exposed UI deployments with MFA and configurable lockout controls.
- Governance runtime and UI deployment guidance updated with clearer hardening and rollback instructions.
