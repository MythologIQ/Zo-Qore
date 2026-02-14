/**
 * Constellation Spatial View
 *
 * Full-screen 2D cluster visualization with momentum physics.
 */
(function () {
  "use strict";

  var state = null;
  var canvas = null;
  var ctx = null;
  var animationFrame = null;
  var isActive = false;

  var viewport = {
    x: 0,
    y: 0,
    scale: 1,
    velocityX: 0,
    velocityY: 0,
  };

  var physics = {
    friction: 0.92,
    impulse: 15,
    maxVelocity: 50,
    minVelocity: 0.1,
  };

  var keys = { up: false, down: false, left: false, right: false };

  function init() {
    state = window.ZoConstellationState;
    canvas = document.querySelector(".constellation-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  function show() {
    if (!canvas) return;
    isActive = true;
    canvas.style.display = "block";
    document.querySelector(".constellation-tree").style.display = "none";
    resizeCanvas();
    centerViewport();
    startAnimation();
  }

  function hide() {
    isActive = false;
    canvas.style.display = "none";
    document.querySelector(".constellation-tree").style.display = "block";
    cancelAnimationFrame(animationFrame);
  }

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 400;
  }

  function centerViewport() {
    viewport.x = canvas.width / 2;
    viewport.y = canvas.height / 2;
    viewport.velocityX = 0;
    viewport.velocityY = 0;
  }

  function startAnimation() {
    function tick() {
      if (!isActive) return;
      update();
      render();
      animationFrame = requestAnimationFrame(tick);
    }
    tick();
  }

  function update() {
    if (keys.up) viewport.velocityY += physics.impulse;
    if (keys.down) viewport.velocityY -= physics.impulse;
    if (keys.left) viewport.velocityX += physics.impulse;
    if (keys.right) viewport.velocityX -= physics.impulse;

    viewport.velocityX *= physics.friction;
    viewport.velocityY *= physics.friction;

    if (Math.abs(viewport.velocityX) < physics.minVelocity) viewport.velocityX = 0;
    if (Math.abs(viewport.velocityY) < physics.minVelocity) viewport.velocityY = 0;

    viewport.velocityX = clamp(viewport.velocityX, -physics.maxVelocity, physics.maxVelocity);
    viewport.velocityY = clamp(viewport.velocityY, -physics.maxVelocity, physics.maxVelocity);

    viewport.x += viewport.velocityX;
    viewport.y += viewport.velocityY;
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(viewport.x, viewport.y);

    drawConnections();

    var clusters = state.spatialClusters || state.clusters || [];
    for (var i = 0; i < clusters.length; i++) {
      drawCluster(clusters[i]);
    }

    ctx.restore();
  }

  function drawConnections() {
    var clusters = state.spatialClusters || state.clusters || [];
    ctx.strokeStyle = "rgba(61, 125, 255, 0.3)";
    ctx.lineWidth = 2;

    for (var i = 0; i < clusters.length; i++) {
      var cluster = clusters[i];
      var connections = cluster.connections || [];
      for (var j = 0; j < connections.length; j++) {
        var target = clusters.find(function (c) {
          return c.id === connections[j];
        });
        if (target && target.position) {
          ctx.beginPath();
          ctx.moveTo(cluster.position.x, cluster.position.y);
          ctx.lineTo(target.position.x, target.position.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawCluster(cluster) {
    var x = cluster.position ? cluster.position.x : 0;
    var y = cluster.position ? cluster.position.y : 0;
    var radius = 40;

    ctx.fillStyle = cluster.id === state.selectedClusterId ? "#3d7dff" : "#182d51";
    ctx.strokeStyle = "#315181";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e9f1ff";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(truncate(cluster.name, 15), x, y + 4);
  }

  function onKeyDown(e) {
    if (!isActive) return;
    if (e.key === "ArrowUp" || e.key === "w") keys.up = true;
    if (e.key === "ArrowDown" || e.key === "s") keys.down = true;
    if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
    if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
    if (e.key === "Escape") hide();
  }

  function onKeyUp(e) {
    if (e.key === "ArrowUp" || e.key === "w") keys.up = false;
    if (e.key === "ArrowDown" || e.key === "s") keys.down = false;
    if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
    if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function truncate(str, len) {
    return str.length <= len ? str : str.substring(0, len) + "...";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ZoConstellationSpatial = {
    show: show,
    hide: hide,
    getViewport: function () {
      return viewport;
    },
  };
})();
