function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(value ?? "");
}

function setJson(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(value, null, 2);
}

async function getJson(path) {
  const res = await fetch(path);
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function refreshHub() {
  try {
    const { ok, json } = await getJson("/api/hub");
    if (!ok) {
      setText("status-line", "Hub unavailable");
      return;
    }
    const runtime = json.runtime || {};
    setText("runtime-state", runtime.connected ? "Connected" : runtime.enabled ? "Unreachable" : "Disabled");
    setText("policy-version", runtime.policyVersion || "unknown");
    setText("runtime-endpoint", runtime.baseUrl || "n/a");
    setText("runtime-latency", Number.isFinite(Number(runtime.latencyMs)) ? `${Math.round(Number(runtime.latencyMs))} ms` : "n/a");
    setText("status-line", json.monitor?.statusLine || "Ready");
  } catch (error) {
    setText("status-line", `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function refreshHealth() {
  const result = await getJson("/api/qore/health");
  setJson("health-output", result);
}

async function submitEvaluate(event) {
  event.preventDefault();
  const actorId = document.getElementById("actor-id")?.value || "did:myth:test:actor";
  const action = document.getElementById("action")?.value || "read";
  const targetPath = document.getElementById("target-path")?.value || "repo://unknown";
  const context = document.getElementById("context")?.value || "";
  const requestId = `ui_${Date.now()}`;

  const payload = {
    requestId,
    actorId,
    action,
    targetPath,
    rationale: context,
  };

  const response = await fetch("/api/qore/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  setJson("evaluate-output", { ok: response.ok, status: response.status, body });
  await refreshHub();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("evaluate-form")?.addEventListener("submit", submitEvaluate);
  document.getElementById("refresh-health")?.addEventListener("click", refreshHealth);
  refreshHub();
  refreshHealth();
  setInterval(refreshHub, 5000);
});
