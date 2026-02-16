class MobileClient {
  constructor() {
    this.hub = {
      activePlan: null,
      sentinelStatus: null,
      l3Queue: [],
      recentVerdicts: [],
      qoreRuntime: null,
    };
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;

    this.elements = {
      sprintTitle: document.querySelector('.sprint-title'),
      sprintProgress: document.querySelector('.progress-bar'),
      sprintProgressContainer: document.querySelector('.progress-bar-container'),
      sprintPercent: document.querySelector('.sprint-percent'),
      sprintDue: document.querySelector('.sprint-due'),
      milestoneList: document.querySelector('.milestone-list'),
      deploymentStages: document.querySelector('.deployment-stages'),
      consoleOutput: document.querySelector('.console-output'),
      sentinelStatusLabel: document.querySelector('.sentinel-status-container .status-label'),
      sentinelOrb: document.querySelector('.sentinel-status-container .big-orb'),
      sentinelDetail: document.querySelector('.sentinel-status-container .status-detail'),
      verdictLoadBar: document.getElementById('verdict-load-bar'),
      policyList: document.querySelector('.policy-list'),
      debugLed: document.querySelector('.led'),
    };

    this.connect();
    this.fetchHub();
  }

  connect() {
    // Mobile doesn't have a status line, so we might just log or show a toast
    // this.setStatus('Connecting...');
    this.ws = new WebSocket(`ws://${window.location.host}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    this.ws.onclose = () => {
      this.updateConnectionStatus(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.updateConnectionStatus(false);
    };
  }

  updateConnectionStatus(connected) {
    if (this.elements.debugLed) {
      this.elements.debugLed.classList.toggle('on', connected);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * (2 ** (this.reconnectAttempts - 1))) + Math.floor(Math.random() * 400);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleMessage(data) {
    if (data.type === 'init' && data.payload) {
      this.hub = data.payload;
      this.render();
      return;
    }
    if (data.type === 'hub.refresh' || data.type === 'event' || data.type === 'verdict') {
      if (data.type === 'event' && data.payload) {
        this.logConsoleEvent(data.payload);
      }
      this.fetchHub();
    }
  }

  async fetchHub() {
    try {
      const res = await fetch('/api/hub');
      if (!res.ok) throw new Error(`Hub request failed (${res.status})`);
      this.hub = await res.json();
      this.render();
    } catch (err) {
      console.error('Failed to fetch hub data', err);
    }
  }

  render() {
    const plan = this.hub.activePlan || { phases: [], blockers: [], milestones: [], risks: [] };
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const milestones = (plan.milestones || []);
    
    this.renderStrategy(phases, milestones, plan);
    this.renderConsole(this.hub.sentinelStatus || {});
    this.renderMonitor(this.hub.sentinelStatus || {}, this.hub.recentVerdicts || []);
  }

  renderStrategy(phases, milestones, plan) {
    // Active Phase/Sprint
    const activePhase = phases.find(p => p.id === plan.currentPhaseId) || phases.find(p => p.status === 'active') || phases[0];
    
    if (this.elements.sprintTitle) {
      this.elements.sprintTitle.textContent = activePhase ? activePhase.title : 'No Active Plan';
    }

    if (activePhase && this.elements.sprintProgress) {
        // Calculate progress based on artifacts or default to 0
        const total = activePhase.artifacts ? activePhase.artifacts.length : 0;
        const done = activePhase.artifacts ? activePhase.artifacts.filter(a => a.touched).length : 0; // simplistic metric
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        
        this.elements.sprintProgress.style.width = `${percent}%`;
        if (this.elements.sprintPercent) this.elements.sprintPercent.textContent = `${percent}% Complete`;
    }

    // Milestones
    if (this.elements.milestoneList) {
        const sorted = milestones.sort((a, b) => new Date(a.targetDate || 0) - new Date(b.targetDate || 0));
        const html = sorted.slice(0, 5).map(m => {
            const statusClass = m.completedAt ? 'future' : (m.targetDate ? 'active' : 'queued'); // using future style for completed for now to dim it
            const icon = m.completedAt 
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>`;
            
            return `
                <div class="milestone-item ${statusClass}">
                    <div class="milestone-icon">${icon}</div>
                    <div class="milestone-info">
                        <div style="font-weight:600; font-size:0.85rem;">${this.escapeHtml(m.title)}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${m.targetDate ? new Date(m.targetDate).toLocaleDateString() : 'Planned'}</div>
                    </div>
                </div>
            `;
        }).join('');
        this.elements.milestoneList.innerHTML = html || '<div style="padding:10px; color:#888;">No milestones defined.</div>';
    }
  }

  renderConsole(sentinelStatus) {
      // Deployment Stages (Progress bar visual)
      // This maps roughly to the Plan -> Audit -> Implement -> Substantiate flow
      if (this.elements.deploymentStages) {
          // Simplification: we just highlight based on active phase index
          // We'd need to know the index of the active phase.
          // For now, let's assume standard 4-step if possible, or just mark all if complete.
      }
  }

  logConsoleEvent(payload) {
      if (!this.elements.consoleOutput) return;
      const div = document.createElement('div');
      div.className = 'log-entry';
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      // Simple formatting
      const prefix = payload.source ? `<span class="log-agent">[${this.escapeHtml(payload.source)}]</span> ` : `<span class="log-sys">[System]</span> `;
      div.innerHTML = `<span class="log-ts">[${timestamp}]</span> ${prefix}${this.escapeHtml(payload.message || JSON.stringify(payload))}`;
      this.elements.consoleOutput.appendChild(div);
      this.elements.consoleOutput.scrollTop = this.elements.consoleOutput.scrollHeight;
  }

  renderMonitor(status, verdicts) {
    const isRunning = status.running;
    const verdict = status.lastVerdict?.decision || 'PASS';
    
    let label = isRunning ? 'Active' : 'Offline';
    let detail = 'System operational';
    let orbClass = 'big-orb';

    if (verdict === 'WARN') {
        label = 'Warning';
        detail = 'Policy warnings detected';
        orbClass += ' warning'; // Need CSS for this if not exists, or reuse existing classes
    } else if (['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(verdict)) {
        label = 'Alert';
        detail = 'Blocking issues detected';
        orbClass += ' error'; // Need CSS
    } else if (isRunning) {
        orbClass += ' pulse'; // animate
    }

    if (this.elements.sentinelStatusLabel) this.elements.sentinelStatusLabel.textContent = `Status: ${label.toUpperCase()}`;
    if (this.elements.sentinelDetail) this.elements.sentinelDetail.textContent = detail;
    
    // Verdict Load
    // We can calculate a load % based on recent verdict frequency or volume
    if (this.elements.verdictLoadBar) {
        // Mocking 'load' based on recent verdict count for now as a real metric
        const recentCount = verdicts.length;
        const load = Math.min(100, recentCount * 10); 
        this.elements.verdictLoadBar.style.height = `${load}%`;
    }
  }

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MobileClient();
  
  // Tab logic remains valid
  const tabs = document.querySelectorAll('.tab-content');
  const navItems = document.querySelectorAll('.nav-item');

  window.switchTab = function(targetId) {
    tabs.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    const targetTab = document.getElementById(targetId);
    if (targetTab) {
        targetTab.style.display = 'block';
        // force reflow
        void targetTab.offsetWidth;
        targetTab.classList.add('active');
    }
    navItems.forEach(item => {
        if (item.dataset.target === targetId) {
            item.classList.add('active');
            const icon = item.querySelector('.icon svg');
            if(icon) icon.style.stroke = 'var(--accent-cyan)';
        } else {
            item.classList.remove('active');
            const icon = item.querySelector('.icon svg');
            if(icon) icon.style.stroke = 'currentColor';
        }
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const btn = e.target.closest('.nav-item');
        const targetId = btn.dataset.target;
        switchTab(targetId);
    });
  });
  
  switchTab('tab-strategy');
});
