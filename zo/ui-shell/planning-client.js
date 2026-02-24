/**
 * PlanningClient - Client-side API wrapper for the planning pipeline
 * 
 * Provides methods for CRUD operations on all six planning views:
 * Void, Reveal, Constellation, Path, Risk, and Autonomy
 */
(function() {
  'use strict';

  var API_BASE = '/api/projects';

  var PlanningClient = {
    _currentProjectId: 'default-project',
    _apiKey: null,

    setProjectId: function(projectId) {
      this._currentProjectId = projectId;
    },

    getCurrentProjectId: function() {
      var params = new URLSearchParams(window.location.search);
      return params.get('project') || this._currentProjectId;
    },

    setApiKey: function(key) {
      this._apiKey = key;
    },

    _fetch: function(url, options) {
      var headers = {};
      if (this._apiKey) {
        headers['Authorization'] = 'Bearer ' + this._apiKey;
      }
      if (options && options.body && typeof options.body === 'object') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      var opts = options || {};
      opts.headers = Object.assign({}, headers, opts.headers);
      return fetch(url, opts).then(function(resp) {
        if (!resp.ok) {
          return resp.json().then(function(err) {
            var e = new Error(err.message || 'API Error');
            e.status = resp.status;
            e.data = err;
            throw e;
          });
        }
        return resp.json();
      });
    },

    // ========== NAV-STATE ==========
    getNavState: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch('/api/project/' + projectId + '/nav-state');
    },

    // ========== INTEGRITY ==========
    checkIntegrity: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch('/api/projects/' + projectId + '/integrity');
    },

    runChecks: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch('/api/projects/' + projectId + '/check', { method: 'POST' });
    },

    // ========== VICTOR ==========
    getVictorReview: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch('/api/victor/review-plan', {
        method: 'POST',
        body: { projectId: projectId }
      });
    },

    // ========== VOID - Thoughts ==========
    getThoughts: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/void/thoughts')
        .then(function(data) { return data.thoughts || []; });
    },

    addThought: function(content, source, capturedBy, tags) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/void/thoughts', {
        method: 'POST',
        body: {
          content: content,
          source: source || 'text',
          capturedBy: capturedBy || 'user',
          tags: tags || []
        }
      });
    },

    updateThoughtStatus: function(thoughtId, status) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/void/thoughts/' + thoughtId + '/status', {
        method: 'PUT',
        body: { status: status }
      });
    },

    // ========== REVEAL - Clusters ==========
    getClusters: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/reveal/clusters')
        .then(function(data) { return data.clusters || []; });
    },

    createCluster: function(label, thoughtIds, notes) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/reveal/clusters', {
        method: 'POST',
        body: {
          label: label,
          thoughtIds: thoughtIds || [],
          notes: notes || ''
        }
      });
    },

    updateCluster: function(clusterId, updates) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/reveal/clusters/' + clusterId, {
        method: 'PUT',
        body: updates
      });
    },

    deleteCluster: function(clusterId) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/reveal/clusters/' + clusterId, {
        method: 'DELETE'
      });
    },

    // ========== CONSTELLATION - Map ==========
    getConstellation: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/constellation/map')
        .then(function(data) { return data.map; });
    },

    saveConstellation: function(mapData) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/constellation/map', {
        method: 'POST',
        body: mapData
      });
    },

    // ========== PATH - Phases ==========
    getPhases: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/path/phases')
        .then(function(data) { return data.phases || []; });
    },

    createPhase: function(phaseData) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/path/phases', {
        method: 'POST',
        body: phaseData
      });
    },

    updatePhase: function(phaseId, updates) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/path/phases/' + phaseId, {
        method: 'PUT',
        body: updates
      });
    },

    deletePhase: function(phaseId) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/path/phases/' + phaseId, {
        method: 'DELETE'
      });
    },

    // ========== RISK - Register ==========
    getRisks: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/risk/register')
        .then(function(data) { return data.risks || []; });
    },

    addRisk: function(riskData) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/risk/register', {
        method: 'POST',
        body: riskData
      });
    },

    updateRisk: function(riskId, updates) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/risk/register/' + riskId, {
        method: 'PUT',
        body: updates
      });
    },

    deleteRisk: function(riskId) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/risk/register/' + riskId, {
        method: 'DELETE'
      });
    },

    // ========== AUTONOMY - Config ==========
    getAutonomyConfig: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/autonomy/config')
        .then(function(data) { return data.config; });
    },

    saveAutonomyConfig: function(config) {
      var projectId = this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId + '/autonomy/config', {
        method: 'POST',
        body: config
      });
    },

    // ========== PROJECT ==========
    getProject: function(projectId) {
      projectId = projectId || this.getCurrentProjectId();
      return this._fetch(API_BASE + '/' + projectId);
    },

    createProject: function(name, description, createdBy) {
      return this._fetch(API_BASE, {
        method: 'POST',
        body: {
          name: name,
          description: description || '',
          createdBy: createdBy || 'user'
        }
      });
    },

    // ========== LEDGER ==========
    getLedger: function(projectId, limit) {
      projectId = projectId || this.getCurrentProjectId();
      var url = API_BASE + '/' + projectId + '/ledger';
      if (limit) url += '?limit=' + limit;
      return this._fetch(url);
    }
  };

  // Expose globally
  window.PlanningClient = PlanningClient;

  // Dispatch ready event
  document.dispatchEvent(new CustomEvent('planning:client-ready', {
    detail: { PlanningClient: PlanningClient }
  }));
})();
