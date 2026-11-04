import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { DateRangePopover, TopBarPortal, cardHover, cn } from "@/platform"

import { RANGE_PRESETS, SEVERITIES, fmtNum, fmtTs, prettyFields, qs, severityLabel, severityVariant } from "./lib.js"

const PAGE = 100

export function SearchTab({ api, setError }) {
  const [preset, setPreset] = useState("-1h")
  const [range, setRange] = useState({})
  const [q, setQ] = useState("")
  const [source, setSource] = useState("")
  const [sevMax, setSevMax] = useState("")
  const [sources, setSources] = useState([])
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(null)

  const timeParams = useMemo(() => {
    if (preset === "custom") return { from: range.from || "-1h", to: range.to || "now" }
    return { from: preset, to: "now" }
  }, [preset, range])

  useEffect(() => {
    api
      .get("/sources")
      .then((r) => setSources(r?.sources || []))
      .catch(() => {})
  }, [api])

  const run = useCallback(
    async (off = 0) => {
      setLoading(true)
      try {
        const params = { ...timeParams, q, source, severity_max: sevMax, limit: PAGE, offset: off }
        const [res, st] = await Promise.all([
          api.get(`/search${qs(params)}`),
          api.get(`/stats${qs({ ...timeParams, q, source, severity_max: sevMax })}`).catch(() => null),
        ])
        setData(res)
        setStats(st)
        setOffset(off)
      } catch (err) {
        setError?.(err.message || "检索失败")
      } finally {
        setLoading(false)
      }
    },
    [api, timeParams, q, source, sevMax, setError],
  )

  useEffect(() => {
    run(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = data?.rows || []
  const total = data?.total ?? 0
  const maxBucket = stats?.histogram?.reduce((m, b) => Math.max(m, b.count), 0) || 0

  return (
    <div className="flex flex-col gap-4">
      <TopBarPortal>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => run(0)} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
        </div>
      </TopBarPortal>

      <Card className={cardHover}>
        <CardContent className="flex flex-col gap-3 pt-4">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(0)
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
            <Select value={source || "__all"} onValueChange={(v) => setSource(v === "__all" ? "" : v)}>
              <SelectTrigger size="sm" className="w-40" aria-label="来源">
                <SelectValue placeholder="全部来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部来源</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sevMax === "" ? "__all" : String(sevMax)} onValueChange={(v) => setSevMax(v === "__all" ? "" : v)}>
              <SelectTrigger size="sm" className="w-36" aria-label="级别">
                <SelectValue placeholder="全部级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部级别</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s.value} value={String(s.value)}>
                    ≤ {s.value} {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-8 min-w-56 flex-1" placeholder="关键字（空格分隔，AND）" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" />}
              检索
            </Button>
          </form>

          {stats?.histogram?.length ? (
            <div className="flex flex-col gap-1">
              <div className="flex h-16 items-end gap-px">
                {stats.histogram.map((b) => (
                  <div
                    key={b.t}
                    title={`${fmtTs(b.t)} · ${fmtNum(b.count)} 条`}
                    className="flex-1 rounded-t-sm bg-primary/70"
                    style={{ height: `${maxBucket ? Math.max(2, (b.count / maxBucket) * 100) : 2}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{fmtTs(stats.histogram[0].t)}</span>
                <span>
                  共 {fmtNum(stats.total)} 条 · 桶 {stats.interval_seconds}s
                </span>
                <span>{fmtTs(stats.histogram[stats.histogram.length - 1].t)}</span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className={cardHover}>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>{loading ? "检索中…" : "没有匹配的日志"}</EmptyTitle>
                <EmptyDescription>调整时间范围、来源或关键字后再试。</EmptyDescription>
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
            {total > 10000 + PAGE ? "（最多翻到第 10100 条，请收窄范围）" : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={offset === 0 || loading} onClick={() => run(Math.max(0, offset - PAGE))} aria-label="上一页">
              <ChevronLeft data-icon="inline-start" />
              上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={offset + rows.length >= total || offset + PAGE > 10000 || loading}
              onClick={() => run(offset + PAGE)}
              aria-label="下一页"
            >
              下一页
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}

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
                <Meta label="主机" value={selected.hostname} />
                <Meta label="程序" value={selected.app} />
                <Meta label="进程" value={selected.proc_id} />
                <Meta label="facility" value={String(selected.facility)} />
                <Meta label="接收时间" value={fmtTs(selected.received_at)} />
                <Separator />
                <Block label="消息" text={selected.message} />
                {prettyFields(selected.fields) ? <Block label="结构化字段" text={prettyFields(selected.fields)} /> : null}
                <Block label="原文" text={selected.raw} muted />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Meta({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-mono break-all">{value}</span>
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
