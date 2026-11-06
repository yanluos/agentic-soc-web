// 安全事件 detail modal: an overlay Dialog (replaces the old in-card
// Collapsible) with the triage facts in the left rail and the 事件时间线 on
// the right. The timeline is assembled client-side (timeline.js) from the
// record itself (告警发生 / 入库 / 研判结论 / 跟进记录 entries), the workflow
// runs dispatched for it (workflow_runs rows whose input.record_id is the
// row id or the 详情「指纹」, read through the generic table route) and the
// tickets linked via 关联告警. An AI node unfolds its「分析过程」= the run's
// step traces (GET /api/v1/workflows/runs/{id}), agent/analyze outputs
// rendered as Markdown, tool steps collapsed. Runs update live over the
// shared workflow SSE feed while the modal is open; a run of this record
// reaching a terminal state also re-reads the row (the follow-up agent
// writes its verdict just before).
//
// Users without the workflow tables / tickets grant simply see the
// record-derived nodes — the extra fetches fail soft.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Clock,
  Crosshair,
  Footprints,
  Hash,
  Inbox,
  MonitorSmartphone,
  RefreshCw,
  Sparkles,
  Ticket,
  User,
  UserRoundSearch,
  Workflow,
} from "lucide-react"

import {
  RISK_FALLBACK,
  STATUS_FALLBACK,
  optionsFor,
  QuickSelect,
  EditableDetailRow,
  DetailRow,
  DetailBlock,
  EditableMarkdownBlock,
  buildTablePath,
  statusBadgeVariant,
} from "@/platform"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { MarkdownText } from "@/components/MarkdownText.jsx"
import { CopyText } from "@/components/CopyText.jsx"
import { TicketCreateDialog } from "@/plugins/tickets/TicketCreate.jsx" // TODO(lint): cross-plugin import (secincident→tickets); acceptable until a shared "create ticket from record" action lands in @/platform
import { subscribeWorkflowEvents } from "@/lib/workflowEvents.js"
import { cn } from "@/lib/utils"

import {
  OWNER_WORKFLOW_NAME,
  StatusPicker,
  resolveOwnerWorkflow,
  riskVariant,
  ticketInitialFor,
  waitForRun,
} from "./shared.jsx"
import {
  buildTimeline,
  fingerprintOf,
  fmtTime,
  isTerminalRunStatus,
  normalizeRun,
} from "./timeline.js"

const RUN_PAGE = 30
// Projection: the run row's `definition` snapshot is the whole def JSON —
// never pull it for a list.
const RUN_FIELDS = [
  "def_id",
  "name",
  "status",
  "input",
  "error",
  "dry_run",
  "created_by",
  "tokens_used",
  "llm_calls",
  "CreatedAt",
  "UpdatedAt",
]

// ── data hooks ─────────────────────────────────────────────────────────

// Workflow runs dispatched for this record, newest-first with「加载更早」
// paging. 403/401 → available:false (no grant), anything else is reported.
function useIncidentRuns({ apiClient, id, fingerprint, open, setError }) {
  const [runs, setRuns] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(true)
  const [tick, setTick] = useState(0)

  const where = useMemo(() => {
    const clauses = [`(input,like,%"record_id":"${id}"%)`]
    if (fingerprint) clauses.push(`(input,like,%"record_id":"${fingerprint}"%)`)
    return clauses.join("~or")
  }, [id, fingerprint])

  const reload = useCallback(() => {
    setPage(1)
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!open || !apiClient) return
    let cancelled = false
    setLoading(true)
    const path = buildTablePath("workflow_runs", {
      limit: RUN_PAGE,
      page,
      where,
      sort: "-Id",
      fields: RUN_FIELDS,
    })
    apiClient
      .get(path)
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp?.records)
          ? resp.records
          : Array.isArray(resp)
            ? resp
            : []
        const norm = list.map(normalizeRun)
        setRuns((prev) => (page === 1 ? norm : [...prev, ...norm]))
        setHasMore(typeof resp?.next === "string" && resp.next !== "")
        setAvailable(true)
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.status === 401 || err?.status === 403) {
          setAvailable(false)
        } else {
          setError?.(err.message || "读取工作流运行失败")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, apiClient, page, where, tick, setError])

  // Patch a known run in place from a live event (no refetch).
  const patchRun = useCallback((ev) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === String(ev.id)
          ? {
              ...r,
              status: ev.status ?? r.status,
              error: ev.error ?? r.error,
              tokens: ev.tokens_used ?? r.tokens,
              llmCalls: ev.llm_calls ?? r.llmCalls,
            }
          : r
      )
    )
  }, [])

  return {
    runs,
    loading,
    hasMore,
    available,
    reload,
    patchRun,
    loadMore: () => setPage((p) => p + 1),
  }
}

