import { useCallback, useEffect, useState } from "react"
import { RefreshCw, Activity, Database, HardDrive, Radio, HeartPulse } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TopBarPortal, cardHover } from "@/platform"

import { fmtAgo, fmtBytes, fmtNum, fmtTs } from "./lib.js"

export function StatusTab({ api, apiClient, setError }) {
  const [status, setStatus] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, h] = await Promise.all([
        api.get("/status"),
        apiClient.get("/api/v1/health/checks?ids=logs").catch(() => null),
      ])
      setStatus(s)
      setHealth(h)
    } catch (err) {
      setError?.(err.message || "读取状态失败")
    } finally {
      setLoading(false)
    }
  }, [api, apiClient, setError])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const m = status?.metrics || {}
  const q = status?.queue || {}
  const r = status?.retention || {}
  const ls = status?.listeners || {}
  const checks = health?.checks || health?.results || []
  const items = Array.isArray(checks) ? checks.flatMap((c) => c.items || []) : []

  return (
    <div className="flex flex-col gap-4">
      <TopBarPortal>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
        </div>
      </TopBarPortal>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Activity} label="接收速率" value={`${(m.eps_1m ?? 0).toFixed(1)} EPS`} sub={`累计 ${fmtNum(m.received_total)} 条 · 运行 ${status?.uptime || "-"}`} />
        <Stat
          icon={Database}
          label="已写入"
          value={fmtNum(m.insert_ok_rows)}
          sub={m.insert_ok_rows ? `最近 ${fmtAgo(m.last_insert_ok)}` : "尚未写入"}
          tone={m.last_insert_error && (!m.insert_ok_rows || m.last_insert_error_at > m.last_insert_ok) ? "error" : undefined}
        />
        <Stat
          icon={Radio}
          label="队列 / 丢弃"
          value={`${Math.round((q.fill ?? 0) * 100)}%`}
          sub={`${fmtNum(q.len)}/${fmtNum(q.cap)} · 5 分钟丢弃 ${fmtNum(m.dropped_5m)}`}
          tone={m.dropped_5m > 0 ? "warn" : undefined}
        />
        <Stat
          icon={HardDrive}
          label="磁盘占用"
          value={fmtBytes(r.total_bytes)}
          sub={`${fmtNum(r.total_rows)} 行 · ${r.partitions?.length ?? 0} 个日分区 · 保留 ${r.retention_days ?? "-"} 天${r.max_disk_gb ? ` · 上限 ${r.max_disk_gb} GB` : ""}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={cardHover}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <HeartPulse className="size-4" /> 健康检查
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">{health ? "无检查项" : "健康检查不可用（需要 health 权限）"}</p>
            ) : (
              items.map((it) => (
                <div key={it.name} className="flex items-start gap-2 text-xs">
                  <Badge variant={it.status === "ok" ? "success" : it.status === "warn" ? "secondary" : "destructive"} className="mt-0.5 w-12 justify-center text-[10px]">
                    {it.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{it.name}</div>
                    {it.detail ? <div className="text-muted-foreground">{it.detail}</div> : null}
                    {it.error ? <div className="break-all text-destructive">{it.error}</div> : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={cardHover}>
          <CardHeader>
            <CardTitle className="text-sm">接收明细</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row k="syslog UDP" v={`${fmtNum(m.received_udp)} · ${ls.udp?.bound ? "监听中 " + ls.udp.addr : "未监听"}`} />
              <Row k="syslog TCP" v={`${fmtNum(m.received_tcp)} · ${ls.tcp?.bound ? `监听中 ${ls.tcp.addr}（${ls.tcp.conns} 连接）` : "未监听"}`} />
              <Row k="HTTP ingest" v={fmtNum(m.received_http)} />
              <Row k="解析成功 / 原文兜底" v={`${fmtNum(m.parsed_ok)} / ${fmtNum(m.fallback_raw)}`} />
              <Row k="丢弃：队列满" v={fmtNum(m.dropped_queue_full)} />
              <Row k="丢弃：未登记来源" v={fmtNum(m.dropped_unknown_source)} />
              <Row k="丢弃：超长 / 缓冲满" v={`${fmtNum(m.dropped_oversize)} / ${fmtNum(m.dropped_buffer_full)}`} />
              <Row k="丢弃：写入失败 / 令牌错误" v={`${fmtNum(m.dropped_insert_fail)} / ${fmtNum(m.dropped_bad_token)}`} />
              <Row k="写入批次 成功 / 失败" v={`${fmtNum(m.insert_ok_batches)} / ${fmtNum(m.insert_fail_batches)}`} />
              <Row k="ClickHouse" v={status?.clickhouse?.ok ? `v${status.clickhouse.version}` : status?.clickhouse?.error || "-"} />
              <Row k="保留策略上次执行" v={r.last_run ? `${fmtTs(r.last_run)}${r.dropped?.length ? ` · 删除 ${r.dropped.join(", ")}` : ""}` : "尚未执行"} />
              {r.last_error ? <Row k="保留策略错误" v={r.last_error} /> : null}
              {m.last_insert_error ? <Row k="最近写入错误" v={m.last_insert_error} /> : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-sm">日分区</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {r.partitions?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分区</TableHead>
                  <TableHead className="text-right">行数</TableHead>
                  <TableHead className="text-right">磁盘</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...r.partitions].reverse().map((p) => (
                  <TableRow key={p.partition}>
                    <TableCell className="font-mono text-xs">{p.partition}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtNum(p.rows)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtBytes(p.bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 pb-4 text-xs text-muted-foreground">暂无数据</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <Card className={cardHover}>
      <CardContent className="flex items-start gap-3 pt-4">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={tone === "error" ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{value}</div>
          <div className="truncate text-[11px] text-muted-foreground" title={sub}>
            {sub}
          </div>
          {tone === "warn" ? (
            <Badge variant="secondary" className="mt-1 text-[10px]">
              有丢弃
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ k, v }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-all font-mono">{v}</dd>
    </>
  )
}
