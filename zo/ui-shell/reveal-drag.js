/**
 * Reveal UI Component - Drag Interaction
 *
 * Cluster element creation, selection, renaming, and drag handling.
 */
(function() {
  'use strict';

  var state = null;
  var canvas = null;
  var dragState = null;

  function init() {
    state = window.ZoRevealState;
    canvas = document.querySelector('.reveal-canvas');
  }

  function createClusterElement(cluster, thoughts) {
    var el = document.createElement('div');
    el.className = 'reveal-cluster';
    el.dataset.clusterId = cluster.id;
    el.style.left = cluster.position.x + 'px';
    el.style.top = cluster.position.y + 'px';

    var inCluster = thoughts.filter(function(t) {
      return t.clusterId === cluster.id;
    });

    var pills = inCluster.slice(0, 3).map(function(t) {
      return '<span class="reveal-thought-pill">' +
        window.ZoReveal.escapeHtml(window.ZoReveal.truncate(t.content, 20)) + '</span>';
    }).join('');

    el.innerHTML = [
      '<input class="reveal-cluster-name" type="text" value="' +
        window.ZoReveal.escapeHtml(cluster.name) + '">',
      '<div class="reveal-cluster-theme">' +
        window.ZoReveal.escapeHtml(cluster.theme) + '</div>',
      '<div class="reveal-cluster-count">' + inCluster.length + ' thoughts</div>',
      '<div class="reveal-thoughts">' + pills + '</div>'
    ].join('');

    bindClusterEvents(el, cluster);
    return el;
  }

  function bindClusterEvents(el, cluster) {
    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('reveal-cluster-name')) return;
      selectCluster(cluster.id);
    });

    var nameInput = el.querySelector('.reveal-cluster-name');
    nameInput.addEventListener('change', function() {
      renameCluster(cluster.id, nameInput.value);
    });

    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('reveal-cluster-name')) return;
      startDrag(el, cluster, e);
    });
  }

  function selectCluster(clusterId) {
    state.selectedClusterId = clusterId;
    var all = canvas.querySelectorAll('.reveal-cluster');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('selected', all[i].dataset.clusterId === clusterId);
    }
  }

  function renameCluster(clusterId, name) {
    var cluster = state.clusters.find(function(c) { return c.id === clusterId; });
    if (cluster) cluster.name = name;

    fetch('/api/reveal/' + state.sessionId + '/cluster/' + clusterId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name })
    }).catch(function() {});
  }

  function startDrag(el, cluster, e) {
    dragState = {
      el: el,
      cluster: cluster,
      startX: e.clientX,
      startY: e.clientY,
      origX: cluster.position.x,
      origY: cluster.position.y
    };
    el.classList.add('dragging');
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    dragState.cluster.position.x = dragState.origX + dx;
    dragState.cluster.position.y = dragState.origY + dy;
    dragState.el.style.left = dragState.cluster.position.x + 'px';
    dragState.el.style.top = dragState.cluster.position.y + 'px';
  }

  function endDrag() {
    if (!dragState) return;
    dragState.el.classList.remove('dragging');

    fetch('/api/reveal/' + state.sessionId + '/cluster/' + dragState.cluster.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: dragState.cluster.position })
    }).catch(function() {});

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    dragState = null;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.ZoRevealDrag = {
    createClusterElement: createClusterElement,
    selectCluster: selectCluster
  };
})();
