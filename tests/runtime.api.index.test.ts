import { describe, expect, it } from "vitest";
import * as runtimeApi from "../runtime/api";

describe("runtime/api index exports", () => {
  it("exposes core runtime classes and helpers", () => {
    expect(typeof runtimeApi.QoreLogicManager).toBe("function");
    expect(typeof runtimeApi.TrustEngine).toBe("function");
    expect(typeof runtimeApi.ShadowGenomeManager).toBe("function");
    expect(typeof runtimeApi.QoreRuntimeService).toBe("function");
    expect(typeof runtimeApi.LocalApiServer).toBe("function");
    expect(typeof runtimeApi.LedgerManager).toBe("function");
    expect(typeof runtimeApi.PolicyEngine).toBe("function");
    expect(typeof runtimeApi.EventBus).toBe("function");
    expect(typeof runtimeApi.LRUCache).toBe("function");
    expect(typeof runtimeApi.InMemoryStateStore).toBe("function");
    expect(typeof runtimeApi.recommendModel).toBe("function");
    expect(typeof runtimeApi.resolveCatalog).toBe("function");
    expect(typeof runtimeApi.toPromptTransparencyView).toBe("function");
  });
});

