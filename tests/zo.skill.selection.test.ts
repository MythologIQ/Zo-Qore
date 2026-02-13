import { describe, expect, it } from "vitest";
// @ts-expect-error no declaration file for UI helper module
import { selectPreferredSkill } from "../zo/ui-shell/custom/legacy/skill-selection.js";

describe("skill selection preference", () => {
  it("chooses favorited skill when multiple relevant matches exist", () => {
    const grouped = {
      allRelevant: [
        { key: "alpha", label: "Alpha" },
        { key: "beta", label: "Beta" },
        { key: "gamma", label: "Gamma" },
      ],
      recommended: [{ key: "alpha", label: "Alpha" }],
    };

    const chosen = selectPreferredSkill(grouped, (key: string) => key === "beta");
    expect(chosen?.key).toBe("beta");
  });

  it("falls back to first candidate when no favorites exist", () => {
    const grouped = {
      allRelevant: [
        { key: "alpha", label: "Alpha" },
        { key: "beta", label: "Beta" },
      ],
      recommended: [],
    };

    const chosen = selectPreferredSkill(grouped, () => false);
    expect(chosen?.key).toBe("alpha");
  });

  it("uses recommended list when allRelevant is empty", () => {
    const grouped = {
      allRelevant: [],
      recommended: [
        { key: "delta", label: "Delta" },
        { key: "epsilon", label: "Epsilon" },
      ],
    };

    const chosen = selectPreferredSkill(grouped, (key: string) => key === "epsilon");
    expect(chosen?.key).toBe("epsilon");
  });
});
