/**
 * Victor UI System - Shared Module
 * Common auth, navigation, and utilities for all Victor pages
 */

const VICTOR_CONFIG = {
  password: 'AliceGrace',
  sessionKey: 'victor-auth',
  apiBase: 'https://qore-runtime-frostwulf.zocomputer.io',
  apiKey: 'qore_dev_53864b4213623eaba716687ebcc28e08'
};

// Auth functions
function checkAuth() {
  const auth = sessionStorage.getItem(VICTOR_CONFIG.sessionKey);
  if (auth === 'authenticated') {
    showApp();
    return true;
  }
  showLogin();
  return false;
}

function authenticate() {
  const input = document.getElementById('password-input');
  if (input.value === VICTOR_CONFIG.password) {
    sessionStorage.setItem(VICTOR_CONFIG.sessionKey, 'authenticated');
    showApp();
  } else {
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
    input.value = '';
    input.placeholder = 'Incorrect password';
  }
}

function logout() {
  sessionStorage.removeItem(VICTOR_CONFIG.sessionKey);
  location.reload();
}

function showLogin() {
  const login = document.getElementById('login-screen');
  const app = document.getElementById('app-container');
  if (login) login.style.display = 'flex';
  if (app) app.style.display = 'none';
}

function showApp() {
  const login = document.getElementById('login-screen');
  const app = document.getElementById('app-container');
  if (login) login.style.display = 'none';
  if (app) app.style.display = 'block';
}

// Navigation
function getNavHtml(currentPage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: 'index.html', icon: '⌂' },
    { id: 'emails', label: 'Emails', href: 'emails.html', icon: '✉' },
    { id: 'calendar', label: 'Calendar', href: 'calendar.html', icon: '📅' },
    { id: 'tasks', label: 'Tasks', href: 'tasks.html', icon: '☑' },
    { id: 'victor', label: 'Victor Chat', href: 'victor.html', icon: '💬' },
    { id: 'victor-dashboard', label: 'Victor Config', href: 'victor-dashboard.html', icon: '⚙' },
    { id: 'logs', label: 'Logs', href: 'logs.html', icon: '📋' }
  ];
  
  return `
    <nav class="victor-nav">
      <div class="nav-brand">
        <div class="nav-avatar">V</div>
        <span class="nav-title">Victor</span>
      </div>
      <div class="nav-links">
        ${pages.map(p => `
          <a href="${p.href}" class="nav-link ${p.id === currentPage ? 'active' : ''}">
            <span class="nav-icon">${p.icon}</span>
            <span class="nav-label">${p.label}</span>
          </a>
        `).join('')}
      </div>
      <button class="nav-logout" onclick="logout()">Logout</button>
    </nav>
  `;
}

// Shared CSS
const VICTOR_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a1220;
    color: #e7efff;
    min-height: 100vh;
  }
  
  /* Login Screen */
  #login-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #0a1220 0%, #13223a 100%);
  }
  
  .login-box {
    background: #13223a;
    border: 1px solid #2f4a70;
    border-radius: 12px;
    padding: 40px;
    text-align: center;
    max-width: 400px;
    width: 90%;
  }
  
  .login-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1e3a5f, #5a9cf8);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    font-size: 36px;
    font-weight: bold;
    color: white;
  }
  
  .login-title {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  
  .login-subtitle {
    color: #7a8fb8;
    margin-bottom: 24px;
  }
  
  .login-input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #2f4a70;
    border-radius: 8px;
    background: #0f1b30;
    color: #e7efff;
    font-size: 16px;
    margin-bottom: 16px;
    outline: none;
    transition: border-color 0.2s;
  }
  
  .login-input:focus {
    border-color: #5a9cf8;
  }
  
  .login-btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #1e3a5f, #5a9cf8);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .login-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(90, 156, 248, 0.3);
  }
  
  .shake {
    animation: shake 0.5s ease-in-out;
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
  }
  
  /* Navigation */
  .victor-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    background: #0d1a2d;
    border-bottom: 1px solid #2f4a70;
  }
  
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .nav-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1e3a5f, #5a9cf8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: white;
  }
  
  .nav-title {
    font-size: 18px;
    font-weight: 600;
  }
  
  .nav-links {
    display: flex;
    gap: 4px;
  }
  
  .nav-link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    color: #7a8fb8;
    text-decoration: none;
    font-size: 14px;
    transition: all 0.2s;
  }
  
  .nav-link:hover {
    background: #162d4a;
    color: #e7efff;
  }
  
  .nav-link.active {
    background: #1e3a5f;
    color: #e7efff;
  }
  
  .nav-icon {
    font-size: 16px;
  }
  
  .nav-logout {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid #2f4a70;
    border-radius: 6px;
    color: #7a8fb8;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .nav-logout:hover {
    background: #ef4444;
    border-color: #ef4444;
    color: white;
  }
  
  /* App Container */
  #app-container {
    display: none;
  }
  
  .app-content {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }
  
  /* Cards */
  .card {
    background: #13223a;
    border: 1px solid #2f4a70;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }
  
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  
  .card-title {
    font-size: 18px;
    font-weight: 600;
  }
  
  /* Buttons */
  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: #5a9cf8;
    color: white;
  }
  
  .btn-primary:hover {
    background: #4a8ce8;
  }
  
  .btn-secondary {
    background: #1e3a5f;
    color: #e7efff;
  }
  
  .btn-secondary:hover {
    background: #2f4a70;
  }
  
  /* Grid */
  .grid {
    display: grid;
    gap: 20px;
  }
  
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  
  @media (max-width: 768px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    .nav-links { display: none; }
  }
  
  /* Status badges */
  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .badge-success { background: #22c55e20; color: #22c55e; }
  .badge-warning { background: #eab30820; color: #eab308; }
  .badge-error { background: #ef444420; color: #ef4444; }
  .badge-info { background: #5a9cf820; color: #5a9cf8; }
  
  /* Loading */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #2f4a70;
    border-top-color: #5a9cf8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 40px;
    color: #7a8fb8;
  }
  
  .empty-state-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
`;

// API helper
async function victorApi(endpoint, options = {}) {
  const url = `${VICTOR_CONFIG.apiBase}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-qore-api-key': VICTOR_CONFIG.apiKey,
    ...options.headers
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

// Export for use in pages
window.VictorApp = {
  config: VICTOR_CONFIG,
  checkAuth,
  authenticate,
  logout,
  getNavHtml,
  css: VICTOR_CSS,
  api: victorApi
};
