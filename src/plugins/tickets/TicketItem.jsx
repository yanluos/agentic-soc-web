// List-item renderer for 工单 (tickets), following the 安全事件 card idiom:
// header carries 优先级/标题/类型/来源 badges + 负责人/创建人/关联告警/时间, the
// right column holds the 状态 pill picker (top) and a one-line 描述 preview
// that opens a modal editor (bottom). The expandable detail is stacked
// full-width sections: a compact field grid (unified controls, w-24 labels) →
// 描述 markdown → the 处理记录 timeline (colored dot + rail per entry, delete
// icon in the section header) with the 追加备注 composer inline at the bottom.
// Rendered by GenericTableModule's `renderItem` list mode.
//
// All edits go through onPatch, which App.jsx routes to the dedicated
// /api/v1/tickets/{id} PATCH (patchPath override) — 状态 changes and note
// patches land in the server-appended 处理记录 timeline, and the response's
// fresh fields (timeline included) merge back into the list record.

import { useState } from "react"
import { Select as SelectPrimitive } from "radix-ui"
import {
  Building2,
  ChevronDown,
  Clock,
  Link2,
  MessageSquarePlus,
  User,
  UserRoundPen,
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
import { Select, SelectContent } from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { dropdownCls, VeilSelectItem } from "@/modules/table/veilSelect.jsx"
import { cardHover, cardLifted } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { toNocoDateStr } from "@/utils.js"
import { Input } from "@/components/ui/input"
import { CopyText } from "@/components/CopyText.jsx"
import { DetailRow, MarkdownBlock, QuickSelect, optionsFor } from "@/platform"

// Fallbacks when the /meta columns don't carry select options — mirror the
// backend enums (soc-server internal/tickets). Shared with TicketCreate.jsx.
export const TICKET_STATUS_FALLBACK = ["待处理", "处理中", "已解决", "已关闭"]
export const TICKET_PRIORITY_FALLBACK = ["低", "中", "高", "紧急"]
export const TICKET_TYPE_FALLBACK = [
  "告警处置",
  "漏洞修复",
  "安全咨询",
  "变更请求",
  "其他",
]
// Mirrors the secincident 前台公司 option set (tickets.Companies backend seed).
export const TICKET_COMPANY_FALLBACK = [
  "antalpha",
  "antpool",
  "大陆方舟",
  "ssc",
  "chiconypower",
  "bitfufu",
  "bitmain",
  "sophgo",
  "-",
]

function priorityVariant(priority) {
  const s = String(priority || "")
  if (s.includes("紧急")) return "destructive"
  if (s.includes("高")) return "warning"
  if (s.includes("中")) return "secondary"
  return "outline"
}

function statusVariant(status) {
  const s = String(status || "")
  if (s.includes("待处理")) return "destructive"
  if (s.includes("处理中")) return "warning"
  if (s.includes("已解决")) return "success"
  return "outline" // 已关闭
}

// Timeline dot color by action kind: 创建 blue(primary) / 状态变更 orange
// (warning) / 备注及其他 neutral.
function timelineDot(action) {
  const s = String(action || "")
  if (s.includes("创建")) return "bg-primary"
  if (s.includes("状态变更")) return "bg-warning"
  return "bg-muted-foreground/60"
}

// Click-to-edit field row: no pencil affordance — the value itself is the
// trigger. Clicking swaps in an input; blur or Enter commits (unchanged value
// is a no-op), Escape cancels.
function ClickEditRow({ label, value, onSave, editable }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const empty = value === null || value === undefined || value === ""
  if (!editable) return <DetailRow label={label} value={value} />

  function start() {
    setDraft(empty ? "" : String(value))
    setEditing(true)
  }
  async function commit(v) {
    setEditing(false)
    if (v === (empty ? "" : String(value))) return
    await onSave(v)
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft.trim())
            if (e.key === "Escape") setEditing(false)
          }}
          className="soc-field-sm h-7 min-w-0 flex-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={`编辑${label}`}
          className={cn(
            "-mx-1 min-w-0 flex-1 cursor-text truncate rounded px-1 py-0.5 text-left",
            "hover:bg-muted/60",
            empty && "text-muted-foreground"
          )}
        >
          {empty ? "—" : String(value)}
        </button>
      )}
    </div>
  )
}

