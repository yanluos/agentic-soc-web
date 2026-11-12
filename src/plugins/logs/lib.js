export const SEVERITIES = [
  { value: 0, label: "emerg" },
  { value: 1, label: "alert" },
  { value: 2, label: "crit" },
  { value: 3, label: "err" },
  { value: 4, label: "warning" },
  { value: 5, label: "notice" },
  { value: 6, label: "info" },
  { value: 7, label: "debug" },
]

export function severityLabel(n) {
  return SEVERITIES[n]?.label ?? String(n)
}

// Badge variant by severity: ≤3 destructive, 4 warning-ish (secondary), else outline.
export function severityVariant(n) {
  if (n <= 2) return "destructive"
  if (n === 3) return "destructive"
  if (n === 4) return "secondary"
  return "outline"
}

export const RANGE_PRESETS = [
  { value: "-15m", label: "15 分钟" },
  { value: "-1h", label: "1 小时" },
  { value: "-6h", label: "6 小时" },
  { value: "-24h", label: "24 小时" },
  { value: "-7d", label: "7 天" },
  { value: "custom", label: "自定义" },
]

export function fmtTs(s) {
  if (!s) return "-"
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  if (d.getFullYear() < 2000) return "-" // Go zero time
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function fmtAgo(s) {
  if (!s) return "从未"
  const d = new Date(s)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return "从未" // Go zero time
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  return `${Math.floor(sec / 86400)} 天前`
}

export function fmtBytes(n) {
  if (!n) return "0 B"
  const u = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`
}

export function fmtNum(n) {
  return (n ?? 0).toLocaleString()
}

export function qs(params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

// qsMulti: like qs but an array value becomes repeated keys (the backend ORs
// repeated list filters: ?source=a&source=b).
export function qsMulti(params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    if (Array.isArray(v)) {
      for (const x of v) if (x !== undefined && x !== null) sp.append(k, String(x))
      continue
    }
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}
