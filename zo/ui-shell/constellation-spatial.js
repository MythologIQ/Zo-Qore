/**
 * Constellation Spatial View
 *
 * Renders clusters as positioned circles on a canvas element.
 * @module zo/ui-shell/constellation-spatial
 */
(function() {
  "use strict";

  var canvas = null;
  var ctx = null;
  var clusters = [];

  function mount(el) {
    canvas = el || document.querySelector(".constellation-canvas");
    if (canvas) ctx = canvas.getContext("2d");
  }

  function setData(data) {
    clusters = data.spatialClusters || data.clusters || [];
    render();
  }

  function render() {
    if (!canvas || !ctx) return;
    var w = canvas.width = canvas.offsetWidth;
    var h = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    if (clusters.length === 0) return;

    var primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#3d7dff";
    var muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#888";

    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      var pos = c.position || { x: 0.1 + (i * 0.2), y: 0.5 };
      var x = pos.x * w;
      var y = pos.y * h;
      var count = Array.isArray(c.thoughtIds) ? c.thoughtIds.length : 0;
      var radius = Math.max(20, Math.min(50, 15 + count * 5));

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = primary;
      ctx.globalAlpha = 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = muted;
      ctx.font = "600 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(c.name || "Cluster", x, y + radius + 16);
    }
  }

  window.ZoConstellationSpatial = {
    mount: mount,
    setData: setData,
    render: render
  };
})();
