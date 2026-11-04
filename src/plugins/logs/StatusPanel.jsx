// 运行状态 — the logs plugin's operational panel on the 插件管理 page
// (declared in remote-entry.jsx `panels`): receive counters, queue, listeners,
// retention outcome + day partitions, and a「立即执行保留策略」button. Health
// items are NOT repeated here — the plugin page's own 健康 tab shows them.
//
// Remote bundle: the host passes apiClient; usePluginApi would read a context
// nobody provides, so the prefixed client is built here.
import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Activity, Database, HardDrive, Radio, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cardHover, prefixedApi } from "@/platform"

import { fmtAgo, fmtBytes, fmtNum, fmtTs } from "./lib.js"

export function StatusPanel({ apiClient, setError }) {
  const api = useMemo(() => prefixedApi(apiClient, "logs"), [apiClient])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await api.get("/status"))
    } catch (err) {
      setError?.(err.message || "读取状态失败")
    } finally {
      setLoading(false)
    }
  }, [api, setError])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  async function runRetention() {
    setRunning(true)
    try {
      const r = await api.post("/retention/run", {})
      const n = (r?.dropped?.length || 0) + (r?.deleted?.length || 0)
      toast.success(n ? `保留策略已执行：删除分区 ${r.dropped.length} 个，按来源清理 ${r.deleted?.length || 0} 批` : "保留策略已执行，没有需要清理的数据")
      load()
    } catch (err) {
      toast.error(err.message || "执行失败")
    } finally {
      setRunning(false)
    }
  }

  const m = status?.metrics || {}
  const q = status?.queue || {}
  const r = status?.retention || {}
  const ls = status?.listeners || {}

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          log-service v{status?.version || "-"} · 运行 {status?.uptime || "-"} · ClickHouse {status?.clickhouse?.ok ? `v${status.clickhouse.version}` : status?.clickhouse?.error || "-"}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runRetention} disabled={running || !status?.clickhouse?.ok}>
            {running ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            立即执行保留策略
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Activity} label="接收速率" value={`${(m.eps_1m ?? 0).toFixed(1)} EPS`} sub={`累计 ${fmtNum(m.received_total)} 条`} />
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
          sub={`${fmtNum(r.total_rows)} 行 · ${r.partitions?.length ?? 0} 个日分区 · 全局保留 ${r.retention_days ?? "-"} 天${
            r.source_overrides ? ` · ${r.source_overrides} 个来源单独设置(分区最长 ${r.partition_cutoff_days} 天)` : ""
          }${r.max_disk_gb ? ` · 上限 ${r.max_disk_gb} GB` : ""}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
              {m.last_insert_error ? <Row k="最近写入错误" v={m.last_insert_error} /> : null}
            </dl>
          </CardContent>
        </Card>

        <Card className={cardHover}>
          <CardHeader>
            <CardTitle className="text-sm">保留策略</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row k="上次执行" v={r.last_run ? fmtTs(r.last_run) : "尚未执行"} />
              <Row k="全局保留" v={`${r.retention_days ?? "-"} 天`} />
              <Row k="分区最长保留" v={`${r.partition_cutoff_days ?? r.retention_days ?? "-"} 天（含来源单独设置）`} />
              <Row k="来源单独设置" v={`${fmtNum(r.source_overrides)} 个`} />
              <Row k="磁盘上限" v={r.max_disk_gb ? `${r.max_disk_gb} GB` : "不限"} />
              <Row k="上次删除分区" v={r.dropped?.length ? r.dropped.join(", ") : "无"} />
              <Row k="上次按来源清理" v={r.deleted?.length ? r.deleted.join("；") : "无"} />
              {r.last_error ? <Row k="错误" v={r.last_error} /> : null}
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
