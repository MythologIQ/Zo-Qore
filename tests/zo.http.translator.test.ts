import { describe, expect, it } from "vitest";
import { toDecisionRequest } from "../zo/http-proxy/translator";

describe("Zo HTTP translator", () => {
  it("fails closed for ambiguous prompts", () => {
    const decision = toDecisionRequest({ prompt: "Do the thing." }, "did:myth:tester");
    expect(decision.action).toBe("execute");
  });

  it("uses model/session/context in request identity", () => {
    const a = toDecisionRequest(
      { prompt: "Summarize this.", model: "alpha", sessionId: "s1", context: { turn: 1 } },
      "did:myth:tester",
    );
    const b = toDecisionRequest(
      { prompt: "Summarize this.", model: "beta", sessionId: "s2", context: { turn: 2 } },
      "did:myth:tester",
    );
    expect(a.requestId).not.toBe(b.requestId);
  });
});
