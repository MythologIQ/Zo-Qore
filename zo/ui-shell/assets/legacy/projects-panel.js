import { escapeHtml } from './utils.js';

export class ProjectsPanel {
  constructor(options) {
    this.elements = options.elements;
    this.onError = options.onError || (() => {});
    this.dataClient = options.dataClient || null;
    this.data = null;
    this._folders = null;

    // Brainstorm recording state
    this._recorder = null;
    this._recChunks = [];
    this._recInterval = null;
    this._recStart = 0;
    this._recBlob = null;
    this._initBrainstormRecording();
  }

  async fetch() {
    try {
      const res = await fetch('/api/projects/dashboard');
      if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
      this.data = await res.json();
      this.render();
    } catch (err) {
      console.error('[ProjectsPanel]', err);
      this.onError(String(err));
    }
  }

  render() {
    if (!this.data) return;
    this.renderToolbar();
    this.renderOverview();
    this.renderKanban();
    this.renderGantt();
    this.renderRoadmap();
    this.renderBrainstorm();
    this.renderSettings();
  }

  renderToolbar() {
    const p = this.data.project;
    const allProjects = this.data.allProjects || [];
    if (!p) return;
    const el = this.elements;

    // Build project selector with all projects
    if (el.projectSelect) {
      el.projectSelect.innerHTML = allProjects.map(proj => {
        const suffix = proj.parentId ? ' (Sub)' : (proj.isActive ? ' (Active)' : '');
        return `<option value="${escapeHtml(proj.id)}"${proj.isActive ? ' selected' : ''}>${escapeHtml(proj.name)}${suffix}</option>`;
      }).join('');
    }
    if (el.projectState) {
      el.projectState.textContent = p.state;
      el.projectState.className = 'projects-meta-value state-pill state-' + p.state.toLowerCase();
    }
    if (el.projectPhaseCount) el.projectPhaseCount.textContent = p.phaseCount ? String(p.phaseCount) : 'No data';
    if (el.projectTaskCount) el.projectTaskCount.textContent = p.taskCount ? String(p.taskCount) : 'No data';
    if (el.projectRiskCount) el.projectRiskCount.textContent = p.riskCount ? String(p.riskCount) : 'No data';
  }

