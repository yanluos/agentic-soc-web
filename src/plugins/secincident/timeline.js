// Pure helpers behind the 安全事件 detail timeline: parse the server-appended
// 跟进记录 Markdown (`#### <time> · 跟进 #n（actor）` entries, see
// soc-server/plugins/secincident/followup.go), normalize workflow_runs rows,
// and merge everything the platform knows about one incident into one
// chronological node list.
//
// Node kinds (in tie-break order): occurred 告警发生 · created 事件入库 ·
// run 工作流运行 · verdict AI 研判结论 · followup AI 跟进 · ticket 工单 ·
// ticketlog 工单状态 · ir 应急响应 · block 封禁 · recurrence 告警复发 ·
// closure 事件结案. 跟进记录 entries carry a label after the time
// (`· 跟进 #n` / `· 工单` / `· 结案` / `· 复发`, 2026-11-06 case loop; phase 2
// adds `· 建议` / `· 处置` / `· 应急` / `· 备注`); legacy
// entries without one are AI follow-ups.
// A 跟进 entry whose actor names `run#<id>` folds that run into itself (the
// entry is the run's conclusion, the run's step traces are its process); the
// 研判结论 node adopts the latest 研判 run that started before 研判时间 the
// same way. Remaining runs stand alone.

import { getRecordFields, getRecordId } from "@/utils.js"

const KIND_ORDER = {
  occurred: 0,
  created: 1,
  run: 2,
  verdict: 3,
  followup: 4,
  ticket: 5,
  ticketlog: 6,
  ir: 7,
  block: 8,
  recurrence: 9,
  proposal: 10,
  action: 11,
  irnote: 12,
  note: 13,
  closure: 14,
}

// 跟进记录 entry label → timeline node kind + title.
const LABEL_KIND = {
  工单: { kind: "ticketlog", title: "工单状态变更" },
  结案: { kind: "closure", title: "事件结案" },
  复发: { kind: "recurrence", title: "告警复发" },
  归并: { kind: "recurrence", title: "告警归并" },
  // 案件闭环二期：跟进 agent 的阶段建议 → 审批通过后的执行结果 → 主机应急研判结论
  建议: { kind: "proposal", title: "阶段建议" },
  处置: { kind: "action", title: "阶段处置" },
  应急: { kind: "irnote", title: "主机应急研判" },
  备注: { kind: "note", title: "备注" },
}

// "YYYY-MM-DD HH:MM[:SS]" / "YYYY/MM/DD HH:MM" are local wall-clock strings
// (what the plugin writes); anything else goes to Date (RFC3339 CreatedAt).
export function parseTime(v) {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  const m = s.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
  )
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const pad2 = (n) => String(n).padStart(2, "0")

export function fmtTime(v) {
  const d = parseTime(v)
  if (!d) return v ? String(v) : ""
  if (d.getFullYear() < 1971) return "" // Go zero time (step traces carry none)
  return (
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  )
}

// 研判证据 of a log-derived incident carries「指纹：<sha1>」— the triage run
// that created it was dispatched with record_id = that fingerprint, not the
// row id. Rows created before 2026-11-05 carried the block in 详情.
export function fingerprintOf(fields) {
  for (const col of ["研判证据", "详情"]) {
    const m = String(fields?.[col] || "").match(/指纹[：:]\s*([0-9a-f]{40})/i)
    if (m) return m[1].toLowerCase()
  }
  return ""
}

const ENTRY_HEAD =
  /^#### (\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?:\s*·\s*(跟进|工单|结案|复发|归并|建议|处置|应急|备注)(?:\s*#(\d+))?)?\s*(?:[（(](.*?)[）)])?\s*$/

