// 应急响应 (ir) plugin — shared constants/helpers. Row shapes mirror
// soc-ir/schema/types.go (snake_case JSON); case/finding rows are pgstore
// records {id, fields:{中文列}, created_at, updated_at}.

export const LEVELS = [
  { value: "critical", label: "严重", variant: "destructive", rank: 4 },
  { value: "high", label: "高", variant: "destructive", rank: 3 },
  { value: "medium", label: "中", variant: "warning", rank: 2 },
  { value: "suspicious", label: "可疑", variant: "secondary", rank: 1 },
  { value: "low", label: "低", variant: "outline", rank: 0 },
]

export function levelOf(value) {
  if (value == null || value === "") return null
  const s = String(value).toLowerCase()
  return LEVELS.find((l) => l.value === s || l.label === value) || null
}

export function levelForScore(score) {
  const n = Number(score) || 0
  if (n >= 80) return LEVELS[0]
  if (n >= 60) return LEVELS[1]
  if (n >= 40) return LEVELS[2]
  if (n >= 20) return LEVELS[3]
  return LEVELS[4]
}

export const CASE_STATUSES = ["待上传", "待研判", "研判中", "已研判", "已关闭"]
export const FINDING_STATUSES = ["待确认", "确认恶意", "误报", "已处置"]

export const FINDING_TYPES = [
  ["object", "执行对象"],
  ["process", "进程"],
  ["trigger", "触发项"],
  ["event", "事件"],
  ["module", "模块"],
  ["forensic", "取证"],
  ["memory", "内存"],
  ["chain", "行为链"],
  ["indicator", "IOC"],
  ["yara", "YARA"],
]

export function findingTypeLabel(t) {
  return FINDING_TYPES.find(([v]) => v === t)?.[1] || t || "-"
}

export const TRIGGER_LABELS = {
  run_key: "注册表 Run",
  startup: "启动目录",
  task: "计划任务",
  service: "服务",
  wmi: "WMI 订阅",
  ifeo: "IFEO 调试器",
  winlogon: "Winlogon",
  cron: "crontab",
  systemd: "systemd",
  rc_local: "rc.local",
  profile: "shell profile",
  ssh_authorized_keys: "SSH 授权密钥",
  ld_preload: "LD_PRELOAD",
  suid: "SUID",
  kernel_module: "内核模块",
  other: "其他",
}

export function triggerLabel(t) {
  return TRIGGER_LABELS[t] || t || "-"
}

export const LOCATION_LABELS = {
  system32: "System32",
  syswow64: "SysWOW64",
  windows: "Windows",
  programfiles: "Program Files",
  windowsapps: "WindowsApps",
  programdata: "ProgramData",
  userdir: "用户目录",
  temp: "临时目录",
  other: "其他",
  missing: "文件缺失",
}

export function locationLabel(l) {
  return LOCATION_LABELS[l] || l || "-"
}

// Views served by GET /cases/{id}/view/{view}; scoreless views default the
// min_score filter to 0.
export const VIEWS = [
  { key: "objects", label: "执行对象", scored: true },
  { key: "processes", label: "进程", scored: true },
  { key: "triggers", label: "触发项", scored: true },
  { key: "events", label: "事件", scored: true },
  { key: "modules", label: "模块", scored: true },
  { key: "forensics", label: "取证", scored: true },
  { key: "memory", label: "内存", scored: true },
  { key: "timeline", label: "时间线", scored: false },
  { key: "chains", label: "行为链", scored: false },
  { key: "indicators", label: "IOC", scored: false },
  { key: "yara", label: "YARA", scored: false },
]

export function fields(rec) {
  return rec?.fields || {}
}

// listOf tolerates the common list envelopes ({list}|{items}|{rows}|{cases}|{records}|array).
export function listOf(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  for (const k of [
    "list",
    "items",
    "rows",
    "cases",
    "findings",
    "records",
    "data",
  ]) {
    if (Array.isArray(raw[k])) return raw[k]
  }
  return []
}

// parseJSON accepts an already-parsed object or a JSON string column.
export function parseJSON(v, fallback = null) {
  if (v == null || v === "") return fallback
  if (typeof v === "object") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

export function fmtTime(v) {
  if (!v) return "-"
  const s = String(v)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/)
  if (m) return `${m[1]} ${m[2]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function truncate(s, n = 80) {
  if (s == null) return ""
  const str = String(s)
  return str.length > n ? `${str.slice(0, n)}…` : str
}

export function sigText(sig) {
  if (!sig) return "-"
  if (sig.signed && sig.valid) return `有效 ${sig.signer || ""}`.trim()
  if (sig.signed) return `无效 ${sig.signer || ""}`.trim()
  return "未签名"
}

export function errMsg(err, fallback) {
  return err?.message || fallback || "请求失败"
}
