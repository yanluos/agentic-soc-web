// MonitorTab — 持续监控: the live session of a case. A collector started
// with -watch keeps reporting what changed on the host after the full
// collection (new process / first-seen remote address / persistence entry
// added, altered, removed); this tab shows the session state and the event
// stream, polling GET /cases/{id}/monitor while the session runs.
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity,
  CircleStop,
  Network,
  Radio,
  RefreshCw,
  TerminalSquare,
  Timer,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ConfirmDialog } from "@/components/ConfirmDialog.jsx"
import { LevelBadge } from "./LevelBadge.jsx"
import { RowSheet } from "./RowSheet.jsx"
import { TRIGGER_LABELS, errMsg, fields, fmtTime } from "./lib.js"

const POLL_MS = 5000
const PAGE = 200

const KINDS = {
  process: { label: "进程", icon: TerminalSquare },
  network: { label: "外联", icon: Network },
  trigger: { label: "持久化", icon: Timer },
}
const OPS = { new: "新增", gone: "消失", changed: "变更" }
const END_REASONS = {
  interrupted: "主机上手动结束（Ctrl+C / 关闭窗口）",
  expired: "到达监控时长上限",
  platform: "平台停止",
  rejected: "会话被平台结束",
  lost: "采集端失联后由平台关闭",
}

function StateBadge({ monitor }) {
  if (monitor?.state === "监控中") {
    if (monitor.stop_requested)
      return <Badge variant="secondary">正在停止…</Badge>
    return monitor.online ? (
      <Badge variant="success">监控中</Badge>
    ) : (
      <Badge variant="warning">失联</Badge>
    )
  }
  if (monitor?.state === "已停止")
    return <Badge variant="outline">已停止</Badge>
  return <Badge variant="outline">未开启</Badge>
}

function Stat({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums">{children ?? "-"}</span>
    </div>
  )
}

function what(f) {
  const d = f["详情"] || {}
  if (f["类型"] === "network")
    return `${f["名称"] || "-"} → ${f["远端地址"] || "-"}${d.public ? "（公网）" : ""}`
  if (f["类型"] === "trigger")
    return `${TRIGGER_LABELS[d.trigger_type] || d.trigger_type || "持久化项"}：${f["名称"] || "-"}`
  return f["名称"] || "-"
}

