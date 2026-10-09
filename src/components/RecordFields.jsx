// Shared record-card building blocks (fallback enums, option resolution,
// inline-editable rows, markdown blocks, the compact QuickSelect). Extracted
// from the 安全事件 card so the tickets / scan / secincident plugins share one
// implementation via @/platform instead of importing each other.
import { useEffect, useState } from "react"
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
  Trash2,
  User,
  UserRoundSearch,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
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
import { MarkdownText } from "@/components/MarkdownText.jsx"
import { cardHover, cardLifted } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { toNocoDateStr } from "@/utils.js"

export const RISK_FALLBACK = ["高", "中", "低", "误报"]
export const STATUS_FALLBACK = [
  "待跟进",
  "跟进中",
  "已驳回",
  "忽略",
  "未受害",
  "误报",
  "已处置",
  "已完成",
]

export function optionsFor(columns, field, fallback) {
  const col = columns?.find((c) => c.field === field)
  if (Array.isArray(col?.options) && col.options.length > 0) return col.options
  return fallback.map((v) => ({ value: v, label: v }))
}

export function QuickSelect({
  value,
  placeholder,
  options,
  onChange,
  triggerClassName,
  ...props
}) {
  return (
    <Select value={value || ""} onValueChange={onChange} {...props}>
      <SelectTrigger size="sm" className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
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

// DetailRow variant with inline editing: the pencil swaps the value for a
// small input (Enter/blur saves, Escape cancels) — or, when the column is a
// select with options, a QuickSelect that saves on pick. Saving goes through
// the card's patchField → onPatch.
export function EditableDetailRow({ label, value, onSave, options, editable }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const empty = value === null || value === undefined || value === ""
  const asSelect = Array.isArray(options) && options.length > 0
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
        asSelect ? (
          <div className="min-w-0 flex-1">
            <QuickSelect
              defaultOpen
              value={draft}
              placeholder={`选择${label}`}
              options={options}
              onChange={commit}
              onOpenChange={(o) => {
                if (!o) setEditing(false)
              }}
            />
          </div>
        ) : (
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
        )
      ) : (
        <>
          {empty ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="min-w-0 break-all">{String(value)}</span>
          )}
          <IconButton
            color="gray"
            variant="ghost"
            size="xs"
            aria-label={`编辑${label}`}
            onClick={start}
          >
            <Pencil />
          </IconButton>
        </>
      )}
    </div>
  )
}

export function DetailRow({ label, value }) {
  const empty = value === null || value === undefined || value === ""
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      {empty ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="min-w-0 break-all">{String(value)}</span>
      )}
    </div>
  )
}

// Labeled long-text block with markdown rendering (AI-produced fields).
// Shared with DlpEventItem.
export function MarkdownBlock({ label, value }) {
  const text = String(value || "").trim()
  if (!text) return null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="rounded-md bg-muted/50 p-2">
        <MarkdownText>{text}</MarkdownText>
      </div>
    </div>
  )
}

// Labeled long-text block that is markdown when viewing and a textarea when
// editing (pencil toggles). Draft state lives in the parent so an in-flight
// edit survives re-renders. Shared with DlpEventItem.
export function EditableMarkdownBlock({
  label,
  value,
  draft,
  setDraft,
  dirty,
  saving,
  onSave,
  editable,
  placeholder,
}) {
  const [editing, setEditing] = useState(false)
  const showEditor = editing || dirty
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        {editable && !showEditor ? (
          <IconButton
            color="gray"
            variant="soft"
            size="sm"
            aria-label={`编辑${label}`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </IconButton>
        ) : null}
      </div>
      {showEditor ? (
        <>
          <Textarea
            rows={3}
            placeholder={placeholder || `填写${label}…`}
            value={draft ?? value}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(null)
                setEditing(false)
              }}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await onSave()
                setEditing(false)
              }}
              disabled={saving || !dirty}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </div>
        </>
      ) : value ? (
        <div className="rounded-md bg-muted/50 p-2">
          <MarkdownText>{value}</MarkdownText>
        </div>
      ) : (
        <span className="text-muted-foreground">暂无，点击右侧铅笔补充。</span>
      )}
    </div>
  )
}

export function DetailBlock({ label, value, mono }) {
  const text = String(value || "").trim()
  if (!text) return null
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <span className="text-muted-foreground">{label}</span>
      <div
        className={cn(
          "rounded-md bg-muted/50 p-2 break-all whitespace-pre-wrap",
          mono && "font-mono"
        )}
      >
        {text}
      </div>
    </div>
  )
}
