#!/usr/bin/env node

const VERSION = "0.1.0";

function usage() {
  console.log(
    `qorectl v${VERSION}\n\nUsage:\n  qorectl doctor\n  qorectl sessions\n  qorectl devices\n  qorectl revoke-sessions [--all|--current|--session <tokenId>|--device <deviceId>]\n  qorectl mfa-reset [--secret <base32>] [--account <name>] [--issuer <name>] [--confirm RESET_MFA]\n\nEnvironment:\n  QORECTL_RUNTIME_URL          Runtime base URL (default: http://127.0.0.1:7777)\n  QORECTL_UI_URL               UI base URL (default: http://127.0.0.1:9380)\n  QORE_API_KEY                 Runtime API key for /health and /policy/version\n  QORE_UI_ADMIN_TOKEN          Admin token for /api/admin/* endpoints\n  QORE_UI_BASIC_AUTH_USER      Optional basic auth username for UI /health\n  QORE_UI_BASIC_AUTH_PASS      Optional basic auth password for UI /health\n`
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  return { cmd, args: args.slice(1) };
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function basicAuthHeader() {
  const user = process.env.QORE_UI_BASIC_AUTH_USER;
  const pass = process.env.QORE_UI_BASIC_AUTH_PASS;
  if (!user || !pass) return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    let json = null;
    let text = "";
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      json = await res.json();
    } else {
      text = await res.text();
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (error) {
    return { ok: false, status: 0, json: null, text: String(error) };
  }
}

function printCheck(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function printWarn(label, detail) {
  console.log(`[WARN] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function doctor() {
  const runtimeUrl = (process.env.QORECTL_RUNTIME_URL || "http://127.0.0.1:7777").replace(/\/$/, "");
  const uiUrl = (process.env.QORECTL_UI_URL || "http://127.0.0.1:9380").replace(/\/$/, "");

  const runtimeHeaders = {};
  if (process.env.QORE_API_KEY) runtimeHeaders["x-qore-api-key"] = process.env.QORE_API_KEY;

  const uiHeaders = {};
  const basic = basicAuthHeader();
  if (basic) uiHeaders["authorization"] = basic;
  if (process.env.QORE_UI_ADMIN_TOKEN) uiHeaders["x-qore-admin-token"] = process.env.QORE_UI_ADMIN_TOKEN;

  let allPass = true;

  const runtimeHealth = await fetchJson(`${runtimeUrl}/health`, { headers: runtimeHeaders });
  const runtimeHealthOk = runtimeHealth.ok;
  if (!runtimeHealthOk) allPass = false;
  printCheck("runtime /health", runtimeHealthOk, runtimeHealthOk ? "reachable" : `status=${runtimeHealth.status} ${runtimeHealth.text || ""}`.trim());

  const runtimePolicy = await fetchJson(`${runtimeUrl}/policy/version`, { headers: runtimeHeaders });
  const runtimePolicyOk = runtimePolicy.ok;
  if (!runtimePolicyOk) allPass = false;
  const policyVersion = runtimePolicyOk ? runtimePolicy.json?.policyVersion || "unknown" : `status=${runtimePolicy.status}`;
  printCheck("runtime /policy/version", runtimePolicyOk, String(policyVersion));

  const uiHealth = await fetchJson(`${uiUrl}/health`, { headers: uiHeaders });
  const uiHealthOk = uiHealth.ok;
  if (!uiHealthOk) allPass = false;
  printCheck("ui /health", uiHealthOk, uiHealthOk ? "reachable" : `status=${uiHealth.status} ${uiHealth.text || ""}`.trim());

  if (process.env.QORE_UI_ADMIN_TOKEN) {
    const adminSecurity = await fetchJson(`${uiUrl}/api/admin/security`, { headers: uiHeaders });
    const adminSecurityOk = adminSecurity.ok;
    if (!adminSecurityOk) allPass = false;
    if (adminSecurityOk) {
      const sess = adminSecurity.json?.sessions?.activeMfaSessions;
      const mfa = adminSecurity.json?.auth?.requireMfa;
      printCheck("ui /api/admin/security", true, `requireMfa=${String(mfa)} activeMfaSessions=${String(sess)}`);
    } else {
      printCheck("ui /api/admin/security", false, `status=${adminSecurity.status}`);
    }
  } else {
    printWarn("ui /api/admin/security", "skipped (QORE_UI_ADMIN_TOKEN not set)");
  }

  if (!allPass) {
    process.exitCode = 1;
    return;
  }
  console.log("Doctor complete: all checks passed.");
}

function requireAdminTokenOrExit() {
  const adminToken = process.env.QORE_UI_ADMIN_TOKEN;
  if (!adminToken) {
    console.error("QORE_UI_ADMIN_TOKEN is required for admin operations.");
    process.exitCode = 2;
    return null;
  }
  return adminToken;
}

function adminHeaders(adminToken) {
  return {
    "content-type": "application/json",
    "x-qore-admin-token": adminToken,
  };
}

async function listSessions() {
  const uiUrl = (process.env.QORECTL_UI_URL || "http://127.0.0.1:9380").replace(/\/$/, "");
  const adminToken = requireAdminTokenOrExit();
  if (!adminToken) return;

  const response = await fetchJson(`${uiUrl}/api/admin/sessions`, {
    headers: adminHeaders(adminToken),
  });
  if (!response.ok) {
    console.error(`sessions failed: status=${response.status} ${response.text || JSON.stringify(response.json || {})}`);
    process.exitCode = 1;
    return;
  }
  const sessions = Array.isArray(response.json?.sessions) ? response.json.sessions : [];
  console.log(JSON.stringify({ sessions }, null, 2));
}

async function listDevices() {
  const uiUrl = (process.env.QORECTL_UI_URL || "http://127.0.0.1:9380").replace(/\/$/, "");
  const adminToken = requireAdminTokenOrExit();
  if (!adminToken) return;

  const response = await fetchJson(`${uiUrl}/api/admin/devices`, {
    headers: adminHeaders(adminToken),
  });
  if (!response.ok) {
    console.error(`devices failed: status=${response.status} ${response.text || JSON.stringify(response.json || {})}`);
    process.exitCode = 1;
    return;
  }
  const devices = Array.isArray(response.json?.devices) ? response.json.devices : [];
  console.log(JSON.stringify({ devices }, null, 2));
}

async function revokeSessions(args) {
  const uiUrl = (process.env.QORECTL_UI_URL || "http://127.0.0.1:9380").replace(/\/$/, "");
  const adminToken = requireAdminTokenOrExit();
  if (!adminToken) return;

  let body = {};
  let mode = "current";
  const sessionId = readArgValue(args, "--session");
  const deviceId = readArgValue(args, "--device");
  if (hasFlag(args, "--all") || (!hasFlag(args, "--current") && !sessionId && !deviceId)) {
    body = { all: true };
    mode = "all";
  } else if (sessionId) {
    body = { sessionId };
    mode = "session";
  } else if (deviceId) {
    body = { deviceId };
    mode = "device";
  }

  const response = await fetchJson(`${uiUrl}/api/admin/sessions/revoke`, {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`revoke-sessions failed: status=${response.status} ${response.text || JSON.stringify(response.json || {})}`);
    process.exitCode = 1;
    return;
  }

  console.log(`revoke-sessions complete: ${mode}`);
}

async function resetMfa(args) {
  const uiUrl = (process.env.QORECTL_UI_URL || "http://127.0.0.1:9380").replace(/\/$/, "");
  const adminToken = requireAdminTokenOrExit();
  if (!adminToken) return;

  const body = {
    confirm: readArgValue(args, "--confirm") || "RESET_MFA",
    secret: readArgValue(args, "--secret"),
    account: readArgValue(args, "--account"),
    issuer: readArgValue(args, "--issuer"),
  };

  const response = await fetchJson(`${uiUrl}/api/admin/mfa/recovery/reset`, {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`mfa-reset failed: status=${response.status} ${response.text || JSON.stringify(response.json || {})}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(response.json || {}, null, 2));
}

async function main() {
  const { cmd, args } = parseArgs(process.argv);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }

  if (cmd === "doctor") {
    await doctor();
    return;
  }

  if (cmd === "sessions") {
    await listSessions();
    return;
  }

  if (cmd === "devices") {
    await listDevices();
    return;
  }

  if (cmd === "revoke-sessions") {
    await revokeSessions(args);
    return;
  }

  if (cmd === "mfa-reset") {
    await resetMfa(args);
    return;
  }

  console.error(`unknown command: ${cmd}`);
  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(`qorectl failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
