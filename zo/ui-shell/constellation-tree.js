/**
 * Constellation Tree View
 *
 * Renders clusters as a hierarchical tree inside the mind-map container.
 * @module zo/ui-shell/constellation-tree
 */
(function() {
  "use strict";

  var projectId = null;
  var clusters = [];
  var thoughts = [];
  var container = null;

  function mount(el) {
    container = el || document.querySelector(".constellation-tree");
    window.addEventListener("genesis:event", function(e) {
      if (e.detail && e.detail.type === "clustering_completed") fetchData();
    });
    window.addEventListener("brainstorm:recording-ingested", function() {
      fetchData();
    });
  }

  function setProjectId(id) {
    projectId = id;
    if (projectId) fetchData();
  }

  function setState(data) {
    clusters = data.clusters || [];
    thoughts = data.thoughts || [];
    render();
  }

  function fetchData() {
    if (!projectId || !container) return;
    container.innerHTML = '<div class="constellation-loading">Loading mind map...</div>';

    fetch("/api/constellation/" + encodeURIComponent(projectId))
      .then(function(res) {
        if (!res.ok) throw new Error("Failed to load constellation");
        return res.json();
      })
      .then(function(data) {
        clusters = data.clusters || [];
        thoughts = data.thoughts || [];
        render();
      })
      .catch(function() {
        container.innerHTML = '<div class="constellation-loading">Failed to load.</div>';
      });
  }

  function render() {
    if (!container) return;
    if (clusters.length === 0) {
      container.innerHTML = '<div class="constellation-loading">No clusters yet. Brainstorm ideas first.</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      var count = Array.isArray(c.thoughtIds) ? c.thoughtIds.length : 0;
      var lockedCls = c.locked ? ' locked-in-code' : '';
      html += '<div class="constellation-node' + lockedCls + '" data-cluster-id="' + escapeAttr(c.id) + '">';
      html += '<span class="constellation-node-name">' + escapeHtml(c.name || c.suggestedName || "Cluster") + '</span>';
      if (c.locked) {
        html += '<span class="locked-badge">in code</span>';
      }
      if (c.theme) {
        html += '<span class="constellation-node-theme">' + escapeHtml(c.theme) + '</span>';
      }
      html += '<span class="constellation-node-count">' + count + ' idea' + (count !== 1 ? 's' : '') + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  window.ZoConstellationTree = {
    mount: mount,
    setState: setState,
    setProjectId: setProjectId,
    refresh: fetchData
  };
})();
