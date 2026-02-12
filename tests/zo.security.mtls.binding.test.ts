import { describe, expect, it } from "vitest";
import { certificateMatchesActorId, extractActorIdsFromCertificate } from "../zo/security/mtls-actor-binding";

describe("mTLS actor binding", () => {
  it("extracts CN and URI SAN actor IDs", () => {
    const ids = extractActorIdsFromCertificate({
      subject: { CN: "did:myth:cn-actor" },
      subjectaltname: "DNS:example.local, URI:did:myth:uri-actor",
    });
    expect(ids).toContain("did:myth:cn-actor");
    expect(ids).toContain("did:myth:uri-actor");
  });

  it("matches actor ID against cert identities", () => {
    const cert = {
      subject: { CN: "did:myth:cn-actor" },
      subjectaltname: "URI:did:myth:uri-actor",
    };
    expect(certificateMatchesActorId(cert, "did:myth:cn-actor")).toBe(true);
    expect(certificateMatchesActorId(cert, "did:myth:uri-actor")).toBe(true);
    expect(certificateMatchesActorId(cert, "did:myth:other")).toBe(false);
  });
});
