import { escapeHtml } from './utils.js';

const TEMPLATE_DECKS = {
  planning: {
    label: 'Planning',
    defaults: {
      persona: 'systems',
      context:
        'Define goals, constraints, assumptions, and phased milestones. Prefer deterministic checkpoints with clear validation and rollback notes.',
    },
  },
  fast: {
    label: 'Fast Action',
    defaults: {
      persona: 'systems',
      context:
        'Prioritize speed with safe defaults. Keep changes minimal and verifiable. Return concise output with direct next steps.',
    },
  },
  analysis: {
    label: 'Deep Analysis',
    defaults: {
      persona: 'security',
      context:
        'Prioritize evidence, risk ranking, assumptions, and alternatives. Include explicit validation and residual risk.',
    },
  },
  build: {
    label: 'Build + Verify',
    defaults: {
      persona: 'product',
      context:
        'Implement complete functionality first, then verify with tests, lint, and build checks. Document rollback path.',
    },
  },
  migration: {
    label: 'Migration / Refactor',
    defaults: {
      persona: 'performance',
      context:
        'Preserve behavior while reducing risk. Stage migration plan, compatibility checks, and phased verification.',
    },
  },
};

const VENDOR_PRACTICES = {
  'zo-fast-1': [
    'Lead with precise objective, constraints, and expected output format.',
    'Use explicit acceptance criteria and keep context concise.',
    'Request deterministic, ordered steps with concrete verification commands.',
  ],
  'zo-reasoning-1': [
    'Provide full problem framing, dependencies, and non-obvious constraints.',
    'Ask for risk tradeoff analysis before implementation details.',
    'Require checkpointed plan with validation and rollback evidence.',
  ],
};

const PHASE_TO_NUMBER = {
  plan: 1,
  implement: 2,
  verify: 3,
  governance: 4,
  run: 5,
};

export class IntentAssistant {
  constructor(options) {
    this.elements = options.elements;
    this.getPhase = options.getPhase;
    this.getSelectedSkill = options.getSelectedSkill;
    this.getFallbackSkill = options.getFallbackSkill;
    this.latestPromptText = '';
    this.chatTurns = [];
    this.storageKey = 'zoqore.intent.session.v1';
    this.defaultPromptText = '';
    this.defaultChatText = String(this.elements.chatOutput?.textContent || 'Assistant responses appear here after send.');
    this.isLoadingSession = false;
    this.sessionMeta = this.startSession();

    this.elements.generate?.addEventListener('click', () => this.generate());
    this.elements.copy?.addEventListener('click', () => this.copy());
    this.elements.send?.addEventListener('click', () => this.send());
    this.elements.output?.addEventListener('input', () => this.updateSendState());
    this.elements.template?.addEventListener('change', () => {
      this.applyTemplateDefaults();
      this.resetFlowForInputInteraction();
    });
    this.elements.input?.addEventListener('input', () => this.resetFlowForInputInteraction());
    this.elements.contextInput?.addEventListener('input', () => this.resetFlowForInputInteraction());
    this.elements.persona?.addEventListener('change', () => this.resetFlowForInputInteraction());
    this.elements.modelMode?.addEventListener('change', () => this.resetFlowForInputInteraction());
    this.elements.skillSelect?.addEventListener('change', () => this.resetFlowForInputInteraction());
    this.elements.chatLogsButton?.addEventListener('click', () => this.openChatLogs());
    this.elements.chatLogClose?.addEventListener('click', () => this.closeChatLogs());
    this.elements.chatLogModal?.addEventListener('click', (event) => {
      if (event.target === this.elements.chatLogModal) this.closeChatLogs();
    });
    this.elements.sessionChatNew?.addEventListener('click', () => this.createNewSession(true));
    this.elements.sessionChatMemory?.addEventListener('change', () => {
      const next = String(this.elements.sessionChatMemory?.value || '').trim();
      if (!next) return;
      this.loadSessionFromMemory(next);
    });

    this.applyTemplateDefaults(true);
    this.setFlowState('pipeline', 'pending');
    this.setFlowState('package', 'idle');
    this.setFlowState('chat', 'idle');
    this.renderSessionMeta();
    this.renderSessionMemoryOptions();
    this.renderChatOutputs();
    this.renderPromptStaging(this.defaultPromptText);
    this.updateSendState();
  }