export function MonitorTab({
  api,
  caseId,
  onResetToken,
  onNavigate,
  hostname,
}) {
  const [open, setOpen] = useState(null)
  const [monitor, setMonitor] = useState(null)
  const [events, setEvents] = useState(null)
  const [total, setTotal] = useState(0)
  const [kind, setKind] = useState("all")
  const [minScore, setMinScore] = useState("0")
  const [loading, setLoading] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const seq = useRef(0)

  const load = useCallback(
    async (quiet) => {
      const my = ++seq.current
      if (!quiet) setLoading(true)
      try {
        const q = new URLSearchParams({ limit: String(PAGE) })
        if (kind !== "all") q.set("kind", kind)
        if (minScore !== "0") q.set("min_score", minScore)
        const r = await api.get(`/cases/${caseId}/monitor?${q}`)
        if (my !== seq.current) return
        setMonitor(r.monitor || {})
        setEvents(Array.isArray(r.events) ? r.events : [])
        setTotal(r.pageInfo?.totalRows ?? 0)
      } catch (err) {
        if (my === seq.current && !quiet)
          toast.error(errMsg(err, "读取监控状态失败"))
      } finally {
        if (my === seq.current) setLoading(false)
      }
    },
    [api, caseId, kind, minScore]
  )

  useEffect(() => {
    load(false)
  }, [load])

  const running = monitor?.state === "监控中"
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(t)
  }, [running, load])

  async function stop() {
    try {
      const r = await api.post(`/cases/${caseId}/monitor/stop`, {})
      setMonitor(r.monitor || {})
      toast.success(
        r.monitor?.state === "已停止"
          ? "监控已关闭"
          : "已请求停止，采集端下次上报时结束并自清理"
      )
    } catch (err) {
      toast.error(errMsg(err, "停止监控失败"))
    }
  }

  if (!monitor)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )

  if (!monitor.state)
    return (
      <Empty className="flex-1 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radio />
          </EmptyMedia>
          <EmptyTitle>该案例未开启持续监控</EmptyTitle>
          <EmptyDescription>
            持续监控会让采集端在首次全量采集后留在主机前台，持续上报新进程、新外联和持久化项的变化；结束后采集端自动从主机删除。重置令牌后复制「持续监控」命令到主机执行即可开启。
          </EmptyDescription>
        </EmptyHeader>
        {onResetToken ? (
          <Button variant="outline" size="sm" onClick={onResetToken}>
            重置令牌并获取命令
          </Button>
        ) : null}
      </Empty>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <StateBadge monitor={monitor} />
        </div>
        <Stat label="开始">{fmtTime(monitor.started)}</Stat>
        <Stat label={running ? "最近心跳" : "结束"}>
          {fmtTime(running ? monitor.last_beat : monitor.ended)}
        </Stat>
        {running ? (
          <Stat label="最晚到">{fmtTime(monitor.deadline)}</Stat>
        ) : null}
        <Stat label="累计事件">{monitor.events ?? 0}</Stat>
        {running ? <Stat label="当前进程数">{monitor.processes}</Stat> : null}
        <Stat label="最高风险分">{monitor.max_score ?? 0}</Stat>
        {!running && monitor.end_reason ? (
          <Stat label="结束原因">
            {END_REASONS[monitor.end_reason] || monitor.end_reason}
          </Stat>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(false)}
            disabled={loading}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            刷新
          </Button>
          {running ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={monitor.stop_requested}
              onClick={() => setConfirmStop(true)}
            >
              <CircleStop data-icon="inline-start" />
              停止监控
            </Button>
          ) : null}
        </div>
      </div>

      {running && !monitor.online ? (
        <Alert>
          <Radio />
          <AlertTitle>采集端已超过 2 分钟没有上报</AlertTitle>
          <AlertDescription>
            可能是主机关机、断网，或采集端进程被结束。恢复后会自动补报；确认不再回来可点「停止监控」关闭会话（此时无法通知采集端自清理）。
          </AlertDescription>
        </Alert>
      ) : null}
      {monitor.dropped ? (
        <Alert>
          <Radio />
          <AlertTitle>有 {monitor.dropped} 条变化未入库</AlertTitle>
          <AlertDescription>
            平台不可达期间采集端本地队列溢出，或单个案例的事件数已达上限。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={kind}
          onValueChange={(v) => v && setKind(v)}
        >
          <ToggleGroupItem value="all">全部</ToggleGroupItem>
          <ToggleGroupItem value="process">进程</ToggleGroupItem>
          <ToggleGroupItem value="network">外联</ToggleGroupItem>
          <ToggleGroupItem value="trigger">持久化</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={minScore}
          onValueChange={(v) => v && setMinScore(v)}
        >
          <ToggleGroupItem value="0">所有分数</ToggleGroupItem>
          <ToggleGroupItem value="20">可疑及以上</ToggleGroupItem>
          <ToggleGroupItem value="60">高及以上</ToggleGroupItem>
        </ToggleGroup>
        <span className="ml-auto text-xs text-muted-foreground">
          {total > (events?.length || 0)
            ? `最近 ${events?.length || 0} 条，共 ${total} 条`
            : `${events?.length || 0} 条`}
        </span>
      </div>

      <div className="min-h-0 thin-scrollbar flex-1 overflow-auto rounded-md border">
        {events?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">主机时间</TableHead>
                <TableHead className="w-24">类型</TableHead>
                <TableHead className="w-20">风险</TableHead>
                <TableHead>变化</TableHead>
                <TableHead>路径 / 命令行</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const f = fields(e)
                const k = KINDS[f["类型"]] || KINDS.process
                const Icon = k.icon
                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() =>
                      setOpen({
                        ...f,
                        name: what(f),
                        path: f["路径"],
                        score: f["风险分"],
                        level: f["风险等级"],
                        reasons: f["详情"]?.reasons,
                      })
                    }
                  >
                    <TableCell className="align-top text-xs text-muted-foreground tabular-nums">
                      {f["时间"]}
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {k.label}
                        <span className="text-muted-foreground">
                          {OPS[f["动作"]] || f["动作"]}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <LevelBadge
                        level={f["风险等级"]}
                        score={f["风险分"]}
                        showScore
                      />
                    </TableCell>
                    <TableCell className="max-w-64 align-top text-xs whitespace-normal">
                      <div className="break-all">{what(f)}</div>
                      {f["原因"] ? (
                        <div className="line-clamp-2 text-[11px] text-muted-foreground">
                          {f["原因"]}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-96 align-top font-mono text-[11px] whitespace-normal text-muted-foreground">
                      <div className="line-clamp-2 break-all">
                        {f["命令行"] || f["路径"] || "-"}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {running
              ? "暂无变化。采集端每 10 秒对比一次进程与外联，约每分钟对比一次持久化项。"
              : "没有符合条件的事件"}
          </p>
        )}
      </div>

      <RowSheet
        row={open}
        title="监控事件"
        onOpenChange={setOpen}
        onNavigate={onNavigate}
        hostname={hostname}
      />
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="停止持续监控？"
        description={
          monitor.online
            ? "采集端会在下一次上报时（约 10–30 秒内）结束，并从主机删除自身和本地采集文件。已上报的事件保留。"
            : "采集端当前失联，只能关闭平台侧会话，无法通知它自清理；主机恢复后采集端会发现会话已结束并自行退出、清理。"
        }
        confirmText="停止监控"
        destructive
        onConfirm={stop}
      />
    </div>
  )
}
