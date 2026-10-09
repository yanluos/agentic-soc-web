// Core module descriptors — the platform's own pages, in the same shape a
// plugin's src/plugins/<id>/index.js uses (see docs/design/plugin-architecture.md
// §8.2). Core is a static list, always enabled, never glob-discovered; heavy
// modules are lazy so the first paint carries only the shell + overview/助手.
//
// Descriptor fields: { id, group, label, icon, permission?, component | render | table }
//   component — React.lazy (or eager) component receiving the host ctx props
//   render    — (ctx) => element, for modules that need core-only props
//   table     — slug rendered through GenericTableModule + tableRenderers[slug]
import { lazy } from "react"
import {
  Home, Bot, GitBranch, Cpu, Network, BookOpen, HeartPulse, Blocks, Globe, Settings, Users,
} from "lucide-react"

import { OverviewModule } from "@/modules/OverviewModule.jsx"
import { AssistantModule } from "@/modules/assistant/AssistantModule.jsx"

const HealthModule = lazy(() => import("@/modules/HealthModule.jsx").then((m) => ({ default: m.HealthModule })))
const SettingsProxyModule = lazy(() => import("@/modules/SettingsModule.jsx").then((m) => ({ default: m.SettingsProxyModule })))
const SettingsOtherModule = lazy(() => import("@/modules/SettingsModule.jsx").then((m) => ({ default: m.SettingsOtherModule })))
const UserManagementModule = lazy(() => import("@/modules/UserManagementModule.jsx").then((m) => ({ default: m.UserManagementModule })))
const AiModelsModule = lazy(() => import("@/modules/AiModelsModule.jsx").then((m) => ({ default: m.AiModelsModule })))
const McpModule = lazy(() => import("@/modules/McpModule.jsx").then((m) => ({ default: m.McpModule })))
const KnowledgeModule = lazy(() => import("@/modules/KnowledgeModule.jsx").then((m) => ({ default: m.KnowledgeModule })))
const WorkflowVizModule = lazy(() => import("@/modules/WorkflowVizModule.jsx").then((m) => ({ default: m.WorkflowVizModule })))
const PluginsModule = lazy(() => import("@/modules/PluginsModule.jsx").then((m) => ({ default: m.PluginsModule })))
// Every feature module has moved to src/plugins/* (scan, probe, tickets,
// secincident); only platform pages remain here. They stay here until each one's backend plugin lands.

export const core = {
  id: "core",
  sdk: "1",
  modules: [
    { id: "overview", group: "events", label: "概览", icon: Home, component: OverviewModule },
    { id: "assistant", group: "ai", label: "AI 助手", icon: Bot, render: (ctx) => <AssistantModule onAction={ctx.onAgentAction} /> },
    { id: "workflow_viz", group: "ai", label: "WorkFlow", icon: GitBranch, component: WorkflowVizModule },
    { id: "ai_models", group: "ai", label: "AI 模型", icon: Cpu, component: AiModelsModule },
    { id: "mcp", group: "ai", label: "MCP 能力", icon: Network, component: McpModule },
    { id: "knowledge", group: "ai", label: "技能与知识库", icon: BookOpen, component: KnowledgeModule },
    { id: "health", group: "system", label: "健康检查", icon: HeartPulse, component: HealthModule },
    // 插件管理: every backend plugin's state, settings sections, panels, tools
    // and health in one place (replaced the 服务集成 page 2026-09-10). Rides on
    // the `settings` grant like plugin enable/disable does server-side.
    { id: "plugins", group: "system", label: "插件管理", icon: Blocks, permission: "settings", component: PluginsModule },
    // The former single "设置" page split by function, riding on the backend
    // `settings` permission (no new grantable modules).
    { id: "settings_proxy", group: "system", label: "系统代理", icon: Globe, permission: "settings", component: SettingsProxyModule },
    {
      id: "settings_other", group: "system", label: "其他设置", icon: Settings, permission: "settings",
      render: (ctx) => (
        <SettingsOtherModule
          apiBase={ctx.host.apiBase}
          apiKey={ctx.host.apiKey}
          onChange={ctx.host.onSettingsChange}
          apiClient={ctx.apiClient}
          setError={ctx.setError}
        />
      ),
    },
    { id: "users", group: "system", label: "用户管理", icon: Users, component: UserManagementModule },
  ],
  // Raw tables a typed module renders (the backend now also marks these via
  // `owner`; this list only covers tables the backend cannot attribute).
  hiddenTables: ["workflow_runs", "workflow_defs", "workflow_steps", "ai_models"],
  // Renderers for slugs shown through GenericTableModule (a `table:` module or
  // a table-backed static module). Each factory takes the host ctx.
  tableRenderers: {
  },
  settingsSections: [],
  sources: [],
  icons: {},
}

export default core