  getStorage() {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
    return {
      getItem() {
        return null;
      },
      setItem() {},
    };
  }

  loadSessionStore() {
    const storage = this.getStorage();
    try {
      const raw = storage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && parsed.projects && typeof parsed.projects === 'object') {
        return parsed;
      }
    } catch {}
    return { projects: {} };
  }

  saveSessionStore(store) {
    const storage = this.getStorage();
    try {
      storage.setItem(this.storageKey, JSON.stringify(store));
    } catch {}
  }

  resolveProjectId() {
    const storage = this.getStorage();
    const raw = String(storage.getItem('zoqore.project.id') || 'project01').trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9_-]/g, '');
    return clean || 'project01';
  }

  resolvePhaseNumber() {
    const phaseKey = String(this.getPhase?.()?.key || 'plan').toLowerCase();
    return PHASE_TO_NUMBER[phaseKey] || 1;
  }

  startSession() {
    const store = this.loadSessionStore();
    const projectId = this.resolveProjectId();
    const existing = store.projects[projectId] || { sessions: {} };
    const startingPhase = Number(existing.lastPhaseNumber || this.resolvePhaseNumber() || 1);
    const increment = Number(existing.nextIncrement || 1);
    const chatId = `${projectId}-phase${startingPhase}-chat${increment}`;
    const now = new Date().toISOString();

    store.projects[projectId] = {
      ...existing,
      nextIncrement: increment + 1,
      lastPhaseNumber: Number(existing.lastPhaseNumber || startingPhase),
      sessions: {
        ...(existing.sessions || {}),
        [chatId]: {
          chatId,
          projectId,
          startingPhase,
          increment,
          createdAt: now,
          updatedAt: now,
          promptText: '',
          chatTurns: [],
          form: {
            intent: '',
            context: '',
            template: String(this.elements.template?.value || 'fast'),
            persona: String(this.elements.persona?.value || 'systems'),
            modelMode: String(this.elements.modelMode?.value || 'auto'),
            skillKey: String(this.elements.skillSelect?.value || ''),
          },
        },
      },
    };
    this.saveSessionStore(store);

    return { projectId, startingPhase, increment, chatId };
  }

  markSessionProgress() {
    const store = this.loadSessionStore();
    const projectId = this.sessionMeta.projectId;
    const current = store.projects[projectId] || { sessions: {} };
    store.projects[projectId] = {
      ...current,
      nextIncrement: Number(current.nextIncrement || this.sessionMeta.increment + 1),
      lastPhaseNumber: this.resolvePhaseNumber(),
      sessions: current.sessions || {},
    };
    this.saveSessionStore(store);
  }

  renderSessionMeta() {
    const text = this.sessionMeta?.chatId || 'pending';
    if (this.elements.chatId) this.elements.chatId.textContent = text;
    if (this.elements.sessionChatId) this.elements.sessionChatId.textContent = text;
  }

  renderSessionMemoryOptions() {
    const select = this.elements.sessionChatMemory;
    if (!select) return;
    const store = this.loadSessionStore();
    const projectId = this.resolveProjectId();
    const project = store.projects[projectId] || {};
    const sessions = Object.values(project.sessions || {});
    sessions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    const options = ['<option value="">Zo Memory</option>'];
    for (const item of sessions) {
      const label = `${item.chatId}${item.updatedAt ? ` (${String(item.updatedAt).slice(0, 16).replace('T', ' ')})` : ''}`;
      options.push(`<option value="${escapeHtml(item.chatId)}">${escapeHtml(label)}</option>`);
    }
    select.innerHTML = options.join('');
    if (this.sessionMeta?.chatId) {
      select.value = this.sessionMeta.chatId;
    }
  }

  captureFormState() {
    return {
      intent: String(this.elements.input?.value || ''),
      context: String(this.elements.contextInput?.value || ''),
      template: String(this.elements.template?.value || 'fast'),
      persona: String(this.elements.persona?.value || 'systems'),
      modelMode: String(this.elements.modelMode?.value || 'auto'),
      skillKey: String(this.elements.skillSelect?.value || ''),
    };
  }

  persistCurrentSession() {
    if (!this.sessionMeta?.chatId) return;
    const store = this.loadSessionStore();
    const projectId = this.sessionMeta.projectId;
    const project = store.projects[projectId] || { sessions: {} };
    const existing = project.sessions?.[this.sessionMeta.chatId] || {};
    project.sessions = project.sessions || {};
    project.sessions[this.sessionMeta.chatId] = {
      ...existing,
      chatId: this.sessionMeta.chatId,
      projectId,
      startingPhase: this.sessionMeta.startingPhase,
      increment: this.sessionMeta.increment,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      promptText: String(this.latestPromptText || ''),
      chatTurns: Array.isArray(this.chatTurns) ? this.chatTurns : [],
      form: this.captureFormState(),
    };
    store.projects[projectId] = {
      ...project,
      nextIncrement: Number(project.nextIncrement || this.sessionMeta.increment + 1),
      lastPhaseNumber: Number(project.lastPhaseNumber || this.sessionMeta.startingPhase),
    };
    this.saveSessionStore(store);
    this.renderSessionMemoryOptions();
  }

  loadSessionFromMemory(chatId) {
    const store = this.loadSessionStore();
    const projectId = this.resolveProjectId();
    const project = store.projects[projectId] || {};
    const record = project.sessions?.[chatId];
    if (!record) return;

    this.isLoadingSession = true;
    this.sessionMeta = {
      projectId,
      chatId: String(record.chatId || chatId),
      startingPhase: Number(record.startingPhase || 1),
      increment: Number(record.increment || 1),
    };

    const form = record.form || {};
    if (this.elements.template) this.elements.template.value = String(form.template || this.elements.template.value || 'fast');
    if (this.elements.persona) this.elements.persona.value = String(form.persona || this.elements.persona.value || 'systems');
    if (this.elements.modelMode) this.elements.modelMode.value = String(form.modelMode || this.elements.modelMode.value || 'auto');
    if (this.elements.skillSelect && typeof form.skillKey !== 'undefined') this.elements.skillSelect.value = String(form.skillKey || '');
    if (this.elements.input) this.elements.input.value = String(form.intent || '');
    if (this.elements.contextInput) this.elements.contextInput.value = String(form.context || '');

    this.latestPromptText = String(record.promptText || '');
    this.chatTurns = Array.isArray(record.chatTurns) ? record.chatTurns : [];
    if (this.elements.approve) this.elements.approve.checked = false;

    if (this.latestPromptText) {
      this.setFlowState('pipeline', 'ready');
      this.setFlowState('package', this.chatTurns.length > 0 ? 'ready' : 'pending');
      this.setFlowState('chat', this.chatTurns.length > 0 ? 'ready' : 'idle');
      this.renderPromptStaging(this.latestPromptText);
    } else {
      this.setFlowState('pipeline', 'pending');
      this.setFlowState('package', 'idle');
      this.setFlowState('chat', 'idle');
      this.renderPromptStaging(this.defaultPromptText);
    }
    this.renderSessionMeta();
    this.renderSessionMemoryOptions();
    this.renderChatOutputs();
    this.updateSendState();
    this.isLoadingSession = false;
  }

  createNewSession(resetInputs = false) {
    this.latestPromptText = '';
    this.chatTurns = [];
    this.sessionMeta = this.startSession();
    if (this.elements.approve) this.elements.approve.checked = false;
    if (resetInputs) {
      if (this.elements.input) this.elements.input.value = '';
      if (this.elements.contextInput) this.elements.contextInput.value = '';
      this.applyTemplateDefaults(true);
    }
    this.setFlowState('pipeline', 'pending');
    this.setFlowState('package', 'idle');
    this.setFlowState('chat', 'idle');
    this.renderSessionMeta();
    this.renderSessionMemoryOptions();
    this.renderPromptStaging(this.defaultPromptText);
    this.renderChatOutputs();
    this.updateSendState();
  }

  setFlowState(stage, state) {
    const map = {
      pipeline: this.elements.flowPipeline,
      package: this.elements.flowPackage,
      chat: this.elements.flowChat,
    };
    const target = map[stage];
    if (target) target.dataset.flowState = state;
  }

  renderPromptStaging(text) {
    if (!this.elements.output) return;
    this.elements.output.value = String(text || this.defaultPromptText);
  }

  renderChatOutputs() {
    const transcript = this.chatTurns.length
      ? this.chatTurns.map((turn) => `[${turn.role}] ${turn.text}`).join('\n\n')
      : this.defaultChatText;
    if (this.elements.chatOutput) this.elements.chatOutput.textContent = transcript;

    const fullLog = this.chatTurns.length
      ? this.chatTurns
          .map((turn) => `${turn.at} | ${turn.role}\n${turn.text}`)
          .join('\n\n------------------------------\n\n')
      : 'No chat responses for this session yet.';
    if (this.elements.chatLogContent) this.elements.chatLogContent.textContent = fullLog;
    if (this.elements.chatLogsButton) this.elements.chatLogsButton.disabled = this.chatTurns.length === 0;
  }

  appendChat(role, text) {
    const value = String(text || '').trim();
    if (!value) return;
    this.chatTurns.push({ role, text: value, at: new Date().toISOString() });
    this.renderChatOutputs();
    this.persistCurrentSession();
  }

  openChatLogs() {
    if (!this.elements.chatLogModal) return;
    this.renderChatOutputs();
    this.elements.chatLogModal.classList.remove('hidden');
  }

  closeChatLogs() {
    this.elements.chatLogModal?.classList.add('hidden');
  }

  resetFlowForInputInteraction() {
    if (this.isLoadingSession) return;
    const hasWork = Boolean(String(this.latestPromptText || '').trim()) || this.chatTurns.length > 0;
    if (!hasWork) return;
    this.createNewSession(false);
  }

  extractAssistantReply(result) {
    const directKeys = ['responseText', 'response', 'output', 'answer', 'message', 'content'];
    for (const key of directKeys) {
      const value = result?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    const choicesContent = result?.choices?.[0]?.message?.content;
    if (typeof choicesContent === 'string' && choicesContent.trim()) return choicesContent.trim();

    const nestedContent = result?.result?.content || result?.result?.output || result?.data?.content;
    if (typeof nestedContent === 'string' && nestedContent.trim()) return nestedContent.trim();

    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result ?? '');
    }
  }

  async pollZoJob(jobId, maxWaitMs = 120000) {
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

  applyTemplateDefaults(initial = false) {
    const key = String(this.elements.template?.value || 'fast');
    const template = TEMPLATE_DECKS[key] || TEMPLATE_DECKS.fast;
    if (!this.elements.contextInput) return;
    if (initial || !String(this.elements.contextInput.value || '').trim()) {
      this.elements.contextInput.value = template.defaults.context;
    }
    if (this.elements.persona && (initial || !String(this.elements.persona.value || '').trim())) {
      this.elements.persona.value = template.defaults.persona;
    }
  }

  classifyTask(intent, context) {
    const input = `${intent} ${context}`.toLowerCase();
    if (/(audit|security|threat|vuln|auth|mfa|compliance)/.test(input)) return 'security-audit';
    if (/(refactor|migrate|upgrade|replace|restructure)/.test(input)) return 'migration-refactor';
    if (/(performance|latency|optimi|throughput|cache)/.test(input)) return 'performance-optimization';
    if (/(ui|ux|layout|copy|template|branding)/.test(input)) return 'experience-design';
    if (/(test|verify|coverage|ci|pipeline)/.test(input)) return 'quality-engineering';
    return 'implementation';
  }

  estimateComplexity(intent, context) {
    const text = `${intent} ${context}`.toLowerCase();
    let score = Math.max(1, Math.floor((intent.length + context.length) / 220));
    if (/(security|distributed|concurrent|migration|architecture|multi|mfa|proxy)/.test(text)) score += 2;
    if (/(quick|small|simple|minor|one file)/.test(text)) score -= 1;
    return Math.max(1, Math.min(5, score));
  }

  recommendModel(taskNature, complexity, mode) {
    const autoReasoning = complexity >= 4 || ['security-audit', 'migration-refactor'].includes(taskNature);
    const recommended = autoReasoning ? 'zo-reasoning-1' : 'zo-fast-1';
    const pricing = recommended === 'zo-reasoning-1' ? 'Higher cost, higher reasoning depth' : 'Lower cost, fast turnaround';

    if (mode === 'manual') {
      const manualSelect = document.getElementById('intent-model-select');
      const manualId = manualSelect ? String(manualSelect.value || '').trim() : '';
      if (manualId) {
        return {
          recommended: manualId,
          mode,
          pricing: 'User-selected model',
          rationale: `Manual override: operator selected ${manualId}.`,
        };
      }
    }

    return {
      recommended,
      mode,
      pricing,
      rationale:
        recommended === 'zo-reasoning-1'
          ? 'Complexity/risk profile indicates deeper reasoning is worth cost.'
          : 'Task is bounded and deterministic; fast tier is cost-efficient.',
    };
  }

  renderContext() {
    const phase = this.getPhase();
    const skill = this.getSelectedSkill();
    const persona = this.elements.persona?.value || 'systems';
    this.elements.context.textContent = skill
      ? `Intent Buffer: ${phase.title} | ${skill.label} | ${persona}`
      : `Intent Buffer: ${phase.title} | no skill selected | ${persona}`;
  }

  generate() {
    const intent = String(this.elements.input?.value || '').trim();
    if (!intent) {
      this.renderPromptStaging('Enter intent first.');
      return;
    }

    const context = String(this.elements.contextInput?.value || '').trim();
    const phase = this.getPhase();
    const selected = this.getSelectedSkill() || this.getFallbackSkill();
    const persona = String(this.elements.persona?.value || 'systems');
    const templateKey = String(this.elements.template?.value || 'fast');
    const modelMode = String(this.elements.modelMode?.value || 'auto');
    const taskNature = this.classifyTask(intent, context);
    const complexity = this.estimateComplexity(intent, context);
    const recommendation = this.recommendModel(taskNature, complexity, modelMode);
    const practices = VENDOR_PRACTICES[recommendation.recommended] || VENDOR_PRACTICES['zo-fast-1'];

    if (this.elements.taskNature) {
      this.elements.taskNature.textContent = `Task nature: ${taskNature} | complexity: ${complexity}/5`;
    }
    if (this.elements.modelRecommendation) {
      this.elements.modelRecommendation.textContent =
        `Model: ${recommendation.recommended} (${recommendation.pricing}). ${recommendation.rationale}`;
    }
    if (this.elements.vendorPractices) {
      this.elements.vendorPractices.innerHTML = `<strong>Vendor Prompting Practices</strong><ul>${practices
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`;
    }

    const promptText = [
      '# generated-prompt',
      'prompt_pipeline:',
      `  intent: "${intent.replace(/"/g, "'")}"`,
      `  context: "${context.replace(/"/g, "'")}"`,
      `  phase: "${phase.key}"`,
      `  phase_title: "${phase.title}"`,
      `  template_deck: "${templateKey}"`,
      `  persona: "${persona}"`,
      `  task_nature: "${taskNature}"`,
      `  complexity: ${complexity}`,
      '  skill:',
      `    key: "${selected?.key || 'failsafe-general-use-workflow'}"`,
      `    label: "${selected?.label || 'General Workflow'}"`,
      '  model_selection:',
      `    mode: "${modelMode}"`,
      `    recommended: "${recommendation.recommended}"`,
      `    pricing_signal: "${recommendation.pricing}"`,
      `    rationale: "${recommendation.rationale}"`,
      '  vendor_best_practices:',
      ...practices.map((line) => `    - "${line.replace(/"/g, "'")}"`),
      '  constraints:',
      '    - "Do not bypass policy or permission checks"',
      '    - "Provide deterministic validation steps"',
      '  execution_outline:',
      '    - "Restate objective, constraints, and desired output schema"',
      '    - "Plan sequenced work with explicit checkpoints"',
      '    - "Execute with minimal-risk increments"',
      '    - "Run tests/verification and summarize residual risk"',
    ].join('\n');

    this.latestPromptText = promptText;
    this.renderPromptStaging(promptText);
    this.setFlowState('pipeline', 'ready');
    this.setFlowState('package', 'pending');
    this.setFlowState('chat', 'idle');
    this.persistCurrentSession();
    this.updateSendState();
  }

  async copy() {
    const text = this.elements.output?.value || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Copy failed silently
    }
  }

  updateSendState() {
    if (!this.elements.send) return;
    const hasPrompt = Boolean(String(this.elements.output?.value || '').trim());
    this.elements.send.disabled = !hasPrompt;
  }

  async send() {
    const promptText = String(this.elements.output?.value || '').trim();
    if (!promptText) {
      this.updateSendState();
      return;
    }

    const governancePayload = {
      prompt: promptText,
      projectId: this.sessionMeta?.projectId || 'default',
      actorId: 'did:myth:zoqore:operator',
    };

    try {
      const intent = String(this.elements.input?.value || '').trim();
      this.appendChat('you', intent || promptText.slice(0, 100) + (promptText.length > 100 ? '...' : ''));
      this.setFlowState('chat', 'pending');

      // Step 1: Prompt governance evaluation
      const evalResponse = await fetch('/api/prompt/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(governancePayload),
      });
      const evalResult = await evalResponse.json();
      if (!evalResponse.ok) {
        throw new Error(evalResult?.error || evalResult?.message || `governance check failed (${evalResponse.status})`);
      }

      const decision = String(evalResult?.decision || 'UNKNOWN');
      if (decision === 'DENY') {
        this.appendChat('system', `Governance blocked: ${decision}. ${evalResult?.reasons?.join(', ') || 'No reason provided.'}`);
        this.setFlowState('chat', 'ready');
        this.persistCurrentSession();
        return;
      }

      if (decision === 'ESCALATE') {
        this.appendChat('system', `Governance escalated: ${evalResult?.requiredActions?.join(', ') || 'Review required.'}`);
        this.setFlowState('chat', 'ready');
        this.persistCurrentSession();
        return;
      }

      // Step 2: Forward to Zo (async job pattern — submit then poll)
      const zoPayload = {
        input: promptText,
      };
      const zoResponse = await fetch('/api/zo/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(zoPayload),
      });
      const zoResult = await zoResponse.json();
      if (!zoResponse.ok) {
        throw new Error(zoResult?.error || zoResult?.message || `Zo request failed (${zoResponse.status})`);
      }

      let assistantReply;
      if (zoResult.jobId) {
        this.appendChat('system', 'Processing...');
        const jobResult = await this.pollZoJob(zoResult.jobId);
        assistantReply = this.extractAssistantReply(jobResult);
      } else {
        assistantReply = this.extractAssistantReply(zoResult);
      }
      this.appendChat('assistant', assistantReply);
      this.setFlowState('package', 'ready');
      this.setFlowState('chat', 'ready');
      this.markSessionProgress();
      this.persistCurrentSession();
    } catch (error) {
      this.appendChat('system', `send_failed: ${String(error)}`);
      this.setFlowState('package', 'ready');
      this.setFlowState('chat', 'ready');
      this.persistCurrentSession();
    }
    this.updateSendState();
  }
}
