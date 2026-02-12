import * as crypto from "crypto";

export interface TotpOptions {
  periodSeconds?: number;
  digits?: number;
  window?: number;
  timestampMs?: number;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyTotpCode(secretBase32: string, candidate: string, options: TotpOptions = {}): boolean {
  const normalizedCandidate = String(candidate || "").trim();
  if (!/^\d{6,8}$/.test(normalizedCandidate)) {
    return false;
  }

  const periodSeconds = options.periodSeconds ?? 30;
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const timestampMs = options.timestampMs ?? Date.now();

  for (let offset = -window; offset <= window; offset += 1) {
    const code = generateTotpCode(secretBase32, {
      periodSeconds,
      digits,
      timestampMs: timestampMs + (offset * periodSeconds * 1000),
    });
    if (timingSafeEqualString(code, normalizedCandidate)) {
      return true;
    }
  }

  return false;
}

export function generateTotpCode(secretBase32: string, options: TotpOptions = {}): string {
  const periodSeconds = options.periodSeconds ?? 30;
  const digits = options.digits ?? 6;
  const timestampMs = options.timestampMs ?? Date.now();

  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  const mod = 10 ** digits;
  const code = (binary % mod).toString().padStart(digits, "0");
  return code;
}

export function encodeBase32(data: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  if (!cleaned || /[^A-Z2-7]/.test(cleaned)) {
    throw new Error("Invalid TOTP base32 secret");
  }

  let bits = 0;
  let buffer = 0;
  const output: number[] = [];

  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) {
      throw new Error("Invalid TOTP base32 secret");
    }
    buffer = (buffer << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
