import * as http from "http";

// Types for the function signatures
type SendJsonFn = (res: http.ServerResponse, status: number, body: unknown) => void;
type ApplyHeadersFn = (res: http.ServerResponse) => void;
type IsAuthorizedFn = (auth: string | undefined) => boolean;
type IsCookieAuthorizedFn = (cookie: string | undefined) => boolean;
type IsMfaAuthorizedFn = (cookie: string | undefined) => boolean;
type HasUiAssetFn = (name: string) => boolean;
type ServeFileFn = (res: http.ServerResponse, fileName: string) => void;

export interface PageDeps {
  sendJson: SendJsonFn;
  applyHeaders: ApplyHeadersFn;
  isAuthorized: IsAuthorizedFn;
  isCookieAuthorized: IsCookieAuthorizedFn;
  isMfaAuthorized: IsMfaAuthorizedFn;
  hasUiAsset: HasUiAssetFn;
  serveFile: ServeFileFn;
  sendBasicAuthChallenge: (res: http.ServerResponse) => void;
  requireUiMfa: boolean;
}

export function serveMfaPage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: PageDeps,
): void {
  if (!deps.requireUiMfa) {
    res.statusCode = 302;
    res.setHeader("location", "/");
    res.end();
    return;
  }
  if (!deps.isAuthorized(req.headers.authorization)) {
    deps.sendBasicAuthChallenge(res);
    return;
  }
  if (deps.isMfaAuthorized(req.headers.cookie)) {
    res.statusCode = 302;
    res.setHeader("location", "/");
    res.end();
    return;
  }

  res.statusCode = 200;
  deps.applyHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FailSafe-Qore MFA</title><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e6eefb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{background:#13233f;border:1px solid #2e4770;border-radius:10px;padding:20px;max-width:360px;width:100%}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#9fb1cd}input,button{width:100%;padding:10px;border-radius:8px;border:1px solid #2e4770}input{background:#0f1a2f;color:#e6eefb;margin-bottom:10px}button{background:#3d7dff;color:#fff;font-weight:700;cursor:pointer}.error{color:#ff8a8a;font-size:13px;min-height:20px}</style></head><body><div class="card"><h1>Two-Factor Verification</h1><p>Enter the 6-digit code from your authenticator app.</p><div id="e" class="error"></div><input id="c" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"/><button id="b">Verify</button></div><script>const b=document.getElementById('b');const c=document.getElementById('c');const e=document.getElementById('e');async function v(){e.textContent='';const code=(c.value||'').trim();const r=await fetch('/mfa/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});if(r.ok){location.href='/';return;}const j=await r.json().catch(()=>({message:'Verification failed'}));e.textContent=j.message||'Verification failed';}b.addEventListener('click',v);c.addEventListener('keydown',(ev)=>{if(ev.key==='Enter')v();});</script></body></html>`,
  );
}

export function serveLoginPage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: PageDeps,
): void {
  if (
    deps.isAuthorized(req.headers.authorization) ||
    deps.isCookieAuthorized(req.headers.cookie)
  ) {
    res.statusCode = 302;
    res.setHeader("location", "/");
    res.end();
    return;
  }

  if (deps.hasUiAsset("login.html")) {
    deps.serveFile(res, "login.html");
    return;
  }

  res.statusCode = 200;
  deps.applyHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    '<!doctype html><html><head><title>Login</title></head><body><h1>Login Required</h1><form action="/api/auth/login" method="post"><input name="username" placeholder="User"><input name="password" type="password" placeholder="Pass"><button>Login</button></form></body></html>',
  );
}

export function serveSettingsPage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: PageDeps,
): void {
  // Require authentication for settings page
  if (
    !deps.isAuthorized(req.headers.authorization) &&
    !deps.isCookieAuthorized(req.headers.cookie)
  ) {
    res.statusCode = 302;
    res.setHeader("location", "/login?next=/settings");
    res.end();
    return;
  }

  if (deps.hasUiAsset("settings.html")) {
    deps.serveFile(res, "settings.html");
    return;
  }

  // Fallback inline settings page
  res.statusCode = 200;
  deps.applyHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(getSettingsPageHtml());
}

