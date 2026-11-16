// 告警详情 — the formatted view of the alert behind a log-derived incident.
//
// alert-log-triage writes 研判证据 as plain text:
//
//   【告警日志聚合证据】
//   指纹：<sha1>
//   来源/程序：天眼 / skyeye-webids-webattack_dolog
//   聚合键：{"dst_ip":…}                         ← JSON on one line
//   24h 命中：6 次（首次 <RFC3339>，末次 <RFC3339>）
//   厂商严重度：9｜攻击结果：1｜置信度：80          ← several pairs per line
//   攻击类型：Webshell（攻击利用:16000000|…）｜杀伤链：…｜ATT&CK：…
//   端口：["8080"]｜同源同规则目的 IP 数：1
//   样本：{"url":…,"detail_info":…}               ← JSON on one line
//
//   【AI 研判】
//   <= 研判结论>
//
// Read raw, the JSON lines are unreadable, so the 告警发生 node renders the
// alert section as labelled rows + key/value tables for 聚合键 and 样本. The
// remaining sections (minus 【AI 研判】, which is the 研判结论 already shown
// by the verdict node) stay in the folded 研判证据 block.

import { useState } from "react"
import { ChevronRight } from "lucide-react"

import { CopyText } from "@/components/CopyText.jsx"
import { cn } from "@/lib/utils"
import { fmtTime } from "./timeline.js"

const ALERT_SECTION = "告警日志聚合证据"
const AI_SECTION = "AI 研判"

// splitSections → [{title, body}] for every 【title】 block (text before the
// first header gets title "").
function splitSections(text) {
  const out = []
  let cur = { title: "", lines: [] }
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^【(.+?)】\s*$/)
    if (m) {
      out.push(cur)
      cur = { title: m[1], lines: [] }
    } else {
      cur.lines.push(line)
    }
  }
  out.push(cur)
  return out
    .map((s) => ({ title: s.title, body: s.lines.join("\n").trim() }))
    .filter((s) => s.title || s.body)
}

