(function() {
  "use strict";

  var CONFIG = {
    rowHeight: 40,
    headerHeight: 60,
    colors: {
      phase: "#4A90D9",
      sprint: "#7CB342",
      milestone: "#F5A623",
      criticalPath: "#D32F2F",
      arrow: "#666666",
      weekend: "#F5F5F5"
    }
  };

  function GanttOverlay() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.state = null;
    this.barPositions = [];
    this.onClose = null;
    this.boundKeydown = this.handleKeydown.bind(this);
  }

  GanttOverlay.prototype.open = function(state) {
    this.state = state;
    this.createOverlay();
    this.render();
    document.addEventListener("keydown", this.boundKeydown);
  };

  GanttOverlay.prototype.close = function() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    document.removeEventListener("keydown", this.boundKeydown);
    if (this.onClose) this.onClose();
  };

  GanttOverlay.prototype.createOverlay = function() {
    var el = document.createElement("div");
    el.className = "gantt-overlay";
    el.innerHTML = this.buildHTML();
    document.body.appendChild(el);
    this.container = el;
    this.canvas = el.querySelector(".gantt-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.attachHandlers();
  };

  GanttOverlay.prototype.buildHTML = function() {
    return '<div class="gantt-header">' +
      '<div class="gantt-title">Gantt Chart</div>' +
      '<div class="gantt-controls">' +
        '<button class="gantt-scale-btn" data-scale="day">Day</button>' +
        '<button class="gantt-scale-btn active" data-scale="week">Week</button>' +
        '<button class="gantt-scale-btn" data-scale="month">Month</button>' +
        '<button class="gantt-close-btn" data-action="close">Close (ESC)</button>' +
      '</div>' +
    '</div>' +
    '<div class="gantt-body">' +
      '<div class="gantt-sidebar"></div>' +
      '<div class="gantt-canvas-container"><canvas class="gantt-canvas"></canvas></div>' +
    '</div>' +
    '<div class="gantt-legend">' +
      '<div class="gantt-legend-item"><div class="gantt-legend-color" style="background:#4A90D9"></div>Phase</div>' +
      '<div class="gantt-legend-item"><div class="gantt-legend-color" style="background:#7CB342"></div>Sprint</div>' +
      '<div class="gantt-legend-item"><div class="gantt-legend-color" style="background:#F5A623"></div>Milestone</div>' +
      '<div class="gantt-legend-item"><div class="gantt-legend-color" style="background:#D32F2F"></div>Critical Path</div>' +
    '</div>';
  };

  GanttOverlay.prototype.attachHandlers = function() {
    var self = this;

    this.container.querySelector("[data-action='close']").addEventListener("click", function() {
      self.close();
    });

    var scaleButtons = this.container.querySelectorAll(".gantt-scale-btn");
    for (var i = 0; i < scaleButtons.length; i++) {
      scaleButtons[i].addEventListener("click", function(e) {
        self.handleScaleChange(e.target);
      });
    }

    this.canvas.addEventListener("click", function(e) {
      var rect = self.canvas.getBoundingClientRect();
      self.handleClick(e.clientX - rect.left, e.clientY - rect.top);
    });
  };

  GanttOverlay.prototype.handleScaleChange = function(btn) {
    var buttons = this.container.querySelectorAll(".gantt-scale-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove("active");
    }
    btn.classList.add("active");
    this.state.viewport.scale = btn.getAttribute("data-scale");
    this.state.viewport.pixelsPerDay = this.getPixelsPerDay(this.state.viewport.scale);
    this.render();
  };

  GanttOverlay.prototype.getPixelsPerDay = function(scale) {
    return scale === "day" ? 60 : scale === "week" ? 30 : 10;
  };

  GanttOverlay.prototype.handleKeydown = function(e) {
    if (e.key === "Escape") this.close();
  };

  GanttOverlay.prototype.render = function() {
    this.renderSidebar();
    this.renderCanvas();
  };

  GanttOverlay.prototype.renderSidebar = function() {
    var sidebar = this.container.querySelector(".gantt-sidebar");
    var html = '<div class="gantt-sidebar-row" style="height:' + CONFIG.headerHeight + 'px;font-weight:600;">Tasks</div>';

    for (var i = 0; i < this.state.bars.length; i++) {
      var bar = this.state.bars[i];
      html += '<div class="gantt-sidebar-row ' + bar.type + '">' + escapeHtml(bar.label) + '</div>';
    }

    sidebar.innerHTML = html;
  };

  GanttOverlay.prototype.renderCanvas = function() {
    var vp = this.state.viewport;
    var bars = this.state.bars;

    var days = this.daysBetween(vp.startDate, vp.endDate);
    var width = days * vp.pixelsPerDay;
    var height = CONFIG.headerHeight + bars.length * CONFIG.rowHeight;

    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";

    this.ctx.clearRect(0, 0, width, height);
    this.renderHeader(vp, width);
    this.barPositions = this.calculateBarPositions(bars, vp);
    this.renderBars();
    this.renderArrows();
  };

  GanttOverlay.prototype.renderHeader = function(vp, width) {
    var startMs = new Date(vp.startDate).getTime();
    var days = this.daysBetween(vp.startDate, vp.endDate);
    var ctx = this.ctx;

    ctx.fillStyle = "#FAFAFA";
    ctx.fillRect(0, 0, width, CONFIG.headerHeight);
    ctx.fillStyle = "#333";
    ctx.font = "12px system-ui";

    for (var i = 0; i <= days; i++) {
      var date = new Date(startMs + i * 86400000);
      var x = i * vp.pixelsPerDay;

      if (date.getDay() === 0 || date.getDay() === 6) {
        ctx.fillStyle = CONFIG.colors.weekend;
        ctx.fillRect(x, CONFIG.headerHeight, vp.pixelsPerDay, this.canvas.height);
        ctx.fillStyle = "#333";
      }

      if (i % 7 === 0 || date.getDate() === 1) {
        var label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        ctx.fillText(label, x + 4, CONFIG.headerHeight - 10);
      }
    }
  };

  GanttOverlay.prototype.calculateBarPositions = function(bars, vp) {
    var startMs = new Date(vp.startDate).getTime();
    var positions = [];

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var barStartMs = new Date(bar.startDate).getTime();
      var barEndMs = new Date(bar.endDate).getTime();
      var x = ((barStartMs - startMs) / 86400000) * vp.pixelsPerDay;
      var days = Math.max(1, (barEndMs - barStartMs) / 86400000);
      var w = days * vp.pixelsPerDay;
      var y = CONFIG.headerHeight + i * CONFIG.rowHeight;
      positions.push({ bar: bar, x: x, width: w, y: y });
    }

    return positions;
  };

  GanttOverlay.prototype.renderBars = function() {
    var ctx = this.ctx;

    for (var i = 0; i < this.barPositions.length; i++) {
      var bp = this.barPositions[i];
      var bar = bp.bar;
      var color = bar.isOnCriticalPath ? CONFIG.colors.criticalPath : CONFIG.colors[bar.type];

      ctx.fillStyle = color;

      if (bar.type === "milestone") {
        this.renderMilestone(ctx, bp);
      } else {
        ctx.fillRect(bp.x, bp.y + 8, bp.width, CONFIG.rowHeight - 16);
      }

      if (bar.id === this.state.selectedBarId) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.strokeRect(bp.x - 1, bp.y + 7, bp.width + 2, CONFIG.rowHeight - 14);
      }
    }
  };

  GanttOverlay.prototype.renderMilestone = function(ctx, bp) {
    var cx = bp.x + bp.width / 2;
    var cy = bp.y + CONFIG.rowHeight / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 10, cy);
    ctx.closePath();
    ctx.fill();
  };

  GanttOverlay.prototype.renderArrows = function() {
    var ctx = this.ctx;
    var posMap = {};
    for (var i = 0; i < this.barPositions.length; i++) {
      posMap[this.barPositions[i].bar.id] = this.barPositions[i];
    }

    ctx.strokeStyle = CONFIG.colors.arrow;
    ctx.lineWidth = 1;

    for (var j = 0; j < this.barPositions.length; j++) {
      var bp = this.barPositions[j];
      for (var k = 0; k < bp.bar.dependencies.length; k++) {
        var dep = posMap[bp.bar.dependencies[k]];
        if (!dep) continue;
        this.renderArrow(ctx, dep, bp);
      }
    }
  };

  GanttOverlay.prototype.renderArrow = function(ctx, from, to) {
    var fromX = from.x + from.width;
    var fromY = from.y + CONFIG.rowHeight / 2;
    var toX = to.x;
    var toY = to.y + CONFIG.rowHeight / 2;
    var midX = (fromX + toX) / 2;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 6, toY - 4);
    ctx.lineTo(toX - 6, toY + 4);
    ctx.closePath();
    ctx.fillStyle = CONFIG.colors.arrow;
    ctx.fill();
  };

  GanttOverlay.prototype.handleClick = function(x, y) {
    var clicked = null;

    for (var i = 0; i < this.barPositions.length; i++) {
      var bp = this.barPositions[i];
      if (x >= bp.x && x <= bp.x + bp.width && y >= bp.y && y <= bp.y + CONFIG.rowHeight) {
        clicked = bp.bar;
        break;
      }
    }

    this.state.selectedBarId = clicked ? clicked.id : null;
    this.renderCanvas();
  };

  GanttOverlay.prototype.daysBetween = function(start, end) {
    return Math.ceil((new Date(end) - new Date(start)) / 86400000);
  };

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.GanttOverlay = GanttOverlay;
})();
