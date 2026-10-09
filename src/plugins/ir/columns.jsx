// Per-view column definitions for ViewTable. Each column: {key, label,
// render(row), className?, sort?} — sort names the server-side sort field.
import { Badge } from "@/components/ui/badge"
import { LevelBadge } from "./LevelBadge.jsx"
import {
  fmtTime,
  locationLabel,
  sigText,
  triggerLabel,
  truncate,
} from "./lib.js"

const mono = "font-mono text-xs"

function yes(b, t = "是", f = "否") {
  return b ? (
    <Badge variant="secondary">{t}</Badge>
  ) : (
    <span className="text-muted-foreground">{f}</span>
  )
}

function Path({ v, n = 70 }) {
  return (
    <span className={mono} title={v}>
      {truncate(v, n) || "-"}
    </span>
  )
}

const levelCol = {
  key: "level",
  label: "等级",
  render: (r) => <LevelBadge level={r.level} score={r.score} />,
}
const scoreCol = {
  key: "score",
  label: "分数",
  sort: "score",
  className: "text-right tabular-nums",
  render: (r) => r.score ?? 0,
}

export const COLUMNS = {
  objects: [
    levelCol,
    scoreCol,
    {
      key: "name",
      label: "名称",
      render: (r) => <span className="font-medium">{r.name || "-"}</span>,
    },
    { key: "path", label: "路径", render: (r) => <Path v={r.path} /> },
    {
      key: "location",
      label: "位置",
      render: (r) => locationLabel(r.location),
    },
    {
      key: "sig",
      label: "签名",
      render: (r) => truncate(sigText(r.signature), 28),
    },
    {
      key: "run",
      label: "运行",
      render: (r) =>
        r.is_running ? (
          <Badge variant="secondary">PID {(r.pids || []).join(",")}</Badge>
        ) : (
          <span className="text-muted-foreground">否</span>
        ),
    },
    {
      key: "trig",
      label: "持久化",
      className: "text-right tabular-nums",
      render: (r) => r.trigger_count || 0,
    },
    {
      key: "net",
      label: "外联",
      render: (r) =>
        r.has_public_ip ? (
          <Badge variant="destructive">公网</Badge>
        ) : r.network_observed ? (
          <Badge variant="outline">内网</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "sources",
      label: "来源",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {(r.sources || []).join(", ")}
        </span>
      ),
    },
  ],
  processes: [
    levelCol,
    scoreCol,
    {
      key: "pid",
      label: "PID",
      className: "tabular-nums",
      render: (r) => r.pid,
    },
    {
      key: "name",
      label: "进程",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "parent",
      label: "父进程",
      render: (r) => `${r.parent_name || "-"}${r.ppid ? ` (${r.ppid})` : ""}`,
    },
    { key: "user", label: "用户", render: (r) => truncate(r.user, 24) || "-" },
    { key: "path", label: "路径", render: (r) => <Path v={r.path} n={50} /> },
    {
      key: "cmd",
      label: "命令行",
      render: (r) => <Path v={r.command_line} n={60} />,
    },
    {
      key: "net",
      label: "外联",
      render: (r) =>
        r.network?.has_public ? (
          <Badge variant="destructive">公网</Badge>
        ) : r.network?.remote_ips?.length ? (
          <Badge variant="outline">内网</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "sig",
      label: "签名",
      render: (r) => truncate(sigText(r.signature), 24),
    },
  ],
  triggers: [
    levelCol,
    scoreCol,
    {
      key: "type",
      label: "类型",
      render: (r) => <Badge variant="outline">{triggerLabel(r.type)}</Badge>,
    },
    { key: "name", label: "名称", render: (r) => <Path v={r.name} n={50} /> },
    { key: "path", label: "目标", render: (r) => <Path v={r.path} n={60} /> },
    {
      key: "cmd",
      label: "命令行",
      render: (r) => <Path v={r.command_line} n={60} />,
    },
    {
      key: "exists",
      label: "文件",
      render: (r) =>
        r.exists === false ? (
          <Badge variant="destructive">缺失</Badge>
        ) : (
          yes(r.exists, "存在", "-")
        ),
    },
    {
      key: "source",
      label: "来源",
      render: (r) => <Path v={r.source} n={40} />,
    },
  ],
  events: [
    levelCol,
    scoreCol,
    {
      key: "time",
      label: "时间",
      sort: "time",
      className: "whitespace-nowrap tabular-nums",
      render: (r) => fmtTime(r.time),
    },
    { key: "source", label: "日志", render: (r) => r.source },
    {
      key: "eid",
      label: "EventID",
      className: "tabular-nums",
      render: (r) => r.event_id,
    },
    {
      key: "desc",
      label: "描述",
      render: (r) => truncate(r.description, 80) || "-",
    },
    {
      key: "cmd",
      label: "命令行 / 目标",
      render: (r) => (
        <Path
          v={
            r.command_line ||
            r.process_path ||
            r.target_path ||
            r.task_name ||
            r.service_name
          }
          n={60}
        />
      ),
    },
    { key: "user", label: "用户", render: (r) => truncate(r.user, 24) || "-" },
  ],
  modules: [
    levelCol,
    scoreCol,
    {
      key: "pid",
      label: "PID",
      className: "tabular-nums",
      render: (r) => r.pid,
    },
    {
      key: "exe",
      label: "进程",
      render: (r) => <span className="font-medium">{r.exe_name}</span>,
    },
    {
      key: "path",
      label: "路径",
      render: (r) => <Path v={r.exe_path} n={50} />,
    },
    {
      key: "n",
      label: "模块",
      className: "tabular-nums",
      render: (r) =>
        `${(r.suspicious_modules || []).length} / ${r.total_modules || 0}`,
    },
    {
      key: "hijack",
      label: "DLL 劫持",
      render: (r) =>
        r.has_dll_hijack ? (
          <Badge variant="destructive">是</Badge>
        ) : (
          <span className="text-muted-foreground">否</span>
        ),
    },
    {
      key: "first",
      label: "首个可疑模块",
      render: (r) => <Path v={r.suspicious_modules?.[0]?.path} n={60} />,
    },
  ],
  forensics: [
    levelCol,
    scoreCol,
    {
      key: "src",
      label: "来源",
      render: (r) => <Badge variant="outline">{r.source}</Badge>,
    },
    { key: "path", label: "路径", render: (r) => <Path v={r.path} /> },
    { key: "type", label: "类型", render: (r) => r.file_type || "-" },
    {
      key: "last",
      label: "最近执行",
      className: "whitespace-nowrap",
      render: (r) => fmtTime(r.last_run),
    },
    {
      key: "mod",
      label: "修改时间",
      className: "whitespace-nowrap",
      render: (r) => fmtTime(r.file_mod_time),
    },
  ],
  memory: [
    levelCol,
    scoreCol,
    {
      key: "pid",
      label: "PID",
      className: "tabular-nums",
      render: (r) => r.pid,
    },
    {
      key: "name",
      label: "进程",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "rwx",
      label: "RWX",
      className: "text-right tabular-nums",
      render: (r) => r.rwx_count || 0,
    },
    {
      key: "pe",
      label: "私有可执行",
      className: "text-right tabular-nums",
      render: (r) => r.private_exec_count || 0,
    },
    {
      key: "mz",
      label: "PE 头",
      className: "text-right tabular-nums",
      render: (r) => r.mz_count || 0,
    },
    {
      key: "total",
      label: "区域总数",
      className: "text-right tabular-nums",
      render: (r) => r.total_regions || 0,
    },
  ],
  timeline: [
    {
      key: "time",
      label: "时间",
      sort: "time",
      className: "whitespace-nowrap tabular-nums",
      render: (r) => fmtTime(r.time),
    },
    {
      key: "type",
      label: "类型",
      render: (r) => <Badge variant="outline">{r.type}</Badge>,
    },
    {
      key: "obj",
      label: "对象",
      render: (r) => (
        <span className="font-medium">{r.object_name || "-"}</span>
      ),
    },
    { key: "detail", label: "详情", render: (r) => truncate(r.detail, 90) },
    {
      key: "src",
      label: "来源",
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.source}</span>
      ),
    },
    { ...scoreCol },
    levelCol,
  ],
  chains: [
    levelCol,
    scoreCol,
    {
      key: "name",
      label: "行为链",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "tactic", label: "战术", render: (r) => r.tactic || "-" },
    {
      key: "ev",
      label: "证据",
      render: (r) => truncate((r.evidence || []).join(" → "), 110),
    },
    {
      key: "n",
      label: "对象数",
      className: "text-right tabular-nums",
      render: (r) => (r.object_paths || []).length,
    },
  ],
  indicators: [
    {
      key: "type",
      label: "类型",
      render: (r) => <Badge variant="outline">{r.type}</Badge>,
    },
    { key: "value", label: "指标", render: (r) => <Path v={r.value} n={70} /> },
    {
      key: "pub",
      label: "公网",
      render: (r) =>
        r.public ? (
          <Badge variant="destructive">是</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "src",
      label: "来源对象",
      render: (r) => <Path v={r.source_object} n={50} />,
    },
    { key: "ctx", label: "上下文", render: (r) => r.context || "-" },
    { ...scoreCol },
  ],
  yara: [
    levelCol,
    scoreCol,
    { key: "path", label: "文件", render: (r) => <Path v={r.path} /> },
    {
      key: "rules",
      label: "命中规则",
      render: (r) =>
        (r.yara?.hits || r.hits || []).map((h) => h.rule).join(", ") || "-",
    },
    {
      key: "tags",
      label: "标签",
      render: (r) =>
        [
          ...new Set(
            (r.yara?.hits || r.hits || []).flatMap((h) => h.tags || [])
          ),
        ].join(", ") || "-",
    },
  ],
}