// parseFollowups splits 跟进记录 on its "#### " entry headers. Each entry:
// {time, n, actor, runId, body, attention}. Body lines are joined with the
// two-space hard breaks the server wrote, so they render as Markdown lines.
export function parseFollowups(text) {
  const s = String(text || "").trim()
  if (!s) return []
  const out = []
  for (const chunk of s.split(/\n+(?=#### )/)) {
    const lines = chunk.trim().split("\n")
    const head = lines.shift() || ""
    const m = head.match(ENTRY_HEAD)
    if (!m) continue
    const actor = (m[4] || "").trim()
    const run = actor.match(/run#(\d+)/)
    // Entry bodies are line-oriented (one fact per line); force Markdown hard
    // breaks so rows written before the server added them still stack.
    const body = lines
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l !== "")
      .join("  \n")
    out.push({
      time: m[1],
      label: m[2] || "跟进",
      n: m[3] ? Number(m[3]) : null,
      actor,
      runId: run ? run[1] : "",
      body,
      attention: /需人工关注|⚠/.test(body),
    })
  }
  return out
}

// normalizeRun maps a workflow_runs table row to the shape the timeline uses.
export function normalizeRun(record) {
  const f = getRecordFields(record)
  let input = f.input
  if (typeof input === "string") {
    try {
      input = JSON.parse(input)
    } catch {
      input = {}
    }
  }
  return {
    id: String(getRecordId(record)),
    defId: f.def_id ? String(f.def_id) : "",
    name: f.name || "工作流运行",
    status: f.status || "",
    error: f.error || "",
    tokens: Number(f.tokens_used) || 0,
    llmCalls: Number(f.llm_calls) || 0,
    createdBy: f.created_by || "",
    dryRun: !!f.dry_run,
    input: input && typeof input === "object" ? input : {},
    startedAt: f.CreatedAt || f.created_at || "",
    updatedAt: f.UpdatedAt || f.updated_at || "",
  }
}

export function isTerminalRunStatus(s) {
  return s === "succeeded" || s === "failed" || s === "cancelled"
}

// A follow-up run the quiet gate ended before the model (2026-11-06): it
// found nothing new and wrote nothing, so it is not a timeline event — a 高
// incident would otherwise collect six empty nodes an hour.
export function isQuietFollowupRun(run) {
  return (
    run.status === "succeeded" &&
    !run.llmCalls &&
    String(run.name || "").includes("跟进") &&
    !String(run.name || "").includes("调度")
  )
}

function isTriageRun(run) {
  const n = String(run.name || "")
  return n.includes("研判") && !n.includes("跟进") && !n.includes("调度")
}

// buildTimeline merges the record's own fields, its 跟进记录 entries, the
// runs dispatched for it and the tickets linked to it. Nodes without a
// parseable time sort last (kept, flagged timeText "").
export function buildTimeline({
  fields,
  runs = [],
  tickets = [],
  irCases = [],
  blocks = [],
}) {
  const nodes = []
  const push = (n) => {
    const d = parseTime(n.at)
    nodes.push({ ...n, date: d, timeText: d ? fmtTime(d) : String(n.at || "") })
  }

  if (fields["事件发生时间"]) {
    push({
      key: "occurred",
      kind: "occurred",
      at: fields["事件发生时间"],
      title: "告警发生",
    })
  }
  if (fields["CreatedAt"]) {
    push({
      key: "created",
      kind: "created",
      at: fields["CreatedAt"],
      title: "事件入库",
    })
  }

  const consumed = new Set()
  const byId = new Map(runs.map((r) => [String(r.id), r]))

  const entries = parseFollowups(fields["跟进记录"])
  entries.forEach((e, i) => {
    const lk = LABEL_KIND[e.label]
    if (lk) {
      push({
        key: `entry-${i}`,
        kind: lk.kind,
        at: e.time,
        title: lk.title,
        entry: e,
        seq: i,
      })
      return
    }
    let run = null
    if (e.runId && byId.has(e.runId) && !consumed.has(e.runId)) {
      run = byId.get(e.runId)
      consumed.add(e.runId)
    }
    push({
      key: `followup-${i}`,
      kind: "followup",
      seq: i,
      at: e.time,
      title: e.n ? `AI 跟进 #${e.n}` : "AI 跟进",
      entry: e,
      run,
    })
  })

  const verdict = String(fields["研判结论"] || "").trim()
  if (verdict) {
    const at = fields["研判时间"] || ""
    const limit = parseTime(at)
    let run = null
    for (const r of runs) {
      if (consumed.has(String(r.id)) || !isTriageRun(r)) continue
      const started = parseTime(r.startedAt)
      if (limit && started && started.getTime() > limit.getTime() + 120_000)
        continue
      if (!run || (started && parseTime(run.startedAt) < started)) run = r
    }
    if (run) consumed.add(String(run.id))
    push({
      key: "verdict",
      kind: "verdict",
      at: at || (run ? run.startedAt : ""),
      title: "AI 研判结论",
      riskText: fields["风险等级"] || "待定级",
      run,
    })
  }

  for (const r of runs) {
    if (consumed.has(String(r.id))) continue
    if (isQuietFollowupRun(r)) continue
    push({
      key: `run-${r.id}`,
      kind: "run",
      at: r.startedAt,
      title: r.name,
      run: r,
    })
  }

  for (const t of tickets) {
    const f = getRecordFields(t)
    push({
      key: `ticket-${getRecordId(t)}`,
      kind: "ticket",
      at: f.CreatedAt || "",
      title: `生成工单 #${getRecordId(t)}`,
      ticket: { id: getRecordId(t), ...f },
    })
  }

  for (const c of irCases) {
    const f = getRecordFields(c)
    push({
      key: `ir-${getRecordId(c)}`,
      kind: "ir",
      at: f.CreatedAt || "",
      title: `应急响应案例 #${getRecordId(c)}`,
      irCase: { id: getRecordId(c), ...f },
    })
  }

  for (const b of blocks) {
    const f = getRecordFields(b)
    push({
      key: `block-${getRecordId(b)}`,
      kind: "block",
      at: f.CreatedAt || "",
      title: `探针封禁 ${f["目标"] || ""}`.trim(),
      block: { id: getRecordId(b), ...f },
    })
  }

  nodes.sort((a, b) => {
    const ta = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY
    const tb = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    // 跟进记录 entries share minute-resolution times: keep their write order
    if (a.seq != null && b.seq != null) return a.seq - b.seq
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
  })
  return nodes
}
