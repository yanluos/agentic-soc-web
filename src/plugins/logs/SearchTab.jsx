// 检索 — a log explorer: time range + keyword on top, a facet rail on the left
// (来源/级别/程序/主机/格式/来源类型, counts from /stats of the CURRENT query,
// click to toggle; OR inside a facet, AND across), the histogram (click a bar
// to zoom into that bucket), the result table and a row sheet whose fields can
// be turned into filters. Every facet/time change re-runs the query; the
// keyword applies on Enter / 检索.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X, Filter, ZoomOut } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { DateRangePopover, TopBarPortal, cardHover, cn } from "@/platform"

import { RANGE_PRESETS, fmtNum, fmtTs, qsMulti, severityLabel, severityVariant } from "./lib.js"

const PAGE = 100
const MAX_OFFSET = 10000

// Facet dimensions: query key → label + which /stats list feeds it.
const FACETS = [
  { key: "source", label: "来源", stat: "top_sources" },
  { key: "severity", label: "级别", stat: "severity", render: (k) => `${k} ${severityLabel(Number(k))}`, sort: (a, b) => Number(a.key) - Number(b.key) },
  { key: "app", label: "程序", stat: "top_apps" },
  { key: "host", label: "主机", stat: "top_hosts" },
  { key: "source_type", label: "来源类型", stat: "source_types" },
  { key: "format", label: "格式", stat: "formats" },
]
const EMPTY_FILTERS = Object.fromEntries(FACETS.map((f) => [f.key, []]))

