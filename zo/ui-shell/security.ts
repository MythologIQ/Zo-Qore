import * as crypto from "crypto";
import * as http from "http";
import {
  generateSessionToken,
  parseCookies,
  verifyTotpCode,
} from "./mfa.js";
import type { MfaSessionRecord, AuthSessionRecord } from "./types.js";

// ── IP & Rate Limiting ─────────────────────────────────────────────

export function getClientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const firstXff = Array.isArray(xff) ? xff[0] : xff;
    if (firstXff) {
      const first = String(firstXff).split(",")[0]?.trim();
      if (first) return first;
    }
    const xRealIp = req.headers["x-real-ip"];
    if (xRealIp) {
      const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
      if (ip) return String(ip).trim();
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function isClientAllowed(clientIp: string, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) return true;
  return allowedIps.includes(clientIp);
}

export function isLockedOut(
  store: Map<string, { count: number; lockUntil: number }>,
  key: string,
): boolean {
  const record = store.get(key);
  if (!record) return false;
  if (record.lockUntil > Date.now()) return true;
  if (record.lockUntil > 0 && record.lockUntil <= Date.now()) {
    store.delete(key);
  }
  return false;
}

export function recordFailure(
  store: Map<string, { count: number; lockUntil: number }>,
  key: string,
  lockoutMs: number,
  maxFailures: number,
): void {
  const current = store.get(key) ?? { count: 0, lockUntil: 0 };
  const nextCount = current.count + 1;
  const lockUntil =
    nextCount >= maxFailures ? Date.now() + Math.max(lockoutMs, 1000) : 0;
  store.set(key, { count: nextCount, lockUntil });
}

export function clearFailure(
  store: Map<string, { count: number; lockUntil: number }>,
  key: string,
): void {
  store.delete(key);
}

// ── Session Management ──────────────────────────────────────────────

export function pruneExpiredSessions(
  mfaSessions: Map<string, MfaSessionRecord>,
  authSessions: Map<string, AuthSessionRecord>,
): void {
  const now = Date.now();
  for (const [token, session] of mfaSessions.entries()) {
    if (session.expiresAt <= now) {
      mfaSessions.delete(token);
    }
  }
  for (const [token, session] of authSessions.entries()) {
    if (session.expiresAt <= now) {
      authSessions.delete(token);
    }
  }
}

export function sessionTokenId(rawToken: string): string {
  return crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex")
    .slice(0, 24);
}

export function deriveDeviceId(userAgent: string, clientIp: string): string {
  return crypto
    .createHash("sha256")
    .update(`${userAgent}|${clientIp}`)
    .digest("hex")
    .slice(0, 16);
}

export function listSessions(
  mfaSessions: Map<string, MfaSessionRecord>,
  authSessions: Map<string, AuthSessionRecord>,
): Array<{
  tokenId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  clientIp: string;
  userAgent: string;
  deviceId: string;
}> {
  pruneExpiredSessions(mfaSessions, authSessions);
  return [...mfaSessions.values()]
    .map((session) => ({
      tokenId: session.tokenId,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      lastSeenAt: new Date(session.lastSeenAt).toISOString(),
      clientIp: session.clientIp,
      userAgent: session.userAgent,
      deviceId: session.deviceId,
    }))
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

// ── TOTP Utilities ──────────────────────────────────────────────────

export function normalizeTotpSecret(input: unknown): string | null {
  const value = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!value) return null;
  if (!/^[A-Z2-7]+$/.test(value)) return null;
  return value;
}

export function buildOtpAuthUrl(
  secret: string,
  account: string,
  issuer: string,
): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Response & Headers ──────────────────────────────────────────────

export function sendBasicAuthChallenge(
  res: http.ServerResponse,
  applyHeaders: (res: http.ServerResponse) => void,
): void {
  res.statusCode = 401;
  applyHeaders(res);
  res.setHeader("www-authenticate", 'Basic realm="FailSafe-Qore UI"');
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Authentication required.");
}

export function applySecurityHeaders(
  res: http.ServerResponse,
  allowFrameEmbedding: boolean,
  frameAncestors: string,
): void {
  res.setHeader("x-content-type-options", "nosniff");
  if (allowFrameEmbedding) {
    res.removeHeader("x-frame-options");
  } else {
    res.setHeader("x-frame-options", "DENY");
  }
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("cache-control", "no-store");
  res.setHeader(
    "permissions-policy",
    "geolocation=(), microphone=(self), camera=()",
  );
  res.setHeader(
    "content-security-policy",
    `default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors ${frameAncestors};`,
  );
}

