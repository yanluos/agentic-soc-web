// Field lists for the generic FilterPanel on the case-detail lists. Each
// entry is the column spec FilterPanel expects ({field, label, filter,
// options?}); the committed tree is serialized by nodeToWhere and sent as
// `where` — evaluated in memory for the analysis views (dotted paths into the
// package row, soc-server plugins/ir/internal/views_where.go) and by pgstore
// for 发现 / 监控事件 (中文 column names).
import {
  FINDING_STATUSES,
  FINDING_TYPES,
  FORENSIC_LABELS,
  LEVELS,
  LOCATION_LABELS,
  TRIGGER_LABELS,
} from "./lib.js"
import { emptyTree, newClause } from "@/platform"

const text = (field, label) => ({ field, key: field, label, filter: "text" })
const num = (field, label) => ({ field, key: field, label, filter: "number" })
const date = (field, label) => ({ field, key: field, label, filter: "date" })
const select = (field, label, options) => ({
  field,
  key: field,
  label,
  filter: "select",
  options,
})
const YES_NO = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
]
const bool = (field, label) => select(field, label, YES_NO)
const fromLabels = (m) =>
  Object.entries(m).map(([value, label]) => ({ value, label }))

const score = num("score", "分数")
const level = select(
  "level",
  "等级",
  LEVELS.map((l) => ({ value: l.value, label: l.label }))
)
const location = select("location", "位置", fromLabels(LOCATION_LABELS))
const signer = text("signature.signer", "签名者")
const signed = bool("signature.signed", "已签名")
const sigValid = bool("signature.valid", "签名有效")

const objectFields = [
  score,
  level,
  text("name", "名称"),
  text("path", "路径"),
  text("command_line", "命令行"),
  location,
  signer,
  signed,
  sigValid,
  bool("is_running", "运行中"),
  bool("network_observed", "有外联"),
  bool("has_public_ip", "公网外联"),
  text("remote_ips", "远端 IP"),
  num("trigger_count", "持久化数"),
  text("trigger_names", "持久化项"),
  text("sources", "来源"),
  bool("is_lolbin", "LOLBin"),
  bool("has_dll_hijack", "DLL 劫持"),
  bool("has_memory_findings", "内存异常"),
  bool("yara.matched", "YARA 命中"),
  text("sha256", "SHA256"),
]

