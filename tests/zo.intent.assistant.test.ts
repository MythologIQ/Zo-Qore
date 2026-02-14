import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

type StubElement = {
  value?: string;
  textContent: string;
  innerHTML: string;
  dataset: Record<string, string>;
  listeners: Record<string, Listener | undefined>;
  addEventListener: (type: string, listener: Listener) => void;
};

function stubElement(initialValue = ""): StubElement {
  return {
    value: initialValue,
    textContent: "",
    innerHTML: "",
    dataset: {},
    listeners: {},
    addEventListener(type: string, listener: Listener) {
      this.listeners[type] = listener;
    },
  };
}

describe("IntentAssistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: () => ({
          _text: "",
          set textContent(value: string) {
            this._text = String(value);
          },
          get innerHTML() {
            return String(this._text)
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#39;");
          },
        }),
      },
      configurable: true,
    });
  });

  it("applies defaults and builds robust prompt package with recommendations", async () => {
    const modulePath = "../zo/ui-shell/shared/legacy/" + "intent-assistant.js";
    const { IntentAssistant } = await import(modulePath);
    const elements = {
      generate: stubElement(),
      copy: stubElement(),
      template: stubElement("analysis"),
      contextInput: stubElement(""),
      persona: stubElement(""),
      context: stubElement(""),
      input: stubElement("Run security audit for auth and mfa proxy flows."),
      modelMode: stubElement("auto"),
      taskNature: stubElement(""),
      modelRecommendation: stubElement(""),
      vendorPractices: stubElement(""),
      output: stubElement(""),
      chatOutput: stubElement(""),
      flowPipeline: stubElement(""),
      flowPackage: stubElement(""),
      flowChat: stubElement(""),
    };

    const assistant = new IntentAssistant({
      elements,
      getPhase: () => ({ key: "implement", title: "Implement" }),
      getSelectedSkill: () => ({ key: "security-audit", label: "Security Audit" }),
      getFallbackSkill: () => null,
    });

    assistant.renderContext();
    assistant.generate();

    expect(elements.contextInput.value).toContain("risk ranking");
    expect(elements.persona.value).toBe("security");
    expect(elements.context.textContent).toContain("Implement");
    expect(elements.context.textContent).toContain("Security Audit");
    expect(elements.taskNature.textContent).toContain("security-audit");
    expect(elements.modelRecommendation.textContent).toContain("zo-reasoning-1");
    expect(elements.vendorPractices.innerHTML).toContain("Vendor Prompting Practices");
    expect(elements.output.value).toContain("prompt_pipeline:");
    expect(elements.output.value).toContain('recommended: "zo-reasoning-1"');
    expect(elements.output.value).toContain('template_deck: "analysis"');
  });

  it("returns guidance for empty intent and handles clipboard copy states", async () => {
    const modulePath = "../zo/ui-shell/shared/legacy/" + "intent-assistant.js";
    const { IntentAssistant } = await import(modulePath);
    const elements = {
      generate: stubElement(),
      copy: stubElement(),
      template: stubElement("fast"),
      contextInput: stubElement(""),
      persona: stubElement(""),
      context: stubElement(""),
      input: stubElement(""),
      modelMode: stubElement("auto"),
      taskNature: stubElement(""),
      modelRecommendation: stubElement(""),
      vendorPractices: stubElement(""),
      output: stubElement(""),
      chatOutput: stubElement(""),
      flowPipeline: stubElement(""),
      flowPackage: stubElement(""),
      flowChat: stubElement(""),
    };

    const assistant = new IntentAssistant({
      elements,
      getPhase: () => ({ key: "plan", title: "Plan" }),
      getSelectedSkill: () => null,
      getFallbackSkill: () => ({ key: "fallback", label: "Fallback Skill" }),
    });

    assistant.generate();
    expect(elements.output.value).toContain("Enter intent first");

    elements.output.value = "copy me";
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard },
      configurable: true,
    });
    await assistant.copy();
    // Copy now silently succeeds without modifying output
    expect(clipboard.writeText).toHaveBeenCalledWith("copy me");
    expect(elements.output.value).toBe("copy me");

    const failingClipboard = { writeText: vi.fn().mockRejectedValue(new Error("blocked")) };
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: failingClipboard },
      configurable: true,
    });
    elements.output.value = "copy me again";
    await assistant.copy();
    // Copy now silently fails without modifying output
    expect(elements.output.value).toBe("copy me again");
  });

  it("dispatches through qore evaluate and forwards to zo when allowed", async () => {
    const modulePath = "../zo/ui-shell/shared/legacy/" + "intent-assistant.js";
    const { IntentAssistant } = await import(modulePath);
    const elements = {
      generate: stubElement(),
      copy: stubElement(),
      send: { ...stubElement(), disabled: true } as StubElement & { disabled: boolean },
      template: stubElement("planning"),
      contextInput: stubElement("Architecture constraints and policy boundaries."),
      persona: stubElement("systems"),
      context: stubElement(""),
      input: stubElement("Build secure prompt package dispatch."),
      modelMode: stubElement("auto"),
      taskNature: stubElement(""),
      modelRecommendation: stubElement(""),
      vendorPractices: stubElement(""),
      output: stubElement(""),
      chatOutput: stubElement(""),
      flowPipeline: stubElement(""),
      flowPackage: stubElement(""),
      flowChat: stubElement(""),
      chatId: stubElement(""),
      homeChatId: stubElement(""),
      chatLogsButton: { ...stubElement(), disabled: true } as StubElement & { disabled: boolean },
    };

    let callCount = 0;
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url === "/api/qore/evaluate") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ decision: "ALLOW" }),
        });
      }
      if (url === "/api/zo/ask") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: "Implemented with verification." }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchSpy,
      configurable: true,
    });

    const assistant = new IntentAssistant({
      elements,
      getPhase: () => ({ key: "implement", title: "Implement" }),
      getSelectedSkill: () => ({ key: "security-audit", label: "Security Audit" }),
      getFallbackSkill: () => null,
    });

    // Before generate, send is disabled (no output)
    expect(elements.send.disabled).toBe(true);

    assistant.generate();
    expect(elements.flowPipeline.dataset.flowState).toBe("ready");
    expect(elements.flowPackage.dataset.flowState).toBe("pending");
    expect(elements.flowChat.dataset.flowState).toBe("idle");

    // After generate, send is enabled (output has content)
    expect(elements.send.disabled).toBe(false);

    await assistant.send();

    // Verify governance was called first, then Zo
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/qore/evaluate");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/zo/ask");

    // Verify chat output shows assistant response
    expect(elements.chatOutput.textContent).toContain("[assistant] Implemented with verification.");
    expect(elements.flowPackage.dataset.flowState).toBe("ready");
    expect(elements.flowChat.dataset.flowState).toBe("ready");
    expect(elements.chatLogsButton.disabled).toBe(false);

    // Input change resets flow states
    elements.input.listeners.input?.();
    expect(elements.flowPipeline.dataset.flowState).toBe("pending");
    expect(elements.flowPackage.dataset.flowState).toBe("idle");
    expect(elements.flowChat.dataset.flowState).toBe("idle");
    expect(elements.chatOutput.textContent).toContain("Assistant responses appear here after send.");
    expect(elements.chatLogsButton.disabled).toBe(true);
  });
});
