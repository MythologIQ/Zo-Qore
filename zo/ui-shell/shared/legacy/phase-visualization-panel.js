/**
 * PhaseVisualizationPanel - Phase-aware SVG visualization component
 * Renders different educational visualizations based on current deployment phase
 */
export class PhaseVisualizationPanel {
  constructor(elements) {
    this.el = elements;
    this.lastPhaseId = null;
    this.animationFrame = null;
  }

  /**
   * Main render entry point
   * @param {Object} state - Application state with hub.activePlan
   */
  render(state) {
    if (!this.el.phaseVisualizationSvg) return;

    const plan = state?.hub?.activePlan || { phases: [], blockers: [], currentPhaseId: 'plan' };
    const phaseId = plan.currentPhaseId || 'plan';

    this.updateHeader(phaseId, plan);

    // Only re-render visualization if phase changed or forced
    if (phaseId !== this.lastPhaseId) {
      this.clearLayers();
      this.renderPhaseVisualization(phaseId, plan, state);
      this.updateLegend(phaseId);
      this.lastPhaseId = phaseId;
    } else {
      // Update existing visualization with new data
      this.updateVisualization(phaseId, plan, state);
    }
  }

  /**
   * Update the header title and badge
   */
  updateHeader(phaseId, plan) {
    const titles = {
      plan: 'Plan Phase',
      audit: 'Audit Phase',
      implement: 'Implement Phase',
      debug: 'Debug Phase',
      substantiate: 'Substantiate Phase'
    };

    if (this.el.vizPhaseTitle) {
      this.el.vizPhaseTitle.textContent = titles[phaseId] || 'Unknown Phase';
    }

    if (this.el.vizPhaseBadge) {
      const currentPhase = (plan.phases || []).find(p => p.id === phaseId);
      const status = currentPhase?.status || 'pending';
      const badgeText = status === 'in_progress' ? 'ACTIVE' : status.toUpperCase();
      this.el.vizPhaseBadge.textContent = badgeText;
      this.el.vizPhaseBadge.className = `viz-phase-badge viz-badge-${status}`;
    }
  }

  /**
   * Clear all SVG layers
   */
  clearLayers() {
    ['vizBackgroundLayer', 'vizConnectionsLayer', 'vizNodesLayer', 'vizAnnotationsLayer'].forEach(key => {
      if (this.el[key]) this.el[key].innerHTML = '';
    });
  }

  /**
   * Render the appropriate visualization for the phase
   */
  renderPhaseVisualization(phaseId, plan, state) {
    switch (phaseId) {
      case 'plan':
        this.renderPlanPhase(plan, state);
        break;
      case 'audit':
        this.renderAuditPhase(plan, state);
        break;
      case 'implement':
        this.renderImplementPhase(plan, state);
        break;
      case 'debug':
        this.renderDebugPhase(plan, state);
        break;
      case 'substantiate':
        this.renderSubstantiatePhase(plan, state);
        break;
      default:
        this.renderPlanPhase(plan, state);
    }
  }

  /**
   * Update existing visualization without full re-render
   */
  updateVisualization(phaseId, plan, state) {
    // For now, just re-render - can optimize later
    this.clearLayers();
    this.renderPhaseVisualization(phaseId, plan, state);
  }

