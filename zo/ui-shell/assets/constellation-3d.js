/**
 * Constellation 3D Mind Map
 *
 * Three.js-based 3D visualization of brainstorm clusters.
 * - Vivid color-coded nodes by category
 * - Frequency-weighted sizing (more mentions = larger node)
 * - Locked-in-code nodes rendered as wireframe + desaturated (gray)
 * - Click node to open thought bubble over node (positioned on screen)
 * - OrbitControls for rotation/zoom
 * - Insight metrics: Vision Strength, Importance, Maturity, Connectivity
 * - 2D/3D toggle switch
 */
(function () {
  'use strict';

  var THREE;
  var scene, camera, renderer, raycaster, mouse;
  var containerEl, modalEl, modalTitle, modalBody, modalClose;
  var nodeMeshes = [];
  var edgeLines = [];
  var glowSprites = [];
  var textSprites = [];
  var clusterData = [];
  var allClusters = []; // keep reference for metrics
  var animFrameId = null;
  var initialized = false;
  var selectedMesh = null;
  var is3D = false; // default to 2D view

  // Vivid category color palette — bright, saturated
  var CATEGORY_COLORS = {
    architecture: 0x4da6ff,
    feature:      0x4dff88,
    data:         0xffaa33,
    ux:           0xff66b2,
    infra:        0xb366ff,
    security:     0xff4d4d,
    testing:      0x33ddcc,
    governance:   0x4da6ff,
    capture:      0xffcc33,
    intelligence: 0x66ccff,
    mythology:    0xcc77ff,
    default:      0x5599ff
  };

  // Name-to-category mapping for clusters that lack explicit category
  var NAME_CATEGORY_MAP = {
    'governance': 'governance', 'ai governance': 'governance', 'guardrail': 'governance',
    'builder': 'ux', 'builder experience': 'ux', 'ux': 'ux', 'ui': 'ux',
    'capture': 'capture', 'knowledge': 'capture', 'knowledge capture': 'capture', 'brainstorm': 'capture',
    'intelligence': 'intelligence', 'project intelligence': 'intelligence', 'intel': 'intelligence',
    'myth': 'mythology', 'mythological': 'mythology', 'mythological framework': 'mythology', 'mythology': 'mythology',
    'security': 'security', 'testing': 'testing', 'infrastructure': 'infra', 'infra': 'infra',
    'data': 'data', 'feature': 'feature', 'architecture': 'architecture'
  };

  // Palette for clusters that don't match any known name
  var DISTINCT_PALETTE = [0x4da6ff, 0x4dff88, 0xffaa33, 0xff66b2, 0xb366ff, 0xff4d4d, 0x33ddcc, 0xffcc33, 0x66ccff, 0xcc77ff];

  // Gray color for locked-in-code nodes
  var LOCKED_COLOR = 0x777777;

  function inferCategory(name, id, index) {
    var n = (name || id || '').toLowerCase().trim();
    if (NAME_CATEGORY_MAP[n]) return NAME_CATEGORY_MAP[n];
    // Try partial match
    for (var key in NAME_CATEGORY_MAP) {
      if (n.indexOf(key) !== -1) return NAME_CATEGORY_MAP[key];
    }
    return null;
  }

  function getCategoryColor(cat, index) {
    if (cat) {
      var key = cat.toLowerCase().replace(/\s+/g, '');
      if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
    }
    // Fallback: distinct color by index
    if (typeof index === 'number') {
      return DISTINCT_PALETTE[index % DISTINCT_PALETTE.length];
    }
    return CATEGORY_COLORS.default;
  }

  function hexToRgbStr(hex) {
    var r = (hex >> 16) & 255;
    var g = (hex >> 8) & 255;
    var b = hex & 255;
    return r + ',' + g + ',' + b;
  }

  // ─── Public API ─────────────────────────────────────────────
  window.Constellation3D = {
    mount: mount,
    setState: setState,
    refresh: refresh,
    toggleView: toggleView,
    toggleFullscreen: toggleFullscreen
  };

  function mount(container) {
    containerEl = container;
    if (!containerEl) return;

    modalEl = document.getElementById('constellation-modal');
    modalTitle = document.getElementById('constellation-modal-title');
    modalBody = document.getElementById('constellation-modal-body');
    modalClose = document.getElementById('constellation-modal-close');

    if (modalClose) {
      modalClose.addEventListener('click', closeModal);
    }

    initialized = true;
    if (clusterData.length > 0) render2D();
  }

  function setState(data) {
    clusterData = data.clusters || [];
    allClusters = clusterData;
    if (initialized) {
      if (is3D) buildGraph();
      else render2D();
    }
  }

  function refresh() {
    if (initialized) {
      if (is3D) buildGraph();
      else render2D();
    }
  }

  function destroy() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (renderer && containerEl) {
      containerEl.removeChild(renderer.domElement);
    }
    if (scene) {
      while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
      }
    }
    initialized = false;
    nodeMeshes = [];
    edgeLines = [];
    glowSprites = [];
    textSprites = [];
  }

  function toggleView() {
    is3D = !is3D;
    if (!initialized) return is3D;
    
    if (is3D) {
      // Switching TO 3D — lazy-load Three.js if not yet loaded
      containerEl.innerHTML = '<p class="empty-state">Loading 3D engine...</p>';
      loadThreeJs(function () {
        containerEl.innerHTML = '';
        initScene();
        buildGraph();
        animate();
      });
    } else {
      // Switching TO 2D
      if (animFrameId) cancelAnimationFrame(animFrameId);
      containerEl.innerHTML = '';
      render2D();
    }
    
    return is3D;
  }

  function toggleFullscreen() {
    var wrapper = containerEl ? containerEl.closest('.brainstorm-canvas-wrapper') : null;
    if (!wrapper) wrapper = containerEl;
    if (!wrapper) return;

    if (document.fullscreenElement === wrapper) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen().catch(function(err) {
        console.warn('[Constellation] Fullscreen denied:', err);
      });
    }
  }

  // Re-render on fullscreen change so the canvas fills the new dimensions
  document.addEventListener('fullscreenchange', function() {
    if (!containerEl || !initialized) return;
    // Small delay for layout to settle
    setTimeout(function() {
      if (is3D && camera && renderer) {
        onResize();
      } else if (!is3D) {
        containerEl.innerHTML = '';
        render2D();
      }
    }, 100);
  });

  // ─── Load Three.js ─────────────────────────────────────────
  function loadThreeJs(callback) {
    if (window.THREE) {
      THREE = window.THREE;
      callback();
      return;
    }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = function () {
      THREE = window.THREE;
      callback();
    };
    script.onerror = function () {
      console.error('[Constellation3D] Failed to load Three.js');
    };
    document.head.appendChild(script);
  }

  // ─── 2D Rendering ───────────────────────────────────────────
  function render2D() {
    if (!containerEl || !clusterData || clusterData.length === 0) return;

    containerEl.innerHTML = '';
    var width = containerEl.clientWidth || 700;
    var height = containerEl.clientHeight || 440;
    var pad = 40;

    // Create 2D container
    var container = document.createElement('div');
    container.className = 'constellation-2d-container';
    container.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:var(--bg);border-radius:10px;';

    // Create SVG for edges
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(svg);

    // ── First pass: compute raw positions ──
    var rawNodes = []; // { x, y, size, type, data, parentIdx }
    var rawEdges = []; // { x1, y1, x2, y2, color, width, opacity, dash }
    var clusterRadius = Math.min(width, height) * 0.35;
    var cx0 = width / 2;
    var cy0 = height / 2;

    clusterData.forEach(function (cluster, ci) {
      var angle = (2 * Math.PI * ci) / clusterData.length;
      var cx = cx0 + clusterRadius * Math.cos(angle);
      var cy = cy0 + clusterRadius * Math.sin(angle);
      var mentionCount = cluster.mentionCount || (cluster.thoughts ? cluster.thoughts.length : 1);
      var size = 40 + Math.log2(1 + mentionCount) * 15;
      var derivedCat = cluster.category || inferCategory(cluster.name, cluster.id, ci);
      var color = cluster.locked ? '#777777' : '#' + getCategoryColor(derivedCat, ci).toString(16).padStart(6, '0');

      var hubIdx = rawNodes.length;
      rawNodes.push({ x: cx, y: cy, size: size, type: 'cluster', data: cluster, color: color, derivedCat: derivedCat, ci: ci });

      var thoughts = cluster.thoughts || [];
      var thoughtRadius = 60 + thoughts.length * 10;
      thoughts.forEach(function (t, ti) {
        var ta = (2 * Math.PI * ti) / thoughts.length;
        var tx = cx + thoughtRadius * Math.cos(ta);
        var ty = cy + thoughtRadius * Math.sin(ta);
        var tSize = 24 + Math.log2(1 + (t.mentionCount || 1)) * 8;
        var tColor = t.locked ? '#777777' : '#' + getCategoryColor(t.category || derivedCat, ci).toString(16).padStart(6, '0');
        rawNodes.push({ x: tx, y: ty, size: tSize, type: 'thought', data: t, color: tColor, parentIdx: hubIdx, derivedCat: derivedCat, ci: ci });
        rawEdges.push({ x1: cx, y1: cy, x2: tx, y2: ty, color: color, width: 1.5, opacity: 0.4 });
      });
    });

    // Cluster-to-cluster edges
    var clusterPositions = {};
    rawNodes.forEach(function (n, i) {
      if (n.type === 'cluster') clusterPositions[n.data.id] = { x: n.x, y: n.y };
    });
    clusterData.forEach(function (cluster) {
      var src = clusterPositions[cluster.id];
      if (!src) return;
      (cluster.connections || []).forEach(function (conn) {
        var tgt = clusterPositions[conn.targetClusterId];
        if (tgt) rawEdges.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, color: '#18c2a5', width: 2, opacity: 0.5, dash: '5,5' });
      });
    });

    // ── Compute bounding box and scale to fit ──
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rawNodes.forEach(function (n) {
      var half = n.size / 2;
      if (n.x - half < minX) minX = n.x - half;
      if (n.x + half > maxX) maxX = n.x + half;
      if (n.y - half < minY) minY = n.y - half;
      if (n.y + half > maxY) maxY = n.y + half;
    });

    var rawW = maxX - minX || 1;
    var rawH = maxY - minY || 1;
    var availW = width - pad * 2;
    var availH = height - pad * 2;
    var scale = Math.min(availW / rawW, availH / rawH, 1); // never scale up
    var offsetX = pad + (availW - rawW * scale) / 2 - minX * scale;
    var offsetY = pad + (availH - rawH * scale) / 2 - minY * scale;

    function tx(x) { return x * scale + offsetX; }
    function ty(y) { return y * scale + offsetY; }
    function ts(s) { return s * scale; }

    // ── Draw edges ──
    rawEdges.forEach(function (e) {
      var edge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      edge.setAttribute('x1', tx(e.x1));
      edge.setAttribute('y1', ty(e.y1));
      edge.setAttribute('x2', tx(e.x2));
      edge.setAttribute('y2', ty(e.y2));
      edge.setAttribute('stroke', e.color);
      edge.setAttribute('stroke-width', e.width);
      edge.setAttribute('opacity', e.opacity);
      if (e.dash) edge.setAttribute('stroke-dasharray', e.dash);
      svg.appendChild(edge);
    });

    // ── Draw nodes ──
    rawNodes.forEach(function (n) {
      var sx = tx(n.x);
      var sy = ty(n.y);
      var ss = ts(n.size);

      var node = document.createElement('div');
      node.className = 'constellation-node-2d' + (n.data.locked ? ' locked' : '') + (n.type === 'thought' ? ' thought' : '');

      if (n.type === 'cluster') {
        node.style.cssText = 'position:absolute;left:' + (sx - ss/2) + 'px;top:' + (sy - ss/2) + 'px;width:' + ss + 'px;height:' + ss + 'px;border-radius:50%;background:' + n.color + ';box-shadow:0 0 20px ' + n.color + '80,0 0 40px ' + n.color + '40;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.max(0.5, 0.7 * scale) + 'rem;color:#fff;text-align:center;padding:5px;transition:transform 0.2s,box-shadow 0.2s;';
        node.textContent = (n.data.name || n.data.suggestedName || 'C').substring(0, 3).toUpperCase();
        node.addEventListener('click', (function(d, nx, ny) { return function(e) { e.stopPropagation(); openModal2D(d, nx, ny); }; })(n.data, sx, sy));
      } else {
        node.style.cssText = 'position:absolute;left:' + (sx - ss/2) + 'px;top:' + (sy - ss/2) + 'px;width:' + ss + 'px;height:' + ss + 'px;border-radius:50%;background:' + n.color + ';cursor:pointer;opacity:0.85;transition:transform 0.2s,opacity 0.2s;';
        node.addEventListener('click', (function(d, nx, ny) { return function(e) { e.stopPropagation(); openModal2D(d, nx, ny); }; })(n.data, sx, sy));
      }
      node.addEventListener('mouseenter', function() { node.style.transform = 'scale(1.15)'; });
      node.addEventListener('mouseleave', function() { node.style.transform = 'scale(1)'; });
      container.appendChild(node);
    });

    containerEl.appendChild(container);
  }

  function openModal2D(data, nodeX, nodeY) {
    openModal(data, null, nodeX, nodeY);
  }

  // ─── Scene Setup (3D) ───────────────────────────────────────────
  function initScene() {
    var w = containerEl.clientWidth || 700;
    var h = containerEl.clientHeight || 440;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060e1e);
    scene.fog = new THREE.FogExp2(0x060e1e, 0.004);

    camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    camera.position.set(0, 0, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    containerEl.innerHTML = '';
    containerEl.appendChild(renderer.domElement);

    // Stronger lighting for vivid colors
    var ambient = new THREE.AmbientLight(0x223355, 0.8);
    scene.add(ambient);

    var key = new THREE.PointLight(0x88bbff, 1.2, 400);
    key.position.set(50, 60, 80);
    scene.add(key);

    var fill = new THREE.PointLight(0x22ffcc, 0.6, 300);
    fill.position.set(-50, -30, 60);
    scene.add(fill);

    var rim = new THREE.PointLight(0xff66aa, 0.4, 250);
    rim.position.set(0, 50, -60);
    scene.add(rim);

    // Raycaster for click detection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Mouse/touch interaction
    renderer.domElement.addEventListener('click', onCanvasClick, false);
    renderer.domElement.addEventListener('mousedown', onDragStart, false);
    renderer.domElement.addEventListener('mousemove', onDragMove, false);
    renderer.domElement.addEventListener('mouseup', onDragEnd, false);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onDragEnd, false);
    window.addEventListener('resize', onResize, false);
  }

  var isDragging = false;
  var dragMoved = false;
  var prevMouse = { x: 0, y: 0 };
  var spherical = { theta: 0, phi: Math.PI / 2, radius: 120 };

  function onDragStart(e) {
    isDragging = true;
    dragMoved = false;
    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
  }

  function onDragMove(e) {
    if (!isDragging) return;
    var dx = e.clientX - prevMouse.x;
    var dy = e.clientY - prevMouse.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    spherical.theta -= dx * 0.005;
    spherical.phi -= dy * 0.005;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
    updateCameraFromSpherical();
    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
  }

  function onDragEnd() {
    isDragging = false;
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      isDragging = true;
      dragMoved = false;
      prevMouse.x = e.touches[0].clientX;
      prevMouse.y = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    var dx = e.touches[0].clientX - prevMouse.x;
    var dy = e.touches[0].clientY - prevMouse.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    spherical.theta -= dx * 0.005;
    spherical.phi -= dy * 0.005;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
    updateCameraFromSpherical();
    prevMouse.x = e.touches[0].clientX;
    prevMouse.y = e.touches[0].clientY;
  }

  function onWheel(e) {
    e.preventDefault();
    spherical.radius += e.deltaY * 0.05;
    spherical.radius = Math.max(30, Math.min(300, spherical.radius));
    updateCameraFromSpherical();
  }

  function updateCameraFromSpherical() {
    if (!camera) return;
    camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.position.y = spherical.radius * Math.cos(spherical.phi);
    camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.lookAt(0, 0, 0);
  }

  function onResize() {
    if (!containerEl || !camera || !renderer) return;
    var w = containerEl.clientWidth;
    var h = containerEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ─── Click / Modal ─────────────────────────────────────────
  function onCanvasClick(e) {
    if (dragMoved) return; // ignore drags
    if (!renderer || !camera) return;
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects(nodeMeshes);

    if (intersects.length > 0) {
      var mesh = intersects[0].object;
      var data = mesh.userData;
      if (data && data.label) {
        // Highlight selected
        if (selectedMesh && selectedMesh.material) {
          selectedMesh.material.emissiveIntensity = selectedMesh.userData._baseEmissive || 0.25;
        }
        selectedMesh = mesh;
        if (mesh.material && !data.locked) {
          mesh.material.emissiveIntensity = 0.8;
        }
        openModal(data, mesh);
      }
    } else {
      // Click on empty space dismisses toast
      closeModal();
    }
  }

  // ─── Insight Metrics ───────────────────────────────────────

  function calcVisionStrength(data) {
    // How complete/fleshed-out is this idea? 0-100
    var score = 0;
    // Has a theme/description
    if (data.theme && data.theme.length > 20) score += 25;
    else if (data.theme) score += 10;
    // Has thoughts (sub-ideas)
    var thoughts = data.thoughts || [];
    if (thoughts.length >= 4) score += 30;
    else if (thoughts.length >= 2) score += 20;
    else if (thoughts.length >= 1) score += 10;
    // Has connections to other clusters
    var connections = data.connections || [];
    if (connections.length >= 2) score += 20;
    else if (connections.length >= 1) score += 10;
    // Has been mentioned multiple times (refinement)
    var mentions = data.mentionCount || 0;
    if (mentions >= 5) score += 25;
    else if (mentions >= 3) score += 15;
    else if (mentions >= 1) score += 5;
    return Math.min(100, score);
  }

  function calcImportance(data) {
    // 1-10 scale based on mentions + thought density
    var mentions = data.mentionCount || (data.thoughts ? data.thoughts.length : 0);
    // Find max mentions across all clusters for normalization
    var maxMentions = 1;
    allClusters.forEach(function (c) {
      var m = c.mentionCount || (c.thoughts ? c.thoughts.length : 0);
      if (m > maxMentions) maxMentions = m;
    });
    var normalized = mentions / maxMentions;
    return Math.max(1, Math.min(10, Math.round(normalized * 9 + 1)));
  }

  function calcMaturity(data) {
    if (data.locked) return 'Implemented';
    var thoughts = (data.thoughts || []).length;
    var mentions = data.mentionCount || 0;
    if (thoughts >= 4 && mentions >= 3) return 'Refined';
    if (thoughts >= 2) return 'Developing';
    if (thoughts >= 1 || mentions >= 1) return 'Emerging';
    return 'Seed';
  }

  function calcConnectivity(data) {
    var connections = data.connections || [];
    if (connections.length >= 3) return 'Highly Connected';
    if (connections.length >= 2) return 'Well Connected';
    if (connections.length >= 1) return 'Linked';
    return 'Isolated';
  }

  function calcActionability(data) {
    // Are thoughts specific enough to act on?
    var thoughts = data.thoughts || [];
    if (thoughts.length === 0) return 'Abstract';
    var avgLen = 0;
    thoughts.forEach(function (t) {
      avgLen += (typeof t === 'string' ? t : (t.content || '')).length;
    });
    avgLen = avgLen / thoughts.length;
    if (avgLen > 60 && thoughts.length >= 3) return 'Actionable';
    if (avgLen > 30) return 'Directional';
    return 'Abstract';
  }

  function getMaturityColor(maturity) {
    switch (maturity) {
      case 'Implemented': return '#777777';
      case 'Refined': return 'var(--good)';
      case 'Developing': return 'var(--accent)';
      case 'Emerging': return 'var(--warn)';
      default: return '#777777';
    }
  }

  function renderBar(pct, color) {
    return '<div class="insight-bar"><div class="insight-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
  }

  // ─── Modal (Thought Bubble) ─────────────────────────────────────────────────
  function openModal(data, mesh, nodeX, nodeY) {
    if (!modalEl || !modalTitle || !modalBody) return;
    modalTitle.textContent = data.label || 'Concept';

    var catColor = '#' + getCategoryColor(data.category || inferCategory(data.label, data.id, 0), 0).toString(16).padStart(6, '0');
    var html = '';

    // Category badge
    if (data.category) {
      html += '<div class="modal-category"><span class="modal-cat-dot" style="background:' + catColor + '"></span>' + escapeHtml(data.category) + '</div>';
    }

    // Theme
    if (data.theme) {
      html += '<p class="modal-theme">' + escapeHtml(data.theme) + '</p>';
    }

    // Locked badge
    if (data.locked) {
      html += '<div class="modal-locked-badge">Locked in Code</div>';
    }

    // ── Insight Metrics ──
    if (data.isHub) {
      var vision = calcVisionStrength(data);
      var importance = calcImportance(data);
      var maturity = calcMaturity(data);
      var connectivity = calcConnectivity(data);
      var actionability = calcActionability(data);
      var importancePct = importance * 10;

      html += '<div class="modal-insights">';

      html += '<div class="insight-row">';
      html += '<span class="insight-label">Vision Strength</span>';
      html += '<span class="insight-value">' + vision + '%</span>';
      html += '</div>';
      html += renderBar(vision, catColor);

      html += '<div class="insight-row">';
      html += '<span class="insight-label">Importance</span>';
      html += '<span class="insight-value">' + importance + ' / 10</span>';
      html += '</div>';
      html += renderBar(importancePct, 'var(--accent)');

      html += '<div class="insight-row">';
      html += '<span class="insight-label">Maturity</span>';
      html += '<span class="insight-value" style="color:' + getMaturityColor(maturity) + '">' + maturity + '</span>';
      html += '</div>';

      html += '<div class="insight-row">';
      html += '<span class="insight-label">Connectivity</span>';
      html += '<span class="insight-value">' + connectivity + '</span>';
      html += '</div>';

      html += '<div class="insight-row">';
      html += '<span class="insight-label">Actionability</span>';
      html += '<span class="insight-value">' + actionability + '</span>';
      html += '</div>';

      var mentions = data.mentionCount || 0;
      if (mentions > 0) {
        html += '<div class="insight-row">';
        html += '<span class="insight-label">Brainstorm Mentions</span>';
        html += '<span class="insight-value insight-mention-count">' + mentions + '</span>';
        html += '</div>';
      }

      html += '</div>';
    } else {
      // For individual thoughts, show simpler info
      if (data.mentionCount && data.mentionCount > 1) {
        html += '<div class="modal-insights">';
        html += '<div class="insight-row">';
        html += '<span class="insight-label">Mentions</span>';
        html += '<span class="insight-value insight-mention-count">' + data.mentionCount + '</span>';
        html += '</div>';
        html += '</div>';
      }
    }

    // Related thoughts
    if (data.thoughts && data.thoughts.length > 0) {
      html += '<div class="modal-thoughts-section"><h4 class="modal-section-title">Related Thoughts</h4><ul class="modal-thoughts">';
      data.thoughts.forEach(function (t) {
        html += '<li>' + escapeHtml(typeof t === 'string' ? t : (t.content || t.label || '')) + '</li>';
      });
      html += '</ul></div>';
    }

    // Content (for individual thoughts)
    if (data.content) {
      html += '<p class="modal-content">' + escapeHtml(data.content) + '</p>';
    }

    modalBody.innerHTML = html || '<p class="modal-empty">No additional details.</p>';

    // Reset position styles
    modalEl.style.left = '';
    modalEl.style.top = '';
    modalEl.style.right = '';
    modalEl.style.bottom = '';
    modalEl.style.transform = '';

    // Show first to measure dimensions
    modalEl.classList.add('visible');

    // Position as toast near clicked node
    if (mesh && camera && renderer) {
      var vector = new THREE.Vector3();
      mesh.getWorldPosition(vector);
      vector.project(camera);

      var rect = renderer.domElement.getBoundingClientRect();
      var x = (vector.x * 0.5 + 0.5) * rect.width;
      var y = (-(vector.y * 0.5) + 0.5) * rect.height;

      // Clamp within container bounds with padding
      var mw = modalEl.offsetWidth || 300;
      var mh = modalEl.offsetHeight || 200;
      var pad = 12;
      // Position above the node, centered horizontally
      var posX = Math.max(pad, Math.min(x - mw / 2, rect.width - mw - pad));
      var posY = Math.max(pad, Math.min(y - mh - 16, rect.height - mh - pad));

      modalEl.style.left = posX + 'px';
      modalEl.style.top = posY + 'px';
    } else if (typeof nodeX === 'number' && typeof nodeY === 'number') {
      // 2D mode: position near the clicked node
      var cw = containerEl ? containerEl.clientWidth : 700;
      var ch = containerEl ? containerEl.clientHeight : 440;
      var mw2 = modalEl.offsetWidth || 300;
      var mh2 = modalEl.offsetHeight || 200;
      var pad2 = 12;
      // Position above the node, centered horizontally on it
      var posX2 = Math.max(pad2, Math.min(nodeX - mw2 / 2, cw - mw2 - pad2));
      var posY2 = nodeY - mh2 - 16;
      // If not enough room above, position below the node
      if (posY2 < pad2) posY2 = nodeY + 30;
      // Clamp vertically
      posY2 = Math.max(pad2, Math.min(posY2, ch - mh2 - pad2));
      modalEl.style.left = posX2 + 'px';
      modalEl.style.top = posY2 + 'px';
    } else {
      // Fallback: center in container
      var cwFb = containerEl ? containerEl.clientWidth : 700;
      var mwFb = modalEl.offsetWidth || 300;
      modalEl.style.left = Math.max(12, (cwFb - mwFb) / 2) + 'px';
      modalEl.style.top = '60px';
    }
  }

  function closeModal() {
    if (modalEl) modalEl.classList.remove('visible');
    if (selectedMesh && selectedMesh.material && !selectedMesh.userData.locked) {
      selectedMesh.material.emissiveIntensity = selectedMesh.userData._baseEmissive || 0.25;
    }
    selectedMesh = null;
  }

  // ─── Graph Building (3D) ────────────────────────────────────────
  function buildGraph() {
    // Clear old meshes
    nodeMeshes.forEach(function (m) { scene.remove(m); });
    edgeLines.forEach(function (l) { scene.remove(l); });
    glowSprites.forEach(function (s) { scene.remove(s); });
    textSprites.forEach(function (s) { scene.remove(s); });
    nodeMeshes = [];
    edgeLines = [];
    glowSprites = [];
    textSprites = [];

    if (clusterData.length === 0) return;

    var nodeMap = {};
    var clusters = clusterData;

    // Layout clusters on a sphere
    var clusterRadius = 40;
    var goldenAngle = Math.PI * (3 - Math.sqrt(5));

    clusters.forEach(function (cluster, ci) {
      var y = 1 - (ci / Math.max(clusters.length - 1, 1)) * 2;
      var radiusAtY = Math.sqrt(1 - y * y);
      var theta = goldenAngle * ci;
      var cx = clusterRadius * radiusAtY * Math.cos(theta);
      var cy = clusterRadius * y;
      var cz = clusterRadius * radiusAtY * Math.sin(theta);

      // Mention frequency determines size
      var mentionCount = cluster.mentionCount || (cluster.thoughts ? cluster.thoughts.length : 1);
      var baseSize = 3.5;
      var sizeScale = baseSize + Math.log2(1 + mentionCount) * 1.8;

      // Create hub node (derive category from name if missing)
      var derivedCategory = cluster.category || inferCategory(cluster.name, cluster.id, ci);
      var color = cluster.locked ? LOCKED_COLOR : getCategoryColor(derivedCategory, ci);
      var hubMesh = createNodeMesh(cx, cy, cz, sizeScale, color, cluster.locked);
      hubMesh.userData = {
        id: cluster.id,
        label: cluster.name || cluster.suggestedName || 'Cluster',
        theme: cluster.theme || '',
        category: derivedCategory || '',
        locked: !!cluster.locked,
        mentionCount: mentionCount,
        thoughts: cluster.thoughts || [],
        connections: cluster.connections || [],
        isHub: true,
        _baseEmissive: cluster.locked ? 0 : 0.25
      };
      scene.add(hubMesh);
      nodeMeshes.push(hubMesh);
      nodeMap[cluster.id] = { x: cx, y: cy, z: cz };

      // Text label above hub node
      var hubLabel = cluster.name || cluster.suggestedName || 'Cluster';
      var labelColor = '#' + (cluster.locked ? LOCKED_COLOR : color).toString(16).padStart(6, '0');
      var textSprite = createTextSprite(hubLabel, labelColor, 32);
      textSprite.position.set(cx, cy + sizeScale + 3, cz);
      textSprite.userData = { isHub: true };
      scene.add(textSprite);
      textSprites.push(textSprite);

      // Glow sprite for hub (only for unlocked nodes)
      if (!cluster.locked) {
        var glow = createGlowSprite(cx, cy, cz, sizeScale * 3.5, color);
        scene.add(glow);
        glowSprites.push(glow);
      }

      // Thought nodes around hub
      var thoughts = cluster.thoughts || [];
      var thoughtRadius = 8 + thoughts.length * 1.8;
      thoughts.forEach(function (t, ti) {
        var ta = (2 * Math.PI / Math.max(thoughts.length, 1)) * ti;
        var tphi = Math.acos(1 - 2 * (ti + 0.5) / Math.max(thoughts.length, 1));
        var tx = cx + thoughtRadius * Math.sin(tphi) * Math.cos(ta);
        var ty = cy + thoughtRadius * Math.cos(tphi);
        var tz = cz + thoughtRadius * Math.sin(tphi) * Math.sin(ta);

        var tMentions = t.mentionCount || 1;
        var tSize = 1.4 + Math.log2(1 + tMentions) * 0.9;
        var tColor = t.locked ? LOCKED_COLOR : getCategoryColor(t.category || derivedCategory, ci);
        var tMesh = createNodeMesh(tx, ty, tz, tSize, tColor, !!t.locked);
        tMesh.userData = {
          id: t.id,
          label: (t.content || '').substring(0, 50) || 'Thought',
          content: t.content || '',
          category: t.category || derivedCategory || '',
          locked: !!t.locked,
          mentionCount: tMentions,
          isHub: false,
          _baseEmissive: t.locked ? 0 : 0.25
        };
        scene.add(tMesh);
        nodeMeshes.push(tMesh);

        // Text label for thought node (abbreviated)
        var tLabel = ((t.content || '').substring(0, 18) || 'Thought');
        if ((t.content || '').length > 18) tLabel += '...';
        var tLabelColor = '#' + (t.locked ? LOCKED_COLOR : tColor).toString(16).padStart(6, '0');
        var tTextSprite = createTextSprite(tLabel, tLabelColor, 20);
        tTextSprite.position.set(tx, ty + tSize + 1.8, tz);
        tTextSprite.userData = { isHub: false };
        scene.add(tTextSprite);
        textSprites.push(tTextSprite);

        // Edge from hub to thought
        var edge = createEdge(cx, cy, cz, tx, ty, tz, 0.3, color);
        scene.add(edge);
        edgeLines.push(edge);
      });

      // Cluster-to-cluster connections stored for later
      nodeMap[cluster.id].connections = cluster.connections || [];
    });

    // Draw cluster-to-cluster edges after all clusters are placed
    clusters.forEach(function (cluster) {
      var src = nodeMap[cluster.id];
      if (!src) return;
      (cluster.connections || []).forEach(function (conn) {
        var target = nodeMap[conn.targetClusterId];
        if (target) {
          var strength = conn.strength || 0.3;
          var edge = createEdge(src.x, src.y, src.z, target.x, target.y, target.z, strength, 0x18c2a5);
          scene.add(edge);
          edgeLines.push(edge);
        }
      });
    });

    // Add subtle star particles in background
    addStarField();

    // Reset camera
    spherical = { theta: 0, phi: Math.PI / 2, radius: 120 };
    updateCameraFromSpherical();
  }

  function createNodeMesh(x, y, z, size, color, locked) {
    var geom = new THREE.SphereGeometry(size, 32, 32);
    var mat;

    if (locked) {
      // Gray desaturated + wireframe for locked nodes
      mat = new THREE.MeshPhongMaterial({
        color: LOCKED_COLOR,
        emissive: 0x222222,
        emissiveIntensity: 0.1,
        wireframe: true,
        transparent: true,
        opacity: 0.6
      });
    } else {
      // Vivid glowing for unlocked nodes
      mat = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.25,
        shininess: 60
      });
    }

    var mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function createEdge(x1, y1, z1, x2, y2, z2, strength, color) {
    var points = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
    var geom = new THREE.BufferGeometry().setFromPoints(points);
    var mat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: strength * 0.6
    });
    var line = new THREE.Line(geom, mat);
    return line;
  }

  function createGlowSprite(x, y, z, size, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    var rgb = hexToRgbStr(color);
    gradient.addColorStop(0, 'rgba(' + rgb + ', 0.4)');
    gradient.addColorStop(0.4, 'rgba(' + rgb + ', 0.15)');
    gradient.addColorStop(1, 'rgba(' + rgb + ', 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    var tex = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false
    });
    var sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  function createTextSprite(text, color, fontSize) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    fontSize = fontSize || 28;
    ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
    var metrics = ctx.measureText(text);
    var textWidth = metrics.width;
    canvas.width = Math.max(64, Math.ceil(textWidth + 20));
    canvas.height = fontSize + 16;
    // Re-set font after resize
    ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    var sprite = new THREE.Sprite(mat);
    var aspect = canvas.width / canvas.height;
    var spriteHeight = 3.5;
    sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
    return sprite;
  }

  function addStarField() {
    if (scene.userData.starField) {
      scene.remove(scene.userData.starField);
    }
    var starGeo = new THREE.BufferGeometry();
    var starCount = 200;
    var positions = new Float32Array(starCount * 3);
    for (var i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 600;
      positions[i + 1] = (Math.random() - 0.5) * 600;
      positions[i + 2] = (Math.random() - 0.5) * 600;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0x88aacc,
      size: 0.8,
      transparent: true,
      opacity: 0.5
    });
    var stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    scene.userData.starField = stars;
  }

  // ─── Animation ─────────────────────────────────────────────
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    // Gentle auto-rotation when not dragging
    if (!isDragging) {
      spherical.theta += 0.0008;
      updateCameraFromSpherical();
    }

    // Subtle breathing on nodes + glow pulse
    var t = Date.now() * 0.001;
    nodeMeshes.forEach(function (mesh, i) {
      if (!mesh.userData.locked) {
        var scale = 1 + Math.sin(t * 0.8 + i * 0.9) * 0.04;
        mesh.scale.set(scale, scale, scale);
      }
    });
    glowSprites.forEach(function (sprite, i) {
      var pulse = 1 + Math.sin(t * 0.6 + i * 1.1) * 0.15;
      var base = sprite.scale.x / (1 + Math.sin((t - 0.016) * 0.6 + i * 1.1) * 0.15 || 1);
      sprite.scale.set(base * pulse, base * pulse, 1);
    });

    // Distance-based label visibility: hide small node labels when far or behind camera
    if (textSprites.length > 0 && camera) {
      var camPos = camera.position;
      var camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      textSprites.forEach(function (sprite) {
        if (sprite.userData && sprite.userData.isHub) {
          sprite.visible = true;
          return;
        }
        var toSprite = new THREE.Vector3().subVectors(sprite.position, camPos);
        var dist = toSprite.length();
        var dot = toSprite.normalize().dot(camDir);
        // Hide if behind camera or very far
        if (dot < 0.1 || dist > 100) {
          sprite.visible = false;
        } else {
          sprite.visible = true;
          // Fade opacity based on distance
          var opacity = dist < 40 ? 1.0 : Math.max(0, 1.0 - (dist - 40) / 60);
          sprite.material.opacity = opacity;
        }
      });
    }

    renderer.render(scene, camera);
  }

  // ─── Utility ───────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
})();
