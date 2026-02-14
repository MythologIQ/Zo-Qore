/**
 * Void LocalStorage Persistence
 *
 * Persists void session state to localStorage for offline access
 * and session recovery across page reloads.
 *
 * @module zo/void/storage
 */

import type { VoidMode } from "./types.js";

// Browser localStorage interface for cross-environment compatibility
interface BrowserLocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Declare global for browser compatibility
declare const localStorage: BrowserLocalStorage | undefined;

/**
 * Get localStorage if available (browser environment).
 */
function getLocalStorage(): BrowserLocalStorage | null {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // localStorage access may throw in some environments
  }
  return null;
}

/**
 * LocalStorage state shape for void sessions.
 */
export interface VoidLocalState {
  sessionId: string;
  projectId: string;
  mode: VoidMode;
  draftContent: string;
  lastActivityAt: string;
}

const STORAGE_KEY = "zoqore_void_state";

/**
 * LocalStorage persistence for void sessions.
 */
export class VoidLocalStorage {
  /**
   * Save void state to localStorage.
   */
  save(state: VoidLocalState): void {
    try {
      const storage = getLocalStorage();
      if (!storage) return;
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage unavailable or full - silently ignore
    }
  }

  /**
   * Load void state from localStorage.
   */
  load(): VoidLocalState | null {
    try {
      const storage = getLocalStorage();
      if (!storage) return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as VoidLocalState;
    } catch {
      return null;
    }
  }

  /**
   * Clear void state from localStorage.
   */
  clear(): void {
    try {
      const storage = getLocalStorage();
      if (!storage) return;
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Update draft content without replacing full state.
   */
  updateDraft(draftContent: string): void {
    const existing = this.load();
    if (!existing) return;

    this.save({
      ...existing,
      draftContent,
      lastActivityAt: new Date().toISOString(),
    });
  }
}