  // =====================================================
  // PLAN PHASE - File Dependency Graph
  // =====================================================
  renderPlanPhase(plan, state) {
    const artifacts = this.extractArtifacts(plan);
    const viewBox = { width: 950, height: 340 };  // Widen viewBox to fit larger cards

    // Grid layout for file nodes
    const cols = 5;
    const nodeWidth = 150;   // Widen cards significantly to fit text
    const nodeHeight = 60;
    const gapX = 20;         // Tighter gap
    const gapY = 30;
    const startX = 50;       // Adjusted start
    const startY = 40;

    let nodesHtml = '';
    let connectionsHtml = '';
    const positions = [];

    artifacts.forEach((artifact, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = startX + col * (nodeWidth + gapX);
      const y = startY + row * (nodeHeight + gapY);
      positions.push({ x: x + nodeWidth / 2, y: y + nodeHeight / 2 });

      const touchedClass = artifact.touched ? 'viz-file-touched' : '';
      const typeIcon = this.getFileTypeIcon(artifact.type);
      
      // Adjusted truncation (14 chars)
      const labelText = this.escapeHtml(this.truncate(artifact.title, 14));

      nodesHtml += `
        <g class="viz-file-node ${touchedClass}" transform="translate(${x}, ${y})">
          <rect class="viz-file-bg" width="${nodeWidth}" height="${nodeHeight}" rx="6"/>
          <text class="viz-file-icon" x="12" y="24">${typeIcon}</text>
          <text class="viz-file-label" x="${nodeWidth/2}" y="24" text-anchor="middle" style="font-size: 11px;">${labelText}</text>
          <text class="viz-file-type" x="${nodeWidth/2}" y="42" text-anchor="middle">${this.escapeHtml(artifact.type || 'file')}</text>
        </g>
      `;
    });

    // Draw dependency connections (simple linear flow for demo)
    for (let i = 0; i < positions.length - 1; i++) {
      if ((i + 1) % cols !== 0) { // Connect horizontally within row
        const from = positions[i];
        const to = positions[i + 1];
        connectionsHtml += `
          <line class="viz-dependency-line" x1="${from.x + nodeWidth/2 - 10}" y1="${from.y}"
                x2="${to.x - nodeWidth/2 + 10}" y2="${to.y}" marker-end="url(#viz-arrow)"/>
        `;
      }
    }

    this.el.vizConnectionsLayer.innerHTML = connectionsHtml;
    this.el.vizNodesLayer.innerHTML = nodesHtml;

    // Add title annotation
    this.el.vizAnnotationsLayer.innerHTML = `
      <text class="viz-annotation" x="400" y="320" text-anchor="middle">
        Files to be touched during this plan • ${artifacts.filter(a => a.touched).length}/${artifacts.length} targeted
      </text>
    `;
  }

