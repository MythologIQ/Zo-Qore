/**
 * Planning API Client
 *
 * Client library for interacting with the planning pipeline API.
 * Used by UI views to fetch and display planning data.
 */

(function(global) {
  'use strict';

  /**
   * Get project ID from URL query params or default
   */
  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  /**
   * Build API URL for planning endpoints
   */
  function buildUrl(path) {
    var projectId = getProjectId();
    return '/api/projects/' + encodeURIComponent(projectId) + path;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  function fetchApi(url, options) {
    return fetch(url, Object.assign({
      headers: {
        'Content-Type': 'application/json'
      }
    }, options)).then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) {
          throw new Error(err.error?.message || 'API error: ' + res.status);
        });
      }
      return res.json();
    });
  }

  /**
   * Planning API Client
   */
  var PlanningClient = {
    // --- Nav State ---
    
    /**
     * Get navigation state including pipeline status
     */
    getNavState: function() {
      return fetchApi('/api/project/' + encodeURIComponent(getProjectId()) + '/nav-state');
    },

    // --- Void (Thoughts) ---

    /**
     * Get all thoughts for current project
     */
    getThoughts: function() {
      return fetchApi(buildUrl('/void/thoughts')).then(function(data) {
        return data.thoughts || [];
      });
    },

    /**
     * Add a new thought
     */
    addThought: function(content, source, capturedBy, tags) {
      return fetchApi(buildUrl('/void/thoughts'), {
        method: 'POST',
        body: JSON.stringify({ content: content, source: source, capturedBy: capturedBy, tags: tags })
      });
    },

    // --- Reveal (Clusters) ---

    /**
     * Get all clusters for current project
     */
    getClusters: function() {
      return fetchApi(buildUrl('/reveal/clusters')).then(function(data) {
        return data.clusters || [];
      });
    },

    /**
     * Create a new cluster
     */
    createCluster: function(label, thoughtIds, notes, actorId) {
      return fetchApi(buildUrl('/reveal/clusters'), {
        method: 'POST',
        body: JSON.stringify({ label: label, thoughtIds: thoughtIds, notes: notes, actorId: actorId })
      });
    },

    // --- Constellation (Map) ---

    /**
     * Get constellation map
     */
    getConstellation: function() {
      return fetchApi(buildUrl('/constellation/map'));
    },

    /**
     * Save constellation map
     */
    saveConstellation: function(nodes, edges, actorId) {
      return fetchApi(buildUrl('/constellation/map'), {
        method: 'POST',
        body: JSON.stringify({ nodes: nodes, edges: edges, actorId: actorId })
      });
    },

    // --- Path (Phases) ---

    /**
     * Get all phases
     */
    getPhases: function() {
      return fetchApi(buildUrl('/path/phases')).then(function(data) {
        return data.phases || [];
      });
    },

    /**
     * Create a new phase
     */
    createPhase: function(name, objective, sourceClusterIds, tasks, actorId) {
      return fetchApi(buildUrl('/path/phases'), {
        method: 'POST',
        body: JSON.stringify({
          name: name,
          objective: objective,
          sourceClusterIds: sourceClusterIds,
          tasks: tasks,
          actorId: actorId
        })
      });
    },

    // --- Risk (Register) ---

    /**
     * Get all risk entries
     */
    getRisks: function() {
      return fetchApi(buildUrl('/risk/register')).then(function(data) {
        return data.risks || [];
      });
    },

    /**
     * Add a new risk entry
     */
    addRisk: function(phaseId, description, likelihood, impact, mitigation, owner, actorId) {
      return fetchApi(buildUrl('/risk/register'), {
        method: 'POST',
        body: JSON.stringify({
          phaseId: phaseId,
          description: description,
          likelihood: likelihood,
          impact: impact,
          mitigation: mitigation,
          owner: owner,
          actorId: actorId
        })
      });
    },

    // --- Autonomy (Config) ---

    /**
     * Get autonomy config
     */
    getAutonomyConfig: function() {
      return fetchApi(buildUrl('/autonomy/config'));
    },

    /**
     * Save autonomy config
     */
    saveAutonomyConfig: function(config, actorId) {
      return fetchApi(buildUrl('/autonomy/config'), {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, config, { actorId: actorId }))
      });
    },

    // --- Integrity & Ledger ---

    /**
     * Get integrity check results
     */
    checkIntegrity: function() {
      return fetchApi(buildUrl('/integrity'));
    },

    /**
     * Run a specific integrity check
     */
    runCheck: function(checkId) {
      return fetchApi(buildUrl('/check'), {
        method: 'POST',
        body: JSON.stringify({ checkId: checkId })
      });
    },

    /**
     * Get ledger entries
     */
    getLedger: function(filters) {
      var url = buildUrl('/ledger');
      if (filters) {
        var params = new URLSearchParams();
        if (filters.view) params.set('view', filters.view);
        if (filters.action) params.set('action', filters.action);
        var qs = params.toString();
        if (qs) url += '?' + qs;
      }
      return fetchApi(url).then(function(data) {
        return data.entries || [];
      });
    },

    // --- Victor Review ---

    /**
     * Request Victor review of planning data
     */
    requestVictorReview: function(scope) {
      return fetchApi('/api/victor/review-plan', {
        method: 'POST',
        body: JSON.stringify({ projectId: getProjectId(), scope: scope })
      });
    }
  };

  // Expose globally
  global.PlanningClient = PlanningClient;

})(typeof window !== 'undefined' ? window : global);
