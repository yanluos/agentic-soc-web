import { useEffect, useMemo, useRef, useState } from "react"
import {
  ShieldAlert,
  GitBranch,
  HeartPulse,
  ShieldBan,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { buildTablePath } from "@/api.js"
import { normalizeNocoRecords, getRecordFields } from "@/utils.js"

function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 6) return "夜深了"
  if (h < 12) return "早上好"
  if (h < 14) return "中午好"
  if (h < 18) return "下午好"
  return "晚上好"
}

// Timestamps look like "2026-06-15 02:32:11+00:00" (CreatedAt, UTC) or
// "2026-06-15 10:32:11" (事件发生时间, local) — make them Date-parsable.
function parseTs(s) {
  if (!s) return null
  const d = new Date(String(s).replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Operation cycle = Saturday 00:00:00 → the following Friday 23:59:59.
// The current cycle's Saturday is the most recent Saturday on-or-before today
// (i.e. "上周六" for a Mon–Fri workweek), ending on "本周五".
// ---------------------------------------------------------------------------

const CYCLE_COUNT = 12 // how many recent cycles to offer in the picker

function cycleStartForDate(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysSinceSat = (start.getDay() - 6 + 7) % 7 // Sat = 6
  start.setDate(start.getDate() - daysSinceSat)
  return start
}

function buildCycles(now = new Date(), count = CYCLE_COUNT) {
  const base = cycleStartForDate(now)
  const cycles = []
  for (let i = 0; i < count; i++) {
    const start = new Date(base)
    start.setDate(start.getDate() - 7 * i)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    cycles.push({ start, end })
  }
  return cycles
}

const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`
function cycleLabel(c) {
  return `${md(c.start)} – ${md(c.end)}`
}

// Local YYYY-MM-DD for NocoDB exactDate filters.
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Local "YYYY-MM-DD HH:mm:ss" — accepted by the report API's nocoDateStr parser.
function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, "0")
  return `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Server-side date window for a cycle on a given date field. CreatedAt is
// stored UTC while the cycle boundaries are local, so widen its exactDate
// range by a day on each side; 事件发生时间 is stored as local time, so the
// cycle dates match directly. The precise ms-level trim happens client-side
// in `inWindow`.
function whereForCycle(cycle, field = "CreatedAt") {
  const lo = new Date(cycle.start)
  const hi = new Date(cycle.end)
  if (field === "CreatedAt") {
    lo.setDate(lo.getDate() - 1)
    hi.setDate(hi.getDate() + 1)
  }
  return `(${field},ge,exactDate,${fmtDate(lo)})~and(${field},le,exactDate,${fmtDate(hi)})`
}

const VISIBLE_CYCLES = 3 // chips shown at once in the picker

export function OverviewModule({ currentUser, apiClient }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const user = currentUser || {}
  const username = user.username || "用户"
  const isAdmin = !!user.is_admin
  const role = isAdmin ? "管理员" : "普通用户"

  const dateStr = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
  const timeStr = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })

  // Operation-cycle selection for the 安全运营 panel.
  // Recompute when the calendar day changes so the current cycle auto-rolls
  // over (e.g. across Saturday) without a page reload.
  const dayKey = now.toDateString()
  const cycles = useMemo(() => buildCycles(now), [dayKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const ordered = useMemo(() => cycles.slice().reverse(), [cycles]) // oldest → newest
  const [cycleIdx, setCycleIdx] = useState(0) // 0 = 本周期 (本周)
  const [viewStart, setViewStart] = useState(
    Math.max(0, CYCLE_COUNT - VISIBLE_CYCLES), // picker window defaults to newest end
  )
  const cycle = cycles[cycleIdx]
  const picker = { cycles, ordered, cycleIdx, setCycleIdx, viewStart, setViewStart }

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome banner — compact */}
      <Card className={cn(cardHover, "relative overflow-hidden border-0 bg-gradient-to-br from-muted via-muted to-muted/40")}>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 md:px-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {greeting(now)}, {username}
          </h2>
          <Badge variant={isAdmin ? "default" : "secondary"}>{role}</Badge>
          <span className="text-sm text-muted-foreground">
            {dateStr} · {timeStr}
          </span>
        </CardContent>
      </Card>

      {/* KPI column (left) + 安全运营 panel (right) */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-4 lg:w-64 lg:shrink-0">
          {KPIS.map((kpi) => (
            <KpiCard key={kpi.title} {...kpi} />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <SecOpsPanel apiClient={apiClient} cycle={cycle} picker={picker} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 安全运营 panel — operation-cycle metrics from secincident + bypass_blocks.
// ---------------------------------------------------------------------------

function SecOpsPanel({ apiClient, cycle, picker }) {
  const { cycles, ordered, cycleIdx, setCycleIdx, viewStart, setViewStart } =
    picker
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [incidents, setIncidents] = useState([])
  const [blocks, setBlocks] = useState([])

  const winStart = cycle.start.getTime()
  const winEnd = cycle.end.getTime()

  // Fetch only the selected cycle's data (widened range, see whereForCycle).
  useEffect(() => {
    if (!apiClient) return
    let cancelled = false
    setLoading(true)
    setError("")
    Promise.all([
      apiClient.get(
        buildTablePath("secincident", {
          limit: 500,
          sort: "-事件发生时间",
          where: whereForCycle(cycle, "事件发生时间"),
          fields: [
            "CreatedAt",
            "标题",
            "来源",
            "处置状态",
            "涉事资产",
            "责任员工",
            "前台公司",
            "事件发生时间",
            "风险等级",
          ],
        }),
      ),
      apiClient.get(
        buildTablePath("bypass_blocks", {
          limit: 500,
          sort: "-CreatedAt",
          where: whereForCycle(cycle),
          fields: ["CreatedAt", "目标", "状态", "类型"],
        }),
      ),
    ])
      .then(([inc, blk]) => {
        if (cancelled) return
        setIncidents(normalizeNocoRecords(inc).map(getRecordFields))
        setBlocks(normalizeNocoRecords(blk).map(getRecordFields))
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "加载失败")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiClient, winStart, winEnd])

  // 安全事件按事件发生时间归入周期；封禁记录没有事件时间，仍按创建时间。
  const inWindow = (f, field = "CreatedAt") => {
    const t = parseTs(f[field])
    if (!t) return false
    const ms = t.getTime()
    return ms >= winStart && ms <= winEnd
  }

  // 1. 封禁域名数量 — distinct 目标 within the window.
  const bannedDomains = useMemo(() => {
    const set = new Set()
    for (const f of blocks) {
      if (inWindow(f) && f.目标) set.add(String(f.目标).trim())
    }
    return set.size
  }, [blocks, winStart, winEnd])

  const windowIncidents = useMemo(
    () => incidents.filter((f) => inWindow(f, "事件发生时间")),
    [incidents, winStart, winEnd],
  )

  // 2. 各告警来源数量统计.
  const sourceCounts = useMemo(() => {
    const m = new Map()
    for (const f of windowIncidents) {
      const k = (f.来源 || "未知").trim() || "未知"
      m.set(k, (m.get(k) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [windowIncidents])

  // Share-of-total so equal counts render as proportional slices instead of
  // every bar spanning 100% of the track.
  const totalSource = sourceCounts.reduce((sum, [, n]) => sum + n, 0)

  // 3. 典型事件 — 处置状态 为「已处置」.
  const typicalEvents = useMemo(
    () =>
      windowIncidents.filter(
        (f) => String(f.处置状态 || "").trim() === "已处置",
      ),
    [windowIncidents],
  )

  return (
    <Card className={cn(cardHover, "h-full")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">安全运营</CardTitle>
          {/* Cycle picker — 3 chips fixed on the right, arrows scroll the rest.
              Each cycle: Sat 00:00 → Fri 23:59. */}
          <div className="flex items-center gap-1">
            <IconButton
              color="gray"
              variant="ghost"
              size="md"
              disabled={viewStart === 0}
              onClick={() => setViewStart((v) => Math.max(0, v - 1))}
              aria-label="较早周期"
            >
              <ChevronLeft />
            </IconButton>
            <div className="flex items-center gap-1.5">
              {ordered
                .slice(viewStart, viewStart + VISIBLE_CYCLES)
                .map((c) => {
                  const i = cycles.indexOf(c)
                  return (
                    <Button
                      key={c.start.getTime()}
                      size="sm"
                      variant={i === cycleIdx ? "default" : "outline"}
                      className="w-24 shrink-0 tabular-nums"
                      onClick={() => setCycleIdx(i)}
                    >
                      {cycleLabel(c)}
                    </Button>
                  )
                })}
            </div>
            <IconButton
              color="gray"
              variant="ghost"
              size="md"
              disabled={viewStart + VISIBLE_CYCLES >= ordered.length}
              onClick={() =>
                setViewStart((v) =>
                  Math.min(ordered.length - VISIBLE_CYCLES, v + 1),
                )
              }
              aria-label="较新周期"
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            {/* 1. 封禁域名数量 + 事件总量 */}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                icon={ShieldBan}
                label="封禁域名数量"
                value={bannedDomains}
              />
              <Stat
                icon={ShieldAlert}
                label="安全事件数量"
                value={windowIncidents.length}
              />
            </div>

            <Separator />

            {/* 2. 各告警来源数量统计 */}
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">告警来源分布</h4>
              {sourceCounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">运营周期内暂无告警。</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {sourceCounts.map(([name, count]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                        {name}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${totalSource ? (count / totalSource) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums font-medium">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* 3. 典型事件（处置状态为「已处置」） */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">典型事件</h4>
                <Badge variant="secondary">已处置 {typicalEvents.length}</Badge>
              </div>
              {typicalEvents.length === 0 ? (
                <Empty className="py-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox />
                    </EmptyMedia>
                    <EmptyTitle>暂无典型事件</EmptyTitle>
                    <EmptyDescription>
                      运营周期内尚无处置结论为「已处置」的安全事件。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="flex flex-col divide-y">
                  {typicalEvents.slice(0, 8).map((f, i) => (
                    <li key={i} className="flex flex-col gap-1 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-sm font-medium" title={f.标题}>
                          {f.标题 || "(无标题)"}
                        </span>
                        {f.来源 ? (
                          <Badge variant="outline" className="shrink-0">
                            {f.来源}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {f.涉事资产 && f.涉事资产 !== "-" ? (
                          <span>资产 {f.涉事资产}</span>
                        ) : null}
                        {f.责任员工 && f.责任员工 !== "-" ? (
                          <span>责任人 {f.责任员工}</span>
                        ) : null}
                        {f.事件发生时间 ? <span>{f.事件发生时间}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

      </CardContent>
    </Card>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-semibold tabular-nums leading-none">
          {value}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

function KpiCard({ title, value, trend, description, icon: Icon }) {
  return (
    <Card className={cardHover}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-start justify-between">
          <span className="text-xs text-muted-foreground">{title}</span>
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </span>
          {trend ? (
            <span className="text-xs text-muted-foreground">{trend}</span>
          ) : null}
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

const KPIS = [
  {
    title: "本周安全告警",
    value: "—",
    description: "需要接入数据后填充",
    icon: ShieldAlert,
  },
  {
    title: "探针阻断规则",
    value: "—",
    description: "已同步入库",
    icon: HeartPulse,
  },
  {
    title: "AI 工作流",
    value: "—",
    description: "本周成功执行次数",
    icon: GitBranch,
  },
  {
    title: "服务健康",
    value: "3/3",
    trend: "全部正常",
    description: "soc-server / soc-ai / soc-auth",
    icon: HeartPulse,
  },
]

export default OverviewModule
