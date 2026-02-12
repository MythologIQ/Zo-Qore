import { describe, expect, it } from "vitest";
import { toPromptTransparencyView } from "../runtime/api/PromptTransparencyView";

describe("Prompt transparency view contract", () => {
  it("maps prompt transparency ledger payloads to UI view model", () => {
    const view = toPromptTransparencyView({
      type: "prompt_transparency",
      stage: "PROMPT_BUILD_COMPLETED",
      surface: "zo_http_api",
      actorId: "did:myth:proxy-http",
      model: "zo-fast-1",
      target: "zo/ask_prompt",
      contentLength: 42,
      promptFingerprint: "abcd1234ef567890",
      profile: "zo-direct",
      traceId: "trace_123",
    });
    expect(view).toBeDefined();
    expect(view?.model).toBe("zo-fast-1");
    expect(view?.stage).toBe("PROMPT_BUILD_COMPLETED");
  });

  it("ignores unrelated or incomplete payloads", () => {
    expect(toPromptTransparencyView({ type: "other" })).toBeUndefined();
    expect(
      toPromptTransparencyView({
        type: "prompt_transparency",
        stage: "PROMPT_BUILD_COMPLETED",
      }),
    ).toBeUndefined();
  });
});