function tryJSON(v) {
  const s = String(v || "").trim()
  if (!/^[[{]/.test(s)) return undefined
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

// parseEvidence → { alert: {pairs:[{k,v}], key, sample} | null, rest: text }.
// `rest` = every other section re-joined (AI 研判 dropped when the alert
// section parsed — it duplicates 研判结论).
export function parseEvidence(text) {
  const sections = splitSections(text)
  const alertSec = sections.find((s) => s.title === ALERT_SECTION)
  if (!alertSec) return { alert: null, rest: String(text || "").trim() }

  const pairs = []
  let key, sample
  for (const raw of alertSec.body.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    // 聚合键/样本 carry JSON that may itself contain "｜" — never split those.
    const parts = /^(聚合键|样本)：/.test(line) ? [line] : line.split("｜")
    for (const part of parts) {
      const i = part.indexOf("：")
      if (i <= 0) {
        pairs.push({ k: "", v: part.trim() })
        continue
      }
      const k = part.slice(0, i).trim()
      const v = part.slice(i + 1).trim()
      if (k === "聚合键") key = tryJSON(v) ?? v
      else if (k === "样本") sample = tryJSON(v) ?? v
      else pairs.push({ k, v })
    }
  }
  const rest = sections
    .filter((s) => s.title !== ALERT_SECTION && s.title !== AI_SECTION)
    .map((s) => (s.title ? `【${s.title}】\n${s.body}` : s.body))
    .join("\n\n")
    .trim()
  return { alert: { pairs, key, sample }, rest }
}

// ── value formatting ─────────────────────────────────────────────────────

const RFC3339 =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g

function isBlank(v) {
  const s = String(v ?? "").trim()
  return !s || s === "（）" || s === "()" || s === "[]" || s === "{}"
}

// "攻击利用:16000000|Webshell上传:16190000" → "攻击利用 › Webshell上传";
// ATT&CK ids are kept ("持久化 TA0003 › 服务器软件组件 T1505.003").
function fmtCoded(v) {
  const items = String(v)
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean)
  if (!items.length || !items.every((x) => /^[^:]+:[^:]+$/.test(x))) return v
  return items
    .map((x) => {
      const [name, code] = x.split(":").map((s) => s.trim())
      return /^(0x[0-9a-f]+|\d+)$/i.test(code) ? name : `${name} ${code}`
    })
    .join(" › ")
}

// 攻击类型 "Webshell（攻击利用:…|…）" → main type + the decoded chain.
function fmtAttackType(v) {
  const m = String(v).match(/^(.*?)（(.*)）$/)
  if (!m) return fmtCoded(v)
  const main = m[1].trim()
  const chain = fmtCoded(m[2].trim())
  if (!chain) return main
  if (!main) return chain
  return `${main}（${chain}）`
}

// attack_result=1 means different things per family (see log-service triage
// families): 天擎病毒 = not cleaned, 天擎防护 = let through, 天眼 = succeeded.
function fmtAttackResult(v, app) {
  const s = String(v).trim()
  if (s !== "1" && s !== "0") return s
  const a = String(app || "")
  let yes = "成功"
  let no = "未成功"
  if (a.includes("antivirus_virus")) {
    yes = "未清除"
    no = "已清除"
  } else if (a.includes("tianqing")) {
    yes = "已放行"
    no = "已拦截"
  }
  return `${s === "1" ? yes : no}（${s}）`
}

function fmtValue(k, v, app) {
  if (k === "攻击类型") return fmtAttackType(v)
  if (k === "杀伤链" || k === "ATT&CK") return fmtCoded(v)
  if (k === "攻击结果") return fmtAttackResult(v, app)
  if (k === "端口") {
    const arr = tryJSON(v)
    return Array.isArray(arr) ? arr.join(", ") : v
  }
  return String(v).replace(RFC3339, (t) => fmtTime(t) || t)
}

// Short labels for the common log keys (log-service parse.FieldMeanings has
// the long explanations). Unknown keys show as-is.
const KEY_LABELS = {
  detail_info: "告警说明",
  description: "事件说明",
  rule_name: "规则名称",
  rule: "规则",
  rule_id: "规则 ID",
  event_name: "事件名称",
  threat: "威胁名称",
  virus: "病毒名称",
  virus_type_name: "病毒种类",
  result_name: "处理结果",
  trigger_mode_name: "触发方式",
  category_id_name: "告警类型",
  severity_name: "级别",
  level: "等级",
  vuln_name: "漏洞名称",
  vuln_type: "威胁类型",
  attack_type: "攻击类型",
  attack_method: "攻击方式",
  victim_type: "受害资产类型",
  src_ip: "源 IP",
  src_port: "源端口",
  dst_ip: "目的 IP",
  dst_port: "目的端口",
  attacker_ip: "攻击方 IP",
  victim_ip: "受害方 IP",
  protocol: "协议",
  method: "HTTP 方法",
  host: "访问主机",
  domain: "域名",
  url: "URL",
  user_agent: "User-Agent",
  rsp_status: "响应状态码",
  status: "状态",
  req_header: "请求头",
  req_body: "请求体",
  rsp_header: "响应头",
  rsp_body: "响应体",
  pcap_url: "报文下载",
  host_ip: "主机 IP",
  host_name: "主机名",
  host_os: "操作系统",
  host_mac: "主机 MAC",
  host_domain: "所在域",
  group_path: "终端分组",
  user: "账号",
  dst_user: "目标账号",
  file: "文件",
  file_path: "文件路径",
  md5: "MD5",
  sha1: "SHA1",
  process: "进程",
  process_path: "进程路径",
  process_command_line: "进程命令行",
  process_md5: "进程 MD5",
  process_parent_name: "父进程",
  process_parent_command_line: "父进程命令行",
  command: "命令",
  itdr_application: "ITDR 应用",
  itdr_module: "ITDR 模块",
  alert_count: "行为次数",
  alert_time: "事件时间",
  tianqing_topic: "天擎日志类型",
  skyeye_time: "天眼时间",
  skyeye_log_type: "天眼日志类型",
  skyeye_device: "天眼设备",
}

// Long free text / paths read better on their own full-width row.
const WIDE = /url|path|command|body|header|detail|description|user_agent/i

function KVTable({ obj }) {
  if (obj == null) return null
  if (typeof obj !== "object") {
    return (
      <div className="font-mono text-xs break-all whitespace-pre-wrap">
        {String(obj)}
      </div>
    )
  }
  const rows = Object.entries(obj).filter(([, v]) => !isBlank(v))
  if (!rows.length) return null
  // 告警说明 first: it is the one human sentence in a vendor sample.
  rows.sort(
    (a, b) =>
      Number(b[0] === "detail_info" || b[0] === "description") -
      Number(a[0] === "detail_info" || a[0] === "description")
  )
  return (
    <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => {
        const text =
          typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)
        const label = KEY_LABELS[k] || k
        return (
          <div key={k} className="contents">
            <dt className="text-muted-foreground" title={k}>
              {label}
            </dt>
            <dd
              className={cn(
                "min-w-0 break-all whitespace-pre-wrap",
                (WIDE.test(k) || typeof v === "object") && "font-mono"
              )}
            >
              {k === "pcap_url" && /^https?:\/\//.test(text) ? (
                <a
                  href={text}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {text}
                </a>
              ) : (
                <CopyText value={text} label={label} className="text-left">
                  {text}
                </CopyText>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function SubTitle({ children }) {
  return (
    <div className="text-[11px] font-medium text-muted-foreground">
      {children}
    </div>
  )
}

// AlertDetail renders the parsed alert section; open by default — it is what
// the analyst judges the incident on.
export function AlertDetail({ alert }) {
  const [open, setOpen] = useState(true)
  if (!alert) return null
  const app =
    alert.pairs
      .find((p) => p.k === "来源/程序")
      ?.v.split("/")
      .pop() || ""
  const pairs = alert.pairs.filter((p) => !isBlank(p.v) && p.k !== "指纹")
  const fp = alert.pairs.find((p) => p.k === "指纹")?.v
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        告警详情
      </button>
      {open ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-md bg-muted/50 p-3">
          {alert.sample != null && !isBlank(JSON.stringify(alert.sample)) ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <SubTitle>告警样本（最近一条原始告警）</SubTitle>
              <KVTable obj={alert.sample} />
            </div>
          ) : null}
          {alert.key != null ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <SubTitle>聚合键（同一组告警的共同特征）</SubTitle>
              <KVTable obj={alert.key} />
            </div>
          ) : null}
          {pairs.length ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <SubTitle>聚合统计</SubTitle>
              <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                {pairs.map((p, i) => (
                  <div key={`${p.k}-${i}`} className="contents">
                    <dt className="text-muted-foreground">{p.k || "—"}</dt>
                    <dd className="min-w-0 break-all">
                      {fmtValue(p.k, p.v, app)}
                    </dd>
                  </div>
                ))}
                {fp ? (
                  <div className="contents">
                    <dt className="text-muted-foreground">指纹</dt>
                    <dd className="min-w-0 font-mono break-all">
                      <CopyText value={fp} label="指纹">
                        {fp}
                      </CopyText>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
