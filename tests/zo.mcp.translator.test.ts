import { describe, expect, it } from "vitest";
import { isReadOnlyMcpRequest, toDecisionRequest } from "../zo/mcp-proxy/translator";

describe("MCP translator", () => {
  it("maps destructive tool names to mutating actions", () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "1",
      method: "tools/call",
      params: {
        name: "delete_file",
        arguments: { path: "src/secret.txt" },
      },
    };
    const decision = toDecisionRequest(request, "did:myth:tester");
    expect(decision.action).toBe("write");
    expect(decision.targetPath).toBe("src/secret.txt");
  });

  it("marks configured tools as read-only for retry eligibility", () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "2",
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: { path: "README.md" },
      },
    };
    const allow = isReadOnlyMcpRequest(request, new Set(["read_file"]));
    const deny = isReadOnlyMcpRequest(request, new Set(["list_files"]));
    expect(allow).toBe(true);
    expect(deny).toBe(false);
  });

  it("fails closed for unknown tools by classifying as execute", () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "3",
      method: "tools/call",
      params: {
        name: "mystery_custom_tool",
        arguments: { input: "x" },
      },
    };
    const decision = toDecisionRequest(request, "did:myth:tester");
    expect(decision.action).toBe("execute");
  });
});
