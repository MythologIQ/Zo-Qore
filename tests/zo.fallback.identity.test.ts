import { describe, expect, it } from "vitest";
import { resolveSshActorContext, signSshActorContext, verifySshActorContext } from "../zo/fallback/identity";

describe("Fallback SSH identity", () => {
  it("verifies signed actor context", () => {
    const actorId = "did:myth:ssh:tester";
    const sessionId = "192.168.1.2 1234 10.0.0.1 22";
    const issuedAt = `${Date.now()}`;
    const secret = "ssh-secret";
    const signature = signSshActorContext(actorId, sessionId, issuedAt, secret);
    const ok = verifySshActorContext(
      { actorId, sessionId, issuedAt, signature },
      secret,
    );
    expect(ok).toBe(true);
  });

  it("resolves defaults when env fields are missing", () => {
    const context = resolveSshActorContext({});
    expect(context.actorId.startsWith("did:myth:ssh:")).toBe(true);
    expect(context.sessionId.length).toBeGreaterThan(0);
  });
});