// ── Auth Session Creation ───────────────────────────────────────────

export function createAuthSession(
  req: http.IncomingMessage,
  clientIp: string,
  uiSessionSecret: string,
  uiSessionTtlMs: number,
  authSessions: Map<string, AuthSessionRecord>,
): string {
  const raw = generateSessionToken();
  const sig = crypto
    .createHmac("sha256", uiSessionSecret)
    .update(raw)
    .digest("hex");
  const token = `${raw}.${sig}`;
  const now = Date.now();
  const userAgent = String(req.headers["user-agent"] ?? "unknown");
  const deviceId = deriveDeviceId(userAgent, clientIp);

  authSessions.set(token, {
    tokenId: sessionTokenId(raw),
    createdAt: now,
    expiresAt: now + uiSessionTtlMs,
    clientIp,
    userAgent,
    deviceId,
    lastSeenAt: now,
  });
  return token;
}

export function createMfaSession(
  req: http.IncomingMessage,
  clientIp: string,
  uiSessionSecret: string,
  uiSessionTtlMs: number,
  mfaSessions: Map<string, MfaSessionRecord>,
): string {
  const raw = generateSessionToken();
  const sig = crypto
    .createHmac("sha256", uiSessionSecret)
    .update(raw)
    .digest("hex");
  const token = `${raw}.${sig}`;
  const now = Date.now();
  const userAgent = String(req.headers["user-agent"] ?? "unknown");
  const deviceHeader = req.headers["x-qore-device-id"];
  const deviceIdRaw = Array.isArray(deviceHeader)
    ? deviceHeader[0]
    : deviceHeader;
  const deviceId =
    (deviceIdRaw ? String(deviceIdRaw).trim() : "") ||
    deriveDeviceId(userAgent, clientIp);
  mfaSessions.set(token, {
    tokenId: sessionTokenId(raw),
    createdAt: now,
    expiresAt: now + uiSessionTtlMs,
    clientIp,
    userAgent,
    deviceId,
    lastSeenAt: now,
  });
  return token;
}

// ── Auth Checks ─────────────────────────────────────────────────────

export function isMfaAuthorized(
  cookieHeader: string | undefined,
  requireUiMfa: boolean,
  mfaSessions: Map<string, MfaSessionRecord>,
  authSessions: Map<string, AuthSessionRecord>,
): boolean {
  if (!requireUiMfa) return true;
  pruneExpiredSessions(mfaSessions, authSessions);
  const token = parseCookies(cookieHeader).qore_ui_mfa;
  if (!token) return false;
  const session = mfaSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    mfaSessions.delete(token);
    return false;
  }
  session.lastSeenAt = Date.now();
  return true;
}

export function isAuthorized(
  authorization: string | undefined,
  requireUiAuth: boolean,
  uiAuthUser: string,
  uiAuthPass: string,
): boolean {
  if (!requireUiAuth) {
    return true;
  }
  if (!authorization || !authorization.startsWith("Basic ")) {
    return false;
  }
  const encoded = authorization.slice("Basic ".length);
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);
  return user === uiAuthUser && pass === uiAuthPass;
}

export function isCookieAuthorized(
  cookieHeader: string | undefined,
  requireUiAuth: boolean,
  authSessions: Map<string, AuthSessionRecord>,
  mfaSessions: Map<string, MfaSessionRecord>,
): boolean {
  if (!requireUiAuth) return true;
  pruneExpiredSessions(mfaSessions, authSessions);
  const token = parseCookies(cookieHeader).qore_ui_auth;
  if (!token) return false;
  const session = authSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    authSessions.delete(token);
    return false;
  }
  session.lastSeenAt = Date.now();
  return true;
}

export function hasValidAdminToken(
  req: http.IncomingMessage,
  uiAdminToken: string,
): boolean {
  if (!uiAdminToken) return false;
  const header = req.headers["x-qore-admin-token"];
  const supplied = Array.isArray(header) ? header[0] : header;
  if (!supplied) return false;
  const expected = Buffer.from(uiAdminToken);
  const actual = Buffer.from(String(supplied));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
