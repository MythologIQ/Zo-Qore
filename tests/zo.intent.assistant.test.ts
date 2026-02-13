import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

type StubElement = {
  value?: string;
  textContent: string;
  innerHTML: string;
  listeners: Record<string, Listener | undefined>;
  addEventListener: (type: string, listener: Listener) => void;
};

function stubElement(initialValue = ""): StubElement {
  return {
    value: initialValue,
    textContent: "",
    innerHTML: "",
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
    expect(elements.output.textContent).toContain("prompt_pipeline:");
    expect(elements.output.textContent).toContain('recommended: "zo-reasoning-1"');
    expect(elements.output.textContent).toContain('template_deck: "analysis"');
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
    };

    const assistant = new IntentAssistant({
      elements,
      getPhase: () => ({ key: "plan", title: "Plan" }),
      getSelectedSkill: () => null,
      getFallbackSkill: () => ({ key: "fallback", label: "Fallback Skill" }),
    });

    assistant.generate();
    expect(elements.output.textContent).toContain("Enter intent first");

    elements.output.textContent = "copy me";
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard },
      configurable: true,
    });
    await assistant.copy();
    expect(clipboard.writeText).toHaveBeenCalledWith("copy me");
    expect(elements.output.textContent).toContain("# copied");

    const failingClipboard = { writeText: vi.fn().mockRejectedValue(new Error("blocked")) };
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: failingClipboard },
      configurable: true,
    });
    elements.output.textContent = "copy me again";
    await assistant.copy();
    expect(elements.output.textContent).toContain("# copy_failed");
  });

  it("requires approval before send and dispatches through qore evaluate when approved", async () => {
    const modulePath = "../zo/ui-shell/shared/legacy/" + "intent-assistant.js";
    const { IntentAssistant } = await import(modulePath);
    const elements = {
      generate: stubElement(),
      copy: stubElement(),
      send: { ...stubElement(), disabled: true } as StubElement & { disabled: boolean },
      approve: { ...stubElement(), checked: false } as StubElement & { checked: boolean },
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
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ decision: "ALLOW" }),
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

    assistant.generate();
    expect(elements.send.disabled).toBe(true);
    await assistant.send();
    expect(String(elements.output.textContent)).toContain("send_blocked");
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    elements.approve.checked = true;
    assistant.updateSendState();
    expect(elements.send.disabled).toBe(false);
    await assistant.send();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/qore/evaluate");
    expect(elements.output.textContent).toContain("# sent");
    expect(elements.output.textContent).toContain("decision: ALLOW");
  });
});
