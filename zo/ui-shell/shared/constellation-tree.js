/**
 * Constellation Tree View
 *
 * Hierarchical cluster display with expand/collapse.
 */
(function () {
  "use strict";

  var state = (window.ZoConstellationState = {
    projectId: null,
    view: "hierarchical",
    clusters: [],
    thoughts: [],
    selectedClusterId: null,
  });

  var container = null;
  var treeEl = null;

  function init() {
    container = document.getElementById("constellation-container");
    if (!container) return;

    treeEl = container.querySelector(".constellation-tree");
    bindToggleButtons();

    window.addEventListener("reveal:confirmed", function (e) {
      state.projectId = e.detail.projectId || "default-project";
      loadConstellation();
    });
  }

  function bindToggleButtons() {
    var btns = container.querySelectorAll(".constellation-toggle-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", onToggleView);
    }
  }

  function onToggleView(e) {
    var view = e.target.dataset.view;
    if (!view) return;
    state.view = view;
    updateToggleButtons();
    if (view === "spatial") {
      window.ZoConstellationSpatial && window.ZoConstellationSpatial.show();
    } else {
      window.ZoConstellationSpatial && window.ZoConstellationSpatial.hide();
    }
  }

  function updateToggleButtons() {
    var btns = container.querySelectorAll(".constellation-toggle-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.view === state.view);
    }
  }

  function loadConstellation() {
    fetch("/api/constellation/" + encodeURIComponent(state.projectId))
      .then(function (resp) {
        return resp.json();
      })
      .then(function (data) {
        state.clusters = data.clusters || [];
        state.thoughts = data.thoughts || [];
        renderTree();
        container.classList.add("active");
      })
      .catch(function () {});
  }

  function renderTree() {
    treeEl.innerHTML = state.clusters.map(createNodeHtml).join("");
    bindNodeEvents();
  }

  function createNodeHtml(cluster) {
    var thoughts = getThoughtsForCluster(cluster.id);
    var expanded = cluster.isExpanded ? "expanded" : "";

    return [
      '<div class="constellation-node ' + expanded + '" data-cluster-id="' + cluster.id + '">',
      '  <div class="constellation-node-header">',
      '    <button class="constellation-expand-btn">' + (cluster.isExpanded ? "\u25BC" : "\u25B6") + "</button>",
      '    <span class="constellation-node-name">' + escapeHtml(cluster.name) + "</span>",
      '    <span class="constellation-node-count">' + thoughts.length + "</span>",
      "  </div>",
      '  <div class="constellation-node-theme">' + escapeHtml(cluster.theme) + "</div>",
      '  <div class="constellation-thoughts">',
      thoughts.slice(0, 5).map(function (t) {
        return '<div class="constellation-thought">' + escapeHtml(truncate(t.content, 50)) + "</div>";
      }).join(""),
      "  </div>",
      "</div>",
    ].join("");
  }

  function getThoughtsForCluster(clusterId) {
    return state.thoughts.filter(function (t) {
      return t.clusterId === clusterId;
    });
  }

  function bindNodeEvents() {
    var nodes = treeEl.querySelectorAll(".constellation-node");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      node.querySelector(".constellation-expand-btn").addEventListener("click", toggleExpand);
      node.addEventListener("click", selectNode);
    }
  }

  function toggleExpand(e) {
    e.stopPropagation();
    var node = e.target.closest(".constellation-node");
    var clusterId = node.dataset.clusterId;
    var cluster = state.clusters.find(function (c) {
      return c.id === clusterId;
    });
    if (cluster) {
      cluster.isExpanded = !cluster.isExpanded;
      renderTree();
    }
  }

  function selectNode(e) {
    var node = e.target.closest(".constellation-node");
    state.selectedClusterId = node.dataset.clusterId;
    updateSelection();
  }

  function updateSelection() {
    var nodes = treeEl.querySelectorAll(".constellation-node");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("selected", nodes[i].dataset.clusterId === state.selectedClusterId);
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    return str.length <= len ? str : str.substring(0, len) + "...";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ZoConstellationTree = {
    load: loadConstellation,
    getState: function () {
      return state;
    },
  };
})();
