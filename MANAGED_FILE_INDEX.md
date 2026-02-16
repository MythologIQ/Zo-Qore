# Managed File Index

This index provides a structured map of the project files to maintain order and clarity.

## 1. Project Root & Configuration

- `README.md`: Main project overview and setup instructions.
- `package.json`: Project dependencies and scripts.
- `TODO_AUDIT.md`: Tracking file for the ongoing audit and cleanup effort.
- `tsconfig.json`: TypeScript compiler configuration.
- `vitest.config.ts`: Configuration for Vitest testing framework.
- `.gitignore`: Files and directories ignored by Git.

## 2. Core Logic (Runtime)

Located in `runtime/`:

- `api/`: API endpoints and interface definitions.
- `service/`: Core business logic and services.
- `support/`: Helper functions and shared utilities (e.g., `SecureSecretStore.ts`).

## 3. Frontend & UI (Zo)

Located in `zo/`:

- `ui-shell/`: The main UI shell components, including `custom/` (Monitor/Command Center) and `assets/` (Mobile).
- `embeddings/`: Logic for vector embeddings (e.g., `local-service.ts`).
- `autonomy/`: Autonomous agent logic.
- `constellation/`: Visualization components.
- `project-tab/`: Project management UI logic.
- `prompt-governance/`: Governance UI components.
- `risk/`: Risk management UI logic.
- `security/`: Security-related UI components.

## 4. Scripts & Deployment

- `scripts/`: Utility scripts for development and maintenance.
  - `sync-failsafe-ui.mjs`: Synchronizes UI assets to the distribution folder, handling legacy removal and mobile integration.
- `deploy/`: Deployment configurations and scripts (e.g., `install-zo-full.sh`).

## 5. Assets & Documentation

- `assets/`: Static assets like branding and screenshots.
- `docs/`: Project documentation (Markdown files).

## 6. Testing

- `tests/`: Unit and integration tests for the project.

---

**Note:** This file should be updated when significant structural changes occur.
