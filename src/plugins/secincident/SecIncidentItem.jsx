// List-item renderer for 安全事件 (secincident): card header carries the
// triage-critical facts — 风险等级/标题/来源/处置状态 badges, the 威胁指标
// (IOC) line, and 责任员工/前台公司/涉事资产/时间 — everything else folds
// into the expandable detail, which splits the left column into 告警信息
// (what fired) and 人员信息 (who owns the asset, with a「同步人员信息」button
// that runs the 责任人定位 workflow on this one record), and also hosts quick
// edit of the disposition fields, inline edit of 责任员工/前台公司/组织架构,
// and a「生成工单」action
// (pre-filled TicketCreateDialog linked back via 关联告警). Rendered by
// GenericTableModule's `renderItem` list mode.

import { useEffect, useState } from "react"
import {
  RISK_FALLBACK,
  STATUS_FALLBACK,
  optionsFor,
  QuickSelect,
  EditableDetailRow,
  DetailRow,
  DetailBlock,
  MarkdownBlock,
  EditableMarkdownBlock,
} from "@/platform"
import { Select as SelectPrimitive } from "radix-ui"
import { toast } from "sonner"
import {
  Building2,
  ChevronDown,
  Clock,
  Crosshair,
  MonitorSmartphone,
  Pencil,
  Ticket,
  User,
  UserRoundSearch,
  Hash,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { dropdownCls, VeilSelectItem } from "@/modules/table/veilSelect.jsx"
import { TicketCreateDialog } from "@/plugins/tickets/TicketCreate.jsx" // TODO(lint): cross-plugin import (secincident→tickets); acceptable until a shared "create ticket from record" action lands in @/platform
import { MarkdownText } from "@/components/MarkdownText.jsx"
import { CopyText } from "@/components/CopyText.jsx"
import { cardHover, cardLifted } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { toNocoDateStr } from "@/utils.js"

// Fallbacks when the /meta columns don't carry select options. Shared with
// the create dialog (SecIncidentCreate.jsx). 处置状态 is the single lifecycle
// column (merged from the retired 处置进度+处置结果 pair): open states first,
// then terminal outcomes; 已完成 is the legacy closed-without-outcome bucket.
function riskVariant(risk) {
  const s = String(risk || "")
  if (s.includes("高")) return "destructive"
  if (s.includes("中")) return "warning"
  if (s.includes("低")) return "secondary"
  return "outline"
}

// 风险等级 → 工单优先级 pre-fill (误报/低 → 低, 高 → 高, otherwise 中).
function priorityForRisk(risk) {
  const s = String(risk || "")
  if (s.includes("高")) return "高"
  if (s.includes("低") || s.includes("误报")) return "低"
  return "中"
}

// Pre-fill for the「生成工单」dialog: carry the incident's triage facts over,
// link back via 关联告警 = the secincident record id, and stamp 来源 so the
// ticket list shows where it came from.
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
function realOwnerValue(v) {
  const s = String(v ?? "").trim()
  return OWNER_PLACEHOLDERS.has(s.toLowerCase()) ? "" : s
}

function ticketInitialFor(id, fields, title, ioc) {
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

function statusVariant(status) {
  const s = String(status || "")
  if (s.includes("待跟进")) return "destructive"
  if (s.includes("跟进中")) return "warning"
  if (s.includes("已处置") || s.includes("已完成") || s.includes("未受害"))
    return "success"
  return "outline"
}

// ── 人员信息同步 ───────────────────────────────────────────────────────
// The「同步人员信息」button runs the 安全事件责任人定位 workflow against this
// one record (input.record_id) — the same def the batch dispatcher fans out —
// then re-reads the row once the run reaches a terminal state.
//
// The def is looked up BY NAME (its numeric id is not stable across
// environments) and cached for the session: one list call serves every card.
// A failed lookup (most often a caller without the workflow_viz grant, whose
// POST .../run would be refused anyway) resolves to null and simply hides the
// button; the cache is cleared on failure so a later card retries.
const OWNER_WORKFLOW_NAME = "安全事件责任人定位"
const RUN_POLL_MS = 3000
const RUN_POLL_MAX = 100 // ~5 min

let ownerDefPromise = null

function resolveOwnerWorkflow(apiClient) {
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
async function waitForRun(apiClient, runId) {
  let run = null
  for (let i = 0; i < RUN_POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, RUN_POLL_MS))
    // GET /runs/{id} answers {run, steps}.
    run = (await apiClient.get(`/api/v1/workflows/runs/${runId}`))?.run
    if (run?.status !== "pending" && run?.status !== "running") return run
  }
  return run
}

export function SecIncidentItem({
  id,
  fields,
  columns,
  onDelete,
  onPatch,
  onRefresh,
  apiClient,
  setError,
}) {
  const [open, setOpen] = useState(false)
  const [advice, setAdvice] = useState(null) // null = untouched draft
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null) // 详情 draft, same convention
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false) // 详情编辑模态框
  const [ownerDef, setOwnerDef] = useState(null) // 责任人定位工作流,null=不可用
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!apiClient) return
    let alive = true
    resolveOwnerWorkflow(apiClient).then((d) => {
      if (alive) setOwnerDef(d)
    })
    return () => {
      alive = false
    }
  }, [apiClient])

  const risk = fields["风险等级"]
  const status = fields["处置状态"]
  const ioc = String(fields["威胁指标"] || "").trim()
  const title = fields["标题"] || "未命名安全事件"
  const occurred = fields["事件发生时间"]
  const created = toNocoDateStr(fields["CreatedAt"]) || fields["CreatedAt"]
  const savedAdvice = fields["处置建议"] ?? ""
  const adviceDirty = advice !== null && advice !== savedAdvice
  const savedDetail = fields["详情"] ?? ""
  const detailDirty = detail !== null && detail !== savedDetail

  async function patchField(field, value) {
    if (!onPatch || value === fields[field]) return
    try {
      await onPatch({ [field]: value })
    } catch {
      // onPatch already surfaced the error
    }
  }

  // Run 安全事件责任人定位 on this record and pull the回填 back into the card.
  async function syncOwner() {
    if (!apiClient || !ownerDef || syncing) return
    setSyncing(true)
    try {
      const run = await apiClient.post(`/api/v1/workflows/${ownerDef.id}/run`, {
        input: { record_id: String(id) },
      })
      const final = await waitForRun(apiClient, run.id)
      await onRefresh?.()
      if (final?.status === "succeeded") {
        toast.success("人员信息已同步")
      } else if (final?.status === "failed") {
        setError?.(final.error || "人员信息同步失败")
      } else {
        toast.info("同步仍在进行，稍后展开事件可看到结果")
      }
    } catch (err) {
      setError?.(err.message || "同步人员信息失败")
    } finally {
      setSyncing(false)
    }
  }

  async function saveAdvice() {
    if (!onPatch || !adviceDirty) return
    setSaving(true)
    try {
      await onPatch({ 处置建议: advice })
      setAdvice(null)
    } catch {
      // keep the draft so the user can retry
    } finally {
      setSaving(false)
    }
  }

  async function saveDetail() {
    if (!onPatch || !detailDirty) return
    setSavingDetail(true)
    try {
      await onPatch({ 详情: detail })
      setDetail(null)
    } catch {
      // keep the draft so the user can retry
    } finally {
      setSavingDetail(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "group rounded-lg bg-card",
          cardHover,
          // 展开(选中)时固定为悬停档的加强阴影,形成持续悬浮感
          open && cardLifted
        )}
      >
        <div className="flex items-start gap-2 p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant={riskVariant(risk)}>{risk || "待定级"}</Badge>
              <CopyText
                value={title}
                label="标题"
                className="min-w-0 text-sm font-medium"
              >
                <span className="min-w-0 truncate">{title}</span>
              </CopyText>
              {fields["来源"] ? (
                <Badge variant="outline">{fields["来源"]}</Badge>
              ) : null}
              {fields["告警类型"] ? (
                <Badge variant="secondary">{fields["告警类型"]}</Badge>
              ) : null}
            </div>
            {ioc ? (
              <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <CopyText value={ioc} label="威胁指标">
                  <Crosshair className="size-3 shrink-0" />
                  <span className="min-w-0 truncate font-mono">{ioc}</span>
                </CopyText>
              </div>
            ) : null}
            {/* 折叠态信息行:每一项点击即复制(CopyText);记录 ID 领头——
                工单「关联告警 #n」与工作流 record_id 都指向它 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <CopyText
                value={String(id)}
                label="记录 ID"
                className="font-mono"
              >
                <Hash className="size-3" />
                {id}
              </CopyText>
              {fields["责任员工"] ? (
                <CopyText value={fields["责任员工"]} label="责任员工">
                  <User className="size-3" />
                  {fields["责任员工"]}
                </CopyText>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <User className="size-3" />—
                </span>
              )}
              {fields["前台公司"] ? (
                <CopyText value={fields["前台公司"]} label="前台公司">
                  <Building2 className="size-3" />
                  {fields["前台公司"]}
                </CopyText>
              ) : null}
              {fields["涉事资产"] ? (
                <CopyText value={fields["涉事资产"]} label="涉事资产">
                  <MonitorSmartphone className="size-3" />
                  {fields["涉事资产"]}
                </CopyText>
              ) : null}
              {occurred || created ? (
                <CopyText value={occurred || created} label="时间">
                  <Clock className="size-3" />
                  {occurred || created}
                </CopyText>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />—
                </span>
              )}
            </div>
          </div>
          {/* 右侧竖排(占卡片一半宽):处置状态胶囊居上、单行详情贴底(点击弹出编辑模态框) */}
          <div className="flex w-1/2 shrink-0 flex-col items-end justify-between gap-1.5 self-stretch">
            <StatusPicker
              value={status}
              options={optionsFor(columns, "处置状态", STATUS_FALLBACK)}
              onChange={(v) => patchField("处置状态", v)}
              editable={!!onPatch}
            />
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              disabled={!onPatch}
              aria-label="查看/编辑详情"
              className={cn(
                "w-full truncate text-right text-xs text-muted-foreground",
                onPatch && "cursor-pointer hover:text-foreground"
              )}
            >
              {savedDetail
                ? savedDetail.replace(/\s+/g, " ")
                : "记录处置 / 分析…"}
            </button>
          </div>
          <CollapsibleTrigger asChild>
            <IconButton
              color="gray"
              variant="ghost"
              size="sm"
              aria-label={open ? "收起详情" : "展开详情"}
            >
              <ChevronDown
                className={cn("transition-transform", open && "rotate-180")}
              />
            </IconButton>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Separator />
          {/* 左:基本信息 = 告警信息 + 人员信息(1/3) · 右:AI 研判输出(2/3) */}
          <div className="grid gap-x-6 gap-y-4 p-3 text-xs md:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-4">
              <section className="flex min-w-0 flex-col gap-2">
                <h4 className="flex h-6 items-center font-medium text-muted-foreground">
                  告警信息
                </h4>
                <DetailRow label="事件发生时间" value={occurred} />
                <DetailRow label="创建时间" value={created} />
                <DetailRow label="涉事资产" value={fields["涉事资产"]} />
                <DetailBlock label="威胁指标 (IOC)" value={ioc} mono />
              </section>
              <section className="flex min-w-0 flex-col gap-2">
                <div className="flex h-6 items-center justify-between gap-2">
                  <h4 className="font-medium text-muted-foreground">
                    人员信息
                  </h4>
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
            </div>
            <section className="flex min-w-0 flex-col gap-2 md:col-span-2 md:border-l md:pl-6">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-medium text-muted-foreground">AI 研判</h4>
                {fields["研判时间"] ? (
                  <span className="text-muted-foreground">
                    研判于 {fields["研判时间"]}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">风险等级</span>
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
              {String(fields["研判结论"] || "").trim() ? (
                <MarkdownBlock label="研判结论" value={fields["研判结论"]} />
              ) : (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-muted-foreground">研判结论</span>
                  <span className="text-muted-foreground">
                    暂无，等待 AI 工作流研判。
                  </span>
                </div>
              )}
              <EditableMarkdownBlock
                label="处置建议"
                value={savedAdvice}
                draft={advice}
                setDraft={setAdvice}
                dirty={adviceDirty}
                saving={saving}
                onSave={saveAdvice}
                editable={!!onPatch}
              />
            </section>
          </div>
          {apiClient || onDelete ? (
            <>
              <Separator />
              <div className="flex items-center justify-end gap-2 p-2">
                {apiClient ? (
                  <TicketCreateDialog
                    apiClient={apiClient}
                    setError={setError}
                    columns={columns}
                    initial={ticketInitialFor(id, fields, title, ioc)}
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
            </>
          ) : null}
        </CollapsibleContent>
      </div>
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          if (!o) saveDetail() // 关闭模态框即保存(无改动则跳过)
          setDetailOpen(o)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[600px] w-[900px] max-w-[calc(100%-2rem)] p-3 sm:max-w-[900px]"
        >
          <DialogTitle className="sr-only">处置 / 分析记录</DialogTitle>
          <Textarea
            autoFocus
            placeholder="记录处置过程与分析笔记（支持 markdown）…"
            value={detail ?? savedDetail}
            onChange={(e) => setDetail(e.target.value)}
            className="h-full min-h-0 resize-none"
          />
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}

// 处置状态 badge in the card header: a real Select behind a pill-shaped
// trigger, so the open list uses the same item-aligned behavior as the filter
// dropdowns — the current value stays anchored under the pointer and the
// other options unfold above/below it. Picking patches immediately, no need
// to expand the card.
function StatusPicker({ value, options, onChange, editable }) {
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

export default SecIncidentItem
