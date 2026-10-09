// List-item renderer for 脆弱性 (fscan_findings), following the 工单/安全事件
// card idiom instead of a fixed-width table: the header carries 级别/主机:端口/
// 类型/服务 badges plus 协议、任务、发现时间, the right column previews 详情 in
// one line, and the collapsible body shows the full 详情 with no truncation
// (fscan detail lines are long — a table cell clipped them, which is what this
// replaces). Rendered by GenericTableModule's `renderItem` list mode.
//
// No inline editing: findings are written by the scanner (VulnsTab passes
// showEdit=false, so no onPatch arrives). The two operator actions live at the
// bottom of the expanded body — 生成工单 (pre-filled TicketCreateDialog, POSTs
// to /api/v1/tickets) and 删除 (false positive / stale after a re-scan, routed
// to /api/v1/scan/findings/{id} because the generic record route refuses
// writes on this table — write_guard "module").

import { useState } from "react"
import { Check, ChevronDown, Clock, Copy, Hash, Network, Ticket } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { cardHover, cardLifted } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { DetailRow } from "@/platform"
import { TicketCreateDialog } from "@/plugins/tickets/TicketCreate.jsx" // TODO(lint): cross-plugin import — promote to @/platform

// fscan levels are lowercase english (info/low/medium/high/critical); tolerate
// the odd chinese/severity string a vendor JSON might carry.
const LEVEL_LABEL = {
  critical: "严重",
  high: "高危",
  medium: "中危",
  low: "低危",
  info: "信息",
}

function levelKey(level) {
  return String(level || "").trim().toLowerCase()
}

function levelVariant(level) {
  const s = levelKey(level)
  if (s.includes("critical") || s.includes("严重")) return "destructive"
  if (s.includes("high") || s.includes("高")) return "destructive"
  if (s.includes("medium") || s.includes("中")) return "warning"
  if (s.includes("low") || s.includes("低")) return "secondary"
  return "outline" // info / 未知
}

function levelLabel(level) {
  const s = levelKey(level)
  return LEVEL_LABEL[s] || (level ? String(level) : "未定级")
}

// fscan finding types as emitted by the runner's parser.
const TYPE_LABEL = {
  vuln: "漏洞",
  "weak-credential": "弱口令",
  service: "服务",
  web: "Web",
  port: "端口",
  info: "信息",
}

function typeLabel(t) {
  const s = String(t || "").trim()
  return TYPE_LABEL[s.toLowerCase()] || s
}

