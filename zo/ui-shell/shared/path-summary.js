(function() {
  "use strict";

  function PathSummary() {
    this.container = null;
    this.state = null;
    this.onOpenGantt = null;
    this.onPhaseClick = null;
  }

  PathSummary.prototype.mount = function(container) {
    this.container = container;
    this.render();
  };

  PathSummary.prototype.setState = function(state) {
    this.state = state;
    this.render();
  };

  PathSummary.prototype.render = function() {
    if (!this.container || !this.state) return;

    var html = '<div class="path-summary">';
    html += this.renderHeader();
    html += this.renderPhases();
    html += '</div>';

    this.container.innerHTML = html;
    this.attachHandlers();
  };

  PathSummary.prototype.renderHeader = function() {
    var s = this.state;
    var duration = s.totalDurationDays ? s.totalDurationDays + " days" : "Not scheduled";

    return '<div class="path-summary-header">' +
      '<div>' +
        '<div class="path-summary-title">Path</div>' +
        '<div class="path-summary-meta">' + s.phases.length + ' phases \u2022 ' + duration + '</div>' +
      '</div>' +
      '<div class="path-summary-actions">' +
        '<button class="path-summary-btn" data-action="generate">Regenerate</button>' +
        '<button class="path-summary-btn path-summary-btn-primary" data-action="gantt">Open Gantt</button>' +
      '</div>' +
    '</div>';
  };

  PathSummary.prototype.renderPhases = function() {
    var s = this.state;
    if (s.phases.length === 0) {
      return '<div class="path-empty">' +
        '<p>No phases generated yet.</p>' +
        '<button class="path-summary-btn path-summary-btn-primary path-empty-btn" data-action="generate">Generate from Constellation</button>' +
      '</div>';
    }

    var criticalSet = {};
    for (var i = 0; i < s.criticalPath.length; i++) {
      criticalSet[s.criticalPath[i]] = true;
    }

    var html = '<div class="path-phases">';
    for (var j = 0; j < s.phases.length; j++) {
      html += this.renderPhaseCard(s.phases[j], j, criticalSet);
    }
    html += '</div>';
    return html;
  };

  PathSummary.prototype.renderPhaseCard = function(phase, index, criticalSet) {
    var isCritical = criticalSet[phase.id];
    var dates = phase.startDate && phase.endDate
      ? formatDate(phase.startDate) + " - " + formatDate(phase.endDate)
      : "Not scheduled";

    var html = '<div class="phase-card' + (isCritical ? ' critical' : '') + '" data-phase-id="' + phase.id + '">';
    html += '<div class="phase-number">' + (index + 1) + '</div>';
    html += '<div class="phase-info">';
    html += '<div class="phase-name">' + escapeHtml(phase.name) + '</div>';
    html += '<div class="phase-dates">' + dates + '</div>';
    html += '</div>';
    html += '<div class="phase-meta">';
    html += '<span>' + phase.sprints.length + ' sprints</span>';
    if (phase.riskCount > 0) {
      html += '<span class="phase-risk-badge">' + phase.riskCount + ' risks</span>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  };

  PathSummary.prototype.attachHandlers = function() {
    var self = this;

    var buttons = this.container.querySelectorAll("[data-action]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function(e) {
        var action = e.target.getAttribute("data-action");
        if (action === "gantt" && self.onOpenGantt) {
          self.onOpenGantt();
        } else if (action === "generate") {
          self.emit("generate");
        }
      });
    }

    var cards = this.container.querySelectorAll(".phase-card");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("click", function(e) {
        var card = e.currentTarget;
        var phaseId = card.getAttribute("data-phase-id");
        if (self.onPhaseClick) {
          self.onPhaseClick(phaseId);
        }
      });
    }
  };

  PathSummary.prototype.emit = function(eventType) {
    this.container.dispatchEvent(new CustomEvent("path:" + eventType, { bubbles: true }));
  };

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.PathSummary = PathSummary;
})();
