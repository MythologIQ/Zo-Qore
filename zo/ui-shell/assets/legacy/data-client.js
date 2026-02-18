export class DataClient {
  constructor(options) {
    this.onHub = options.onHub;
    this.onSkills = options.onSkills;
    this.onEvent = options.onEvent;
    this.onConnection = options.onConnection;
    this.onError = options.onError;
    this.onSkillRelevance = options.onSkillRelevance;
    this.onProjects = options.onProjects;
    this.onConstellation = options.onConstellation;
    this.onPath = options.onPath;
    this.onRisk = options.onRisk;
    this.onAutonomy = options.onAutonomy;
    this.onGenesis = options.onGenesis;
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  start() {
    try { this.connect(); } catch (err) { console.warn('[DataClient] WebSocket connect failed:', err); this.onConnection('disconnected'); }
    this.fetchHub();
    this.fetchSkills();
    this.fetchProjects();
    this.fetchDashboard();
  }

  connect() {
    this.onConnection('connecting');
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${wsProto}//${window.location.host}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.onConnection('connected');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'init' && data.payload) {
        this.onHub(data.payload);
        return;
      }
      if (data.type === 'hub.refresh') {
        this.fetchHub();
        return;
      }
      if (data.type === 'event' || data.type === 'verdict') {
        this.onEvent({
          time: new Date().toLocaleTimeString(),
          type: data.type,
          payload: data.payload || {}
        });
      }
      if (data.type === 'event' && (data.payload?.planEvent || data.payload?.sprintEvent)) {
        this.fetchHub();
      }
      if (data.type === 'genesis' && data.payload) {
        this.onGenesis?.(data.payload);
        window.dispatchEvent(new CustomEvent('genesis:event', { detail: data.payload }));
      }
    };

    this.ws.onerror = () => this.onConnection('disconnected');
    this.ws.onclose = () => {
      this.onConnection('disconnected');
      this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30000, 1000 * (2 ** (this.reconnectAttempts - 1))) + Math.floor(Math.random() * 350);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async fetchHub() {
    try {
      const res = await fetch('/api/hub');
      if (!res.ok) throw new Error(`Hub request failed (${res.status})`);
      const payload = await res.json();
      this.onHub(payload);
    } catch (error) {
      this.onError('Unable to load hub data.', () => this.fetchHub());
      console.error(error);
    }
  }

  normalizeSkill(skill) {
    const id = String(skill.id || skill.key || '').trim();
    const displayName = String(skill.displayName || skill.label || id || 'Unknown Skill').trim();
    const normalized = {
      id,
      displayName,
      localName: String(skill.localName || '').trim(),
      key: id,
      label: displayName,
      desc: String(skill.desc || 'Installed skill').trim(),
      creator: String(skill.creator || skill.publisher || 'Unknown').trim(),
      sourceRepo: String(skill.sourceRepo || 'unknown').trim(),
      sourcePath: String(skill.sourcePath || 'unknown').trim(),
      versionPin: String(skill.versionPin || 'unversioned').trim(),
      trustTier: String(skill.trustTier || 'conditional').trim(),
      sourceType: String(skill.sourceType || 'unknown').trim(),
      sourcePriority: Number(skill.sourcePriority || 99),
      admissionState: String(skill.admissionState || 'conditional').trim(),
      requiredPermissions: Array.isArray(skill.requiredPermissions) ? skill.requiredPermissions : []
    };

    return this.enhanceSkillDescription(normalized);
  }

  enhanceSkillDescription(skill) {
    const dictionary = {
      'marketplace-plugin-ops': 'Manages the lifecycle of marketplace plugins, including catalog parsing, installation, and bridging to the UI.',
      'cx-ux-flow-audit': 'Audits the user experience flow for consistency, accessibility, and performance bottlenecks.',
      'elevenlabs-audio-generate-music': 'Controls background ambient audio and soundscapes for the immersive workspace environment.',
      'failsafe-core': 'Core governance and operational logic for the FailSafe system.',
      // Add more known skills here
    };

    if (dictionary[skill.id] && (skill.desc === 'Installed skill' || skill.desc.length < 20)) {
      skill.desc = dictionary[skill.id];
    }
    return skill;
  }

  async fetchSkills() {
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(`Skill request failed (${res.status})`);
      const payload = await res.json();
      const skills = Array.isArray(payload?.skills) ? payload.skills : [];
      const normalized = skills
        .map((skill) => this.normalizeSkill(skill))
        .filter((skill) => skill.key);
      this.onSkills(normalized);
    } catch (error) {
      this.onSkills([]);
      console.error(error);
    }
  }

  async autoIngestSkills() {
    const res = await fetch('/api/skills/ingest/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`Auto ingest failed (${res.status})`);
    }
    const payload = await res.json();
    if (Array.isArray(payload?.skills)) {
      this.onSkills(payload.skills.map((skill) => this.normalizeSkill(skill)).filter((skill) => skill.key));
    }
    return payload;
  }

  async manualIngestFromFileList(fileList, mode) {
    const items = await this.serializeFileList(fileList, mode);
    if (items.length === 0) {
      throw new Error('No files selected for manual ingest.');
    }
    const res = await fetch('/api/skills/ingest/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, items })
    });
    if (!res.ok) {
      throw new Error(`Manual ingest failed (${res.status})`);
    }
    const payload = await res.json();
    if (Array.isArray(payload?.skills)) {
      this.onSkills(payload.skills.map((skill) => this.normalizeSkill(skill)).filter((skill) => skill.key));
    }
    return payload;
  }

  async serializeFileList(fileList, mode) {
    const files = Array.from(fileList || []);
    const filtered = files.filter((file) => {
      const rel = String(file.webkitRelativePath || file.name || '').toLowerCase();
      return rel.endsWith('skill.md') || rel.endsWith('.yml') || rel.endsWith('.yaml') || rel.endsWith('.md');
    });
    const readers = filtered.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const relativePath = mode === 'folder'
          ? (file.webkitRelativePath || file.name)
          : file.name;
        resolve({
          path: relativePath,
          content: String(reader.result || '')
        });
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    }));
    return Promise.all(readers);
  }

  async fetchSkillRelevance(phase) {
    if (!phase) return;
    try {
      const res = await fetch(`/api/skills/relevance?phase=${encodeURIComponent(phase)}`);
      if (!res.ok) throw new Error(`Relevance request failed (${res.status})`);
      const payload = await res.json();
      const normalizeList = (list) => {
        if (!Array.isArray(list)) return [];
        return list
          .map((item) => ({
            ...this.normalizeSkill(item),
            score: Number(item.score || 0),
            reasons: Array.isArray(item.reasons) ? item.reasons.map((reason) => String(reason)) : [],
          }))
          .filter((item) => item.key);
      };
      this.onSkillRelevance?.({
        phase: String(payload.phase || phase),
        recommended: normalizeList(payload.recommended),
        allRelevant: normalizeList(payload.allRelevant),
        otherAvailable: normalizeList(payload.otherAvailable),
      });
    } catch (error) {
      console.error(error);
    }
  }

  async fetchModels() {
    try {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error(`Models request failed (${res.status})`);
      const payload = await res.json();
      return Array.isArray(payload?.models) ? payload.models : [];
    } catch (error) {
      console.error('[DataClient] fetchModels:', error);
      return [];
    }
  }

  async fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`Projects request failed (${res.status})`);
      const payload = await res.json();
      this.onProjects?.(payload);
    } catch (error) {
      console.error('[DataClient] fetchProjects:', error);
    }
  }

  async renameProject(projectId, name) {
    const res = await fetch('/api/projects/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name })
    });
    if (!res.ok) throw new Error(`Rename failed (${res.status})`);
    await this.fetchProjects();
    return res.json();
  }

  async removeProject(projectId) {
    const res = await fetch('/api/projects/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    if (!res.ok) throw new Error(`Remove failed (${res.status})`);
    await this.fetchProjects();
    return res.json();
  }

  async fetchDashboard() {
    try {
      const res = await fetch('/api/projects/dashboard');
      if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
      const payload = await res.json();
      this.onProjects?.(payload);
      return payload;
    } catch (error) {
      console.error('[DataClient] fetchDashboard:', error);
    }
  }

  async unlinkSubProject(projectId) {
    const res = await fetch('/api/projects/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    if (!res.ok) throw new Error(`Unlink failed (${res.status})`);
    await this.fetchProjects();
    return res.json();
  }

  async setProjectFolder(projectId, folderPath) {
    const res = await fetch('/api/projects/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, folderPath })
    });
    if (!res.ok) throw new Error(`Set folder failed (${res.status})`);
    await this.fetchProjects();
    return res.json();
  }

  async createProject(name, folderPath, parentId) {
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folderPath, parentId: parentId || null })
    });
    if (!res.ok) throw new Error(`Create project failed (${res.status})`);
    await this.fetchProjects();
    return res.json();
  }

  async switchProject(projectId) {
    const res = await fetch('/api/projects/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    if (!res.ok) throw new Error(`Switch project failed (${res.status})`);
    const payload = await res.json();
    this.onProjects?.(payload);
    return payload;
  }

  async fetchProjectFolders() {
    try {
      const res = await fetch('/api/projects/folders');
      if (!res.ok) throw new Error(`Folders request failed (${res.status})`);
      const payload = await res.json();
      return Array.isArray(payload?.folders) ? payload.folders : [];
    } catch (error) {
      console.error('[DataClient] fetchProjectFolders:', error);
      return [];
    }
  }

  async fetchConstellation(projectId) {
    try {
      const res = await fetch(`/api/constellation/${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Constellation request failed (${res.status})`);
      const payload = await res.json();
      this.onConstellation?.(payload);
      return payload;
    } catch (error) {
      console.error('[DataClient] fetchConstellation:', error);
    }
  }

  async fetchPath(projectId) {
    try {
      const res = await fetch(`/api/path/${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Path request failed (${res.status})`);
      const payload = await res.json();
      this.onPath?.(payload);
      return payload;
    } catch (error) {
      console.error('[DataClient] fetchPath:', error);
    }
  }

  async fetchRisk(projectId) {
    try {
      const res = await fetch(`/api/risk/${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error(`Risk request failed (${res.status})`);
      const payload = await res.json();
      this.onRisk?.(payload);
      return payload;
    } catch (error) {
      console.error('[DataClient] fetchRisk:', error);
    }
  }

  async fetchAutonomyReadiness(projectId) {
    try {
      const res = await fetch(`/api/autonomy/${encodeURIComponent(projectId)}/readiness`);
      if (!res.ok) throw new Error(`Autonomy readiness request failed (${res.status})`);
      const payload = await res.json();
      this.onAutonomy?.(payload);
      return payload;
    } catch (error) {
      console.error('[DataClient] fetchAutonomyReadiness:', error);
    }
  }

  async postAction(endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`Action failed (${res.status})`);
    }
    await this.fetchHub();
  }
}
