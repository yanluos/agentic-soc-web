// Date range / single date pickers, all storing values as `YYYY-MM-DD HH:mm:ss`.
//
// Exports:
//   <DateRangeField value onChange />            — inline calendar (no Popover)
//   <DateRangePopover value onChange />          — button trigger + Popover wrapper
//   <SingleDatePopover value onChange />         — same shape, single date

import { useEffect, useState } from "react"
import { CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils.js"

// ── Time helpers ─────────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, "0")
}

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

export function formatRangeLabel(value) {
  if (!value?.from && !value?.to) return ""
  const f = value.from || ""
  const t = value.to || ""
  if (f && t) return `${f.slice(0, 16)} → ${t.slice(11, 16)}`
  if (f) return `${f.slice(0, 16)} →`
  if (t) return `→ ${t.slice(0, 16)}`
  return ""
}

export function formatSingleLabel(value) {
  if (!value) return ""
  return value.slice(0, 16)
}

function clampInt(value, min, max) {
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function dateFromString(s) {
  if (!s) return undefined
  const m = TIME_RE.exec(s)
  if (!m) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const [, y, mo, d, h, mi] = m
  return new Date(+y, +mo - 1, +d, +h, +mi, 0, 0)
}

function dateToString(d, withTime) {
  if (!d) return ""
  const y = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  if (!withTime) return `${y}-${mo}-${da} 00:00:00`
  const h = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  return `${y}-${mo}-${da} ${h}:${mi}:00`
}

// ── TimeRow — two numeric inputs for hour + minute ──────────────────────

function TimeRow({ label, value, onChange }) {
  const m = TIME_RE.exec(value || "")
  const h = m ? m[4] : "00"
  const mi = m ? m[5] : "00"
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        max={23}
        value={h}
        onChange={(e) => {
          const hh = pad2(clampInt(e.target.value, 0, 23))
          onChange(`${hh}:${mi}:00`)
        }}
        className="soc-field-sm h-7 w-14 text-center"
        aria-label={`${label} 小时`}
      />
      <span className="text-xs text-muted-foreground">:</span>
      <Input
        type="number"
        min={0}
        max={59}
        value={mi}
        onChange={(e) => {
          const mm = pad2(clampInt(e.target.value, 0, 59))
          onChange(`${h}:${mm}:00`)
        }}
        className="soc-field-sm h-7 w-14 text-center"
        aria-label={`${label} 分钟`}
      />
    </div>
  )
}

function setTimeOnString(value, time) {
  const d = dateFromString(value)
  const base = d || new Date()
  if (!time) {
    if (value) return value.slice(0, 10) + " 00:00:00"
    return dateToString(base, false)
  }
  const [hh, mi] = time.split(":")
  base.setHours(+hh || 0, +(mi || "0") || 0, 0, 0)
  return dateToString(base, true)
}

function setDateOnString(value, date) {
  if (!date) return value
  const m = TIME_RE.exec(value || "")
  const hh = m ? m[4] : "00"
  const mi = m ? m[5] : "00"
  const next = new Date(date)
  next.setHours(+hh, +mi, 0, 0)
  return dateToString(next, true)
}

// ── DateRangeField — inline range calendar + time rows ──────────────────

export function DateRangeField({ value, onChange }) {
  const v = value || {}
  const fromDate = dateFromString(v.from)
  const toDate = dateFromString(v.to)
  const fromTime =
    (TIME_RE.exec(v.from || "") || [, , , , "00", "00"])[4] +
    ":" +
    (TIME_RE.exec(v.from || "") || [, , , , "00", "00"])[5] +
    ":00"
  const toTime =
    (TIME_RE.exec(v.to || "") || [, , , , "23", "59"])[4] +
    ":" +
    (TIME_RE.exec(v.to || "") || [, , , , "23", "59"])[5] +
    ":00"

  function commitRange(range) {
    onChange?.({
      from: setTimeOnString(
        range?.from ? dateToString(range.from, true) : "",
        fromTime
      ),
      to: setTimeOnString(
        range?.to ? dateToString(range.to, true) : "",
        toTime
      ),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Calendar
        mode="range"
        selected={{ from: fromDate, to: toDate }}
        onSelect={commitRange}
        numberOfMonths={1}
      />
      <div className="flex flex-col gap-2">
        <TimeRow
          label="开始"
          value={v.from}
          onChange={(t) =>
            onChange?.({ ...v, from: setTimeOnString(v.from, t) })
          }
        />
        <TimeRow
          label="结束"
          value={v.to}
          onChange={(t) => onChange?.({ ...v, to: setTimeOnString(v.to, t) })}
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {formatRangeLabel(v) || "未选择"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange?.({})}
        >
          清除范围
        </Button>
      </div>
    </div>
  )
}

// ── DateRangePopover — button trigger + Popover ─────────────────────────

export function DateRangePopover({
  value,
  onChange,
  placeholder = "选择日期范围",
  className,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || {})

  useEffect(() => {
    if (open) setDraft(value || {})
  }, [open, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-start text-left font-normal", className)}
        >
          <CalendarIcon />
          {value?.from || value?.to ? formatRangeLabel(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <DateRangeField value={draft} onChange={setDraft} />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              onChange?.(draft)
              setOpen(false)
            }}
          >
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── SingleDatePopover ───────────────────────────────────────────────────

export function SingleDatePopover({
  value,
  onChange,
  placeholder = "选择日期",
  className,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || "")
  const date = dateFromString(draft)

  useEffect(() => {
    if (open) setDraft(value || "")
  }, [open, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-start text-left font-normal", className)}
        >
          <CalendarIcon />
          {value ? formatSingleLabel(value) : placeholder}
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onChange?.("")
              }}
              className="ml-1 text-muted-foreground hover:text-foreground"
              aria-label="清除"
            >
              <X className="size-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => setDraft(d ? dateToString(d, true) : "")}
        />
        <TimeRow
          label="时间"
          value={draft}
          onChange={(t) => setDraft(setTimeOnString(draft, t))}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onChange?.("")
              setOpen(false)
            }}
          >
            清除
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange?.(draft)
              setOpen(false)
            }}
          >
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
