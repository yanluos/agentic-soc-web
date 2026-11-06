// Bits shared by the 安全事件 list card (SecIncidentItem) and its detail
// modal (SecIncidentDetail): badge variants, the 处置状态 pill picker, the
// 「生成工单」pre-fill and the 责任人定位 workflow lookup. Kept out of the two
// components so neither has to import the other.

import { Select as SelectPrimitive } from "radix-ui"
import { ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Select, SelectContent } from "@/components/ui/select"
import { dropdownCls, VeilSelectItem } from "@/modules/table/veilSelect.jsx"

import { parseFollowups } from "./timeline.js"

export function riskVariant(risk) {
  const s = String(risk || "")
  if (s.includes("高")) return "destructive"
  if (s.includes("中")) return "warning"
  if (s.includes("低")) return "secondary"
  return "outline"
}

export function statusVariant(status) {
  const s = String(status || "")
  if (s.includes("待跟进")) return "destructive"
  if (s.includes("跟进中")) return "warning"
  if (s.includes("已处置") || s.includes("已完成") || s.includes("未受害"))
    return "success"
  return "outline"
}

// One-line AI status for the collapsed card / rail square: latest 跟进 wins over the
// initial 研判, nothing yet → 待研判.
export function aiStatusLine(fields) {
  const entries = parseFollowups(fields["跟进记录"])
  if (entries.length) {
    const last = entries[entries.length - 1]
    const n = last.n ?? entries.length
    return `AI 跟进 #${n} · ${fields["跟进时间"] || last.time}${last.attention ? " · 需人工关注" : ""}`
  }
  if (String(fields["研判结论"] || "").trim()) {
    return fields["研判时间"] ? `AI 研判于 ${fields["研判时间"]}` : "已 AI 研判"
  }
  if (fields["跟进时间"]) return `AI 已认领 · ${fields["跟进时间"]}`
  return "待 AI 研判"
}

// 风险等级 → 工单优先级 pre-fill (误报/低 → 低, 高 → 高, otherwise 中).
function priorityForRisk(risk) {
  const s = String(risk || "")
  if (s.includes("高")) return "高"
  if (s.includes("低") || s.includes("误报")) return "低"
  return "中"
}

// Owner fields the 责任人定位 workflow could not fill carry a "-" placeholder
// (the dispatcher keys on it). Never copy that into a ticket: the tracker's
// resolve step would read it as a tenant named "-" and skip the outreach.
const OWNER_PLACEHOLDERS = new Set([
  "-",
  "—",
  "--",
  "无",
  "未知",
  "未定位",
  "n/a",
  "null",
])
export function realOwnerValue(v) {
  const s = String(v ?? "").trim()
  return OWNER_PLACEHOLDERS.has(s.toLowerCase()) ? "" : s
}

// Pre-fill for the「生成工单」dialog: carry the incident's triage facts over,
// link back via 关联告警 = the secincident record id, and stamp 来源 so the
// ticket list shows where it came from.
export function ticketInitialFor(id, fields, title, ioc) {
  const lines = [`由安全事件 #${id}「${title}」生成。`]
  if (fields["来源"]) lines.push(`事件来源: ${fields["来源"]}`)
  if (fields["告警类型"]) lines.push(`告警类型: ${fields["告警类型"]}`)
  if (ioc) lines.push(`威胁指标: ${ioc}`)
  if (fields["涉事资产"]) lines.push(`涉事资产: ${fields["涉事资产"]}`)
  if (fields["事件发生时间"])
    lines.push(`事件发生时间: ${fields["事件发生时间"]}`)
  const advice = String(fields["处置建议"] || "").trim()
  if (advice) lines.push("", "处置建议:", advice)
  return {
    标题: title,
    类型: "告警处置",
    优先级: priorityForRisk(fields["风险等级"]),
    负责人: realOwnerValue(fields["责任员工"]),
    责任人邮箱: realOwnerValue(fields["责任人邮箱"]),
    前台公司: realOwnerValue(fields["前台公司"]),
    组织架构: realOwnerValue(fields["组织架构"]),
    关联告警: id,
    来源: "安全事件",
    描述: lines.join("\n"),
  }
}

// ── 人员信息同步 ───────────────────────────────────────────────────────
// The「同步人员信息」button runs the 安全事件责任人定位 workflow against one
// record (input.record_id) — the same def the batch dispatcher fans out —
// then re-reads the row once the run reaches a terminal state.
//
// The def is looked up BY NAME (its numeric id is not stable across
// environments) and cached for the session: one list call serves every card.
// A failed lookup (most often a caller without the workflow_viz grant, whose
// POST .../run would be refused anyway) resolves to null and simply hides the
// button; the cache is cleared on failure so a later card retries.
export const OWNER_WORKFLOW_NAME = "安全事件责任人定位"
const RUN_POLL_MS = 3000
const RUN_POLL_MAX = 100 // ~5 min

let ownerDefPromise = null

export function resolveOwnerWorkflow(apiClient) {
  if (!ownerDefPromise) {
    ownerDefPromise = apiClient.get("/api/v1/workflows/").then(
      (list) =>
        (Array.isArray(list) ? list : []).find(
          (d) => d.name === OWNER_WORKFLOW_NAME
        ) || null,
      () => {
        ownerDefPromise = null
        return null
      }
    )
  }
  return ownerDefPromise
}

// Poll a run to a terminal state. Returns the last run seen — the caller
// treats a still-running run (poll budget exhausted) as "check back later".
export async function waitForRun(apiClient, runId) {
  let run = null
  for (let i = 0; i < RUN_POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, RUN_POLL_MS))
    // GET /runs/{id} answers {run, steps}.
    run = (await apiClient.get(`/api/v1/workflows/runs/${runId}`))?.run
    if (run?.status !== "pending" && run?.status !== "running") return run
  }
  return run
}

// 处置状态 badge: a real Select behind a pill-shaped trigger, so the open
// list uses the same item-aligned behavior as the filter dropdowns — the
// current value stays anchored under the pointer and the other options unfold
// above/below it. Picking patches immediately.
export function StatusPicker({ value, options, onChange, editable }) {
  const label = value || "待跟进"
  if (!editable) {
    return (
      <Badge variant={statusVariant(value)} className="ml-auto">
        {label}
      </Badge>
    )
  }
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectPrimitive.Trigger asChild>
        <button
          type="button"
          className="ml-auto cursor-pointer rounded-4xl"
          aria-label="修改处置状态"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant={statusVariant(value)}>
            {/* item-aligned positioning requires a Value node in the trigger
                (radix guards on context.valueNode before positioning). */}
            <SelectPrimitive.Value placeholder="待跟进" />
            <ChevronDown data-icon="inline-end" />
          </Badge>
        </button>
      </SelectPrimitive.Trigger>
      <SelectContent className={dropdownCls}>
        {options.map((o) => (
          <VeilSelectItem key={o.value} value={o.value}>
            {o.label ?? o.value}
          </VeilSelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