  // =====================================================
  // AUDIT PHASE - Policy Verification Flow
  // =====================================================
  renderAuditPhase(plan, state) {
    const policies = [
      { id: 'rbac', label: 'RBAC', icon: '🔐', status: 'pass' },
      { id: 'redact', label: 'DATA_REDACT', icon: '🛡️', status: 'pass' },
      { id: 'intent', label: 'INTENT_VERIFY', icon: '🎯', status: 'checking' },
      { id: 'checksum', label: 'CHECKSUM', icon: '✓', status: 'pending' },
      { id: 'sandbox', label: 'SANDBOX', icon: '📦', status: 'pending' }
    ];

    const nodeRadius = 45;
    const centerY = 140;
    const spacing = 140;
    const startX = 100;

    let nodesHtml = '';
    let connectionsHtml = '';

    policies.forEach((policy, idx) => {
      const x = startX + idx * spacing;
      const statusClass = `viz-policy-${policy.status}`;
      const animClass = policy.status === 'checking' ? 'viz-policy-checking' : '';

      nodesHtml += `
        <g class="viz-policy-node ${statusClass} ${animClass}" transform="translate(${x}, ${centerY})">
          <circle class="viz-policy-bg" r="${nodeRadius}"/>
          <circle class="viz-policy-ring" r="${nodeRadius - 4}"/>
          <text class="viz-policy-icon" y="-5">${policy.icon}</text>
          <text class="viz-policy-label" y="20">${policy.label}</text>
          <text class="viz-policy-status" y="38">${policy.status.toUpperCase()}</text>
        </g>
      `;

      // Draw connection to next
      if (idx < policies.length - 1) {
        const nextX = startX + (idx + 1) * spacing;
        const pathClass = policy.status === 'pass' ? 'viz-flow-active' : 'viz-flow-pending';
        connectionsHtml += `
          <path class="viz-policy-flow ${pathClass}"
                d="M${x + nodeRadius + 5},${centerY} L${nextX - nodeRadius - 5},${centerY}"
                marker-end="url(#viz-arrow)"/>
        `;
      }
    });

    // Add "tear into" particles for active check
    const activeIdx = policies.findIndex(p => p.status === 'checking');
    if (activeIdx >= 0) {
      const x = startX + activeIdx * spacing;
      nodesHtml += `
        <g class="viz-tear-particles" transform="translate(${x}, ${centerY})">
          <circle class="viz-particle p1" cx="-20" cy="-30" r="3"/>
          <circle class="viz-particle p2" cx="25" cy="-25" r="2"/>
          <circle class="viz-particle p3" cx="30" cy="20" r="3"/>
          <circle class="viz-particle p4" cx="-25" cy="25" r="2"/>
        </g>
      `;
    }

    this.el.vizConnectionsLayer.innerHTML = connectionsHtml;
    this.el.vizNodesLayer.innerHTML = nodesHtml;

    // Add progress bar
    const passedCount = policies.filter(p => p.status === 'pass').length;
    const progressPct = (passedCount / policies.length) * 100;
    this.el.vizBackgroundLayer.innerHTML = `
      <rect class="viz-progress-track" x="50" y="280" width="700" height="8" rx="4"/>
      <rect class="viz-progress-fill" x="50" y="280" width="${7 * progressPct}" height="8" rx="4"/>
    `;

    this.el.vizAnnotationsLayer.innerHTML = `
      <text class="viz-annotation" x="400" y="320" text-anchor="middle">
        Policy Verification Pipeline • ${passedCount}/${policies.length} checks passed
      </text>
    `;
  }

  // =====================================================
  // IMPLEMENT PHASE - Module Interconnections
  // =====================================================
  renderImplementPhase(plan, state) {
    const phases = plan.phases || [];
    const moduleHeight = 70;
    const moduleWidth = 120;
    const centerY = 150;
    const spacing = 150;
    const startX = 70;

    let nodesHtml = '';
    let connectionsHtml = '';

    phases.slice(0, 5).forEach((phase, idx) => {
      const x = startX + idx * spacing;
      const progress = phase.progress || 0;
      const isActive = phase.status === 'in_progress' || phase.status === 'active';
      const activeClass = isActive ? 'viz-module-active' : '';

      nodesHtml += `
        <g class="viz-module-node ${activeClass}" transform="translate(${x}, ${centerY - moduleHeight/2})">
          <rect class="viz-module-bg" width="${moduleWidth}" height="${moduleHeight}" rx="8"/>
          <rect class="viz-module-progress" width="${moduleWidth * (progress/100)}" height="${moduleHeight}" rx="8"/>
          <text class="viz-module-label" x="${moduleWidth/2}" y="28">${this.escapeHtml(this.truncate(phase.title, 10))}</text>
          <text class="viz-module-progress-text" x="${moduleWidth/2}" y="50">${progress}%</text>
        </g>
      `;

      // Data flow arrows between modules
      if (idx < phases.length - 1 && idx < 4) {
        const nextX = startX + (idx + 1) * spacing;
        const flowActive = phase.status === 'complete' || phase.status === 'completed';
        const flowClass = flowActive ? 'viz-dataflow-active' : 'viz-dataflow-pending';
        connectionsHtml += `
          <g class="viz-dataflow ${flowClass}">
            <path class="viz-dataflow-line"
                  d="M${x + moduleWidth + 5},${centerY} L${nextX - 5},${centerY}"
                  marker-end="url(#viz-arrow)"/>
            ${flowActive ? '<circle class="viz-dataflow-dot" cx="' + (x + moduleWidth + (nextX - x - moduleWidth)/2) + '" cy="' + centerY + '" r="4"/>' : ''}
          </g>
        `;
      }
    });

    this.el.vizConnectionsLayer.innerHTML = connectionsHtml;
    this.el.vizNodesLayer.innerHTML = nodesHtml;

    // Add interconnection diagram in background
    this.el.vizBackgroundLayer.innerHTML = `
      <rect class="viz-impl-bg-grid" x="40" y="60" width="720" height="200" rx="10"/>
    `;

    this.el.vizAnnotationsLayer.innerHTML = `
      <text class="viz-annotation" x="400" y="310" text-anchor="middle">
        Module Execution Flow • Data flows between phases as they complete
      </text>
    `;
  }