// Tickets generated from this incident (关联告警 = record id).
function useIncidentTickets({ apiClient, id, open }) {
  const [tickets, setTickets] = useState([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open || !apiClient) return
    let cancelled = false
    const path = buildTablePath("tickets", {
      limit: 20,
      where: `(关联告警,eq,${id})`,
      sort: "-Id",
    })
    apiClient
      .get(path)
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp?.records)
          ? resp.records
          : Array.isArray(resp)
            ? resp
            : []
        setTickets(list)
      })
      .catch(() => {
        // no tickets grant / table missing → the timeline just has no 工单 nodes
      })
    return () => {
      cancelled = true
    }
  }, [open, apiClient, id, tick])
  return { tickets, reload: () => setTick((t) => t + 1) }
}

// ── modal ──────────────────────────────────────────────────────────────

export function SecIncidentDetailDialog({
  open,
  onOpenChange,
  id,
  fields,
  columns,
  onPatch,
  onDelete,
  onRefresh,
  apiClient,
  setError,
}) {
  const [advice, setAdvice] = useState(null) // null = untouched draft
  const [savingAdvice, setSavingAdvice] = useState(false)
  const [detail, setDetail] = useState(null)
  const [savingDetail, setSavingDetail] = useState(false)
  const [ownerDef, setOwnerDef] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const risk = fields["风险等级"]
  const status = fields["处置状态"]
  const ioc = String(fields["威胁指标"] || "").trim()
  const title = fields["标题"] || "未命名安全事件"
  const occurred = fields["事件发生时间"]
  const created = fields["CreatedAt"]
  const savedAdvice = fields["处置建议"] ?? ""
  const savedDetail = fields["详情"] ?? ""
  const adviceDirty = advice !== null && advice !== savedAdvice
  const detailDirty = detail !== null && detail !== savedDetail
  const evidence = String(fields["研判证据"] || "").trim()
  const fingerprint = useMemo(() => fingerprintOf(fields), [fields])

  useEffect(() => {
    if (!open || !apiClient) return
    let alive = true
    resolveOwnerWorkflow(apiClient).then((d) => {
      if (alive) setOwnerDef(d)
    })
    return () => {
      alive = false
    }
  }, [open, apiClient])

  const runsState = useIncidentRuns({
    apiClient,
    id,
    fingerprint,
    open,
    setError,
  })
  const ticketsState = useIncidentTickets({ apiClient, id, open })

  // Live feed: new/removed runs → debounced reload; a known run's update is
  // patched in place, and its terminal state re-reads the record (the agent's
  // 跟进记录 / 研判结论 land right before the run ends).
  const liveRef = useRef({})
  liveRef.current = {
    ids: new Set(runsState.runs.map((r) => r.id)),
    reload: runsState.reload,
    patchRun: runsState.patchRun,
    onRefresh,
  }
  useEffect(() => {
    if (!open) return
    let timer = null
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => liveRef.current.reload(), 1500)
    }
    const unsub = subscribeWorkflowEvents((ev) => {
      if (ev.kind === "resync") return schedule()
      if (ev.kind !== "run") return
      const { ids, patchRun, onRefresh: refresh } = liveRef.current
      if (ids.has(String(ev.id))) {
        if (ev.op === "deleted") return schedule()
        patchRun(ev)
        if (isTerminalRunStatus(ev.status)) refresh?.()
        return
      }
      if (ev.op === "created") schedule()
    })
    return () => {
      unsub()
      clearTimeout(timer)
    }
  }, [open])

  const nodes = useMemo(
    () =>
      buildTimeline({
        fields,
        runs: runsState.runs,
        tickets: ticketsState.tickets,
      }),
    [fields, runsState.runs, ticketsState.tickets]
  )

  async function patchField(field, value) {
    if (!onPatch || value === fields[field]) return
    try {
      await onPatch({ [field]: value })
    } catch {
      // onPatch already surfaced the error
    }
  }

  async function saveAdvice() {
    if (!onPatch || !adviceDirty) return
    setSavingAdvice(true)
    try {
      await onPatch({ 处置建议: advice })
      setAdvice(null)
    } catch {
      // keep the draft
    } finally {
      setSavingAdvice(false)
    }
  }

  async function saveDetail() {
    if (!onPatch || !detailDirty) return
    setSavingDetail(true)
    try {
      await onPatch({ 详情: detail })
      setDetail(null)
    } catch {
      // keep the draft
    } finally {
      setSavingDetail(false)
    }
  }

  // Run 安全事件责任人定位 on this record and pull the回填 back.
  async function syncOwner() {
    if (!apiClient || !ownerDef || syncing) return
    setSyncing(true)
    try {
      const run = await apiClient.post(`/api/v1/workflows/${ownerDef.id}/run`, {
        input: { record_id: String(id) },
      })
      runsState.reload()
      const final = await waitForRun(apiClient, run.id)
      await onRefresh?.()
      if (final?.status === "succeeded") {
        toast.success("人员信息已同步")
      } else if (final?.status === "failed") {
        setError?.(final.error || "人员信息同步失败")
      } else {
        toast.info("同步仍在进行，稍后可在时间线中看到结果")
      }
    } catch (err) {
      setError?.(err.message || "同步人员信息失败")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[1200px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        {/* ── 头部：定级 + 标题 + 来源/类型 + 处置状态 ── */}
        <div className="flex flex-col gap-2 border-b p-4 pr-12">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={riskVariant(risk)}>{risk || "待定级"}</Badge>
            <DialogTitle className="min-w-0 truncate text-base font-semibold">
              <CopyText value={title} label="标题">
                <span className="min-w-0 truncate">{title}</span>
              </CopyText>
            </DialogTitle>
            {fields["来源"] ? (
              <Badge variant="outline">{fields["来源"]}</Badge>
            ) : null}
            {fields["告警类型"] ? (
              <Badge variant="secondary">{fields["告警类型"]}</Badge>
            ) : null}
            <StatusPicker
              value={status}
              options={optionsFor(columns, "处置状态", STATUS_FALLBACK)}
              onChange={(v) => patchField("处置状态", v)}
              editable={!!onPatch}
            />
          </div>
          <DialogDescription className="sr-only">
            安全事件详情与事件时间线
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <CopyText value={String(id)} label="记录 ID" className="font-mono">
              <Hash className="size-3" />
              {id}
            </CopyText>
            {ioc ? (
              <CopyText value={ioc} label="威胁指标" className="font-mono">
                <Crosshair className="size-3" />
                <span className="min-w-0 truncate">{ioc}</span>
              </CopyText>
            ) : null}
            {fields["责任员工"] ? (
              <CopyText value={fields["责任员工"]} label="责任员工">
                <User className="size-3" />
                {fields["责任员工"]}
                {fields["前台公司"] ? ` · ${fields["前台公司"]}` : ""}
              </CopyText>
            ) : null}
            {fields["涉事资产"] ? (
              <CopyText value={fields["涉事资产"]} label="涉事资产">
                <MonitorSmartphone className="size-3" />
                {fields["涉事资产"]}
              </CopyText>
            ) : null}
            {occurred || created ? (
              <CopyText value={occurred || fmtTime(created)} label="时间">
                <Clock className="size-3" />
                {occurred || fmtTime(created)}
              </CopyText>
            ) : null}
          </div>
        </div>

        {/* ── 主体：左栏事实 + 可编辑字段 · 右栏事件时间线 ── */}
        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-b p-4 text-xs md:border-r md:border-b-0">
            <section className="flex min-w-0 flex-col gap-2">
              <h4 className="flex h-6 items-center font-medium text-muted-foreground">
                告警信息
              </h4>
              <DetailRow label="事件发生时间" value={occurred} />
              <DetailRow label="入库时间" value={fmtTime(created)} />
              <DetailRow label="来源" value={fields["来源"]} />
              <DetailRow label="告警类型" value={fields["告警类型"]} />
              <DetailRow label="涉事资产" value={fields["涉事资产"]} />
              <DetailBlock label="威胁指标 (IOC)" value={ioc} mono />
            </section>

            <section className="flex min-w-0 flex-col gap-2">
              <div className="flex h-6 items-center justify-between gap-2">
                <h4 className="font-medium text-muted-foreground">人员信息</h4>
                {ownerDef ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={syncOwner}
                    disabled={syncing}
                    title={`运行「${OWNER_WORKFLOW_NAME}」工作流回填责任员工/邮箱/公司/组织架构`}
                  >
                    {syncing ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <UserRoundSearch data-icon="inline-start" />
                    )}
                    {syncing ? "同步中…" : "同步人员信息"}
                  </Button>
                ) : null}
              </div>
              <EditableDetailRow
                label="责任员工"
                value={fields["责任员工"]}
                editable={!!onPatch}
                onSave={(v) => patchField("责任员工", v)}
              />
              <EditableDetailRow
                label="责任人邮箱"
                value={fields["责任人邮箱"]}
                editable={!!onPatch}
                onSave={(v) => patchField("责任人邮箱", v)}
              />
              <EditableDetailRow
                label="前台公司"
                value={fields["前台公司"]}
                editable={!!onPatch}
                options={optionsFor(columns, "前台公司", [])}
                onSave={(v) => patchField("前台公司", v)}
              />
              <EditableDetailRow
                label="组织架构"
                value={fields["组织架构"]}
                editable={!!onPatch}
                onSave={(v) => patchField("组织架构", v)}
              />
            </section>

            <section className="flex min-w-0 flex-col gap-2">
              <h4 className="flex h-6 items-center font-medium text-muted-foreground">
                研判与处置
              </h4>
              <div className="flex items-center justify-between gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  风险等级
                </span>
                {onPatch ? (
                  <div className="w-32">
                    <QuickSelect
                      value={risk}
                      placeholder="待定级"
                      options={optionsFor(columns, "风险等级", RISK_FALLBACK)}
                      onChange={(v) => patchField("风险等级", v)}
                    />
                  </div>
                ) : (
                  <Badge variant={riskVariant(risk)}>{risk || "待定级"}</Badge>
                )}
              </div>
              <DetailRow label="研判时间" value={fields["研判时间"]} />
              <DetailRow label="最近跟进" value={fields["跟进时间"]} />
              {/* 人工专属：AI 工具不写 详情（2026-11-05），证据在时间线的研判节点里 */}
              <EditableMarkdownBlock
                label="人工处置 / 分析记录"
                value={savedDetail}
                draft={detail}
                setDraft={setDetail}
                dirty={detailDirty}
                saving={savingDetail}
                onSave={saveDetail}
                editable={!!onPatch}
                placeholder="人工记录处置过程与分析笔记（支持 markdown）；AI 不会改写这里…"
              />
            </section>
          </aside>

          <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-xs">
            <div className="flex h-6 items-center justify-between gap-2">
              <h4 className="font-medium text-muted-foreground">
                事件时间线
                <span className="ml-2 font-normal">{nodes.length} 条</span>
              </h4>
              <div className="flex items-center gap-1">
                {runsState.loading ? <Spinner className="size-3" /> : null}
                {runsState.available ? (
                  <IconButton
                    color="gray"
                    variant="ghost"
                    size="sm"
                    aria-label="刷新时间线"
                    onClick={() => {
                      runsState.reload()
                      ticketsState.reload()
                      onRefresh?.()
                    }}
                  >
                    <RefreshCw />
                  </IconButton>
                ) : null}
              </div>
            </div>
            {!runsState.available ? (
              <p className="text-muted-foreground">
                当前账号无工作流查看权限，时间线仅显示事件自身记录。
              </p>
            ) : null}
            <Timeline
              nodes={nodes}
              fields={fields}
              apiClient={apiClient}
              evidence={evidence}
              advice={{
                value: savedAdvice,
                draft: advice,
                setDraft: setAdvice,
                dirty: adviceDirty,
                saving: savingAdvice,
                onSave: saveAdvice,
                editable: !!onPatch,
              }}
            />
            {runsState.hasMore ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-center"
                disabled={runsState.loading}
                onClick={runsState.loadMore}
              >
                {runsState.loading ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                加载更早的运行
              </Button>
            ) : null}
          </section>
        </div>

        {/* ── 底栏动作 ── */}
        {apiClient || onDelete ? (
          <div className="flex items-center justify-end gap-2 border-t p-2">
            {apiClient ? (
              <TicketCreateDialog
                apiClient={apiClient}
                setError={setError}
                columns={columns}
                initial={ticketInitialFor(id, fields, title, ioc)}
                onCreated={ticketsState.reload}
                trigger={
                  <Button type="button" size="sm">
                    <Ticket data-icon="inline-start" />
                    生成工单
                  </Button>
                }
              />
            ) : null}
            {onDelete ? (
              <ConfirmDeleteButton size="sm" onConfirm={onDelete}>
                删除事件
              </ConfirmDeleteButton>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ── timeline ───────────────────────────────────────────────────────────

const KIND_META = {
  occurred: { icon: AlertTriangle, dot: "bg-warning" },
  created: { icon: Inbox, dot: "bg-muted-foreground/60" },
  run: { icon: Workflow, dot: "bg-muted-foreground/60" },
  verdict: { icon: Sparkles, dot: "bg-primary" },
  followup: { icon: Footprints, dot: "bg-primary" },
  ticket: { icon: Ticket, dot: "bg-success" },
}

function dotFor(node) {
  const run = node.run
  if (run?.status === "failed") return "bg-destructive"
  if (run && !isTerminalRunStatus(run.status)) return "bg-primary animate-pulse"
  return KIND_META[node.kind]?.dot || "bg-muted-foreground/60"
}

function Timeline({ nodes, fields, apiClient, advice, evidence }) {
  const hasAI = nodes.some(
    (n) => n.kind === "verdict" || n.kind === "followup" || n.kind === "run"
  )
  return (
    <ol className="flex flex-col">
      {nodes.map((node, i) => {
        const Icon = KIND_META[node.kind]?.icon || Workflow
        const last = i === nodes.length - 1 && hasAI
        return (
          <li key={node.key} className="flex min-w-0 gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-[5px] size-2 shrink-0 rounded-full",
                  dotFor(node)
                )}
              />
              {!last ? <span className="my-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1.5",
                !last && "pb-4"
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{node.title}</span>
                <span className="text-muted-foreground">
                  {node.timeText || "时间未知"}
                </span>
                <NodeBadges node={node} />
              </div>
              <NodeBody
                node={node}
                fields={fields}
                apiClient={apiClient}
                advice={advice}
                evidence={evidence}
              />
            </div>
          </li>
        )
      })}
      {!hasAI ? (
        <li className="flex min-w-0 gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-[5px] size-2 shrink-0 rounded-full border border-dashed border-muted-foreground/60" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
            <Bot className="size-3.5" />
            尚无 AI 研判记录，等待工作流研判。
          </div>
        </li>
      ) : null}
    </ol>
  )
}

function NodeBadges({ node }) {
  const out = []
  if (node.kind === "verdict") {
    out.push(
      <Badge key="risk" variant={riskVariant(node.riskText)}>
        {node.riskText}
      </Badge>
    )
  }
  if (node.kind === "followup" && node.entry?.attention) {
    out.push(
      <Badge key="attn" variant="warning">
        需人工关注
      </Badge>
    )
  }
  if (node.run && node.kind !== "verdict") {
    out.push(
      <Badge key="status" variant={statusBadgeVariant(node.run.status)}>
        {runStatusLabel(node.run.status)}
      </Badge>
    )
  }
  if (node.kind === "ticket" && node.ticket?.["状态"]) {
    out.push(
      <Badge key="tstatus" variant="outline">
        {node.ticket["状态"]}
      </Badge>
    )
  }
  return out
}

function runStatusLabel(s) {
  switch (s) {
    case "succeeded":
      return "成功"
    case "failed":
      return "失败"
    case "cancelled":
      return "已取消"
    case "waiting_approval":
      return "等待审批"
    case "running":
      return "运行中"
    case "pending":
      return "排队中"
    default:
      return s || "—"
  }
}

function NodeBody({ node, fields, apiClient, advice, evidence }) {
  switch (node.kind) {
    case "occurred":
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {fields["来源"] ? <span>来源 {fields["来源"]}</span> : null}
          {fields["告警类型"] ? <span>类型 {fields["告警类型"]}</span> : null}
          {fields["威胁指标"] ? (
            <span className="font-mono">{fields["威胁指标"]}</span>
          ) : null}
          {fields["涉事资产"] ? <span>资产 {fields["涉事资产"]}</span> : null}
        </div>
      )
    case "created":
      return (
        <div className="text-muted-foreground">
          {fields["源ID"]
            ? `由告警源同步入库（源 ID ${fields["源ID"]}）`
            : "由工作流研判创建"}
        </div>
      )
    case "verdict":
      return (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="rounded-md bg-muted/50 p-2">
            <MarkdownText>{String(fields["研判结论"] || "")}</MarkdownText>
          </div>
          {/* 处置建议 is part of the verdict; humans refine it here (pencil). */}
          {advice ? (
            <EditableMarkdownBlock label="处置建议" {...advice} />
          ) : null}
          {evidence ? <EvidenceBlock text={evidence} /> : null}
          {node.run ? (
            <RunProcess run={node.run} apiClient={apiClient} />
          ) : null}
        </div>
      )
    case "followup":
      return (
        <div className="flex min-w-0 flex-col gap-2">
          {node.entry?.body ? (
            <div className="rounded-md bg-muted/50 p-2">
              <MarkdownText>{node.entry.body}</MarkdownText>
            </div>
          ) : null}
          {node.entry?.actor && !node.run ? (
            <span className="text-muted-foreground">
              执行者 {node.entry.actor}
            </span>
          ) : null}
          {node.run ? (
            <RunProcess run={node.run} apiClient={apiClient} />
          ) : null}
        </div>
      )
    case "run":
      return (
        <div className="flex min-w-0 flex-col gap-2">
          {node.run.error ? (
            <div className="rounded-md bg-destructive/10 p-2 break-all text-destructive">
              {node.run.error}
            </div>
          ) : null}
          <RunProcess run={node.run} apiClient={apiClient} />
        </div>
      )
    case "ticket":
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          <span className="text-foreground">{node.ticket["标题"]}</span>
          {node.ticket["优先级"] ? (
            <span>优先级 {node.ticket["优先级"]}</span>
          ) : null}
          {node.ticket["负责人"] ? (
            <span>负责人 {node.ticket["负责人"]}</span>
          ) : null}
        </div>
      )
    default:
      return null
  }
}

// 研判证据: the AI's evidence block written at triage (告警聚合 + 指纹), folded
// by default — the conclusion above is what the analyst reads first.
function EvidenceBlock({ text }) {
  const [open, setOpen] = useState(false)
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
        研判证据
      </button>
      {open ? (
        <div className="max-h-[28rem] overflow-auto rounded-md bg-muted/50 p-2">
          <MarkdownText>{text}</MarkdownText>
        </div>
      ) : null}
    </div>
  )
}

// ── run process (step traces) ──────────────────────────────────────────

const STEP_TYPE_LABEL = {
  tool: "工具",
  agent: "智能体",
  analyze: "分析",
  condition: "条件",
  approval: "审批",
  note: "备注",
  parallel: "并行",
}

function RunProcess({ run, apiClient }) {
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Fetch when unfolded; refetch when the run's status moves (new traces).
  useEffect(() => {
    if (!open || !apiClient) return
    let cancelled = false
    setLoading(true)
    apiClient
      .get(`/api/v1/workflows/runs/${run.id}`)
      .then((resp) => {
        if (cancelled) return
        setSteps(Array.isArray(resp?.steps) ? resp.steps : [])
        setError("")
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "读取运行步骤失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, apiClient, run.id, run.status])

  const meta = [runStatusLabel(run.status)]
  if (run.llmCalls) meta.push(`${run.llmCalls} 次模型调用`)
  if (run.tokens) meta.push(`${run.tokens.toLocaleString()} tok`)
  if (run.createdBy) meta.push(run.createdBy)

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
        <Workflow className="size-3.5" />
        <span>
          分析过程 · {run.name}
          <span className="font-mono"> #{run.id}</span>
        </span>
        {meta.length ? <span>· {meta.join(" · ")}</span> : null}
        {loading ? <Spinner className="size-3" /> : null}
      </button>
      {open ? (
        error ? (
          <p className="text-destructive">{error}</p>
        ) : steps && steps.length === 0 && !loading ? (
          <p className="text-muted-foreground">该运行没有步骤记录。</p>
        ) : steps ? (
          <ol className="flex flex-col gap-1 border-l pl-3">
            {steps.map((s, i) => (
              <StepRow key={s.id || i} step={s} index={i} />
            ))}
          </ol>
        ) : null
      ) : null}
    </div>
  )
}

function StepRow({ step, index }) {
  const isLLM = step.type === "agent" || step.type === "analyze"
  const skipped = step.status === "skipped"
  const [open, setOpen] = useState(isLLM && !skipped)
  const [showInput, setShowInput] = useState(false)
  const hasOutput = step.output != null && String(step.output).trim() !== ""
  const hasInput = step.input != null && String(step.input).trim() !== ""
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-sm text-left hover:text-foreground",
          skipped && "text-muted-foreground"
        )}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            step.status === "failed"
              ? "bg-destructive"
              : skipped
                ? "bg-muted-foreground/40"
                : "bg-success"
          )}
        />
        <span className={cn("font-medium", skipped && "font-normal")}>
          {step.name || `步骤 ${index + 1}`}
        </span>
        {skipped ? <span className="text-[11px]">未执行</span> : null}
        {step.status === "failed" ? (
          <span className="text-[11px] text-destructive">失败</span>
        ) : null}
        <Badge
          variant={isLLM ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {STEP_TYPE_LABEL[step.type] || step.type || "步骤"}
        </Badge>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          {[
            fmtTime(step.executed_at),
            step.duration_ms ? `${(step.duration_ms / 1000).toFixed(1)}s` : "",
            step.tokens ? `${step.tokens.toLocaleString()} tok` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {open ? (
        <div className="flex min-w-0 flex-col gap-1 pl-5">
          {hasInput ? (
            <button
              type="button"
              onClick={() => setShowInput((v) => !v)}
              className="w-fit text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showInput ? "收起输入" : "查看输入"}
            </button>
          ) : null}
          {hasInput && showInput ? (
            <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
              {stringify(step.input)}
            </pre>
          ) : null}
          {hasOutput ? (
            <StepOutput value={step.output} markdown={isLLM} />
          ) : (
            <span className="text-muted-foreground">无输出。</span>
          )}
        </div>
      ) : null}
    </li>
  )
}

function stringify(v) {
  if (typeof v !== "string") return JSON.stringify(v, null, 2)
  const t = v.trim()
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2)
    } catch {
      // not JSON
    }
  }
  return v
}

// Agent/analyze outputs are prose (or a fenced JSON verdict) → Markdown;
// everything that parses as JSON → pretty-printed; else raw text.
function StepOutput({ value, markdown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2)
  const t = text.trim()
  const looksJSON = t.startsWith("{") || t.startsWith("[")
  if (looksJSON) {
    try {
      const pretty = JSON.stringify(JSON.parse(t), null, 2)
      return (
        <pre className="max-h-80 overflow-auto rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap">
          {pretty}
        </pre>
      )
    } catch {
      // fall through
    }
  }
  if (markdown) {
    return (
      <div className="max-h-[32rem] overflow-auto rounded-md bg-muted/50 p-2">
        <MarkdownText>{text}</MarkdownText>
      </div>
    )
  }
  return (
    <pre className="max-h-80 overflow-auto rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap">
      {text}
    </pre>
  )
}

export default SecIncidentDetailDialog