  renderOverview() {
    const p = this.data.project;
    if (!p) return;
    const phases = this.data.phases || [];
    const milestones = this.data.milestones || [];
    const risks = this.data.risks || [];
    const subProjects = this.data.subProjects || [];

    // Project summary with editable name and folder
    const summaryEl = this.elements.projectSummary;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="project-summary-row">
          <span class="project-summary-label">Name</span>
          <span class="project-summary-value project-name-display">
            <span id="project-name-text">${escapeHtml(p.name)}</span>
            <button class="project-edit-btn" id="project-rename-btn" type="button" title="Rename project">&#9998;</button>
          </span>
        </div>
        <div class="project-summary-row" id="project-rename-row" style="display:none">
          <span class="project-summary-label">New Name</span>
          <span class="project-summary-value project-rename-form">
            <input id="project-rename-input" type="text" class="project-inline-input" value="${escapeHtml(p.name)}" maxlength="120">
            <button class="hub-action-btn primary small" id="project-rename-save" type="button">Save</button>
            <button class="hub-action-btn ghost small" id="project-rename-cancel" type="button">Cancel</button>
          </span>
        </div>
        <div class="project-summary-row">
          <span class="project-summary-label">Folder</span>
          <span class="project-summary-value project-folder-display">
            <span id="project-folder-text">${p.folderPath ? escapeHtml(p.folderPath) : '<em>Not mapped</em>'}</span>
            <button class="project-edit-btn" id="project-folder-btn" type="button" title="Map to folder">&#128193;</button>
          </span>
        </div>
        <div class="project-summary-row" id="project-folder-row" style="display:none">
          <span class="project-summary-label">Select Folder</span>
          <span class="project-summary-value project-folder-form">
            <select id="project-folder-select" class="project-inline-select">
              <option value="">Loading folders...</option>
            </select>
            <button class="hub-action-btn primary small" id="project-folder-save" type="button">Save</button>
            <button class="hub-action-btn ghost small" id="project-folder-cancel" type="button">Cancel</button>
          </span>
        </div>
        <div class="project-summary-row"><span class="project-summary-label">Created</span><span class="project-summary-value">${p.createdAt ? escapeHtml(new Date(p.createdAt).toLocaleDateString()) : 'No data'}</span></div>
        <div class="project-summary-row"><span class="project-summary-label">Last Updated</span><span class="project-summary-value">${p.updatedAt ? escapeHtml(new Date(p.updatedAt).toLocaleDateString()) : 'No data'}</span></div>
        <div class="project-summary-row"><span class="project-summary-label">Lifecycle</span><span class="project-summary-value">${p.state ? escapeHtml(p.state) : 'No data'}</span></div>
        <div class="project-summary-row">
          <span class="project-summary-label">Tracking</span>
          <span class="project-summary-value">
            <button class="hub-action-btn danger small" id="project-remove-btn" type="button" title="Remove project from tracking">Remove from Tracking</button>
          </span>
        </div>
      `;
      this._bindRenameHandlers(p);
      this._bindFolderHandlers(p);
      this._bindRemoveHandler(p);
    }

    // Phase progress
    const phaseEl = this.elements.projectPhaseProgress;
    if (phaseEl) {
      if (phases.length === 0) {
        phaseEl.innerHTML = '<p class="empty-state">No phases defined.</p>';
      } else {
        phaseEl.innerHTML = phases.map(ph => `
          <div class="phase-progress-row">
            <div class="phase-progress-header">
              <span class="phase-progress-name">${escapeHtml(ph.title)}</span>
              <span class="phase-progress-pct">${ph.progress}%</span>
            </div>
            <div class="phase-progress-track">
              <div class="phase-progress-fill status-${ph.status}" style="width:${ph.progress}%"></div>
            </div>
          </div>
        `).join('');
      }
    }

    // Milestones
    const mileEl = this.elements.projectMilestones;
    if (mileEl) {
      if (milestones.length === 0) {
        mileEl.innerHTML = '<p class="empty-state">No milestones recorded yet.</p>';
      } else {
        mileEl.innerHTML = '<ul class="milestone-list">' + milestones.map(m => {
          const status = m.completedAt ? 'completed' : 'pending';
          const dateStr = m.completedAt
            ? new Date(m.completedAt).toLocaleDateString()
            : (m.targetDate ? new Date(m.targetDate).toLocaleDateString() : 'TBD');
          return `<li class="milestone-item ${status}">
            <span class="milestone-icon">${m.completedAt ? '&#9670;' : '&#9671;'}</span>
            <span class="milestone-title">${escapeHtml(m.title)}</span>
            <span class="milestone-date">${escapeHtml(dateStr)}</span>
          </li>`;
        }).join('') + '</ul>';
      }
    }

    // Risk matrix
    const riskEl = this.elements.projectRiskMatrix;
    if (riskEl) {
      if (risks.length === 0) {
        riskEl.innerHTML = '<p class="empty-state">No active risks. Governance nominal.</p>';
      } else {
        riskEl.innerHTML = '<ul class="risk-list">' + risks.map(r => `
          <li class="risk-item risk-${r.level}">
            <span class="risk-badge">${escapeHtml(r.level.toUpperCase())}</span>
            <span class="risk-title">${escapeHtml(r.title)}</span>
          </li>
        `).join('') + '</ul>';
      }
    }

    // Sub-projects
    const subEl = this.elements.projectSubProjects;
    if (subEl) {
      if (subProjects.length === 0) {
        subEl.innerHTML = `
          <p class="empty-state">No sub-projects yet.</p>
          <button class="hub-action-btn primary small" id="subproject-create-btn" type="button">+ Add Sub-Project</button>
        `;
      } else {
        subEl.innerHTML = `
          <ul class="subproject-list">
            ${subProjects.map(sp => `
              <li class="subproject-item" data-sp-id="${escapeHtml(sp.id)}">
                <span class="subproject-info">
                  <span class="subproject-name">${escapeHtml(sp.name)}</span>
                  <span class="subproject-folder">${sp.folderPath ? escapeHtml(sp.folderPath) : 'No folder'}</span>
                </span>
                <span class="subproject-actions">
                  <button class="subproject-action-btn" data-sp-action="rename" data-sp-id="${escapeHtml(sp.id)}" data-sp-name="${escapeHtml(sp.name)}" type="button" title="Rename">&#9998;</button>
                  <button class="subproject-action-btn remove" data-sp-action="remove" data-sp-id="${escapeHtml(sp.id)}" data-sp-name="${escapeHtml(sp.name)}" type="button" title="Remove from tracking">&#128465;</button>
                  <button class="subproject-action-btn unlink" data-sp-action="unlink" data-sp-id="${escapeHtml(sp.id)}" data-sp-name="${escapeHtml(sp.name)}" type="button" title="Unlink from parent">&#10005;</button>
                </span>
              </li>
            `).join('')}
          </ul>
          <button class="hub-action-btn primary small" id="subproject-create-btn" type="button">+ Add Sub-Project</button>
        `;
      }
      this._bindSubProjectHandlers();
      this._bindSubProjectItemHandlers();
    }
  }

  _bindRenameHandlers(project) {
    const renameBtn = document.getElementById('project-rename-btn');
    const renameRow = document.getElementById('project-rename-row');
    const renameInput = document.getElementById('project-rename-input');
    const renameSave = document.getElementById('project-rename-save');
    const renameCancel = document.getElementById('project-rename-cancel');
    if (!renameBtn || !renameRow) return;

    renameBtn.addEventListener('click', () => {
      renameRow.style.display = '';
      renameInput?.focus();
      renameInput?.select();
    });
    renameCancel?.addEventListener('click', () => {
      renameRow.style.display = 'none';
    });
    const doRename = async () => {
      const newName = renameInput?.value?.trim();
      if (!newName) return;
      renameSave.disabled = true;
      try {
        if (this.dataClient) {
          await this.dataClient.renameProject(project.id, newName);
        }
      } catch (err) {
        console.error('[ProjectsPanel] rename failed:', err);
      } finally {
        renameSave.disabled = false;
      }
    };
    renameSave?.addEventListener('click', doRename);
    renameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doRename();
      if (e.key === 'Escape') renameRow.style.display = 'none';
    });
  }

  async _bindFolderHandlers(project) {
    const folderBtn = document.getElementById('project-folder-btn');
    const folderRow = document.getElementById('project-folder-row');
    const folderSelect = document.getElementById('project-folder-select');
    const folderSave = document.getElementById('project-folder-save');
    const folderCancel = document.getElementById('project-folder-cancel');
    if (!folderBtn || !folderRow) return;

    folderBtn.addEventListener('click', async () => {
      folderRow.style.display = '';
      if (!this._folders) {
        if (this.dataClient) {
          this._folders = await this.dataClient.fetchProjectFolders();
        } else {
          try {
            const res = await fetch('/api/projects/folders');
            const data = await res.json();
            this._folders = data.folders || [];
          } catch { this._folders = []; }
        }
      }
      if (folderSelect) {
        folderSelect.innerHTML = '<option value="">-- Select folder --</option>' +
          this._folders.map(f => `<option value="${escapeHtml(f)}"${f === project.folderPath ? ' selected' : ''}>${escapeHtml(f)}</option>`).join('');
      }
    });
    folderCancel?.addEventListener('click', () => {
      folderRow.style.display = 'none';
    });
    folderSave?.addEventListener('click', async () => {
      const selected = folderSelect?.value;
      if (!selected) return;
      folderSave.disabled = true;
      try {
        if (this.dataClient) {
          await this.dataClient.setProjectFolder(project.id, selected);
        }
      } catch (err) {
        console.error('[ProjectsPanel] folder set failed:', err);
      } finally {
        folderSave.disabled = false;
      }
    });
  }

  _bindRemoveHandler(project) {
    const removeBtn = document.getElementById('project-remove-btn');
    if (!removeBtn) return;

    removeBtn.addEventListener('click', async () => {
      const confirmMsg = `Remove "${project.name}" from tracking? This will not delete any files.`;
      if (!confirm(confirmMsg)) return;
      removeBtn.disabled = true;
      try {
        if (this.dataClient) {
          await this.dataClient.removeProject(project.id);
        }
      } catch (err) {
        console.error('[ProjectsPanel] remove failed:', err);
      } finally {
        removeBtn.disabled = false;
      }
    });
  }

  _bindSubProjectHandlers() {
    const createBtn = document.getElementById('subproject-create-btn');
    if (!createBtn) return;

    createBtn.addEventListener('click', () => {
      const parentId = this.data?.project?.id;
      if (!parentId) return;
      // Show inline creation form
      const container = createBtn.parentElement;
      if (!container) return;
      const form = document.createElement('div');
      form.className = 'subproject-create-form';
      form.innerHTML = `
        <input id="subproject-name-input" type="text" class="project-inline-input" placeholder="Sub-project name" maxlength="120">
        <select id="subproject-folder-select" class="project-inline-select">
          <option value="">No folder (optional)</option>
        </select>
        <button class="hub-action-btn primary small" id="subproject-save" type="button">Create</button>
        <button class="hub-action-btn ghost small" id="subproject-cancel" type="button">Cancel</button>
      `;
      container.appendChild(form);
      createBtn.style.display = 'none';

      // Load folders for sub-project
      const loadFolders = async () => {
        const sel = document.getElementById('subproject-folder-select');
        if (!sel) return;
        let folders = this._folders;
        if (!folders) {
          if (this.dataClient) {
            folders = await this.dataClient.fetchProjectFolders();
          } else {
            try {
              const res = await fetch('/api/projects/folders');
              const data = await res.json();
              folders = data.folders || [];
            } catch { folders = []; }
          }
          this._folders = folders;
        }
        sel.innerHTML = '<option value="">No folder (optional)</option>' +
          folders.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
      };
      loadFolders();

      document.getElementById('subproject-cancel')?.addEventListener('click', () => {
        form.remove();
        createBtn.style.display = '';
      });
      document.getElementById('subproject-save')?.addEventListener('click', async () => {
        const name = document.getElementById('subproject-name-input')?.value?.trim();
        if (!name) return;
        const folder = document.getElementById('subproject-folder-select')?.value || '';
        const saveBtn = document.getElementById('subproject-save');
        if (saveBtn) saveBtn.disabled = true;
        try {
          if (this.dataClient) {
            await this.dataClient.createProject(name, folder, parentId);
          }
        } catch (err) {
          console.error('[ProjectsPanel] sub-project create failed:', err);
        }
      });
    });
  }

  _bindSubProjectItemHandlers() {
    const renameBtns = document.querySelectorAll('.subproject-action-btn[data-sp-action="rename"]');
    const unlinkBtns = document.querySelectorAll('.subproject-action-btn[data-sp-action="unlink"]');
    const removeBtns = document.querySelectorAll('.subproject-action-btn[data-sp-action="remove"]');
    const dataClient = this.dataClient;

    renameBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const spId = btn.getAttribute('data-sp-id');
        const spName = btn.getAttribute('data-sp-name');
        if (!spId || !spName) return;
        const li = btn.closest('.subproject-item');
        if (!li) return;

        // Show inline rename form
        const form = document.createElement('div');
        form.className = 'subproject-rename-form';
        form.innerHTML = `
          <input id="subproject-rename-input" type="text" class="project-inline-input" value="${escapeHtml(spName)}" maxlength="120">
          <button class="hub-action-btn primary small" id="subproject-rename-save" type="button">Save</button>
          <button class="hub-action-btn ghost small" id="subproject-rename-cancel" type="button">Cancel</button>
        `;
        li.appendChild(form);
        btn.remove();

        const input = form.querySelector('#subproject-rename-input');
        const saveBtn = form.querySelector('#subproject-rename-save');
        const cancelBtn = form.querySelector('#subproject-rename-cancel');
        if (!input || !saveBtn || !cancelBtn) return;

        input.focus();
        input.select();

        const doRename = async () => {
          const newName = input?.value?.trim();
          if (!newName) return;
          saveBtn.disabled = true;
          try {
            if (dataClient) {
              await dataClient.renameProject(spId, newName);
            }
          } catch (err) {
            console.error('[ProjectsPanel] sub-project rename failed:', err);
          } finally {
            saveBtn.disabled = false;
          }
        };

        saveBtn?.addEventListener('click', doRename);
        input?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doRename();
          if (e.key === 'Escape') {
            form.remove();
            li.appendChild(btn);
          }
        });
        cancelBtn?.addEventListener('click', () => {
          form.remove();
          li.appendChild(btn);
        });
      });
    });

    removeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const spId = btn.getAttribute('data-sp-id');
        const spName = btn.getAttribute('data-sp-name');
        if (!spId || !spName) return;

        const confirmMsg = `Remove "${spName}" from tracking? This will not delete any files.`;
        if (!confirm(confirmMsg)) return;

        try {
          if (dataClient) {
            await dataClient.removeProject(spId);
          }
        } catch (err) {
          console.error('[ProjectsPanel] sub-project remove failed:', err);
        }
      });
    });

    unlinkBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const spId = btn.getAttribute('data-sp-id');
        const spName = btn.getAttribute('data-sp-name');
        if (!spId || !spName) return;
        const li = btn.closest('.subproject-item');
        if (!li) return;

        // Confirm unlink
        const confirmMsg = `Unlink "${spName}" from this project?`;
        if (!confirm(confirmMsg)) return;

        try {
          if (dataClient) {
            await dataClient.unlinkSubProject(spId);
          }
        } catch (err) {
          console.error('[ProjectsPanel] sub-project unlink failed:', err);
        }
      });
    });
  }

  renderKanban() {
    const kanban = this.data.kanban || [];
    const el = this.elements.kanbanBoard;
    if (!el) return;

    if (kanban.every(col => col.cards.length === 0)) {
      el.innerHTML = '<p class="empty-state">No kanban cards. Tasks will appear as phases produce artifacts.</p>';
      return;
    }

    el.innerHTML = '<div class="kanban-columns">' + kanban.map(col => {
      const cards = col.cards.map(c => `
        <div class="kanban-card kanban-${c.status}">
          <div class="kanban-card-title">${escapeHtml(c.title)}</div>
          <div class="kanban-card-phase">${escapeHtml(c.phase)}</div>
        </div>
      `).join('');
      return `
        <div class="kanban-column">
          <div class="kanban-column-header">
            <h4>${escapeHtml(col.title)}</h4>
            <span class="kanban-wip-badge">${col.cards.length}</span>
          </div>
          <div class="kanban-column-body">${cards || '<div class="kanban-empty">No items</div>'}</div>
        </div>
      `;
    }).join('') + '</div>';
  }

  renderGantt() {
    const gantt = this.data.gantt;
    const el = this.elements.ganttChart;
    if (!el || !gantt) return;

    const pStart = new Date(gantt.projectStart).getTime();
    const pEnd = new Date(gantt.projectEnd).getTime();
    const total = pEnd - pStart;
    if (total <= 0) { el.innerHTML = '<p class="empty-state">Invalid project date range.</p>'; return; }
    const toPercent = (dateStr) => {
      const d = new Date(dateStr).getTime();
      return Math.max(0, Math.min(100, ((d - pStart) / total) * 100));
    };

    // Month labels
    const months = [];
    const s = new Date(gantt.projectStart);
    const e = new Date(gantt.projectEnd);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const left = toPercent(cur.toISOString());
      const label = cur.toLocaleString('default', { month: 'short', year: '2-digit' });
      months.push(`<span class="gantt-month-label" style="left:${left}%">${label}</span>`);
      cur.setMonth(cur.getMonth() + 1);
    }

    // Phase rows — each phase gets its own row with a label + bar
    const rows = gantt.phases.map(ph => {
      const left = toPercent(ph.startDate);
      const right = toPercent(ph.endDate);
      const width = Math.max(right - left, 1);
      const cls = ph.status === 'completed' ? 'completed' : (ph.status === 'in-progress' ? 'in-progress' : 'planned');
      return `
        <div class="gantt-row">
          <span class="gantt-row-label">${escapeHtml(ph.title)}</span>
          <div class="gantt-row-bar ${cls}" style="left:${left}%;width:${width}%" title="${escapeHtml(ph.title)}: ${ph.startDate} → ${ph.endDate}"></div>
        </div>`;
    }).join('');

    // Vertical gridlines for each month
    const gridlines = [];
    const gCur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (gCur <= e) {
      const left = toPercent(gCur.toISOString());
      gridlines.push(`<div class="gantt-gridline" style="left:${left}%"></div>`);
      gCur.setMonth(gCur.getMonth() + 1);
    }

    // Milestone markers
    const msRow = gantt.milestones.length > 0
      ? `<div class="gantt-milestones-row">${gantt.milestones.map(m => {
          const left = toPercent(m.date);
          const cls = m.critical ? 'gantt-milestone-marker critical' : 'gantt-milestone-marker';
          return `<div class="${cls}" style="left:${left}%" title="${escapeHtml(m.title)}: ${m.date}">&#9670;</div>`;
        }).join('')}</div>`
      : '';

    el.innerHTML = `
      <div class="gantt-chart-dynamic">
        <div class="gantt-header">
          <div class="gantt-months">${months.join('')}</div>
        </div>
        <div class="gantt-body">
          <div class="gantt-tracks">
            ${gridlines.join('')}
            ${rows}
            ${msRow}
            <div class="gantt-today" style="left:${gantt.todayPercent}%"><span class="gantt-today-label">Today</span></div>
          </div>
          <div class="gantt-legend">
            ${gantt.phases.map(ph => {
              const cls = ph.status === 'completed' ? 'completed' : (ph.status === 'in-progress' ? 'in-progress' : 'planned');
              return `<span class="gantt-legend-item"><span class="gantt-legend-dot ${cls}"></span>${escapeHtml(ph.title)}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderRoadmap() {
    const roadmap = this.data.roadmap || [];
    const el = this.elements.roadmapTimeline;
    if (!el) return;

    if (roadmap.length === 0) {
      el.innerHTML = '<p class="empty-state">No roadmap phases defined.</p>';
      return;
    }

    el.innerHTML = roadmap.map(phase => {
      const statusClass = phase.status === 'completed' ? 'completed' :
        (phase.status === 'in-progress' ? 'in-progress' : 'planned');
      const badgeLabel = phase.status === 'completed' ? 'Completed' :
        (phase.status === 'in-progress' ? 'In Progress' : 'Planned');
      const progressLabel = phase.progress ? `<span class="roadmap-phase-progress">${escapeHtml(phase.progress)} tasks</span>` : '';
      const desc = phase.description ? `<p class="roadmap-phase-desc">${escapeHtml(phase.description)}</p>` : '';
      const items = (phase.items || []).map(item => {
        const cls = item.done ? 'done' : (item.active ? 'active' : '');
        const tooltip = item.description ? ` title="${escapeHtml(item.description)}"` : '';
        return `<li class="${cls}"${tooltip}>${escapeHtml(item.text)}</li>`;
      }).join('');
      return `
        <div class="roadmap-phase-card ${statusClass}">
          <div class="roadmap-phase-header">
            <span class="roadmap-phase-badge ${statusClass}">${badgeLabel}</span>
            <h4>${escapeHtml(phase.title)}</h4>
            <span class="roadmap-phase-dates">${escapeHtml(phase.dates)}</span>
            ${progressLabel}
          </div>
          ${desc}
          <ul class="roadmap-phase-items">${items}</ul>
        </div>
      `;
    }).join('');
  }

  /* ── Brainstorm voice recording ─────────────────────────────── */

  _initBrainstormRecording() {
    const btn = this.elements.brainstormRecordBtn;
    const sendBtn = this.elements.brainstormSendBtn;
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (this._recorder && this._recorder.state === 'recording') {
        this._stopRecording();
      } else {
        this._startRecording();
      }
    });

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this._sendRecording());
    }
  }

  async _startRecording() {
    const btn = this.elements.brainstormRecordBtn;
    const timer = this.elements.brainstormRecTimer;
    const sendBtn = this.elements.brainstormSendBtn;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._recChunks = [];
      this._recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._recChunks.push(e.data); };
      this._recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        this._recBlob = new Blob(this._recChunks, { type: 'audio/webm' });
        if (sendBtn) sendBtn.disabled = false;
      };
      this._recorder.start(250);
      this._recStart = Date.now();
      btn.classList.add('recording');
      btn.innerHTML = '<span class="rec-dot recording"></span> Stop';
      if (sendBtn) sendBtn.disabled = true;

      // Timer tick
      this._recInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - this._recStart) / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        if (timer) timer.textContent = `${m}:${s}`;
      }, 250);
    } catch (err) {
      console.error('[Brainstorm] Mic access denied:', err);
    }
  }

  _stopRecording() {
    const btn = this.elements.brainstormRecordBtn;
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.stop();
    }
    clearInterval(this._recInterval);
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="rec-dot"></span> Record';
  }

  async _sendRecording() {
    if (!this._recBlob) return;
    const sendBtn = this.elements.brainstormSendBtn;
    const timer = this.elements.brainstormRecTimer;
    const projectId = this.data?.project?.id;
    if (!projectId) { console.error('[Brainstorm] No active project'); return; }

    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

    try {
      const fd = new FormData();
      fd.append('audio', this._recBlob, `brainstorm-${Date.now()}.webm`);
      fd.append('projectId', projectId);
      fd.append('target', 'constellation'); // signal: interpret into mind map

      const res = await fetch('/api/projects/brainstorm/ingest', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Ingest failed (${res.status})`);

      // Re-fetch dashboard to reflect new constellation data
      if (this.dataClient) {
        await this.dataClient.fetchConstellation(projectId);
        await this.dataClient.fetchDashboard();
      }

      this._recBlob = null;
      if (timer) timer.textContent = '';
      if (sendBtn) { sendBtn.textContent = 'Sent!'; setTimeout(() => { sendBtn.textContent = 'Send'; }, 1500); }
    } catch (err) {
      console.error('[Brainstorm] Send failed:', err);
      if (sendBtn) { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }
    }
  }

  /* ── Brainstorm / Mind Map rendering ──────────────────────── */

  renderBrainstorm() {
    const constellation = this.data.constellation;
    const canvasEl = this.elements.brainstormCanvas;
    const clusterEl = this.elements.brainstormClusters;
    const detailEl = this.elements.brainstormDetail;
    if (!canvasEl) return;

    if (!constellation || !constellation.clusters || constellation.clusters.length === 0) {
      canvasEl.innerHTML = '<p class="empty-state">No thought constellation data. Run a Genesis session to populate ideas.</p>';
      if (clusterEl) clusterEl.innerHTML = '<p class="empty-state">No clusters yet.</p>';
      return;
    }

    const clusters = constellation.clusters;
    const W = 700, H = 440;
    const CX = W / 2, CY = H / 2;

    // Layout clusters in a circle, thoughts around each cluster center
    const clusterAngleStep = (2 * Math.PI) / clusters.length;
    const clusterRadius = Math.min(W, H) * 0.3;

    const nodes = [];
    const edges = [];

    clusters.forEach((cluster, ci) => {
      const angle = clusterAngleStep * ci - Math.PI / 2;
      const cx = CX + clusterRadius * Math.cos(angle);
      const cy = CY + clusterRadius * Math.sin(angle);

      // Cluster hub node
      nodes.push({ id: cluster.id, x: cx, y: cy, label: cluster.name, isHub: true, clusterId: cluster.id, theme: cluster.theme, category: cluster.category || null, locked: !!cluster.locked });

      // Thought nodes around hub
      const thoughts = cluster.thoughts || [];
      const thoughtRadius = 40 + thoughts.length * 5;
      thoughts.forEach((t, ti) => {
        const ta = (2 * Math.PI / Math.max(thoughts.length, 1)) * ti;
        const tx = cx + thoughtRadius * Math.cos(ta);
        const ty = cy + thoughtRadius * Math.sin(ta);
        nodes.push({ id: t.id, x: tx, y: ty, label: t.content.substring(0, 20), isHub: false, clusterId: cluster.id, content: t.content, category: t.category || cluster.category || null, locked: !!t.locked });
        edges.push({ from: cluster.id, to: t.id, strong: false });
      });

      // Connections to other clusters
      (cluster.connections || []).forEach(conn => {
        edges.push({ from: cluster.id, to: conn.targetClusterId, strong: conn.strength > 0.5 });
      });
    });

    // Build node lookup for edge drawing
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    // SVG rendering
    const edgesSvg = edges.map(e => {
      const a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return '';
      const cls = e.strong ? 'constellation-edge strong' : 'constellation-edge';
      return `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
    }).join('');

    const nodesSvg = nodes.map(n => {
      const r = n.isHub ? 18 : 8;
      let circleCls = n.isHub ? 'constellation-node-circle cluster-hub' : 'constellation-node-circle';
      const labelCls = n.isHub ? 'constellation-cluster-label' : 'constellation-node-label';
      const labelY = n.isHub ? n.y + r + 14 : n.y + r + 10;

      // Color-code by category
      if (n.category) circleCls += ` cat-${n.category}`;
      // Locked-in-code state
      const lockedCls = n.locked ? ' locked-in-code' : '';

      return `
        <g class="constellation-node${lockedCls}" data-node-id="${escapeHtml(n.id)}" data-cluster-id="${escapeHtml(n.clusterId)}" data-category="${escapeHtml(n.category || '')}">
          <circle class="${circleCls}" cx="${n.x}" cy="${n.y}" r="${r}" />
          <text class="${labelCls}" x="${n.x}" y="${labelY}">${escapeHtml(n.label)}</text>
        </g>`;
    }).join('');

    canvasEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${edgesSvg}${nodesSvg}</svg>`;

    // Click handler for nodes
    canvasEl.querySelectorAll('.constellation-node').forEach(nodeEl => {
      nodeEl.addEventListener('click', () => {
        const nodeId = nodeEl.dataset.nodeId;
        const node = nodeMap[nodeId];
        if (!node) return;
        if (detailEl) {
          if (node.isHub) {
            detailEl.innerHTML = `<div class="brainstorm-thought-title">${escapeHtml(node.label)}</div><div class="brainstorm-thought-content">${escapeHtml(node.theme || '')}</div>`;
          } else {
            detailEl.innerHTML = `<div class="brainstorm-thought-title">Thought</div><div class="brainstorm-thought-content">${escapeHtml(node.content || node.label)}</div>`;
          }
        }
        // Highlight cluster in sidebar
        if (clusterEl) {
          clusterEl.querySelectorAll('.brainstorm-cluster-item').forEach(el => {
            el.classList.toggle('active', el.dataset.clusterId === node.clusterId);
          });
        }
      });
    });

    // Sidebar cluster list
    if (clusterEl) {
      clusterEl.innerHTML = clusters.map(c => {
        const lockedCls = c.locked ? ' locked-in-code' : '';
        const catCls = c.category ? ` cat-${c.category}` : '';
        return `
        <div class="brainstorm-cluster-item${lockedCls}${catCls}" data-cluster-id="${escapeHtml(c.id)}">
          <div class="brainstorm-cluster-name">${escapeHtml(c.name)}${c.locked ? ' <span class="locked-badge">in code</span>' : ''}</div>
          <div class="brainstorm-cluster-theme">${escapeHtml(c.theme)}</div>
          <div class="brainstorm-cluster-count">${(c.thoughts || []).length} thoughts</div>
        </div>`;
      }).join('');

      clusterEl.querySelectorAll('.brainstorm-cluster-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const cid = itemEl.dataset.clusterId;
          clusterEl.querySelectorAll('.brainstorm-cluster-item').forEach(el => el.classList.toggle('active', el.dataset.clusterId === cid));
          // Highlight cluster hub in canvas
          canvasEl.querySelectorAll('.constellation-node').forEach(n => {
            n.style.opacity = n.dataset.clusterId === cid ? '1' : '0.3';
          });
          canvasEl.querySelectorAll('.constellation-edge').forEach(e => { e.style.opacity = '0.15'; });
        });
      });
    }
  }

