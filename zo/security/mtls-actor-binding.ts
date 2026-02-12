import * as tls from "tls";

export interface PeerCertificateLike {
  subject?: {
    CN?: string;
  };
  subjectaltname?: string;
}

export function extractActorIdsFromCertificate(cert: PeerCertificateLike): string[] {
  const ids: string[] = [];
  const cn = cert.subject?.CN?.trim();
  if (cn) ids.push(cn);

  const san = cert.subjectaltname ?? "";
  for (const entry of san.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed.startsWith("URI:")) continue;
    const uri = trimmed.slice("URI:".length).trim();
    if (uri) ids.push(uri);
  }
  return Array.from(new Set(ids));
}

export function certificateMatchesActorId(cert: PeerCertificateLike, actorId: string): boolean {
  if (!actorId) return false;
  const ids = extractActorIdsFromCertificate(cert);
  return ids.includes(actorId);
}

export function getPeerCertificate(socket: tls.TLSSocket): tls.PeerCertificate | undefined {
  if (typeof socket.getPeerCertificate !== "function") return undefined;
  const cert = socket.getPeerCertificate();
  if (!cert || Object.keys(cert).length === 0) return undefined;
  return cert;
}