function pad(n) {
  return String(n).padStart(2, "0")
}
function fmtLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function SearchTab({ api, setError }) {
  const [preset, setPreset] = useState("-1h")
  const [range, setRange] = useState({})
  const [qInput, setQInput] = useState("")
  const [q, setQ] = useState("") // submitted keyword
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [fieldFilters, setFieldFilters] = useState({}) // key → [values] ("*" = present)
  const [openKey, setOpenKey] = useState(null) // expanded 字段 facet key
  const [fieldVals, setFieldVals] = useState({}) // key → [{key,count}] for the current query
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setErr] = useState("")
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  const reqSeq = useRef(0)

  const timeParams = useMemo(() => {
    if (preset === "custom") return { from: range.from || "-1h", to: range.to || "now" }
    return { from: preset, to: "now" }
  }, [preset, range])

  const fieldParams = useMemo(
    () => Object.entries(fieldFilters).flatMap(([k, vs]) => vs.map((v) => (v === "*" ? k : `${k}=${v}`))),
    [fieldFilters],
  )
  const filterKey = JSON.stringify([filters, fieldParams])
  const activeCount = FACETS.reduce((n, f) => n + filters[f.key].length, 0) + fieldParams.length

  const run = useCallback(
    async (off = 0) => {
      const seq = ++reqSeq.current
      setLoading(true)
      setErr("")
      try {
        const base = { ...timeParams, q, ...filters, field: fieldParams }
        const [res, st] = await Promise.all([
          api.get(`/search${qsMulti({ ...base, limit: PAGE, offset: off })}`),
          api.get(`/stats${qsMulti(base)}`).catch(() => null),
        ])
        if (seq !== reqSeq.current) return // a newer query superseded this one
        setData(res)
        setStats(st)
        setOffset(off)
        setFieldVals({}) // value lists belong to the previous query
      } catch (err) {
        if (seq !== reqSeq.current) return
        setErr(err.message || "检索失败")
        setError?.(err.message || "检索失败")
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, timeParams, q, filterKey, setError],
  )

  const baseParams = useMemo(() => ({ ...timeParams, q, ...filters, field: fieldParams }), [timeParams, q, filters, fieldParams])

  // 字段 facet second level: values of the expanded key under the current query
  useEffect(() => {
    if (!openKey || fieldVals[openKey]) return
    let cancelled = false
    api
      .get(`/stats/field${qsMulti({ ...baseParams, key: openKey })}`)
      .then((r) => {
        if (!cancelled) setFieldVals((m) => ({ ...m, [openKey]: r?.values || [] }))
      })
      .catch(() => {
        if (!cancelled) setFieldVals((m) => ({ ...m, [openKey]: [] }))
      })
    return () => {
      cancelled = true
    }
  }, [api, openKey, baseParams, fieldVals])

  function toggleField(key, value) {
    setFieldFilters((f) => {
      const cur = f[key] || []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      const out = { ...f }
      if (next.length) out[key] = next
      else delete out[key]
      return out
    })
  }

  // facets / time / submitted keyword drive the query directly
  useEffect(() => {
    run(0)
  }, [run])

  function toggle(key, value) {
    setFilters((f) => {
      const cur = f[key]
      return { ...f, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] }
    })
  }
  function clearAll() {
    setFilters(EMPTY_FILTERS)
    setFieldFilters({})
    setQInput("")
    setQ("")
  }
  function zoomTo(bucket) {
    if (!stats?.interval_seconds) return
    const from = new Date(bucket.t)
    const to = new Date(from.getTime() + stats.interval_seconds * 1000)
    setRange({ from: fmtLocal(from), to: fmtLocal(to) })
    setPreset("custom")
  }
  function toggleFieldAndClose(key, value) {
    toggleField(key, value)
    setSelected(null)
  }
  function filterFromRow(key, value) {
    if (!value) return
    setFilters((f) => (f[key].includes(value) ? f : { ...f, [key]: [...f[key], value] }))
    setSelected(null)
  }

  const rows = data?.rows || []
  const total = data?.total ?? 0
  const maxBucket = stats?.histogram?.reduce((m, b) => Math.max(m, b.count), 0) || 0

  return (
    <div className="flex flex-col gap-3">
      <TopBarPortal>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => run(0)} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
        </div>
      </TopBarPortal>

      {/* query bar */}
      <Card className={cardHover}>
        <CardContent className="flex flex-col gap-2 pt-4">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setQ(qInput.trim())
            }}
          >
            <ToggleGroup type="single" variant="outline" size="sm" value={preset} onValueChange={(v) => v && setPreset(v)}>
              {RANGE_PRESETS.map((p) => (
                <ToggleGroupItem key={p.value} value={p.value} aria-label={p.label}>
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {preset === "custom" ? <DateRangePopover value={range} onChange={setRange} placeholder="选择时间范围" /> : null}
            <Input
              className="h-8 min-w-56 flex-1"
              placeholder="关键字：空格分隔多个词（同时满足），回车检索"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              aria-label="关键字"
            />
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" />}
              检索
            </Button>
          </form>

          {activeCount > 0 || q ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="size-3.5 text-muted-foreground" />
              {q ? (
                <Chip
                  label={`关键字: ${q}`}
                  onRemove={() => {
                    setQ("")
                    setQInput("")
                  }}
                />
              ) : null}
              {FACETS.flatMap((f) =>
                filters[f.key].map((v) => <Chip key={`${f.key}:${v}`} label={`${f.label}: ${f.render ? f.render(v) : v}`} onRemove={() => toggle(f.key, v)} />),
              )}
              {Object.entries(fieldFilters).flatMap(([k, vs]) =>
                vs.map((v) => <Chip key={`f:${k}:${v}`} label={v === "*" ? `${k} 存在` : `${k} = ${v}`} onRemove={() => toggleField(k, v)} />),
              )}
              <Button size="xs" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={clearAll}>
                清除全部
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* facet rail */}
        <Card className={cn(cardHover, "self-start")}>
          <CardContent className="flex flex-col gap-3 px-3 py-3">
            {FACETS.map((f) => (
              <Facet key={f.key} def={f} items={stats?.[f.stat] || []} selected={filters[f.key]} onToggle={(v) => toggle(f.key, v)} loading={loading && !stats} />
            ))}
            <FieldFacet
              keys={stats?.top_fields || []}
              selected={fieldFilters}
              openKey={openKey}
              values={fieldVals[openKey]}
              onOpen={(k) => setOpenKey((cur) => (cur === k ? null : k))}
              onToggle={toggleField}
              loading={loading && !stats}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          {/* histogram */}
          <Card className={cardHover}>
            <CardContent className="flex flex-col gap-1 px-4 py-3">
              {stats?.histogram?.length ? (
                <>
                  <div className="flex h-16 items-end gap-px">
                    {stats.histogram.map((b) => (
                      <button
                        type="button"
                        key={b.t}
                        title={`${fmtTs(b.t)} · ${fmtNum(b.count)} 条（点击放大）`}
                        className="flex-1 rounded-t-sm bg-primary/60 transition-colors hover:bg-primary"
                        style={{ height: `${maxBucket ? Math.max(2, (b.count / maxBucket) * 100) : 2}%` }}
                        onClick={() => zoomTo(b)}
                        aria-label={`放大到 ${fmtTs(b.t)}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{fmtTs(stats.histogram[0].t)}</span>
                    <span className="flex items-center gap-2">
                      共 {fmtNum(stats.total)} 条 · 每格 {fmtInterval(stats.interval_seconds)}
                      {preset === "custom" ? (
                        <Button size="xs" variant="ghost" className="h-5 px-1 text-[10px]" onClick={() => setPreset("-1h")}>
                          <ZoomOut data-icon="inline-start" />
                          退出放大
                        </Button>
                      ) : null}
                    </span>
                    <span>{fmtTs(stats.histogram[stats.histogram.length - 1].t)}</span>
                  </div>
                </>
              ) : (
                <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">{loading ? "统计中…" : "该范围内没有日志"}</div>
              )}
            </CardContent>
          </Card>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* results */}
          <Card className={cardHover}>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>{loading ? "检索中…" : "没有匹配的日志"}</EmptyTitle>
                    <EmptyDescription>调整时间范围、左侧分面或关键字后再试。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">时间</TableHead>
                      <TableHead className="w-32">来源</TableHead>
                      <TableHead className="w-20">级别</TableHead>
                      <TableHead className="w-28">程序</TableHead>
                      <TableHead>消息</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={`${r.ts}-${i}`} className="cursor-pointer" onClick={() => setSelected(r)}>
                        <TableCell className="font-mono text-xs">{fmtTs(r.ts)}</TableCell>
                        <TableCell className="text-xs">
                          <span className="block truncate" title={`${r.source_name} (${r.source_ip})`}>
                            {r.source_name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={severityVariant(r.severity)} className="text-[10px]">
                            {severityLabel(r.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="block truncate" title={r.app}>
                            {r.app || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-0 font-mono text-xs">
                          <span className="block truncate" title={r.message}>
                            {r.message}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {total > 0 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                第 {fmtNum(offset + 1)}–{fmtNum(Math.min(offset + rows.length, total))} 条，共 {fmtNum(total)} 条
                {total > MAX_OFFSET + PAGE ? `（最多翻到第 ${fmtNum(MAX_OFFSET + PAGE)} 条，请收窄范围）` : ""}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={offset === 0 || loading} onClick={() => run(Math.max(0, offset - PAGE))} aria-label="上一页">
                  <ChevronLeft data-icon="inline-start" />
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset + rows.length >= total || offset + PAGE > MAX_OFFSET || loading}
                  onClick={() => run(offset + PAGE)}
                  aria-label="下一页"
                >
                  下一页
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge variant={severityVariant(selected.severity)}>{severityLabel(selected.severity)}</Badge>
                  <span className="font-mono text-sm">{fmtTs(selected.ts)}</span>
                </SheetTitle>
                <SheetDescription>
                  {selected.source_name} ({selected.source_ip}) · {selected.protocol} · {selected.format}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-6 text-xs">
                <Meta label="来源" value={selected.source_name} onFilter={() => filterFromRow("source", selected.source_name)} />
                <Meta label="来源类型" value={selected.source_type} onFilter={() => filterFromRow("source_type", selected.source_type)} />
                <Meta label="主机" value={selected.hostname} onFilter={() => filterFromRow("host", selected.hostname)} />
                <Meta label="程序" value={selected.app} onFilter={() => filterFromRow("app", selected.app)} />
                <Meta label="级别" value={`${selected.severity} ${severityLabel(selected.severity)}`} onFilter={() => filterFromRow("severity", String(selected.severity))} />
                <Meta label="格式" value={selected.format} onFilter={() => filterFromRow("format", selected.format)} />
                <Meta label="进程" value={selected.proc_id} />
                <Meta label="facility" value={String(selected.facility)} />
                <Meta label="接收时间" value={fmtTs(selected.received_at)} />
                <Separator />
                <Block label="消息" text={selected.message} />
                <KVTable kv={selected.kv} onFilter={(k, v) => toggleFieldAndClose(k, v)} />
                <Block label="原文" text={selected.raw} muted />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Facet({ def, items, selected, onToggle, loading }) {
  // selected values stay listed even when the current result has none of them
  const list = useMemo(() => {
    const seen = new Set(items.map((i) => i.key))
    const merged = [...items, ...selected.filter((v) => !seen.has(v)).map((v) => ({ key: v, count: null }))]
    if (def.sort) merged.sort(def.sort)
    return merged
  }, [items, selected, def])
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>{def.label}</span>
        {selected.length ? <span className="text-primary">{selected.length} 选中</span> : null}
      </div>
      {list.length === 0 ? (
        <div className="px-1 text-[11px] text-muted-foreground/70">{loading ? "…" : "无"}</div>
      ) : (
        list.map((it) => {
          const on = selected.includes(it.key)
          const label = it.key === "" ? "(空)" : def.render ? def.render(it.key) : it.key
          return (
            <button
              type="button"
              key={it.key}
              onClick={() => onToggle(it.key)}
              aria-pressed={on}
              title={label}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted",
                on && "bg-primary/10 font-medium text-primary",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{it.count == null ? "—" : fmtNum(it.count)}</span>
            </button>
          )
        })
      )}
    </div>
  )
}

// 字段 facet: structured keys (top_fields) → expand one → its values.
function FieldFacet({ keys, selected, openKey, values, onOpen, onToggle, loading }) {
  const list = useMemo(() => {
    const seen = new Set(keys.map((i) => i.key))
    return [...keys, ...Object.keys(selected).filter((k) => !seen.has(k)).map((k) => ({ key: k, count: null }))]
  }, [keys, selected])
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
        <span>字段</span>
        {Object.keys(selected).length ? <span className="text-primary">{Object.values(selected).reduce((n, v) => n + v.length, 0)} 选中</span> : null}
      </div>
      {list.length === 0 ? (
        <div className="px-1 text-[11px] text-muted-foreground/70">{loading ? "…" : "无（消息未解析出字段）"}</div>
      ) : (
        list.map((it) => {
          const open = openKey === it.key
          const picked = selected[it.key] || []
          return (
            <div key={it.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => onOpen(it.key)}
                aria-expanded={open}
                title={it.key}
                className={cn(
                  "flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted",
                  (open || picked.length) && "font-medium",
                  picked.length && "text-primary",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                  <span className="truncate">{it.key}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{it.count == null ? "—" : fmtNum(it.count)}</span>
              </button>
              {open ? (
                <div className="ml-3 flex flex-col gap-0.5 border-l pl-1">
                  {values == null ? (
                    <div className="px-1 text-[11px] text-muted-foreground/70">…</div>
                  ) : (
                    [...values, ...picked.filter((v) => v !== "*" && !values.some((x) => x.key === v)).map((v) => ({ key: v, count: null }))].map((v) => {
                      const on = picked.includes(v.key)
                      return (
                        <button
                          type="button"
                          key={v.key}
                          onClick={() => onToggle(it.key, v.key)}
                          aria-pressed={on}
                          title={v.key}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-muted",
                            on && "bg-primary/10 font-medium text-primary",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">{v.key === "" ? "(空)" : v.key}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{v.count == null ? "—" : fmtNum(v.count)}</span>
                        </button>
                      )
                    })
                  )}
                  <button
                    type="button"
                    onClick={() => onToggle(it.key, "*")}
                    aria-pressed={picked.includes("*")}
                    className={cn("rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted", picked.includes("*") && "bg-primary/10 text-primary")}
                  >
                    只要含此字段的日志
                  </button>
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )
}

// Structured fields of one row, each value filterable.
function KVTable({ kv, onFilter }) {
  const entries = Object.entries(kv || {}).sort(([a], [b]) => (a.startsWith("_") === b.startsWith("_") ? a.localeCompare(b) : a.startsWith("_") ? 1 : -1))
  if (entries.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">结构化字段 ({entries.length})</span>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableBody>
            {entries.map(([k, v]) => (
              <TableRow key={k} className="group">
                <TableCell className="w-40 py-1 font-mono text-[11px] text-muted-foreground">{k}</TableCell>
                <TableCell className="py-1 font-mono text-[11px] break-all">{v === "" ? <span className="text-muted-foreground">(空)</span> : v}</TableCell>
                <TableCell className="w-14 py-1 text-right">
                  <Button size="xs" variant="ghost" className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100" onClick={() => onFilter(k, v)} aria-label={`按 ${k} 筛选`}>
                    <Filter data-icon="inline-start" />
                    筛选
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Chip({ label, onRemove }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
      <span className="max-w-64 truncate" title={label}>
        {label}
      </span>
      <button type="button" onClick={onRemove} aria-label={`移除 ${label}`} className="rounded-sm hover:bg-foreground/10">
        <X className="size-3" />
      </button>
    </Badge>
  )
}

function fmtInterval(sec) {
  if (!sec) return "-"
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${sec / 60} 分钟`
  if (sec < 86400) return `${sec / 3600} 小时`
  return `${sec / 86400} 天`
}

function Meta({ label, value, onFilter }) {
  if (!value) return null
  return (
    <div className="group flex items-center gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono">{value}</span>
      {onFilter ? (
        <Button size="xs" variant="ghost" className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100" onClick={onFilter}>
          <Filter data-icon="inline-start" />
          筛选
        </Button>
      ) : null}
    </div>
  )
}

function Block({ label, text, muted }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <pre className={cn("whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs", muted && "text-muted-foreground")}>{text}</pre>
    </div>
  )
}