// 处理记录 is a JSON string on list responses and a parsed array on the fresh
// fields a /api/v1/tickets PATCH merges back — tolerate both.
function parseTimeline(v) {
  if (Array.isArray(v)) return v
  const s = String(v || "").trim()
  if (!s.startsWith("[")) return []
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function TicketItem({ id, fields, columns, onDelete, onPatch }) {
  const [open, setOpen] = useState(false)
  const [descOpen, setDescOpen] = useState(false) // 描述编辑模态框
  const [desc, setDesc] = useState(null) // null = untouched draft
  const [note, setNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const title = fields["标题"] || "未命名工单"
  const status = fields["状态"]
  const priority = fields["优先级"]
  const created = toNocoDateStr(fields["CreatedAt"]) || fields["CreatedAt"]
  const updated = toNocoDateStr(fields["UpdatedAt"]) || fields["UpdatedAt"]
  const savedDesc = fields["描述"] ?? ""
  const descDirty = desc !== null && desc !== savedDesc
  const timeline = parseTimeline(fields["处理记录"])

  async function patchField(field, value) {
    if (!onPatch || value === fields[field]) return
    try {
      await onPatch({ [field]: value })
    } catch {
      // onPatch already surfaced the error
    }
  }

  async function saveDesc() {
    if (!onPatch || !descDirty) return
    try {
      await onPatch({ 描述: desc })
      setDesc(null)
    } catch {
      // keep the draft so the user can retry
    }
  }

  async function saveNote() {
    if (!onPatch || !note.trim()) return
    setSavingNote(true)
    try {
      await onPatch({ note: note.trim() })
      setNote("")
    } catch {
      // keep the draft so the user can retry
    } finally {
      setSavingNote(false)
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
              <Badge variant={priorityVariant(priority)}>
                {priority || "未定级"}
              </Badge>
              <CopyText
                value={title}
                label="标题"
                className="min-w-0 text-sm font-medium"
              >
                <span className="min-w-0 truncate">{title}</span>
              </CopyText>
              {fields["类型"] ? (
                <Badge variant="secondary">{fields["类型"]}</Badge>
              ) : null}
              {fields["来源"] ? (
                <Badge variant="outline">{fields["来源"]}</Badge>
              ) : null}
            </div>
            {/* 折叠态信息行:每一项点击即复制(CopyText);工单 ID 领头——
                ticket_* 工具与追踪工作流按它定位 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <CopyText
                value={String(id)}
                label="工单 ID"
                className="font-mono"
              >
                <Hash className="size-3" />
                {id}
              </CopyText>
              {fields["负责人"] ? (
                <CopyText value={fields["负责人"]} label="负责人">
                  <User className="size-3" />
                  {fields["负责人"]}
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
              {fields["创建人"] ? (
                <CopyText value={fields["创建人"]} label="创建人">
                  <UserRoundPen className="size-3" />
                  {fields["创建人"]}
                </CopyText>
              ) : null}
              {fields["关联告警"] ? (
                <CopyText
                  value={String(fields["关联告警"])}
                  label="关联告警 ID"
                >
                  <Link2 className="size-3" />
                  <span className="font-mono">告警 #{fields["关联告警"]}</span>
                </CopyText>
              ) : null}
              {updated || created ? (
                <CopyText value={updated || created} label="时间">
                  <Clock className="size-3" />
                  {updated || created}
                </CopyText>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />—
                </span>
              )}
            </div>
          </div>
          {/* 右侧竖排(占卡片一半宽):状态胶囊居上、单行描述贴底(点击弹出编辑模态框) */}
          <div className="flex w-1/2 shrink-0 flex-col items-end justify-between gap-1.5 self-stretch">
            <TicketStatusPicker
              value={status}
              options={optionsFor(columns, "状态", TICKET_STATUS_FALLBACK)}
              onChange={(v) => patchField("状态", v)}
              editable={!!onPatch}
            />
            <button
              type="button"
              onClick={() => setDescOpen(true)}
              disabled={!onPatch}
              aria-label="查看/编辑工单详情"
              className={cn(
                "w-full truncate text-right text-xs text-muted-foreground",
                onPatch && "cursor-pointer hover:text-foreground"
              )}
            >
              {savedDesc ? savedDesc.replace(/\s+/g, " ") : "补充工单详情…"}
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
          {/* 上下分段:字段网格(全宽) → 描述(全宽) → 处理记录时间轴(全宽) */}
          <div className="flex flex-col gap-3 p-3 text-xs">
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  优先级
                </span>
                {onPatch ? (
                  <QuickSelect
                    value={priority}
                    placeholder="未定级"
                    options={optionsFor(
                      columns,
                      "优先级",
                      TICKET_PRIORITY_FALLBACK
                    )}
                    onChange={(v) => patchField("优先级", v)}
                    triggerClassName="w-fit text-xs"
                  />
                ) : (
                  <Badge variant={priorityVariant(priority)}>
                    {priority || "未定级"}
                  </Badge>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  类型
                </span>
                {onPatch ? (
                  <QuickSelect
                    value={fields["类型"]}
                    placeholder="选择类型"
                    options={optionsFor(columns, "类型", TICKET_TYPE_FALLBACK)}
                    onChange={(v) => patchField("类型", v)}
                    triggerClassName="w-fit text-xs"
                  />
                ) : (
                  <span>{fields["类型"] || "—"}</span>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  前台公司
                </span>
                {onPatch ? (
                  <QuickSelect
                    value={fields["前台公司"]}
                    placeholder="选择公司"
                    options={optionsFor(
                      columns,
                      "前台公司",
                      TICKET_COMPANY_FALLBACK
                    )}
                    onChange={(v) => patchField("前台公司", v)}
                    triggerClassName="w-fit text-xs"
                  />
                ) : (
                  <span>{fields["前台公司"] || "—"}</span>
                )}
              </div>
              <ClickEditRow
                label="负责人"
                value={fields["负责人"]}
                editable={!!onPatch}
                onSave={(v) => patchField("负责人", v)}
              />
              <ClickEditRow
                label="责任人邮箱"
                value={fields["责任人邮箱"]}
                editable={!!onPatch}
                onSave={(v) => patchField("责任人邮箱", v)}
              />
              <ClickEditRow
                label="组织架构"
                value={fields["组织架构"]}
                editable={!!onPatch}
                onSave={(v) => patchField("组织架构", v)}
              />
              <ClickEditRow
                label="关联告警"
                value={fields["关联告警"]}
                editable={!!onPatch}
                onSave={(v) => patchField("关联告警", v)}
              />
              <DetailRow label="来源" value={fields["来源"]} />
              <DetailRow label="创建人" value={fields["创建人"]} />
              <DetailRow label="创建时间" value={created} />
            </div>
            {savedDesc ? (
              <>
                <Separator />
                <MarkdownBlock label="工单详情" value={savedDesc} />
              </>
            ) : null}
            <Separator />
            <section className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium text-muted-foreground">处理记录</h4>
                {onDelete ? (
                  <ConfirmDeleteButton
                    variant="soft"
                    size="sm"
                    label="删除工单"
                    onConfirm={onDelete}
                  />
                ) : null}
              </div>
              {timeline.length === 0 ? (
                <span className="text-muted-foreground">暂无处理记录。</span>
              ) : (
                <ol className="flex flex-col">
                  {timeline.map((e, i) => (
                    <li key={i} className="flex min-w-0 gap-3">
                      {/* 圆点+轨道线:动作着色(创建蓝/流转橙/备注灰) */}
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-[3px] size-2 shrink-0 rounded-full",
                            timelineDot(e.action)
                          )}
                        />
                        {i < timeline.length - 1 ? (
                          <span className="my-1 w-px flex-1 bg-border" />
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 flex-col gap-1",
                          i < timeline.length - 1 && "pb-3"
                        )}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{e.action}</span>
                          <span className="text-muted-foreground">
                            {e.operator}
                          </span>
                          <span className="text-muted-foreground">
                            {e.time}
                          </span>
                        </div>
                        {e.note ? (
                          <div className="rounded-md bg-muted/50 p-2 break-all whitespace-pre-wrap">
                            {e.note}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {onPatch ? (
                <div className="flex items-end gap-2 pt-1">
                  <Textarea
                    rows={2}
                    placeholder="追加处置备注（记入处理记录时间线）…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-0 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={saveNote}
                    disabled={savingNote || !note.trim()}
                  >
                    {savingNote ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <MessageSquarePlus data-icon="inline-start" />
                    )}
                    追加备注
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        </CollapsibleContent>
      </div>
      <Dialog
        open={descOpen}
        onOpenChange={(o) => {
          if (!o) saveDesc() // 关闭模态框即保存(无改动则跳过)
          setDescOpen(o)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[600px] w-[900px] max-w-[calc(100%-2rem)] p-3 sm:max-w-[900px]"
        >
          <DialogTitle className="sr-only">工单详情</DialogTitle>
          <Textarea
            autoFocus
            placeholder="补充工单详情（支持 markdown）…"
            value={desc ?? savedDesc}
            onChange={(e) => setDesc(e.target.value)}
            className="h-full min-h-0 resize-none"
          />
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}

// 状态 badge in the card header: same pill-shaped Select pattern as the
// secincident StatusPicker (item-aligned dropdown, patch on pick).
function TicketStatusPicker({ value, options, onChange, editable }) {
  const label = value || "待处理"
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
          aria-label="修改工单状态"
        >
          <Badge variant={statusVariant(value)}>
            {/* item-aligned positioning requires a Value node in the trigger
                (radix guards on context.valueNode before positioning). */}
            <SelectPrimitive.Value placeholder="待处理" />
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

export default TicketItem
