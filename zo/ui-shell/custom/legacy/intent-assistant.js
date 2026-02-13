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

export class IntentAssistant {
  constructor(options) {
    this.elements = options.elements;
    this.getPhase = options.getPhase;
    this.getSelectedSkill = options.getSelectedSkill;
    this.getFallbackSkill = options.getFallbackSkill;
    this.latestPackageText = '';

    this.elements.generate?.addEventListener('click', () => this.generate());
    this.elements.copy?.addEventListener('click', () => this.copy());
    this.elements.send?.addEventListener('click', () => this.send());
    this.elements.approve?.addEventListener('change', () => this.updateSendState());
    this.elements.template?.addEventListener('change', () => this.applyTemplateDefaults());

    this.applyTemplateDefaults(true);
    this.updateSendState();
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
      this.elements.output.textContent = 'Enter intent first. Prompt package generation is non-executing.';
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

    const packageText = [
      '# prompt-package (no execution)',
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

    this.latestPackageText = packageText;
    this.elements.output.textContent = packageText;
    this.updateSendState();
  }

  async copy() {
    const text = this.elements.output.textContent || '';
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      this.elements.output.textContent = `${text}\n\n# copied`;
    } catch {
      this.elements.output.textContent = `${text}\n\n# copy_failed`;
    }
  }

  updateSendState() {
    if (!this.elements.send) return;
    const approved = Boolean(this.elements.approve?.checked);
    const hasPackage = Boolean(String(this.latestPackageText || '').trim());
    this.elements.send.disabled = !(approved && hasPackage);
  }

  async send() {
    const approved = Boolean(this.elements.approve?.checked);
    if (!approved) {
      this.elements.output.textContent = `${this.latestPackageText || this.elements.output.textContent}\n\n# send_blocked: approve package first`;
      this.updateSendState();
      return;
    }
    if (!String(this.latestPackageText || '').trim()) {
      this.elements.output.textContent = 'Generate a package before sending.';
      this.updateSendState();
      return;
    }

    const payload = {
      requestId: `prompt-package-${Date.now()}`,
      actorId: 'did:myth:zoqore:operator',
      action: 'prompt.package.send',
      targetPath: 'repo://comms/prompt-package',
      prompt: this.latestPackageText,
    };

    try {
      const response = await fetch('/api/qore/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || result?.message || `send failed (${response.status})`);
      }
      this.elements.output.textContent = `${this.latestPackageText}\n\n# sent\n# decision: ${String(result?.decision || 'UNKNOWN')}`;
    } catch (error) {
      this.elements.output.textContent = `${this.latestPackageText}\n\n# send_failed: ${String(error)}`;
    }
    this.updateSendState();
  }
}
