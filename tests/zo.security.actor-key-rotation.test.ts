import { describe, expect, it } from "vitest";
import { rotateActorKeys } from "../zo/security/actor-key-rotation";

describe("actor key rotation", () => {
  it("adds a new active key and retires selected keys", () => {
    const rotated = rotateActorKeys("active:aaa,old:bbb", {
      newKid: "next",
      newSecret: "ccc",
      retireKids: ["old"],
    });

    expect(rotated.activeKid).toBe("next");
    expect(rotated.activeSecret).toBe("ccc");
    expect(rotated.serializedKeys).toContain("active:aaa");
    expect(rotated.serializedKeys).toContain("next:ccc");
    expect(rotated.serializedKeys).not.toContain("old:bbb");
  });
});
