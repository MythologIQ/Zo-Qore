/**
 * Void Storage Tests
 *
 * Tests for localStorage persistence layer.
 *
 * @module tests/void.storage.test
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { VoidLocalStorage } from "../zo/void/storage";

describe("VoidLocalStorage", () => {
  let storage: VoidLocalStorage;
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    mockStorage = new Map();

    // Mock localStorage
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mockStorage.set(key, value);
      },
      removeItem: (key: string) => {
        mockStorage.delete(key);
      },
    });

    storage = new VoidLocalStorage();
  });

  it("saves void state to localStorage", () => {
    const state = {
      sessionId: "session-1",
      projectId: "project-1",
      mode: "genesis" as const,
      draftContent: "Draft text",
      lastActivityAt: new Date().toISOString(),
    };

    storage.save(state);

    const stored = mockStorage.get("zoqore_void_state");
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.sessionId).toBe("session-1");
    expect(parsed.projectId).toBe("project-1");
    expect(parsed.mode).toBe("genesis");
    expect(parsed.draftContent).toBe("Draft text");
  });

  it("loads void state from localStorage", () => {
    const state = {
      sessionId: "session-2",
      projectId: "project-2",
      mode: "living",
      draftContent: "Loaded draft",
      lastActivityAt: new Date().toISOString(),
    };

    mockStorage.set("zoqore_void_state", JSON.stringify(state));

    const loaded = storage.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe("session-2");
    expect(loaded?.mode).toBe("living");
    expect(loaded?.draftContent).toBe("Loaded draft");
  });

  it("returns null when no state exists", () => {
    const loaded = storage.load();
    expect(loaded).toBeNull();
  });

  it("clears void state from localStorage", () => {
    const state = {
      sessionId: "session-3",
      projectId: "project-3",
      mode: "genesis" as const,
      draftContent: "",
      lastActivityAt: new Date().toISOString(),
    };

    storage.save(state);
    expect(storage.load()).not.toBeNull();

    storage.clear();
    expect(storage.load()).toBeNull();
  });

  it("updates draft content without replacing full state", () => {
    const initialState = {
      sessionId: "session-4",
      projectId: "project-4",
      mode: "genesis" as const,
      draftContent: "Initial draft",
      lastActivityAt: "2026-02-14T10:00:00Z",
    };

    storage.save(initialState);
    storage.updateDraft("Updated draft content");

    const loaded = storage.load();
    expect(loaded?.sessionId).toBe("session-4"); // Preserved
    expect(loaded?.projectId).toBe("project-4"); // Preserved
    expect(loaded?.draftContent).toBe("Updated draft content"); // Updated
    expect(loaded?.lastActivityAt).not.toBe("2026-02-14T10:00:00Z"); // Updated
  });

  it("updateDraft does nothing when no state exists", () => {
    storage.updateDraft("No state to update");
    expect(storage.load()).toBeNull();
  });

  it("handles invalid JSON gracefully on load", () => {
    mockStorage.set("zoqore_void_state", "not valid json");

    const loaded = storage.load();
    expect(loaded).toBeNull();
  });

  it("handles localStorage errors gracefully on save", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Storage full");
      },
      getItem: () => null,
      removeItem: () => {},
    });

    // Should not throw
    expect(() => {
      storage.save({
        sessionId: "test",
        projectId: "test",
        mode: "genesis",
        draftContent: "",
        lastActivityAt: new Date().toISOString(),
      });
    }).not.toThrow();
  });
});