  // =====================================================
  // DEBUG PHASE - Execution Trace
  // =====================================================
  renderDebugPhase(plan, state) {
    const blockers = (plan.blockers || []).filter(b => !b.resolvedAt);
    const phases = plan.phases || [];
    const events = state.events || [];

    // Stack frames (left side)
    const frameHeight = 50;
    const frameWidth = 200;
    const startX = 40;
    const startY = 30;

    let stackHtml = '';
    const activePhases = phases.filter(p =>
      p.status === 'in_progress' || p.status === 'active' || p.status === 'complete' || p.status === 'completed'
    ).slice(0, 5);

    activePhases.forEach((phase, idx) => {
      const y = startY + idx * (frameHeight + 8);
      const isCurrent = idx === 0;
      const hasBlocker = blockers.some(b => b.phaseId === phase.id);
      const frameClass = isCurrent ? 'viz-stack-current' : '';
      const blockerClass = hasBlocker ? 'viz-stack-blocked' : '';

      stackHtml += `
        <g class="viz-stack-frame ${frameClass} ${blockerClass}" transform="translate(${startX}, ${y})">
          <rect class="viz-stack-bg" width="${frameWidth}" height="${frameHeight}" rx="4"/>
          <text class="viz-stack-fn" x="10" y="20">${this.escapeHtml(phase.title || 'Phase')}</text>
          <text class="viz-stack-loc" x="10" y="38">plan:${plan.id || 'active'}:${phase.id}</text>
          ${hasBlocker ? '<circle class="viz-breakpoint" cx="' + (frameWidth - 15) + '" cy="25" r="6"/>' : ''}
        </g>
      `;
    });

    // Timeline (bottom)
    const timelineY = 280;
    const timelineStart = 280;
    const timelineEnd = 760;
    const recentEvents = events.slice(-10);

    let timelineHtml = `
      <line class="viz-timeline-track" x1="${timelineStart}" y1="${timelineY}" x2="${timelineEnd}" y2="${timelineY}"/>
    `;

    if (recentEvents.length > 0) {
      const spacing = (timelineEnd - timelineStart) / (recentEvents.length + 1);
      recentEvents.forEach((evt, idx) => {
        const x = timelineStart + (idx + 1) * spacing;
        const markerClass = this.getEventMarkerClass(evt.type);
        timelineHtml += `
          <circle class="viz-timeline-marker ${markerClass}" cx="${x}" cy="${timelineY}" r="5">
            <title>${this.escapeHtml(evt.type || 'event')}</title>
          </circle>
        `;
      });
    }

    // Variable inspector (right side)
    let inspectorHtml = `
      <g transform="translate(280, 30)">
        <rect class="viz-inspector-bg" width="480" height="200" rx="6"/>
        <text class="viz-inspector-title" x="15" y="25">Execution State</text>
        <line class="viz-inspector-divider" x1="10" y1="35" x2="470" y2="35"/>
    `;

    const currentPhase = activePhases[0];
    if (currentPhase) {
      inspectorHtml += `
        <text class="viz-inspector-label" x="15" y="60">Current Phase:</text>
        <text class="viz-inspector-value" x="130" y="60">${this.escapeHtml(currentPhase.title)}</text>
        <text class="viz-inspector-label" x="15" y="85">Status:</text>
        <text class="viz-inspector-value" x="130" y="85">${currentPhase.status || 'unknown'}</text>
        <text class="viz-inspector-label" x="15" y="110">Progress:</text>
        <text class="viz-inspector-value" x="130" y="110">${currentPhase.progress || 0}%</text>
        <text class="viz-inspector-label" x="15" y="135">Blockers:</text>
        <text class="viz-inspector-value ${blockers.length > 0 ? 'viz-value-warn' : ''}" x="130" y="135">${blockers.length}</text>
      `;
    }
    inspectorHtml += '</g>';

    this.el.vizNodesLayer.innerHTML = stackHtml + inspectorHtml;
    this.el.vizConnectionsLayer.innerHTML = timelineHtml;

    this.el.vizAnnotationsLayer.innerHTML = `
      <text class="viz-annotation" x="400" y="320" text-anchor="middle">
        Execution Trace • Call stack depth: ${activePhases.length} • Events: ${recentEvents.length}
      </text>
    `;
  }

