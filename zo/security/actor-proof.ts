import * as crypto from "crypto";

export interface ActorProofHeaders {
  actorId: string;
  actorKid: string;
  actorTs: string;
  actorNonce: string;
  actorSig: string;
}

export function buildActorProof(
  actorId: string,
  body: string,
  ts: string,
  nonce: string,
  secret: string,
): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const payload = `${actorId}.${ts}.${nonce}.${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyActorProof(
  headers: ActorProofHeaders,
  body: string,
  secret: string,
  maxSkewMs = 5 * 60 * 1000,
): boolean {
  const tsMs = Number(headers.actorTs);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(Date.now() - tsMs) > maxSkewMs) return false;

  if (typeof headers.actorNonce !== "string" || headers.actorNonce.length < 8) return false;

  const expected = buildActorProof(
    headers.actorId,
    body,
    headers.actorTs,
    headers.actorNonce,
    secret,
  );
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(headers.actorSig, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