export const VIEW_FILTER_FIELDS = {
  objects: objectFields,
  processes: [
    score,
    level,
    num("pid", "PID"),
    num("ppid", "父 PID"),
    text("name", "进程"),
    text("parent_name", "父进程"),
    text("user", "用户"),
    text("path", "路径"),
    text("command_line", "命令行"),
    date("start_time", "启动时间"),
    location,
    signer,
    signed,
    sigValid,
    bool("network.has_public", "公网外联"),
    text("network.remote_ips", "远端 IP"),
    bool("is_lolbin", "LOLBin"),
    bool("is_masquerade", "名称伪装"),
    bool("abnormal_parent", "异常父进程"),
    text("persistence", "持久化项"),
    text("sha256", "SHA256"),
  ],
  triggers: [
    score,
    level,
    select("type", "类型", fromLabels(TRIGGER_LABELS)),
    text("name", "名称"),
    text("path", "目标"),
    text("command_line", "命令行"),
    text("source", "来源"),
    text("detail", "详情"),
    bool("exists", "文件存在"),
    location,
    signer,
    signed,
  ],
  events: [
    score,
    level,
    date("time", "时间"),
    text("source", "日志"),
    num("event_id", "EventID"),
    text("description", "描述"),
    text("command_line", "命令行"),
    text("process_path", "进程路径"),
    text("target_path", "目标路径"),
    text("user", "用户"),
    text("ip_address", "IP"),
    text("task_name", "任务名"),
    text("service_name", "服务名"),
    text("logon_type", "登录类型"),
  ],
  modules: [
    score,
    level,
    num("pid", "PID"),
    text("exe_name", "进程"),
    text("exe_path", "路径"),
    text("exe_signer", "进程签名者"),
    bool("exe_signed", "进程已签名"),
    num("total_modules", "模块总数"),
    bool("has_dll_hijack", "DLL 劫持"),
    text("suspicious_modules.path", "可疑模块路径"),
    text("suspicious_modules.signer", "可疑模块签名者"),
  ],
  forensics: [
    score,
    level,
    select("source", "来源", fromLabels(FORENSIC_LABELS)),
    text("path", "路径"),
    text("exe_name", "程序名"),
    text("file_type", "类型"),
    text("detail", "详情"),
    num("run_count", "执行次数"),
    date("last_run", "最近执行"),
    date("file_mod_time", "修改时间"),
    text("sha256", "SHA256"),
  ],
  memory: [
    score,
    level,
    num("pid", "PID"),
    text("name", "进程"),
    text("path", "路径"),
    num("rwx_count", "RWX"),
    num("private_exec_count", "私有可执行"),
    num("mz_count", "PE 头"),
    num("total_regions", "区域总数"),
  ],
  timeline: [
    date("time", "时间"),
    text("type", "类型"),
    text("object_name", "对象"),
    text("object_path", "对象路径"),
    text("detail", "详情"),
    text("source", "来源"),
    score,
    level,
  ],
  chains: [
    score,
    level,
    text("name", "行为链"),
    text("tactic", "战术"),
    text("description", "说明"),
    text("evidence", "证据"),
    text("object_paths", "对象路径"),
  ],
  indicators: [
    score,
    text("type", "类型"),
    text("value", "指标"),
    bool("public", "公网"),
    text("source_object", "来源对象"),
    text("context", "上下文"),
    text("decoded", "解码内容"),
  ],
  yara: [
    score,
    level,
    text("path", "文件"),
    text("name", "名称"),
    text("yara.hits.rule", "命中规则"),
    text("yara.hits.tags", "标签"),
    location,
    signer,
  ],
}

// pgstore tables: 风险等级 stores the Chinese label.
const levelZh = select(
  "风险等级",
  "等级",
  LEVELS.map((l) => ({ value: l.label, label: l.label }))
)

export const FINDING_FILTER_FIELDS = [
  num("风险分", "分数"),
  levelZh,
  select(
    "类型",
    "类型",
    FINDING_TYPES.map(([value, label]) => ({ value, label }))
  ),
  select(
    "状态",
    "状态",
    FINDING_STATUSES.map((s) => ({ value: s, label: s }))
  ),
  text("名称", "名称"),
  text("路径", "路径"),
  text("命令行", "命令行"),
  text("原因", "原因"),
  text("原因码", "原因码"),
  text("研判人", "研判人"),
  text("研判备注", "研判备注"),
]

export const MONITOR_FILTER_FIELDS = [
  select("类型", "类型", [
    { value: "process", label: "进程" },
    { value: "network", label: "外联" },
    { value: "trigger", label: "持久化" },
  ]),
  select("动作", "动作", [
    { value: "new", label: "新增" },
    { value: "gone", label: "消失" },
    { value: "changed", label: "变更" },
  ]),
  num("风险分", "分数"),
  levelZh,
  text("名称", "名称"),
  text("路径", "路径"),
  text("命令行", "命令行"),
  text("远端地址", "远端地址"),
  text("原因", "原因"),
  text("时间", "主机时间"),
]

// The lists used to open on "≥20" (可疑及以上); the same default is now an
// ordinary, removable clause of the filter tree.
export function scoreTree(field = "score", min = 20) {
  const t = emptyTree()
  t.children.push(newClause(field, "ge", String(min)))
  return t
}

export function defaultTree(key) {
  if (key === "findings") return scoreTree("风险分")
  if (key === "monitor") return emptyTree()
  const fieldsOf = VIEW_FILTER_FIELDS[key] || []
  return fieldsOf[0] === score && fieldsOf[1] === level
    ? scoreTree()
    : emptyTree()
}