  // =====================================================
  // SUBSTANTIATE PHASE - Plan vs Actual Comparison
  // =====================================================
  renderSubstantiatePhase(plan, state) {
    const artifacts = this.extractArtifacts(plan);
    const colWidth = 350;
    const rowHeight = 40;
    const startY = 50;
    const leftX = 60;
    const rightX = 420;

    // Column headers
    let html = `
      <g class="viz-comparison-headers">
        <rect class="viz-header-bg" x="${leftX - 10}" y="10" width="${colWidth}" height="30" rx="4"/>
        <text class="viz-header-text" x="${leftX + colWidth/2 - 10}" y="30">PLANNED</text>
        <rect class="viz-header-bg" x="${rightX - 10}" y="10" width="${colWidth}" height="30" rx="4"/>
        <text class="viz-header-text" x="${rightX + colWidth/2 - 10}" y="30">ACTUAL</text>
      </g>
    `;

    // Artifact rows
    artifacts.slice(0, 6).forEach((artifact, idx) => {
      const y = startY + idx * rowHeight;
      const matched = artifact.touched; // Simulated: touched = completed
      const matchClass = matched ? 'viz-match-pass' : 'viz-match-pending';
      const icon = matched ? '✓' : '○';

      html += `
        <g class="viz-comparison-row ${matchClass}" transform="translate(0, ${y})">
          <!-- Planned -->
          <rect class="viz-row-bg" x="${leftX - 10}" y="5" width="${colWidth}" height="${rowHeight - 5}" rx="3"/>
          <text class="viz-row-text" x="${leftX}" y="28">${this.escapeHtml(artifact.title)}</text>
          <text class="viz-row-type" x="${leftX + 200}" y="28">${artifact.type || 'file'}</text>

          <!-- Actual -->
          <rect class="viz-row-bg" x="${rightX - 10}" y="5" width="${colWidth}" height="${rowHeight - 5}" rx="3"/>
          <text class="viz-row-text" x="${rightX}" y="28">${matched ? this.escapeHtml(artifact.title) : '—'}</text>
          <text class="viz-row-status" x="${rightX + 280}" y="28">${icon}</text>

          <!-- Connection line -->
          <line class="viz-match-line" x1="${leftX + colWidth - 20}" y1="20" x2="${rightX - 10}" y2="20"/>
        </g>
      `;
    });

    // Summary stats
    const matchedCount = artifacts.filter(a => a.touched).length;
    const totalCount = artifacts.length;
    const matchPct = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

    html += `
      <g class="viz-comparison-summary" transform="translate(400, 300)">
        <text class="viz-summary-text" text-anchor="middle">
          Validation: ${matchedCount}/${totalCount} artifacts matched (${matchPct}%)
        </text>
      </g>
    `;

    this.el.vizNodesLayer.innerHTML = html;

    this.el.vizAnnotationsLayer.innerHTML = `
      <text class="viz-annotation" x="400" y="330" text-anchor="middle">
        Plan vs Actual Comparison • Verifying all planned changes were applied correctly
      </text>
    `;
  }

