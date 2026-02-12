import { describe, expect, it } from "vitest";
import { classifyToolAction, classifyZoPromptAction } from "@mythologiq/qore-contracts/schemas/ActionClassification";

describe("action classification hardening", () => {
  it("does not classify substring collisions as read", () => {
    const action = classifyToolAction("tools/call", "listen_socket_cleanup");
    expect(action).toBe("execute");
  });

  it("prioritizes mutating tokens over read-like tokens", () => {
    const action = classifyToolAction("tools/call", "get_and_delete_file");
    expect(action).toBe("write");
  });

  it("fails closed on ambiguous Zo prompts", () => {
    const action = classifyZoPromptAction("Handle this.");
    expect(action).toBe("execute");
  });
});

