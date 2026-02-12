import { describe, expect, it } from "vitest";
import { encodeBase32, generateTotpCode, parseCookies, verifyTotpCode } from "../zo/ui-shell/mfa";

describe("ui mfa helpers", () => {
  it("parses cookies", () => {
    const parsed = parseCookies("a=1; b=hello%20world");
    expect(parsed.a).toBe("1");
    expect(parsed.b).toBe("hello world");
  });

  it("generates and verifies totp", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890"));
    const timestampMs = 1700000000000;
    const code = generateTotpCode(secret, { timestampMs, periodSeconds: 30, digits: 6 });
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, { timestampMs, periodSeconds: 30, digits: 6, window: 0 })).toBe(true);
    expect(verifyTotpCode(secret, "000000", { timestampMs, periodSeconds: 30, digits: 6, window: 0 })).toBe(false);
  });
});
