// List-item renderer for 安全事件 (secincident): a compact card carrying the
// triage-critical facts — 风险等级/标题/来源/处置状态 badges, the 威胁指标
// (IOC) line, 责任员工/前台公司/涉事资产/时间 and a one-line AI status
// (研判于 / 跟进 #n). Clicking the card (anywhere that is not a button) opens
// the overlay SecIncidentDetailDialog, which holds everything else: the
// editable fields, the actions and the 事件时间线 with the AI 研判/跟进
// process. 处置状态 is still switchable from the card. Rendered by
// GenericTableModule's `renderItem` list mode.

import { useState } from "react"
import { STATUS_FALLBACK, optionsFor } from "@/platform"
import {
  Bot,
  Building2,
  Clock,
  Crosshair,
  Hash,
  Maximize2,
  MonitorSmartphone,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/IconButton.jsx"
import { CopyText } from "@/components/CopyText.jsx"
import { cardHover, cardLifted } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { toNocoDateStr } from "@/utils.js"

import { SecIncidentDetailDialog } from "./SecIncidentDetail.jsx"
import { StatusPicker, aiStatusLine, riskVariant } from "./shared.jsx"

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

  const risk = fields["风险等级"]
  const status = fields["处置状态"]
  const ioc = String(fields["威胁指标"] || "").trim()
  const title = fields["标题"] || "未命名安全事件"
  const occurred = fields["事件发生时间"]
  const created = toNocoDateStr(fields["CreatedAt"]) || fields["CreatedAt"]
  const aiLine = aiStatusLine(fields)

  async function patchField(field, value) {
    if (!onPatch || value === fields[field]) return
    try {
      await onPatch({ [field]: value })
    } catch {
      // onPatch already surfaced the error
    }
  }

  // The card is the trigger; nested buttons (copy chips, the status pill)
  // keep their own behavior.
  function onCardClick(e) {
    if (
      e.target.closest("button, a, [role=option], [data-slot=select-content]")
    )
      return
    setOpen(true)
  }
  function onCardKey(e) {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onCardClick}
        onKeyDown={onCardKey}
        aria-label={`打开安全事件 #${id} 详情`}
        className={cn(
          "group cursor-pointer rounded-lg bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          cardHover,
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
          {/* 右侧竖排:处置状态胶囊居上、AI 状态一行贴底 */}
          <div className="flex w-1/3 shrink-0 flex-col items-end justify-between gap-1.5 self-stretch">
            <StatusPicker
              value={status}
              options={optionsFor(columns, "处置状态", STATUS_FALLBACK)}
              onChange={(v) => patchField("处置状态", v)}
              editable={!!onPatch}
            />
            <span className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
              <Bot className="size-3 shrink-0" />
              <span className="truncate">{aiLine}</span>
            </span>
          </div>
          <IconButton
            color="gray"
            variant="ghost"
            size="sm"
            aria-label="打开详情"
            onClick={() => setOpen(true)}
          >
            <Maximize2 />
          </IconButton>
        </div>
      </div>
      {open ? (
        <SecIncidentDetailDialog
          open={open}
          onOpenChange={setOpen}
          id={id}
          fields={fields}
          columns={columns}
          onPatch={onPatch}
          onDelete={onDelete}
          onRefresh={onRefresh}
          apiClient={apiClient}
          setError={setError}
        />
      ) : null}
    </>
  )
}

export default SecIncidentItem
