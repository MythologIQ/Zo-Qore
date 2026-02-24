/**
 * Reveal UI Component - Core
 *
 * Main reveal UI state and rendering.
 * Drag interaction is in reveal-drag.js.
 */
(function() {
  'use strict';

  // State (shared with reveal-drag.js via window.ZoRevealState)
  var state = window.ZoRevealState = {
    sessionId: null,
    clusters: [],
    thoughts: [],
    outliers: [],
    selectedClusterId: null
  };

  // DOM Elements
  var container = null;
  var canvas = null;
  var outliersEl = null;

  function init() {
    container = document.getElementById('reveal-container');
    if (!container) return;

    canvas = container.querySelector('.reveal-canvas');
    outliersEl = container.querySelector('.reveal-outliers');

    window.addEventListener('void:reveal', function(e) {
      state.sessionId = e.detail.sessionId;
      showReveal();
    });
  }

  function showReveal() {
    container.classList.add('active');
    loadRevealData();
  }

  function hideReveal() {
    container.classList.remove('active');
    state.clusters = [];
    state.thoughts = [];
    state.outliers = [];
    state.selectedClusterId = null;
    canvas.innerHTML = '';
  }

  function loadRevealData() {
    canvas.innerHTML = '<div class="reveal-loading">Loading clusters...</div>';
    var projectId = getProjectId();

    // Use PlanningClient if available, otherwise fallback to legacy API
    if (typeof PlanningClient !== 'undefined') {
      Promise.all([
        PlanningClient.getThoughts(projectId),
        PlanningClient.getClusters(projectId)
      ])
        .then(function(results) {
          var thoughts = results[0] || [];
          var clusters = results[1] || [];
          
          // Separate thoughts that are in clusters vs outliers
          var clusterThoughtIds = {};
          clusters.forEach(function(c) {
            (c.thoughtIds || []).forEach(function(tid) {
              clusterThoughtIds[tid] = true;
            });
          });
          
          var outliers = thoughts.filter(function(t) {
            return !clusterThoughtIds[t.thoughtId] && t.status !== 'claimed';
          });
          
          state.clusters = clusters;
          state.thoughts = thoughts;
          state.outliers = outliers;
          renderClusters();
          renderOutliers();
        })
        .catch(function() {
          canvas.innerHTML = '<div class="reveal-loading">Failed to load.</div>';
        });
    } else {
      // Fallback to legacy API
      fetch('/api/reveal/' + encodeURIComponent(state.sessionId))
        .then(function(resp) {
          if (!resp.ok) throw new Error('Failed to load reveal data');
          return resp.json();
        })
        .then(function(data) {
          state.clusters = data.clusters || [];
          state.thoughts = data.thoughts || [];
          state.outliers = data.outliers || [];
          renderClusters();
          renderOutliers();
        })
        .catch(function() {
          canvas.innerHTML = '<div class="reveal-loading">Failed to load.</div>';
        });
    }
  }

  function renderClusters() {
    canvas.innerHTML = '';
    state.clusters.forEach(function(cluster) {
      var el = window.ZoRevealDrag.createClusterElement(cluster, state.thoughts);
      canvas.appendChild(el);
    });
  }

  function renderOutliers() {
    if (!outliersEl || state.outliers.length === 0) {
      if (outliersEl) outliersEl.style.display = 'none';
      return;
    }

    outliersEl.style.display = 'block';
    var pills = state.outliers.map(function(t) {
      return '<span class="reveal-thought-pill">' + escapeHtml(truncate(t.content, 30)) + '</span>';
    }).join('');

    outliersEl.innerHTML =
      '<div class="reveal-outliers-title">Unclustered (' + state.outliers.length + ')</div>' +
      '<div class="reveal-outlier-pills">' + pills + '</div>';
  }

  function confirmOrganization() {
    fetch('/api/reveal/' + state.sessionId + '/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    .then(function() {
      hideReveal();
      window.dispatchEvent(new CustomEvent('reveal:confirmed', {
        detail: { sessionId: state.sessionId }
      }));
    })
    .catch(function() {});
  }

  function cancelReveal() {
    fetch('/api/reveal/' + state.sessionId + '/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    .then(function() { hideReveal(); })
    .catch(function() {});
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    return str.length <= len ? str : str.substring(0, len) + '...';
  }

  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default-project';
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.ZoReveal = {
    show: showReveal,
    hide: hideReveal,
    confirm: confirmOrganization,
    cancel: cancelReveal,
    getState: function() { return state; },
    escapeHtml: escapeHtml,
    truncate: truncate
  };
})();