  // =====================================================
  // LEGEND
  // =====================================================
  updateLegend(phaseId) {
    if (!this.el.vizLegend) return;

    const legends = {
      plan: [
        { color: 'var(--accent)', label: 'Targeted file' },
        { color: 'var(--surface-3)', label: 'Untouched file' },
        { color: 'var(--primary)', label: 'Dependency flow' }
      ],
      audit: [
        { color: 'var(--good)', label: 'Check passed' },
        { color: 'var(--warn)', label: 'Checking' },
        { color: 'var(--surface-3)', label: 'Pending' }
      ],
      implement: [
        { color: 'var(--primary)', label: 'Active module' },
        { color: 'var(--accent)', label: 'Data flowing' },
        { color: 'var(--surface-3)', label: 'Waiting' }
      ],
      debug: [
        { color: 'var(--primary)', label: 'Current frame' },
        { color: 'var(--error)', label: 'Breakpoint' },
        { color: 'var(--warn)', label: 'Warning event' }
      ],
      substantiate: [
        { color: 'var(--good)', label: 'Matched' },
        { color: 'var(--warn)', label: 'Pending' },
        { color: 'var(--error)', label: 'Mismatch' }
      ]
    };

    const items = legends[phaseId] || [];
    this.el.vizLegend.innerHTML = items.map(item => `
      <span class="viz-legend-item">
        <span class="viz-legend-dot" style="background:${item.color}"></span>
        <span class="viz-legend-label">${item.label}</span>
      </span>
    `).join('');
  }

  // =====================================================
  // UTILITIES
  // =====================================================
  extractArtifacts(plan) {
    const phases = plan.phases || [];
    const allArtifacts = [];
    const seen = new Set();

    phases.forEach(phase => {
      (phase.artifacts || []).forEach(artifact => {
        if (!seen.has(artifact.id)) {
          seen.add(artifact.id);
          allArtifacts.push({
            id: artifact.id,
            title: artifact.title || artifact.id,
            type: artifact.type || this.inferFileType(artifact.title || artifact.id),
            touched: artifact.touched || false,
            phaseId: phase.id
          });
        }
      });
    });

    // If no artifacts, generate demo data
    if (allArtifacts.length === 0) {
      return [
        { id: 'main', title: 'main.js', type: 'js', touched: true },
        { id: 'styles', title: 'styles.css', type: 'css', touched: true },
        { id: 'config', title: 'config.json', type: 'json', touched: false },
        { id: 'utils', title: 'utils.js', type: 'js', touched: true },
        { id: 'api', title: 'api.ts', type: 'ts', touched: false }
      ];
    }

    return allArtifacts;
  }

  inferFileType(filename) {
    if (!filename) return 'file';
    const ext = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
      js: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
      css: 'css', scss: 'scss', less: 'less',
      html: 'html', json: 'json', md: 'md',
      py: 'py', rs: 'rs', go: 'go'
    };
    return typeMap[ext] || 'file';
  }

  getFileTypeIcon(type) {
    const icons = {
      js: '📜', ts: '📘', jsx: '⚛️', tsx: '⚛️',
      css: '🎨', scss: '🎨', html: '🌐',
      json: '📋', md: '📝', py: '🐍',
      rs: '🦀', go: '🐹', file: '📄'
    };
    return icons[type] || '📄';
  }

  getEventMarkerClass(type) {
    if (!type) return '';
    const typeLower = type.toLowerCase();
    if (typeLower.includes('error') || typeLower.includes('block')) return 'viz-event-error';
    if (typeLower.includes('warn') || typeLower.includes('blocker')) return 'viz-event-warn';
    if (typeLower.includes('complete') || typeLower.includes('pass')) return 'viz-event-success';
    return 'viz-event-info';
  }

  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
