/**
 * Victor UI - Alden-Inspired Dashboard
 * Lightweight virtual collaborator with clear boundaries
 * No LLM chat - deterministic processing only
 */
import { useState } from "react";

type VictorTabId = "hub" | "tasks" | "email" | "calendar" | "settings";

interface VictorTab {
  id: VictorTabId;
  label: string;
  icon: string;
}

const VICTOR_TABS: VictorTab[] = [
  { id: "hub", label: "Command Center", icon: "⚡" },
  { id: "tasks", label: "Task Management", icon: "📋" },
  { id: "email", label: "Email", icon: "✉️" },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function VictorUI() {
  const [activeTab, setActiveTab] = useState<VictorTabId>("hub");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                V
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Victor</h1>
                <p className="text-xs text-slate-400">Virtual Collaborator • Deterministic Mode</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-mono">
                ONLINE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VICTOR_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                ${activeTab === tab.id
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-700"
                }
              `}
            >
              <span>{tab.icon}</span>
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "hub" && <VictorHub />}
        {activeTab === "tasks" && <VictorTasks />}
        {activeTab === "email" && <VictorEmail />}
        {activeTab === "calendar" && <VictorCalendar />}
        {activeTab === "settings" && <VictorSettings />}
      </div>
    </div>
  );
}

function VictorHub() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
            <div className="text-sm text-slate-400 mb-1">Processing Mode</div>
            <div className="text-xl font-bold text-green-400">Deterministic</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
            <div className="text-sm text-slate-400 mb-1">LLM Access</div>
            <div className="text-xl font-bold text-rose-400">Disabled</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
            <div className="text-sm text-slate-400 mb-1">Boundary Mode</div>
            <div className="text-xl font-bold text-blue-400">Protected</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="p-4 bg-slate-900/50 rounded-lg border border-white/5 hover:border-blue-500/30 hover:bg-slate-800/50 transition-all text-left">
            <div className="text-blue-400 text-2xl mb-2">📋</div>
            <div className="font-medium text-white">Create Task</div>
            <div className="text-sm text-slate-400">Add a new deterministic task</div>
          </button>
          <button className="p-4 bg-slate-900/50 rounded-lg border border-white/5 hover:border-blue-500/30 hover:bg-slate-800/50 transition-all text-left">
            <div className="text-green-400 text-2xl mb-2">✉️</div>
            <div className="font-medium text-white">Check Email</div>
            <div className="text-sm text-slate-400">Review unread messages</div>
          </button>
          <button className="p-4 bg-slate-900/50 rounded-lg border border-white/5 hover:border-blue-500/30 hover:bg-slate-800/50 transition-all text-left">
            <div className="text-purple-400 text-2xl mb-2">📅</div>
            <div className="font-medium text-white">View Calendar</div>
            <div className="text-sm text-slate-400">Check upcoming events</div>
          </button>
          <button className="p-4 bg-slate-900/50 rounded-lg border border-white/5 hover:border-blue-500/30 hover:bg-slate-800/50 transition-all text-left">
            <div className="text-rose-400 text-2xl mb-2">🛡️</div>
            <div className="font-medium text-white">Review Rules</div>
            <div className="text-sm text-slate-400">View governance boundaries</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function VictorTasks() {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Task Management</h2>
        <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors">
          + Add Task
        </button>
      </div>
      <div className="space-y-3">
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5">
          <div className="flex items-start justify-between mb-2">
            <div className="font-medium text-white">Review Zo-Qore Policy</div>
            <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 text-xs font-mono">PENDING</span>
          </div>
          <div className="text-sm text-slate-400">Validate current governance rules against Victor principles</div>
        </div>
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5">
          <div className="flex items-start justify-between mb-2">
            <div className="font-medium text-white">Analyze AgentMesh Integration</div>
            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-mono">IN PROGRESS</span>
          </div>
          <div className="text-sm text-slate-400">Examine multi-agent governance protocols</div>
        </div>
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5">
          <div className="flex items-start justify-between mb-2">
            <div className="font-medium text-white">Plan Victor UI Refactor</div>
            <span className="px-2 py-1 rounded bg-slate-500/10 text-slate-400 text-xs font-mono">PLANNED</span>
          </div>
          <div className="text-sm text-slate-400">Design Alden-inspired interface with clear boundaries</div>
        </div>
      </div>
    </div>
  );
}

function VictorEmail() {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Email Management</h2>
        <div className="text-sm text-slate-400">
          <span className="text-blue-400 font-mono">3</span> unread
        </div>
      </div>
      <div className="space-y-3">
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5 border-l-4 border-l-blue-500">
          <div className="flex items-start justify-between mb-2">
            <div className="font-medium text-white">AgentMesh Integration Request</div>
            <div className="text-xs text-slate-400">10:32 AM</div>
          </div>
          <div className="text-sm text-slate-400 mb-2">Reviewing trust protocols for multi-agent deployment...</div>
          <button className="text-sm text-blue-400 hover:text-blue-300">View →</button>
        </div>
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5 border-l-4 border-l-yellow-500">
          <div className="flex items-start justify-between mb-2">
            <div className="font-medium text-white">Zo-Qore Deployment Update</div>
            <div className="text-xs text-slate-400">Yesterday</div>
          </div>
          <div className="text-sm text-slate-400 mb-2">Runtime service registered successfully. Ready for testing.</div>
          <button className="text-sm text-blue-400 hover:text-blue-300">View →</button>
        </div>
      </div>
    </div>
  );
}

function VictorCalendar() {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Calendar</h2>
        <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm transition-colors">
          Today
        </button>
      </div>
      <div className="space-y-3">
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-blue-400">📅</div>
            <div className="font-medium text-white">Victor Design Review</div>
          </div>
          <div className="text-sm text-slate-400">2:00 PM - 3:00 PM</div>
        </div>
        <div className="p-4 bg-slate-900/50 rounded-lg border border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-green-400">📅</div>
            <div className="font-medium text-white">Zo-Qore Testing</div>
          </div>
          <div className="text-sm text-slate-400">4:00 PM - 5:00 PM</div>
        </div>
      </div>
    </div>
  );
}

function VictorSettings() {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-white/5 p-6">
      <h2 className="text-lg font-semibold text-white mb-6">Settings</h2>
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-white mb-3">Victor Persona</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div>
                <div className="font-medium text-white">Mode</div>
                <div className="text-sm text-slate-400">Current processing behavior</div>
              </div>
              <div className="px-3 py-1 rounded bg-green-500/10 text-green-400 text-sm font-mono">DETERMINISTIC</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div>
                <div className="font-medium text-white">LLM Access</div>
                <div className="text-sm text-slate-400">Large language model integration</div>
              </div>
              <div className="px-3 py-1 rounded bg-rose-500/10 text-rose-400 text-sm font-mono">DISABLED</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-medium text-white mb-3">Integration Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div>
                <div className="font-medium text-white">Zo-Qore Runtime</div>
                <div className="text-sm text-slate-400">Governance system connection</div>
              </div>
              <div className="px-3 py-1 rounded bg-blue-500/10 text-blue-400 text-sm font-mono">CONNECTED</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div>
                <div className="font-medium text-white">AgentMesh</div>
                <div className="text-sm text-slate-400">Multi-agent coordination</div>
              </div>
              <div className="px-3 py-1 rounded bg-yellow-500/10 text-yellow-400 text-sm font-mono">PENDING</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <div>
                <div className="font-medium text-white">Qwen3 TTS</div>
                <div className="text-sm text-slate-400">Text-to-speech engine</div>
              </div>
              <div className="px-3 py-1 rounded bg-slate-500/10 text-slate-400 text-sm font-mono">NOT CONFIGURED</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