export function getSettingsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FailSafe-Qore | Settings</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #e7efff; background: radial-gradient(circle at 15% 10%, #1d365f, #0a1220 45%); min-height: 100vh; padding: 16px; }
.container { max-width: 600px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 24px; }
.subtitle { color: #a9bad7; margin: 0 0 24px; }
.card { background: #13223a; border: 1px solid #2f4a70; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.card h2 { margin: 0 0 16px; font-size: 18px; }
.input-group { display: grid; gap: 6px; margin-bottom: 16px; }
.input-group label { font-size: 13px; color: #c7d8f5; }
input { width: 100%; border-radius: 8px; border: 1px solid #35537b; background: #0f1b30; color: #e7efff; padding: 10px 12px; font: inherit; font-size: 14px; outline: none; }
input:focus { border-color: #5a8ed0; }
button { border-radius: 8px; border: 1px solid #35537b; background: #1c3f72; color: #e7efff; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.15); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger { background: #7a2f3f; border-color: #a04050; }
.message { padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 13px; }
.message.success { background: #1a3f2a; border: 1px solid #2f7050; color: #7de6a8; }
.message.error { background: #3f1a2a; border: 1px solid #a04050; color: #ff8a9a; }
.status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #102643; border: 1px solid #3b5a84; }
.status-badge.enabled { color: #7de6a8; }
.status-badge.disabled { color: #a9bad7; }
.back-link { display: inline-block; margin-bottom: 16px; color: #5a8ed0; text-decoration: none; font-size: 14px; }
.back-link:hover { text-decoration: underline; }
.mfa-secret { font-family: monospace; background: #0f1b30; padding: 12px; border-radius: 8px; word-break: break-all; margin: 12px 0; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back-link">&larr; Back to Console</a>
<h1>Settings</h1>
<p class="subtitle">Manage your authentication and security settings</p>

<div class="card">
<h2>Credentials</h2>
<div id="credentials-status"></div>
<form id="credentials-form">
<div class="input-group" id="current-pass-group" style="display:none;">
<label for="currentPassword">Current Password</label>
<input type="password" id="currentPassword" autocomplete="current-password">
</div>
<div class="input-group">
<label for="username">Username</label>
<input type="text" id="username" autocomplete="username" required>
</div>
<div class="input-group">
<label for="password">New Password</label>
<input type="password" id="password" autocomplete="new-password" minlength="8" required>
</div>
<div class="input-group">
<label for="confirmPassword">Confirm Password</label>
<input type="password" id="confirmPassword" autocomplete="new-password" required>
</div>
<button type="submit" id="save-creds-btn">Save Credentials</button>
</form>
<div id="credentials-message"></div>
</div>

<div class="card">
<h2>Two-Factor Authentication (MFA)</h2>
<div id="mfa-status"></div>
<div id="mfa-actions"></div>
<div id="mfa-secret-display" style="display:none;">
<p>Scan this secret with your authenticator app:</p>
<div class="mfa-secret" id="mfa-secret-value"></div>
<p style="color:#a9bad7;font-size:13px;">After scanning, set the environment variable <code>QORE_UI_REQUIRE_MFA=true</code> and restart the server to enable MFA enforcement.</p>
</div>
<div id="mfa-message"></div>
</div>

<div class="card">
<h2>Configuration Location</h2>
<p style="color:#a9bad7;font-size:13px;">Secrets are stored in:</p>
<div class="mfa-secret" id="config-path">Loading...</div>
</div>
</div>

<script>
async function loadSettings() {
const res = await fetch('/api/settings');
const data = await res.json();

document.getElementById('config-path').textContent = data.configPath + '/secrets.env';

const credStatus = document.getElementById('credentials-status');
const currentPassGroup = document.getElementById('current-pass-group');
if (data.hasCredentials) {
credStatus.innerHTML = '<span class="status-badge enabled">Configured</span>';
document.getElementById('username').value = data.username || '';
currentPassGroup.style.display = 'block';
} else {
credStatus.innerHTML = '<span class="status-badge disabled">Not configured</span>';
}

const mfaStatus = document.getElementById('mfa-status');
const mfaActions = document.getElementById('mfa-actions');
if (data.mfaConfigured) {
mfaStatus.innerHTML = '<span class="status-badge ' + (data.mfaEnabled ? 'enabled' : 'disabled') + '">' + (data.mfaEnabled ? 'Enabled' : 'Configured but not enforced') + '</span>';
mfaActions.innerHTML = '<button type="button" class="btn-danger" onclick="disableMfa()">Remove MFA</button>';
} else {
mfaStatus.innerHTML = '<span class="status-badge disabled">Not configured</span>';
mfaActions.innerHTML = '<button type="button" onclick="enableMfa()">Setup MFA</button>';
}
}

document.getElementById('credentials-form').addEventListener('submit', async (e) => {
e.preventDefault();
const msg = document.getElementById('credentials-message');
const pass = document.getElementById('password').value;
const confirm = document.getElementById('confirmPassword').value;

if (pass !== confirm) {
msg.innerHTML = '<div class="message error">Passwords do not match</div>';
return;
}

const body = {
username: document.getElementById('username').value,
password: pass,
currentPassword: document.getElementById('currentPassword').value || undefined
};

const res = await fetch('/api/settings/credentials', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body)
});
const data = await res.json();

if (res.ok) {
msg.innerHTML = '<div class="message success">' + data.message + '</div>';
setTimeout(() => location.href = '/login', 1500);
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed to update') + '</div>';
}
});

async function enableMfa() {
const res = await fetch('/api/settings/mfa/enable', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({})
});
const data = await res.json();
const msg = document.getElementById('mfa-message');

if (res.ok) {
document.getElementById('mfa-secret-display').style.display = 'block';
document.getElementById('mfa-secret-value').textContent = data.secret;
msg.innerHTML = '<div class="message success">MFA secret generated</div>';
loadSettings();
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed') + '</div>';
}
}

async function disableMfa() {
if (!confirm('Are you sure you want to disable MFA?')) return;
const code = prompt('Enter your current MFA code to confirm:');
if (!code) return;

const res = await fetch('/api/settings/mfa/disable', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ code })
});
const data = await res.json();
const msg = document.getElementById('mfa-message');

if (res.ok) {
document.getElementById('mfa-secret-display').style.display = 'none';
msg.innerHTML = '<div class="message success">' + data.message + '</div>';
loadSettings();
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed') + '</div>';
}
}

loadSettings();
</script>
</body>
</html>`;
}

export function serveUpdatesPage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: PageDeps,
): void {
  // Require authentication for updates page
  if (
    !deps.isAuthorized(req.headers.authorization) &&
    !deps.isCookieAuthorized(req.headers.cookie)
  ) {
    res.statusCode = 302;
    res.setHeader("location", "/login?next=/updates");
    res.end();
    return;
  }

  if (deps.hasUiAsset("updates.html")) {
    deps.serveFile(res, "updates.html");
    return;
  }

  res.statusCode = 200;
  deps.applyHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(getUpdatesPageHtml());
}

export function getUpdatesPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FailSafe-Qore | Updates</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #e7efff; background: radial-gradient(circle at 15% 10%, #1d365f, #0a1220 45%); min-height: 100vh; padding: 16px; }
.container { max-width: 700px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 24px; }
.subtitle { color: #a9bad7; margin: 0 0 24px; }
.card { background: #13223a; border: 1px solid #2f4a70; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.card h2 { margin: 0 0 16px; font-size: 18px; display: flex; align-items: center; gap: 10px; }
button { border-radius: 8px; border: 1px solid #35537b; background: #1c3f72; color: #e7efff; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.15); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-success { background: #1a5f3a; border-color: #2f8050; }
.btn-danger { background: #7a2f3f; border-color: #a04050; }
.message { padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 13px; }
.message.success { background: #1a3f2a; border: 1px solid #2f7050; color: #7de6a8; }
.message.error { background: #3f1a2a; border: 1px solid #a04050; color: #ff8a9a; }
.message.info { background: #1a2f4a; border: 1px solid #3b5a84; color: #7db8e8; }
.status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #102643; border: 1px solid #3b5a84; }
.status-badge.current { color: #7de6a8; }
.status-badge.available { color: #f0c674; }
.back-link { display: inline-block; margin-bottom: 16px; color: #5a8ed0; text-decoration: none; font-size: 14px; }
.back-link:hover { text-decoration: underline; }
.version-display { font-family: monospace; font-size: 18px; color: #7de6a8; }
.info-text { color: #a9bad7; font-size: 13px; margin: 8px 0; }
.update-list { list-style: none; padding: 0; margin: 16px 0 0; }
.update-item { background: #0f1b30; border: 1px solid #2f4a70; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
.update-item h3 { margin: 0 0 6px; font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
.update-item .notes { font-size: 13px; color: #a9bad7; margin: 8px 0 0; white-space: pre-wrap; max-height: 100px; overflow: auto; }
.update-item .meta { font-size: 12px; color: #7a8fa8; margin-top: 8px; }
.history-item { background: #0f1b30; border: 1px solid #29415f; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.history-item .version { font-family: monospace; color: #7de6a8; }
.history-item .date { font-size: 12px; color: #7a8fa8; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.toggle { position: relative; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #29415f; border-radius: 24px; transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #e7efff; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .toggle-slider { background: #2f8050; }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back-link">&larr; Back to Console</a>
<h1>Updates</h1>
<p class="subtitle">Manage application updates and version history</p>

<div class="card">
<h2>Current Version</h2>
<div class="version-display" id="current-version">Loading...</div>
<p class="info-text" id="last-check">Last checked: Never</p>
<div class="actions">
<button onclick="checkUpdates()" id="check-btn">Check for Updates</button>
<button onclick="createBackup()" class="btn-sm">Create Backup</button>
</div>
<div id="update-message"></div>
</div>

<div class="card" id="updates-card" style="display:none;">
<h2>Available Updates <span class="status-badge available" id="update-count"></span></h2>
<ul class="update-list" id="update-list"></ul>
</div>

<div class="card">
<h2>Auto-Check Settings</h2>
<div class="toggle-row">
<span>Automatically check for updates</span>
<label class="toggle">
<input type="checkbox" id="auto-check-toggle" onchange="updateAutoCheck()">
<span class="toggle-slider"></span>
</label>
</div>
<p class="info-text">When enabled, checks for updates every 24 hours.</p>
</div>

<div class="card" id="rollback-card" style="display:none;">
<h2>Rollback</h2>
<p class="info-text">Restore to a previous version if needed.</p>
<div id="rollback-versions"></div>
</div>

<div class="card">
<h2>Update History</h2>
<div id="history-list">
<p class="info-text">No update history yet.</p>
</div>
</div>
</div>

<script>
async function loadStatus() {
const res = await fetch('/api/updates');
const data = await res.json();

document.getElementById('current-version').textContent = 'v' + data.currentVersion;
document.getElementById('auto-check-toggle').checked = data.autoCheck?.enabled ?? true;

if (data.lastCheck?.lastChecked) {
document.getElementById('last-check').textContent = 'Last checked: ' + new Date(data.lastCheck.lastChecked).toLocaleString();
}

if (data.lastCheck?.updateAvailable) {
showUpdates(data.lastCheck);
}

if (data.canRollback && data.rollbackVersions?.length > 0) {
document.getElementById('rollback-card').style.display = 'block';
const html = data.rollbackVersions.map(v =>
'<button class="btn-sm btn-danger" onclick="rollback(\\'' + v + '\\')">Rollback to v' + v + '</button>'
).join(' ');
document.getElementById('rollback-versions').innerHTML = html;
}

loadHistory();
}

async function loadHistory() {
const res = await fetch('/api/updates/history');
const data = await res.json();
const list = document.getElementById('history-list');

if (data.history?.length > 0) {
list.innerHTML = data.history.map(h =>
'<div class="history-item"><span class="version">v' + h.version + '</span> <span class="date">' + new Date(h.installedAt).toLocaleString() + '</span></div>'
).join('');
}
}

async function checkUpdates() {
const btn = document.getElementById('check-btn');
const msg = document.getElementById('update-message');
btn.disabled = true;
btn.textContent = 'Checking...';
msg.innerHTML = '';

try {
const res = await fetch('/api/updates/check', { method: 'POST' });
const data = await res.json();

document.getElementById('last-check').textContent = 'Last checked: ' + new Date(data.lastChecked).toLocaleString();

if (data.error) {
msg.innerHTML = '<div class="message error">' + data.error + '</div>';
} else if (data.updateAvailable) {
msg.innerHTML = '<div class="message success">Updates available!</div>';
showUpdates(data);
} else {
msg.innerHTML = '<div class="message info">You are on the latest version.</div>';
}
} catch (err) {
msg.innerHTML = '<div class="message error">Failed to check for updates</div>';
}

btn.disabled = false;
btn.textContent = 'Check for Updates';
}

function showUpdates(data) {
if (!data.updates || data.updates.length === 0) return;

const card = document.getElementById('updates-card');
const list = document.getElementById('update-list');
const count = document.getElementById('update-count');

card.style.display = 'block';
count.textContent = data.updates.length + ' available';

list.innerHTML = data.updates.map(u => {
const date = u.releaseDate ? new Date(u.releaseDate).toLocaleDateString() : '';
return '<li class="update-item"><h3><span>v' + u.version + '</span>' +
'<button class="btn-sm btn-success" onclick="installUpdate(\\'' + u.version + '\\')">Install</button></h3>' +
(u.releaseNotes ? '<div class="notes">' + escapeHtml(u.releaseNotes) + '</div>' : '') +
'<div class="meta">Released: ' + date + (u.size ? ' | Size: ' + formatBytes(u.size) : '') + '</div></li>';
}).join('');
}

function escapeHtml(text) {
const div = document.createElement('div');
div.textContent = text;
return div.innerHTML;
}

function formatBytes(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function installUpdate(version) {
if (!confirm('Install update v' + version + '? A backup will be created first.')) return;

const msg = document.getElementById('update-message');
msg.innerHTML = '<div class="message info">Creating backup...</div>';

// Create backup first
await fetch('/api/updates/backup', { method: 'POST' });

msg.innerHTML = '<div class="message info">Installing update... This may take a moment.</div>';

// Record the update (actual installation would use git pull or package download)
await fetch('/api/updates/record', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ version, installedBy: 'ui' })
});

msg.innerHTML = '<div class="message success">Update recorded. Run the update script to complete installation:<br><code>npm run zo:update</code></div>';
loadStatus();
}

async function createBackup() {
const msg = document.getElementById('update-message');
const res = await fetch('/api/updates/backup', { method: 'POST' });
const data = await res.json();
if (res.ok) {
msg.innerHTML = '<div class="message success">Backup created for v' + data.version + '</div>';
loadStatus();
} else {
msg.innerHTML = '<div class="message error">Failed to create backup</div>';
}
}

async function updateAutoCheck() {
const enabled = document.getElementById('auto-check-toggle').checked;
await fetch('/api/updates/settings', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ autoCheckEnabled: enabled })
});
}

async function rollback(version) {
if (!confirm('Rollback to v' + version + '? Current changes may be lost.')) return;
const msg = document.getElementById('update-message');
msg.innerHTML = '<div class="message info">Rollback instructions:<br><code>git checkout v' + version + '</code><br>or restore from backup</div>';
}

loadStatus();
</script>
</body>
</html>`;
}
