// Friendly metadata for the agent's tools. Raw names arrive as either Claude
// Code built-ins ("Bash", "Read"…) or MCP tools ("mcp__soc-server__identity_search").
// Unknown tools fall back to a generic entry so new tools degrade gracefully.

import {
  Terminal,
  FileText,
  FilePen,
  FolderSearch,
  ShieldAlert,
  Search,
  Eye,
  Database,
  Mail,
  MessageSquare,
  Shield,
  GitBranch,
  RefreshCw,
  Wrench,
  Radar,
  BookOpen,
  Library,
} from "lucide-react"

// IconButton semantic colors: cyan=query/read, blue=sync/write, red=block,
// orange=notify, purple=AI/workflow, gray=neutral.
const META = {
  // Claude Code built-ins
  Bash: { label: "执行命令", icon: Terminal, color: "gray" },
  Read: { label: "读取文件", icon: FileText, color: "cyan" },
  Write: { label: "写入文件", icon: FilePen, color: "blue" },
  Edit: { label: "编辑文件", icon: FilePen, color: "blue" },
  Glob: { label: "查找文件", icon: FolderSearch, color: "cyan" },
  Grep: { label: "搜索内容", icon: Search, color: "cyan" },
  Skill: { label: "调用技能", icon: BookOpen, color: "purple" },
  // soc-server data MCP
  secincident_sync: { label: "同步安全事件", icon: RefreshCw, color: "blue" },
  identity_search: { label: "身份查询", icon: Search, color: "cyan" },
  skyeye_alert_search: { label: "天眼告警检索", icon: Radar, color: "cyan" },
  skyeye_alert_count: { label: "天眼告警计数", icon: Radar, color: "cyan" },
  skyeye_alert_trend: { label: "天眼告警趋势", icon: Radar, color: "cyan" },
  skyeye_log_search: { label: "天眼日志检索", icon: Radar, color: "cyan" },
  skyeye_log_hits: { label: "天眼日志直方图", icon: Radar, color: "cyan" },
  skyeye_log_facets: { label: "天眼日志聚合", icon: Radar, color: "cyan" },
  skyeye_log_fields: { label: "天眼日志字段", icon: Radar, color: "cyan" },
  knowledge_search: { label: "知识库检索", icon: Library, color: "cyan" },
  knowledge_get: { label: "读取知识文档", icon: Library, color: "cyan" },
  db_list: { label: "查询记录", icon: Database, color: "cyan" },
  db_get: { label: "读取记录", icon: Database, color: "cyan" },
  db_create: { label: "新增记录", icon: Database, color: "blue" },
  db_update: { label: "更新记录", icon: Database, color: "blue" },
  db_delete: { label: "删除记录", icon: Database, color: "red" },
  send_mail: { label: "发送邮件", icon: Mail, color: "orange" },
  send_appia: { label: "发送 Appia 消息", icon: MessageSquare, color: "orange" },
  update_appia: { label: "更新 Appia 消息", icon: MessageSquare, color: "orange" },
  send_dingtalk: { label: "发送钉钉消息", icon: MessageSquare, color: "orange" },
  probe_block_create: { label: "创建旁路封禁", icon: Shield, color: "red" },
  probe_block_status: { label: "查询封禁状态", icon: Shield, color: "cyan" },
  probe_block_delete: { label: "解除旁路封禁", icon: Shield, color: "red" },
  // soc-ai workflow MCP
  list_available_tools: { label: "列出可编排工具", icon: GitBranch, color: "purple" },
  create_workflow: { label: "创建工作流", icon: GitBranch, color: "purple" },
  list_workflows: { label: "列出工作流", icon: GitBranch, color: "purple" },
  get_workflow: { label: "查看工作流", icon: GitBranch, color: "purple" },
  run_workflow: { label: "运行工作流", icon: GitBranch, color: "purple" },
  approve_run: { label: "批准运行", icon: GitBranch, color: "purple" },
  reject_run: { label: "驳回运行", icon: GitBranch, color: "purple" },
  get_run_result: { label: "查看运行结果", icon: GitBranch, color: "purple" },
}

const FALLBACK = { label: null, icon: Wrench, color: "gray" }
const UI_READ = { label: "读取界面状态", icon: Eye, color: "gray" }

// toolMeta("mcp__soc-server__identity_search") →
//   { label: "身份查询", icon, color, server: "soc-server", raw: "identity_search" }
export function toolMeta(name) {
  if (!name) return { ...FALLBACK, label: "工具", server: null, raw: String(name || "") }
  const mcp = /^mcp__([^_]+(?:[-_][^_]+)*?)__(.+)$/.exec(name)
  const server = mcp ? mcp[1] : null
  const raw = mcp ? mcp[2] : name
  const m = META[raw] || (raw.includes("ui-state") ? UI_READ : FALLBACK)
  return { ...m, label: m.label || raw, server, raw }
}