  renderSettings() {
    const settings = this.data.settings;
    const govEl = this.elements.settingsGovernance;
    const guardEl = this.elements.settingsGuardrails;
    if (!settings) return;

    if (govEl && settings.governance) {
      const g = settings.governance;
      govEl.innerHTML = `
        <div class="project-settings-row"><span class="project-settings-label">Injection Detection</span><span class="project-settings-value">${escapeHtml(g.injectionDetection)}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">PII Action</span><span class="project-settings-value">${escapeHtml(g.piiAction)}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">Max Tokens/Prompt</span><span class="project-settings-value">${g.maxTokensPerPrompt}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">Rate Limit</span><span class="project-settings-value">${escapeHtml(g.rateLimit)}</span></div>
      `;
    }

    if (guardEl && settings.guardrails) {
      const gr = settings.guardrails;
      guardEl.innerHTML = `
        <div class="project-settings-row"><span class="project-settings-label">Active Guardrails</span><span class="project-settings-value">${gr.activeGuardrails}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">Human Approval Gates</span><span class="project-settings-value">${gr.humanApprovalGates}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">Staged Execution</span><span class="project-settings-value">${gr.stagedExecution}</span></div>
        <div class="project-settings-row"><span class="project-settings-label">Validation Gates</span><span class="project-settings-value">${gr.validationGates}</span></div>
      `;
    }
  }
}