// 详情 is free-form: a log line, a URL, or (fallback path) the whole vendor
// JSON record stashed as a string. Pretty-print the JSON case so the expanded
// body is readable instead of one endless line.
function prettyDetail(v) {
  const s = String(v ?? "").trim()
  if (!s.startsWith("{") && !s.startsWith("[")) return s
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

// Web-type findings carry no 主机/端口 (fscan logs the URL instead) — pull it
// out of 详情 so the card header still names a target.
function urlIn(v) {
  const m = String(v ?? "").match(/https?:\/\/[^\s"']+/)
  return m ? m[0] : ""
}

// 级别 → 工单优先级 pre-fill.
function priorityForLevel(level) {
  const s = levelKey(level)
  if (s.includes("critical") || s.includes("严重")) return "紧急"
  if (s.includes("high") || s.includes("高")) return "高"
  if (s.includes("medium") || s.includes("中")) return "中"
  return "低"
}

// Pre-fill for the「生成工单」dialog. 关联告警 stays empty — it links a
// secincident row, not a scan finding; the scan job is named in 描述 instead.
// 详情 rides along verbatim: for a 弱口令 finding it holds the cracked
// credential, which IS the actionable evidence — the operator sees the whole
// draft in the dialog and can trim it before submitting.
function ticketInitialFor(target, fields) {
  const lines = [
    `由主动探测任务 #${fields["job_id"] || "?"} 发现（级别 ${
      fields["级别"] || "-"
    }，类型 ${fields["类型"] || "-"}）。`,
    `目标: ${target}`,
  ]
  if (fields["协议"]) lines.push(`协议: ${fields["协议"]}`)
  if (fields["服务"]) lines.push(`服务: ${fields["服务"]}`)
  if (fields["发现时间"]) lines.push(`发现时间: ${fields["发现时间"]}`)
  const detail = String(fields["详情"] || "").trim()
  if (detail) lines.push("", "详情:", detail)
  return {
    标题: `${target} ${typeLabel(fields["类型"]) || "脆弱性"}`,
    类型: "漏洞修复",
    优先级: priorityForLevel(fields["级别"]),
    来源: "主动探测",
    描述: lines.join("\n"),
  }
}

// "高危 (high)" — the localized label plus the raw stored value, collapsed to
// one when they are the same.
function withRaw(label, raw) {
  const r = String(raw ?? "").trim()
  if (!r) return ""
  return label === r ? r : `${label} (${r})`
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error("复制失败")
    }
  }
  return (
    <IconButton
      color="gray"
      variant="soft"
      size="sm"
      aria-label="复制详情"
      onClick={copy}
    >
      {done ? <Check /> : <Copy />}
    </IconButton>
  )
}

export function ScanFindingItem({ fields, columns, onDelete, apiClient, setError }) {
  const [open, setOpen] = useState(false)

  const host = fields["主机"] || ""
  const port = fields["端口"] || ""
  const target = host
    ? port
      ? `${host}:${port}`
      : host
    : urlIn(fields["详情"]) || port || "未知目标"
  const level = fields["级别"]
  const type = fields["类型"]
  const service = fields["服务"]
  const jobID = fields["job_id"]
  const found = fields["发现时间"]
  const detail = prettyDetail(fields["详情"])
  const preview = String(fields["详情"] ?? "").replace(/\s+/g, " ").trim()

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn("group rounded-lg bg-card", cardHover, open && cardLifted)}>
        {/* 整行即展开触发器(只读卡片,无内联编辑控件与之争抢点击) */}
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-label={open ? "收起详情" : "展开详情"}
            className="flex w-full cursor-pointer items-start gap-2 p-3 text-left"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant={levelVariant(level)}>{levelLabel(level)}</Badge>
                <span className="min-w-0 truncate font-mono text-sm font-medium">
                  {target}
                </span>
                {type ? <Badge variant="secondary">{typeLabel(type)}</Badge> : null}
                {service ? <Badge variant="outline">{service}</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {fields["协议"] ? (
                  <span className="inline-flex items-center gap-1">
                    <Network className="size-3" />
                    {fields["协议"]}
                  </span>
                ) : null}
                {jobID ? (
                  <span className="inline-flex items-center gap-1">
                    <Hash className="size-3" />
                    <span className="font-mono">任务 {jobID}</span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {found || "—"}
                </span>
              </div>
            </div>
            {/* 右侧占卡片一半宽:详情单行预览(展开后隐藏,完整内容在下方) */}
            <div className="hidden w-1/2 shrink-0 self-center sm:block">
              {!open && preview ? (
                <div className="truncate text-right text-xs text-muted-foreground">
                  {preview}
                </div>
              ) : null}
            </div>
            {/* 折叠指示器:整行已是 trigger,这里只能是纯图标 —— 放真按钮会
                在 role="button" 里嵌套可交互元素 */}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="flex flex-col gap-3 p-3 text-xs">
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <DetailRow label="主机" value={host} />
              <DetailRow label="端口" value={port} />
              <DetailRow label="协议" value={fields["协议"]} />
              <DetailRow label="服务" value={service} />
              {/* 中文标签 + 原始值:原始值(high/weak-credential)是筛选器里
                  要输入的值,不能只显示译名 */}
              <DetailRow label="类型" value={withRaw(typeLabel(type), type)} />
              <DetailRow label="级别" value={withRaw(levelLabel(level), level)} />
              <DetailRow label="任务" value={jobID} />
              <DetailRow label="发现时间" value={found} />
            </div>
            <Separator />
            <section className="flex min-w-0 flex-col gap-1">
              <div className="flex h-6 items-center justify-between gap-2">
                <span className="text-muted-foreground">详情</span>
                {detail ? <CopyButton text={detail} /> : null}
              </div>
              {detail ? (
                // 不截断:长行换行、超长块限高内滚,保证可读又不撑爆列表
                <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                  {detail}
                </pre>
              ) : (
                <span className="text-muted-foreground">无详情。</span>
              )}
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
                    initial={ticketInitialFor(target, fields)}
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
                    删除
                  </ConfirmDeleteButton>
                ) : null}
              </div>
            </>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export default ScanFindingItem
