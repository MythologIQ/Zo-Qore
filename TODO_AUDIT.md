# Audit & Cleanup To-Do List

This document tracks the tasks requested for auditing and organizing the codebase.

## Immediate Tasks (Completed)

- [x] **Separate Legacy & New UI**: Confirmed separation of UI components.
- [x] **Sync Script Update**: Updated `sync-failsafe-ui.mjs` to remove legacy dashboard and include mobile dashboard.
- [x] **Mobile UI Reality Check**: Replaced mock data in `mobile.js` and `mobile.html` with real API client (`MobileClient`).

## Upcoming Audit Tasks

- [x] **Dead Code Audit**: Scan for unused files, exports, and dependencies.
- [x] **File Structure Organization**: Review and reorganize file structure for clarity.
- [x] **Separation of Concerns**: Confirmed separation of UI components.
- [x] **Sync Script Update**: Updated `sync-failsafe-ui.mjs` to remove legacy dashboard and include mobile dashboard.
- [x] **Mobile UI Reality Check**: Replaced mock data in `mobile.js` and `mobile.html` with real API client (`MobileClient`).
- [x] **Managed File Index**: Create a central index for key project files to avoid confusion.
- [x] **Legacy Code Removal**: Manually verify and remove any remaining legacy UI artifacts from `zo/ui-shell`.
- [x] **Production Readiness**: Verify all UI components are mapped to live systems (Monitor, Command Center, Mobile).

## Ongoing

- [ ] Maintain this list and verify tasks upon completion.
