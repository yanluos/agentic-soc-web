// Frontend constants: sidebar group order, static module list, and
// filter/option metadata. Dynamic tables (NocoDB `tables` list) are merged
// in at runtime in App.jsx.

import {
  Home,
  Search,
  ShieldAlert,
  Shield,
  GitBranch,
  Cpu,
  FileBarChart,
  HeartPulse,
  Settings,
  Users,
  Wrench,
  CalendarDays,
  Bot,
  Table,
  Database,
  BookOpen,
  ListTree,
  FileText,
  Server,
  Network,
  Plug,
  KeyRound,
  Activity,
  Globe,
  Mail,
  ClipboardList,
  Radar,
  Puzzle,
} from "lucide-react"

import { core } from "@/core/modules.jsx"

// ---------------------------------------------------------------------------
// Icon resolver — sidebar/command-palette modules carry either a lucide
// component (static modules) or a PascalCase string name (dynamic tables,
// from config.json `icon`). Resolve both to a component; fall back to Table.
// ---------------------------------------------------------------------------

const ICONS = {
  Home,
  Search,
  ShieldAlert,
  Shield,
  GitBranch,
  Cpu,
  FileBarChart,
  HeartPulse,
  Settings,
  Users,
  Wrench,
  CalendarDays,
  Bot,
  Table,
  Database,
  BookOpen,
  ListTree,
  FileText,
  Server,
  Network,
  KeyRound,
  Activity,
  Globe,
  Mail,
  ClipboardList,
  Plug,
  Radar,
}

// Appia 公司账号 key（与后端 domainByCompany / notification.appia map 同一套）。
export const APPIA_COMPANIES = ["Bitmain", "SSC", "Antpool", "Sophgo"]

export function resolveIcon(icon) {
  if (typeof icon !== "string") return icon || Table
  return ICONS[icon] || Table
}

/** registerIcons lets a plugin make its lucide icons resolvable by string name. */
export function registerIcons(map) {
  for (const [name, comp] of Object.entries(map || {})) {
    if (comp && !ICONS[name]) ICONS[name] = comp
  }
}

// ---------------------------------------------------------------------------
// Sidebar groups (render order = array order)
// ---------------------------------------------------------------------------

export const moduleGroups = [
  { id: "security", label: "安全工具", icon: Wrench },
  { id: "events", label: "事件记录", icon: CalendarDays },
  { id: "ai", label: "AI Manage", icon: Bot },
  { id: "system", label: "系统设置", icon: Settings },
  // Fallback bucket for plugin modules that name no known group.
  { id: "plugins", label: "扩展", icon: Puzzle },
]

/** Default group for dynamic tables that don't specify one explicitly. */
export const DEFAULT_DYNAMIC_TABLE_GROUP = "events"


// ---------------------------------------------------------------------------
// Static module registry — derived from the core descriptors (src/core/
// modules.js) so there is ONE list. Consumers that only need id/group/label/
// icon/permission (用户管理's grant checkboxes) read this projection.
// ---------------------------------------------------------------------------

export const modules = core.modules.map(({ component, render, table, ...rest }) => rest)
