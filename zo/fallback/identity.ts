import * as crypto from "crypto";

export interface SshActorContext {
  actorId: string;
  sessionId: string;
  issuedAt: string;
  signature: string;
}

export function resolveSshActorContext(env: NodeJS.ProcessEnv): SshActorContext {
  const actorId =
    env.QORE_ACTOR_ID ??
    (env.USER ? `did:myth:ssh:${env.USER}` : "did:myth:ssh:unknown");
  const sessionId = env.SSH_CONNECTION ?? env.TERM_SESSION_ID ?? "session:unknown";
  const issuedAt = env.QORE_ACTOR_TS ?? `${Date.now()}`;
  const signature = env.QORE_ACTOR_SIG ?? "";
  return { actorId, sessionId, issuedAt, signature };
}

export function signSshActorContext(
  actorId: string,
  sessionId: string,
  issuedAt: string,
  secret: string,
): string {
  const payload = `${actorId}.${sessionId}.${issuedAt}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySshActorContext(context: SshActorContext, secret: string): boolean {
  const expected = signSshActorContext(
    context.actorId,
    context.sessionId,
    context.issuedAt,
    secret,
  );
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(context.signature, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
