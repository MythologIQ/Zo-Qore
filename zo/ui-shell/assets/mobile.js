document.addEventListener('DOMContentLoaded', () => {
  // ─── Configuration ───
  const CONFIG = {
    apiHub: '/api/hub',
    apiDashboard: '/api/projects/dashboard',
    apiSkills: '/api/skills',
    apiEval: '/api/qore/evaluate',
    apiAsk: '/api/zo/ask',
    apiSwitchProject: '/api/projects/switch',
    defaultPersona: 'systems',
    defaultTemplate: 'fast',
    pollInterval: 30000,
  };

  // ─── State ───
  const state = {
    isProcessing: false,
    connection: 'connecting',
    hub: null,
    dashboard: null,
    skills: [],
    ws: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    pollTimer: null,
    chatHistory: JSON.parse(localStorage.getItem('zoqore-chat-history') || '[]'),
  };

  // ─── Elements: Console ───
  const consoleLog = document.querySelector('.console-output');
  const cmdInput = document.getElementById('cmd-input');
  const sendBtn = document.getElementById('send-cmd-btn');
  const debugLight = document.querySelector('.led');

  // ─── Elements: Projects ───
  const repoNameEl = document.getElementById('current-repo-name');
  const statusPercentEl = document.querySelector('.status-percent');
  const progressFillEl = document.querySelector('.project-progress-fill');
  const statusStageEl = document.querySelector('.status-stage .highlight');
  const statusHealthEl = document.querySelector('.status-health .good, .status-health .warn, .status-health .bad');
  const milestoneListEl = document.getElementById('milestone-list');

  // ─── Elements: Monitor ───
  const sentinelOrb = document.querySelector('.sentinel-orb');
  const sentinelState = document.querySelector('.sentinel-state');
  const queueCount = document.querySelector('.queue-count');
  const sentinelAlert = document.querySelector('.sentinel-alert');
  const tankFill = document.querySelector('.tank-fill');
  const tankLabel = document.querySelector('.health-sub');
  const errorText = document.querySelector('.health-value-overlay');
  const arcFill = document.querySelector('.arc-fill');
  const sliderThumb = document.querySelector('.slider-thumb');
  const sliderFill = document.querySelector('.slider-fill');
  const sliderVal = document.querySelector('.health-value-large');
  const criticalBlockersVal = document.querySelector('.health-item:first-child .health-value');

  // ─── Elements: Footer ───
  const footerQoreEl = document.querySelector('.footer-stat:nth-child(1) span');
  const footerPolicyEl = document.querySelectorAll('.footer-stat')[1]?.querySelector('span');
  const footerLatencyEl = document.querySelectorAll('.footer-stats-row')[1]?.querySelector('.footer-stat span');
  const footerRefreshBtn = document.querySelector('.footer-refresh');

  // ─── Elements: Repo Modal ───
  const repoModalList = document.querySelector('#repo-modal .skill-list, #repo-modal .repo-list');

  // ─── Utilities ───
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function appendLog(role, text, type = 'info') {
    if (!consoleLog) return;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div = document.createElement('div');
    div.className = 'log-entry';
    let roleSpan = '';
    if (role === 'System') roleSpan = '<span class="log-sys">[System]</span>';
    else if (role === 'Agent') roleSpan = '<span class="log-agent">[Agent]</span>';
    else if (role === 'User') roleSpan = '<span style="color: var(--accent-gold); font-weight:600;">[User]</span>';
    else roleSpan = `<span class="log-ts">[${role}]</span>`;
    let content = escapeHtml(text);
    if (type === 'error') content = `<span style="color: var(--accent-red);">${content}</span>`;
    if (type === 'success') content = `<span style="color: var(--accent-green);">${content}</span>`;
    div.innerHTML = `<span class="log-ts">[${timestamp}]</span> ${roleSpan} ${content}`;
    consoleLog.appendChild(div);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  // ─── WebSocket ───
  function connectWebSocket() {
    try {
      setConnection('connecting');
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      state.ws = new WebSocket(`${wsProto}//${window.location.host}`);

      state.ws.onopen = () => {
        state.reconnectAttempts = 0;
        if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
        setConnection('connected');
      };

      state.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' && data.payload) {
            state.hub = data.payload;
            renderMonitor();
            renderFooter();
          }
          if (data.type === 'hub.refresh') {
            fetchHub();
          }
          if (data.type === 'event' && (data.payload?.planEvent || data.payload?.sprintEvent)) {
            fetchHub();
            fetchDashboard();
          }
        } catch (e) { console.warn('[Mobile WS] parse error:', e); }
      };

      state.ws.onerror = () => setConnection('disconnected');
      state.ws.onclose = () => {
        setConnection('disconnected');
        scheduleReconnect();
      };
    } catch (err) {
      console.warn('[Mobile WS] connect failed:', err);
      setConnection('disconnected');
    }
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * (2 ** (state.reconnectAttempts - 1))) + Math.floor(Math.random() * 350);
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connectWebSocket();
    }, delay);
  }

  function setConnection(status) {
    state.connection = status;
    renderFooter();
  }

  // ─── Data Fetching ───
  async function fetchHub() {
    try {
      const res = await fetch(CONFIG.apiHub);
      if (!res.ok) throw new Error(`Hub ${res.status}`);
      state.hub = await res.json();
      renderMonitor();
      renderFooter();
    } catch (err) {
      console.error('[Mobile] fetchHub:', err);
    }
  }

  async function fetchDashboard() {
    try {
      const res = await fetch(CONFIG.apiDashboard);
      if (!res.ok) throw new Error(`Dashboard ${res.status}`);
      state.dashboard = await res.json();
      renderProjects();
    } catch (err) {
      console.error('[Mobile] fetchDashboard:', err);
    }
  }

  async function fetchSkills() {
    try {
      const res = await fetch(CONFIG.apiSkills);
      if (!res.ok) return;
      const data = await res.json();
      state.skills = Array.isArray(data?.skills) ? data.skills : [];
      renderSkillModal();
    } catch (err) {
      console.error('[Mobile] fetchSkills:', err);
    }
  }

  // ─── Render: Projects Tab ───
  function renderProjects() {
    const d = state.dashboard;
    if (!d) return;
    const project = d.project || {};
    const phases = d.phases || [];
    const milestones = d.milestones || [];
    const allProjects = d.allProjects || [];

    // Project name in repo selector
    if (repoNameEl) {
      const name = project.name || 'No Project';
      repoNameEl.textContent = name.length > 20 ? name.substring(0, 18) + '...' : name;
    }

    // Overall progress: compute from phases
    let overallProgress = 0;
    if (phases.length > 0) {
      const total = phases.reduce((sum, ph) => sum + (ph.progress || 0), 0);
      overallProgress = Math.round(total / phases.length);
    }

    if (statusPercentEl) statusPercentEl.textContent = `${overallProgress}%`;
    if (progressFillEl) progressFillEl.style.width = `${overallProgress}%`;

    // Phase & health
    const currentPhase = phases.find(ph => ph.status === 'in-progress');
    if (statusStageEl) statusStageEl.textContent = currentPhase ? currentPhase.title : (project.state || 'Unknown');

    if (statusHealthEl) {
      const risks = d.risks || [];
      const highRisks = risks.filter(r => r.level === 'high' || r.level === 'critical');
      if (highRisks.length > 0) {
        statusHealthEl.textContent = 'At Risk';
        statusHealthEl.className = 'bad';
      } else if (risks.length > 0) {
        statusHealthEl.textContent = 'Caution';
        statusHealthEl.className = 'warn';
      } else {
        statusHealthEl.textContent = 'Stable';
        statusHealthEl.className = 'good';
      }
    }

    // Milestones
    if (milestoneListEl) {
      if (milestones.length === 0 && phases.length === 0) {
        milestoneListEl.innerHTML = '<div class="milestone-item"><div class="milestone-info"><div class="milestone-title" style="color:var(--text-muted)">No milestones yet</div><div class="milestone-feature">Run a planning session to generate milestones</div></div></div>';
        return;
      }

      // Build from milestones first, fallback to phases
      const items = milestones.length > 0 ? milestones : phases.map(ph => ({
        title: ph.title,
        status: ph.status,
        progress: ph.progress,
        feature: ph.description || '',
      }));

      milestoneListEl.innerHTML = items.map((item, idx) => {
        const isComplete = item.completedAt || item.status === 'completed';
        const isActive = !isComplete && (item.status === 'in-progress' || idx === 0);
        const isFuture = !isComplete && !isActive;
        const progress = item.progress || 0;

        let cls = 'milestone-item';
        if (isActive) cls += ' active with-chart';
        else if (!isComplete && item.status === 'queued') cls += ' queued queue-item';
        else if (isFuture) cls += ' future queue-item';
        else cls += ' queue-item';

        const opacity = isFuture ? ' style="opacity:0.6;"' : '';
        const titleCls = isActive ? 'highlight' : (item.status === 'queued' ? 'warn' : '');

        const icon = isComplete
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';

        const chartHtml = isActive ? `
          <div class="milestone-chart">
            <svg viewBox="0 0 36 36" class="circular-chart blue">
              <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="circle" stroke-dasharray="${progress}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span class="chart-text">${progress}%</span>
          </div>` : '';

        const feature = item.feature || item.targetDate
          ? `Target: ${escapeHtml(item.feature || new Date(item.targetDate).toLocaleDateString())}`
          : '';

        if (isActive) {
          return `<div class="${cls}"${opacity}>
            <div class="milestone-left">
              <div class="milestone-icon">${icon}</div>
              <div class="milestone-info">
                <div class="milestone-title ${titleCls}">${escapeHtml(item.title)}</div>
                <div class="milestone-feature">${feature}</div>
              </div>
            </div>
            ${chartHtml}
          </div>`;
        }

        return `<div class="${cls}"${opacity}>
          <div class="milestone-icon">${icon}</div>
          <div class="milestone-info">
            <div class="milestone-title ${titleCls}">${escapeHtml(item.title)}</div>
            <div class="milestone-feature">${feature}</div>
          </div>
        </div>`;
      }).join('');

      // Respect queue depth setting
      const savedDepth = localStorage.getItem('zoqore-queue-depth') || 3;
      const queueItems = milestoneListEl.querySelectorAll('.queue-item');
      queueItems.forEach((item, index) => {
        item.style.display = index < parseInt(savedDepth) ? 'flex' : 'none';
      });
    }

    // Update repo modal with real projects
    renderRepoModal(allProjects, project);
  }

  function renderRepoModal(allProjects, activeProject) {
    const container = document.querySelector('#repo-modal .modal-content');
    if (!container || !allProjects || allProjects.length === 0) return;

    // Find or create the list
    let listEl = container.querySelector('.repo-options-live');
    if (!listEl) {
      // Remove old static options
      const oldList = container.querySelectorAll('.repo-option, .skill-list');
      oldList.forEach(el => el.remove());
      listEl = document.createElement('div');
      listEl.className = 'repo-options-live skill-list';
      const title = container.querySelector('.modal-title');
      if (title) title.after(listEl);
      else container.prepend(listEl);
    }

    listEl.innerHTML = allProjects.map(proj => {
      const isActive = proj.isActive || (activeProject && proj.id === activeProject.id);
      return `<button class="skill-option repo-live-option${isActive ? ' active' : ''}" data-project-id="${escapeHtml(proj.id)}">
        <span class="skill-name">${escapeHtml(proj.name)}${proj.parentId ? ' (Sub)' : ''}</span>
        <span class="skill-desc">${isActive ? 'Active' : (proj.state || 'tracked')}</span>
      </button>`;
    }).join('');

    // Bind click handlers for project switching
    listEl.querySelectorAll('.repo-live-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const projectId = btn.dataset.projectId;
        if (!projectId) return;
        try {
          const res = await fetch(CONFIG.apiSwitchProject, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId })
          });
          if (!res.ok) throw new Error(`Switch failed (${res.status})`);
          await fetchDashboard();
          const repoModal = document.getElementById('repo-modal');
          if (repoModal) repoModal.style.display = 'none';
        } catch (err) {
          console.error('[Mobile] switchProject:', err);
        }
      });
    });
  }

  // ─── Render: Monitor Tab ───
  function renderMonitor() {
    const hub = state.hub;
    if (!hub) return;

    const sentinel = hub.sentinelStatus || {};
    const verdict = String(sentinel.verdict || sentinel.status || 'NOMINAL').toUpperCase();
    const l3Queue = hub.l3Queue || [];
    const recentVerdicts = hub.recentVerdicts || [];

    // Sentinel state
    const isCritical = ['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(verdict);
    const isWarning = ['WARN', 'REVIEWING'].includes(verdict);
    const isSecure = !isCritical && !isWarning;

    if (sentinelOrb) {
      sentinelOrb.className = 'sentinel-orb';
      if (isCritical) sentinelOrb.classList.add('critical');
      else if (isWarning) sentinelOrb.classList.add('warning');
      else sentinelOrb.classList.add('secure');
    }

    if (sentinelState) {
      sentinelState.textContent = verdict;
      sentinelState.className = 'sentinel-state';
      if (isCritical) sentinelState.classList.add('critical');
      else if (isWarning) sentinelState.classList.add('warning');
      else sentinelState.classList.add('secure');
    }

    if (queueCount) {
      queueCount.textContent = String(l3Queue.length);
    }

    // Alert strip
    if (sentinelAlert) {
      if (isCritical) {
        const reason = sentinel.reason || sentinel.message || 'Critical violation detected';
        sentinelAlert.innerHTML = `<span>&#9888;</span> ${escapeHtml(reason)}`;
        sentinelAlert.style.display = 'flex';
      } else if (isWarning) {
        sentinelAlert.innerHTML = `<span>&#9888;</span> Policy review in progress`;
        sentinelAlert.style.display = 'flex';
        sentinelAlert.style.borderColor = 'var(--accent-gold)';
        sentinelAlert.style.color = 'var(--accent-gold)';
        sentinelAlert.style.background = 'color-mix(in srgb, var(--accent-gold) 15%, transparent)';
      } else {
        sentinelAlert.style.display = 'none';
      }
    }

    // Health metrics from hub data
    const trustSummary = hub.trustSummary || {};
    const activePlan = hub.activePlan || {};
    const sprints = hub.sprints || [];

    // Critical Blockers: count recent BLOCK/ESCALATE verdicts
    const blockerCount = recentVerdicts.filter(v => {
      const d = String(v.decision || v.verdict || '').toUpperCase();
      return d === 'BLOCK' || d === 'ESCALATE';
    }).length;

    if (criticalBlockersVal) {
      criticalBlockersVal.textContent = String(blockerCount);
    }
    // Update the bar fill too
    const blockerBar = document.querySelector('.health-item:first-child .health-bar-fill');
    if (blockerBar) {
      const pct = Math.min(blockerCount * 20, 100);
      blockerBar.style.width = `${pct}%`;
    }

    // Unverified Changes: derive from trust or sprint data
    const unverifiedPct = trustSummary.unverifiedPct || trustSummary.pendingPct || 0;
    if (tankFill) tankFill.style.height = `${unverifiedPct}%`;
    if (tankLabel) tankLabel.textContent = `${unverifiedPct}% Full`;

    // Error Budget Burn: from trust summary or sentinel
    const errorBudget = trustSummary.errorBudgetBurn || sentinel.errorBudget || 0;
    if (errorText) errorText.textContent = `${errorBudget}%`;
    if (arcFill) arcFill.style.opacity = errorBudget > 0 ? '1' : '0.3';

    // Policy Trend: from governance state
    const policyTrend = trustSummary.policyCompliance || trustSummary.policyTrend || 50;
    if (sliderThumb) sliderThumb.style.left = `${policyTrend}%`;
    if (sliderFill) sliderFill.style.width = `${policyTrend}%`;
    if (sliderVal) sliderVal.textContent = `${policyTrend}%`;
  }

  // ─── Render: Footer ───
  function renderFooter() {
    const connLabel = state.connection === 'connected' ? 'ONLINE' : (state.connection === 'connecting' ? 'CONNECTING' : 'OFFLINE');
    const connClass = state.connection === 'connected' ? 'good' : (state.connection === 'connecting' ? 'warn' : 'bad');

    if (footerQoreEl) {
      footerQoreEl.textContent = connLabel;
      footerQoreEl.className = connClass;
    }

    // Policy from hub
    const hub = state.hub;
    if (footerPolicyEl && hub) {
      const activePlan = hub.activePlan || {};
      const governance = activePlan.governance || {};
      const mode = governance.mode || hub.governanceMode || 'baseline';
      footerPolicyEl.textContent = mode.toUpperCase();
      footerPolicyEl.className = mode === 'incident' ? 'bad' : (mode === 'strict' ? 'warn' : 'muted');
    }

    // Latency (approximate from last fetch)
    if (footerLatencyEl && state.connection === 'connected') {
      footerLatencyEl.textContent = 'OK';
      footerLatencyEl.className = 'good';
    }
  }

  // ─── Render: Skill Modal (from real skills) ───
  function renderSkillModal() {
    const container = document.querySelector('#skill-modal .skill-list');
    if (!container || state.skills.length === 0) return;

    container.innerHTML = state.skills.slice(0, 8).map(skill => {
      const name = skill.displayName || skill.label || skill.id || 'Skill';
      const desc = skill.desc || 'Available skill';
      const cmd = `/${skill.id || skill.key || 'run'}`;
      return `<button class="skill-option" data-cmd="${escapeHtml(cmd)}">
        <span class="skill-name">${escapeHtml(name)}</span>
        <span class="skill-desc">${escapeHtml(desc)}</span>
      </button>`;
    }).join('');

    // Rebind click handlers
    container.querySelectorAll('.skill-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const cmd = opt.dataset.cmd;
        if (cmdInput) { cmdInput.value = cmd; cmdInput.focus(); }
        const skillModal = document.getElementById('skill-modal');
        if (skillModal) skillModal.style.display = 'none';
      });
    });
  }

  // ─── Console Command Handler ───

  function getSelectedModel() {
    return localStorage.getItem('zoqore-model') || '';
  }

  function buildSystemPrompt() {
    const d = state.dashboard;
    const project = d?.project || {};
    const phases = d?.phases || [];
    const currentPhase = phases.find(ph => ph.status === 'in-progress');
    const risks = d?.risks || [];
    const milestones = d?.milestones || [];

    let projectContext = '';
    if (project.name) {
      projectContext = `\nActive Project: ${project.name} (${project.state || 'unknown state'})`;
      if (currentPhase) projectContext += `\nCurrent Phase: ${currentPhase.title} (${currentPhase.progress || 0}% complete)`;
      if (milestones.length > 0) {
        const next = milestones.find(m => !m.completedAt && m.status !== 'completed');
        if (next) projectContext += `\nNext Milestone: ${next.title || next.name}`;
      }
      if (risks.length > 0) {
        const highRisks = risks.filter(r => r.level === 'high' || r.level === 'critical');
        if (highRisks.length > 0) projectContext += `\nActive Risks: ${highRisks.length} high/critical`;
      }
    }

    return [
      'You are a concise project assistant on a mobile device.',
      'Keep responses SHORT — 2-3 sentences max unless the user asks for detail.',
      'Use plain text, avoid markdown headers. Bullet points are OK for lists.',
      'Never repeat the question back. Get straight to the answer.',
      projectContext,
    ].filter(Boolean).join('\n');
  }

  function saveChatHistory() {
    const trimmed = state.chatHistory.slice(-20);
    state.chatHistory = trimmed;
    localStorage.setItem('zoqore-chat-history', JSON.stringify(trimmed));
  }

  function buildInputWithContext(userMessage) {
    const systemPrompt = buildSystemPrompt();
    const historyLines = state.chatHistory.map(m =>
      m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`
    );

    const parts = [`[System]\n${systemPrompt}`];
    if (historyLines.length > 0) {
      parts.push(`[Conversation History]\n${historyLines.join('\n')}`);
    }
    parts.push(`[Current Message]\n${userMessage}`);
    return parts.join('\n\n');
  }

  function constructPromptPackage(intent) {
    return buildInputWithContext(intent);
  }

  // Poll a Zo ask job until it completes or times out
  async function pollZoJob(jobId, maxWaitMs = 120000) {
    const pollUrl = `/api/zo/ask/status/${jobId}`;
    const interval = 2000;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      const res = await fetch(pollUrl);
      if (!res.ok) throw new Error(`Poll error: ${res.status}`);
      const data = await res.json();
      if (data.status === 'done') return data.result;
      if (data.status === 'error') throw new Error(data.error || 'Zo API error');
    }
    throw new Error('Response timed out — try again');
  }

  // Extract a readable reply from the Zo API response object
  function extractReply(zoData) {
    if (!zoData) return '(empty response)';
    if (typeof zoData.output === 'string') return zoData.output;
    if (zoData.choices && zoData.choices[0]?.message?.content) return zoData.choices[0].message.content;
    if (zoData.result?.content) return zoData.result.content;
    if (typeof zoData.result === 'string') return zoData.result;
    return JSON.stringify(zoData, null, 2);
  }

  async function handleCommand() {
    const input = String(cmdInput.value || '').trim();
    if (!input || state.isProcessing) return;
    cmdInput.value = '';
    state.isProcessing = true;
    sendBtn.disabled = true;
    if (debugLight) debugLight.classList.add('on');
    appendLog('User', input);

    state.chatHistory.push({ role: 'user', content: input });
    saveChatHistory();

    try {
      const promptPackage = constructPromptPackage(input);
      appendLog('System', 'Verifying policy compliance...', 'info');

      const evalPayload = {
        requestId: `mob-${Date.now()}`,
        actorId: 'did:myth:mobile:operator',
        action: 'read',
        targetPath: 'repo://mobile/console',
        content: promptPackage
      };

      const evalRes = await fetch(CONFIG.apiEval, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evalPayload)
      });

      if (!evalRes.ok) throw new Error(`Governance API error: ${evalRes.status}`);
      const evalData = await evalRes.json();
      const decision = evalData.decision || 'UNKNOWN';

      if (decision === 'DENY' || decision === 'ESCALATE') {
        appendLog('System', `Governance Blocked: ${decision}`, 'error');
        if (evalData.reasons) appendLog('System', evalData.reasons.join(', '), 'error');
        return;
      }

      appendLog('System', 'Uplink established. Transmitting...', 'success');

      const requestBody = { prompt: promptPackage };
      const model = getSelectedModel();
      if (model) requestBody.model_name = model;

      const submitRes = await fetch(CONFIG.apiAsk, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!submitRes.ok) throw new Error(`Agent API error: ${submitRes.status}`);
      const submitData = await submitRes.json();

      let reply = '';
      if (submitData.jobId) {
        appendLog('System', 'Processing...', 'info');
        const zoData = await pollZoJob(submitData.jobId);
        reply = extractReply(zoData);
      } else {
        reply = extractReply(submitData);
      }

      appendLog('Agent', reply);
      state.chatHistory.push({ role: 'assistant', content: reply });
      saveChatHistory();

    } catch (err) {
      appendLog('System', `Execution Error: ${err.message}`, 'error');
    } finally {
      state.isProcessing = false;
      sendBtn.disabled = false;
      if (debugLight) debugLight.classList.remove('on');
      cmdInput.focus();
    }
  }

  // ─── Voice Input (Web Speech API) ───
  const voiceBtn = document.getElementById('voice-input-btn');
  let speechRecognition = null;

  if (voiceBtn && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    voiceBtn.addEventListener('click', () => {
      if (speechRecognition) {
        // Already recording — stop
        speechRecognition.stop();
        return;
      }
      speechRecognition = new SpeechRecognition();
      speechRecognition.lang = 'en-US';
      speechRecognition.interimResults = false;
      speechRecognition.maxAlternatives = 1;

      voiceBtn.classList.add('voice-active');
      appendLog('System', 'Listening...', 'info');

      speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (cmdInput) cmdInput.value = transcript;
        appendLog('System', 'Voice captured. Press send or tap mic again.', 'success');
      };
      speechRecognition.onerror = (event) => {
        appendLog('System', `Voice error: ${event.error}`, 'error');
      };
      speechRecognition.onend = () => {
        voiceBtn.classList.remove('voice-active');
        speechRecognition = null;
      };
      speechRecognition.start();
    });
  } else if (voiceBtn) {
    // Speech API not available — hide the button
    voiceBtn.style.display = 'none';
  }

  // ─── Event Listeners ───
  if (sendBtn) sendBtn.addEventListener('click', handleCommand);
  if (cmdInput) cmdInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleCommand(); });

  // Footer refresh
  if (footerRefreshBtn) {
    footerRefreshBtn.addEventListener('click', () => {
      fetchHub();
      fetchDashboard();
    });
  }

  // ─── Brainstorm: Void Swirl Animation ───
  const voidCanvas = document.getElementById('brainstorm-void-canvas');
  let voidAnimId = null;

  function initVoidSwirl() {
    if (!voidCanvas) return;
    const ctx = voidCanvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 60;

    function resize() {
      voidCanvas.width = voidCanvas.offsetWidth * (window.devicePixelRatio || 1);
      voidCanvas.height = voidCanvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
    resize();
    window.addEventListener('resize', resize);

    const W = () => voidCanvas.offsetWidth;
    const H = () => voidCanvas.offsetHeight;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 30 + Math.random() * Math.min(W(), H()) * 0.35,
        speed: 0.002 + Math.random() * 0.004,
        size: 1 + Math.random() * 2,
        alpha: 0.1 + Math.random() * 0.3,
        drift: (Math.random() - 0.5) * 0.3,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W(), H());
      const cx = W() / 2;
      const cy = H() / 2.2;

      for (const p of particles) {
        p.angle += p.speed;
        p.radius += p.drift * 0.1;
        if (p.radius < 20) p.drift = Math.abs(p.drift);
        if (p.radius > Math.min(W(), H()) * 0.45) p.drift = -Math.abs(p.drift);

        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius * 0.6;

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`;
        ctx.fill();
      }

      voidAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  // Start swirl when brainstorm tab is visible
  const observer = new MutationObserver(() => {
    const brainstormTab = document.getElementById('tab-brainstorm');
    if (brainstormTab && brainstormTab.classList.contains('active')) {
      if (!voidAnimId) initVoidSwirl();
    } else {
      if (voidAnimId) { cancelAnimationFrame(voidAnimId); voidAnimId = null; }
    }
  });
  const brainstormTabEl = document.getElementById('tab-brainstorm');
  if (brainstormTabEl) {
    observer.observe(brainstormTabEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ─── Brainstorm: Recording Logic ───
  const recordBtn = document.getElementById('brainstorm-record-btn');
  const sendBtnBs = document.getElementById('brainstorm-send-btn');
  const bsOrb = document.getElementById('brainstorm-orb');
  const bsStatusText = document.getElementById('brainstorm-status-text');
  const bsTimer = document.getElementById('brainstorm-timer');
  const artifactListEl = document.getElementById('artifact-list');

  let mediaRecorder = null;
  let audioChunks = [];
  let recordingBlob = null;
  let recordingStartTime = null;
  let timerInterval = null;
  let artifacts = JSON.parse(localStorage.getItem('zoqore-brainstorm-artifacts') || '[]');

  function formatTimer(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function setRecordingState(recording) {
    if (recording) {
      recordBtn.classList.add('recording');
      recordBtn.querySelector('span').textContent = 'Stop';
      bsOrb.className = 'brainstorm-orb recording';
      bsStatusText.textContent = 'Recording';
      bsTimer.classList.add('active');
      sendBtnBs.disabled = true;
    } else {
      recordBtn.classList.remove('recording');
      recordBtn.querySelector('span').textContent = 'Record';
      bsOrb.className = 'brainstorm-orb' + (recordingBlob ? ' complete' : '');
      bsStatusText.textContent = recordingBlob ? 'Ready to Send' : 'Ready';
      bsTimer.classList.remove('active');
      sendBtnBs.disabled = !recordingBlob;
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        recordingBlob = new Blob(audioChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerInterval);
        setRecordingState(false);
      };

      mediaRecorder.start(250);
      recordingStartTime = Date.now();
      timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        if (bsTimer) bsTimer.textContent = formatTimer(elapsed);
      }, 500);

      setRecordingState(true);
    } catch (err) {
      console.error('[Brainstorm] Mic access denied:', err);
      if (bsStatusText) bsStatusText.textContent = 'Mic Access Denied';
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  async function sendRecording() {
    if (!recordingBlob) return;
    sendBtnBs.disabled = true;
    bsStatusText.textContent = 'Uploading...';
    bsOrb.className = 'brainstorm-orb';

    const timestamp = new Date().toISOString();
    const filename = `brainstorm-${Date.now()}.webm`;

    try {
      const formData = new FormData();
      formData.append('file', recordingBlob, filename);
      formData.append('type', 'voice-note');
      formData.append('source', 'mobile-brainstorm');
      formData.append('timestamp', timestamp);

      const res = await fetch('/api/projects/artifacts', {
        method: 'POST',
        body: formData,
      });

      // Also send to constellation ingest so the recording is
      // interpreted and incorporated into the mind map
      const ingestFd = new FormData();
      ingestFd.append('audio', recordingBlob, filename);
      ingestFd.append('projectId', currentProject || 'default');
      ingestFd.append('target', 'constellation');
      fetch('/api/projects/brainstorm/ingest', { method: 'POST', body: ingestFd })
        .catch(err => console.warn('[Brainstorm] constellation ingest:', err));

      const artifact = {
        name: filename,
        duration: bsTimer.textContent,
        timestamp,
        status: res.ok ? 'sent' : 'pending',
      };

      artifacts.unshift(artifact);
      if (artifacts.length > 20) artifacts = artifacts.slice(0, 20);
      localStorage.setItem('zoqore-brainstorm-artifacts', JSON.stringify(artifacts));

      bsStatusText.textContent = res.ok ? 'Sent' : 'Upload Failed — Saved Locally';
      bsOrb.className = res.ok ? 'brainstorm-orb complete' : 'brainstorm-orb';

      renderArtifacts();
    } catch (err) {
      console.error('[Brainstorm] upload error:', err);
      // Save locally even if upload fails
      const artifact = { name: filename, duration: bsTimer.textContent, timestamp, status: 'pending' };
      artifacts.unshift(artifact);
      localStorage.setItem('zoqore-brainstorm-artifacts', JSON.stringify(artifacts));
      bsStatusText.textContent = 'Offline — Saved Locally';
      renderArtifacts();
    } finally {
      recordingBlob = null;
      bsTimer.textContent = '00:00';
      setTimeout(() => {
        sendBtnBs.disabled = true;
        if (bsStatusText.textContent.startsWith('Sent')) {
          bsStatusText.textContent = 'Ready';
          bsOrb.className = 'brainstorm-orb';
        }
      }, 2000);
    }
  }

  if (sendBtnBs) {
    sendBtnBs.addEventListener('click', sendRecording);
  }

  function renderArtifacts() {
    if (!artifactListEl) return;
    if (artifacts.length === 0) {
      artifactListEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.15); font-size:0.7rem; padding:12px;">No recordings yet</div>';
      return;
    }
    artifactListEl.innerHTML = artifacts.map(a => {
      const date = new Date(a.timestamp);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `<div class="artifact-item">
        <div>
          <div class="artifact-name">${escapeHtml(a.duration || '00:00')} — ${dateStr}</div>
          <div class="artifact-meta">${timeStr}</div>
        </div>
        <span class="artifact-status ${a.status}">${a.status}</span>
      </div>`;
    }).join('');
  }

  // Initial render of saved artifacts
  renderArtifacts();

  // ─── Initialize ───
  connectWebSocket();
  fetchHub();
  fetchDashboard();
  fetchSkills();

  // Periodic polling as fallback
  state.pollTimer = setInterval(() => {
    fetchHub();
    fetchDashboard();
  }, CONFIG.pollInterval);
});
