// LiveConsole — 实时监控: the host as the agent sees it right now. The agent
// keeps a model of the host (running processes, open connections,
// persistence entries) and reports every change; the platform mirrors it
// (GET /cases/{id}/live/*). This console shows that mirror — process tree,
// connections, autoruns — and the event stream that moves it, refreshing
// every 2 seconds while the session runs. 「已存事件」 is the durable subset
// (ir_events) rendered by MonitorTab.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Crosshair,
  Radio,
  RefreshCw,
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
import { Input } from "@/components/ui/input"
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
import { cn } from "@/lib/utils"
import { LevelBadge } from "./LevelBadge.jsx"
import { MonitorTab } from "./MonitorTab.jsx"
import { RowSheet } from "./RowSheet.jsx"
import { errMsg, fmtTime, triggerLabel } from "./lib.js"

const POLL_MS = 2000
const EVENT_CAP = 2000
const FRESH_MS = 6000

const END_REASONS = {
  interrupted: "主机上手动结束",
  expired: "到达监控时长上限",
  platform: "平台停止",
  rejected: "会话被平台结束",
  lost: "失联后由平台关闭",
}
const KIND_LABEL = { process: "进程", network: "网络", trigger: "启动项" }
const OP_LABEL = {
  process: { new: "启动", gone: "退出" },
  network: { new: "连接", gone: "断开" },
  trigger: { new: "新增", gone: "删除", changed: "变更" },
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

// useFresh remembers when each key was first seen, so rows that just
// appeared can be tinted for a few seconds.
function useFresh(keys) {
  const seen = useRef(new Map())
  const primed = useRef(false)
  const now = Date.now()
  for (const k of keys) {
    // the first load is the baseline, not news
    if (!seen.current.has(k)) seen.current.set(k, primed.current ? now : 0)
  }
  if (keys.length) primed.current = true
  return (k) => now - (seen.current.get(k) ?? 0) < FRESH_MS
}

const procKey = (p) => `${p.pid}|${p.start_time || ""}`

function buildTree(rows) {
  const byPid = new Map(rows.map((p) => [p.pid, { ...p, kids: [] }]))
  const roots = []
  for (const n of byPid.values()) {
    const parent = n.ppid && n.ppid !== n.pid ? byPid.get(n.ppid) : null
    if (parent) parent.kids.push(n)
    else roots.push(n)
  }
  // a subtree is as interesting as its worst member
  const worst = (n) => {
    n.worst = Math.max(n.score || 0, ...n.kids.map(worst))
    return n.worst
  }
  roots.forEach(worst)
  return roots
}

function ProcNode({ node, depth, fresh, onSelect, filter }) {
  const [open, setOpen] = useState(depth < 1 || node.worst >= 20)
  const kids = node.kids
  const show = filter ? true : open
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md py-0.5 pr-2 text-xs hover:bg-muted/60",
          fresh(procKey(node)) && "bg-success/10"
        )}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {kids.length ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={show ? "折叠" : "展开"}
            onClick={() => setOpen((o) => !o)}
          >
            {show ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : (
          <span className="inline-block size-6 shrink-0" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(node)}
        >
          <span className={cn("shrink-0", node.score >= 40 && "font-medium")}>
            {node.name || "-"}
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {node.pid}
          </span>
          {node.user ? (
            <span className="hidden shrink-0 text-muted-foreground xl:inline">
              {node.user}
            </span>
          ) : null}
          <span
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={node.command_line || node.path}
          >
            {node.command_line || node.path}
          </span>
        </button>
        {node.public_conns ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            公网连接 {node.public_conns}
          </Badge>
        ) : node.conns ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            连接 {node.conns}
          </span>
        ) : null}
        {node.path && !node.signed ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            未签名
          </span>
        ) : null}
        {node.score > 0 ? (
          <LevelBadge level={node.level} score={node.score} showScore />
        ) : null}
      </div>
      {show && kids.length ? (
        <ul>
          {kids.map((k) => (
            <ProcNode
              key={procKey(k)}
              node={k}
              depth={depth + 1}
              fresh={fresh}
              onSelect={onSelect}
              filter={filter}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function ProcessPane({ rows, q, onSelect }) {
  const fresh = useFresh(rows.map(procKey))
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    return rows.filter((p) =>
      `${p.name} ${p.path} ${p.command_line} ${p.user} ${p.pid} ${p.signer}`
        .toLowerCase()
        .includes(s)
    )
  }, [rows, q])
  const tree = useMemo(() => buildTree(filtered || rows), [filtered, rows])
  if (!rows.length)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        暂无进程数据
      </p>
    )
  return (
    <ul className="flex flex-col p-1">
      {tree.map((n) => (
        <ProcNode
          key={procKey(n)}
          node={n}
          depth={0}
          fresh={fresh}
          onSelect={onSelect}
          filter={!!filtered}
        />
      ))}
    </ul>
  )
}

function ConnPane({ rows, q, onFind }) {
  const key = (c) =>
    `${c.pid}|${c.proto}|${c.local_port}|${c.remote}|${c.remote_port}`
  const fresh = useFresh(rows.map(key))
  const s = q.trim().toLowerCase()
  const list = s
    ? rows.filter((c) =>
        `${c.name} ${c.path} ${c.remote} ${c.remote_port} ${c.pid}`
          .toLowerCase()
          .includes(s)
      )
    : rows
  if (!list.length)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        当前没有对外连接
      </p>
    )
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[26%]">进程</TableHead>
          <TableHead className="w-20">PID</TableHead>
          <TableHead className="w-20">协议</TableHead>
          <TableHead>远端地址</TableHead>
          <TableHead className="w-24">本地端口</TableHead>
          <TableHead className="w-44">建立于（主机时间）</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((c) => (
          <TableRow
            key={key(c)}
            className={cn(fresh(key(c)) && "bg-success/10")}
          >
            <TableCell className="truncate text-xs" title={c.path}>
              {c.name || "-"}
            </TableCell>
            <TableCell className="text-xs tabular-nums">{c.pid}</TableCell>
            <TableCell className="text-xs">{c.proto}</TableCell>
            <TableCell className="text-xs">
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  className="font-mono hover:underline"
                  title="查看哪些进程连接过这个地址"
                  onClick={() => onFind(c.remote)}
                >
                  {c.remote}:{c.remote_port}
                </button>
                {c.public ? <Badge variant="outline">公网</Badge> : null}
                {c.hit ? (
                  <Badge variant="destructive">命中告警指标</Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-xs tabular-nums">
              {c.local_port}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              {c.since || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AutorunPane({ rows, q, onSelect }) {
  const s = q.trim().toLowerCase()
  const list = s
    ? rows.filter((a) =>
        `${a.name} ${a.path} ${a.command_line} ${a.trigger_type}`
          .toLowerCase()
          .includes(s)
      )
    : rows
  if (!list.length)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        暂无启动项数据
      </p>
    )
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">类型</TableHead>
          <TableHead className="w-24">风险</TableHead>
          <TableHead className="w-[28%]">名称</TableHead>
          <TableHead>命令</TableHead>
          <TableHead className="w-40">签名</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((a, i) => (
          <TableRow
            key={`${a.trigger_type}|${a.name}|${a.command_line}|${i}`}
            className="cursor-pointer"
            onClick={() => onSelect(a)}
          >
            <TableCell className="text-xs">
              {triggerLabel(a.trigger_type)}
            </TableCell>
            <TableCell>
              <LevelBadge level={a.level} score={a.score} showScore />
            </TableCell>
            <TableCell className="truncate text-xs" title={a.name}>
              {a.name}
            </TableCell>
            <TableCell
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={a.command_line || a.path}
            >
              {a.command_line || a.path || "-"}
            </TableCell>
            <TableCell className="truncate text-xs text-muted-foreground">
              {a.signed ? a.signer || "有效" : a.path ? "未签名" : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function eventText(e) {
  if (e.kind === "network")
    return `${e.name || "-"} → ${e.remote}:${e.remote_port || ""}`
  if (e.kind === "trigger") return `${triggerLabel(e.trigger_type)}：${e.name}`
  return e.name || "-"
}

function EventPane({ rows, q, running, onSelect }) {
  const s = q.trim().toLowerCase()
  const list = s
    ? rows.filter((e) =>
        `${e.name} ${e.path} ${e.command_line} ${e.remote} ${e.pid}`
          .toLowerCase()
          .includes(s)
      )
    : rows
  if (!list.length)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {running
          ? "等待主机上的变化…"
          : "实时事件流只保留在平台内存中；历史请看「已存事件」。"}
      </p>
    )
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">主机时间</TableHead>
          <TableHead className="w-28">类型</TableHead>
          <TableHead className="w-24">风险</TableHead>
          <TableHead className="w-[30%]">对象</TableHead>
          <TableHead>命令行 / 路径</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((e) => (
          <TableRow
            key={e.id}
            className={cn("cursor-pointer", e.op === "gone" && "opacity-60")}
            onClick={() => onSelect(e)}
          >
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              {e.time}
            </TableCell>
            <TableCell className="text-xs">
              {KIND_LABEL[e.kind] || e.kind}{" "}
              <span className="text-muted-foreground">
                {OP_LABEL[e.kind]?.[e.op] || e.op}
              </span>
            </TableCell>
            <TableCell>
              {e.score > 0 ? (
                <LevelBadge level={e.level} score={e.score} showScore />
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="text-xs">
              <span className="inline-flex max-w-full items-center gap-2">
                <span className="truncate" title={eventText(e)}>
                  {eventText(e)}
                </span>
                {e.hit ? (
                  <Badge variant="destructive">命中告警指标</Badge>
                ) : null}
                {e.kind === "network" && e.first && e.public ? (
                  <Badge variant="outline">首次公网</Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={e.command_line || e.path}
            >
              {e.command_line || e.path || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// AlertPane — the device alert next to the host: the indicators named by the
// linked 安全事件 and the live events that matched them.
function AlertPane({ indicators, hits, running, onFind, onSelect }) {
  const ips = indicators?.ips || []
  const hashes = indicators?.hashes || []
  const domains = indicators?.domains || []
  if (!indicators?.incident_id)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        该案例没有关联安全事件。从带有安全事件的工单「发起应急响应」创建的案例，会自动把告警里的
        IP、哈希与主机上的实时进程和连接做比对。
      </p>
    )
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2 text-xs">
        <div className="text-muted-foreground">
          关联安全事件 #{indicators.incident_id}{" "}
          的告警指标（点击可反查相关进程）
        </div>
        {ips.length + hashes.length === 0 ? (
          <div className="text-muted-foreground">
            该事件里没有可比对的 IP 或哈希。
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...ips, ...hashes].map((v) => (
              <Button
                key={v}
                variant="outline"
                size="sm"
                className="h-6 font-mono text-[11px]"
                onClick={() => onFind(v)}
              >
                {v.length > 24 ? `${v.slice(0, 16)}…` : v}
              </Button>
            ))}
          </div>
        )}
        {domains.length ? (
          <div className="text-muted-foreground">
            域名（仅供参考，主机事件不含域名，无法自动比对）：
            {domains.join("、")}
          </div>
        ) : null}
      </div>
      {hits.length ? (
        <div className="rounded-md border">
          <EventPane rows={hits} q="" running={running} onSelect={onSelect} />
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {running
            ? "监控期间尚未观察到与告警指标对应的进程或连接。"
            : "监控期间没有观察到与告警指标对应的进程或连接。"}
        </p>
      )}
    </div>
  )
}

export function LiveConsole({
  api,
  caseId,
  onResetToken,
  onNavigate,
  hostname,
  historyProps,
}) {
  const [pane, setPane] = useState("processes")
  const [head, setHead] = useState(null)
  const [procs, setProcs] = useState([])
  const [conns, setConns] = useState([])
  const [autoruns, setAutoruns] = useState([])
  const [events, setEvents] = useState([])
  const [hits, setHits] = useState([])
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(null)
  const [found, setFound] = useState(null)
  const [confirmStop, setConfirmStop] = useState(false)
  const lastId = useRef(0)
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const h = await api.get(`/cases/${caseId}/live`)
      setHead(h)
      const jobs = []
      if (pane === "processes")
        jobs.push(
          api
            .get(`/cases/${caseId}/live/processes`)
            .then((r) => setProcs(r.rows || []))
        )
      if (pane === "connections")
        jobs.push(
          api
            .get(`/cases/${caseId}/live/connections`)
            .then((r) => setConns(r.rows || []))
        )
      if (pane === "autoruns")
        jobs.push(
          api
            .get(`/cases/${caseId}/live/autoruns`)
            .then((r) => setAutoruns(r.rows || []))
        )
      // indicator hits are few and matter most: always current
      jobs.push(
        api
          .get(`/cases/${caseId}/live/events?hits=1&limit=500`)
          .then((r) => setHits(r.rows || []))
      )
      // the event tail is always followed, so switching to it shows history
      jobs.push(
        api
          .get(
            `/cases/${caseId}/live/events?after=${lastId.current}&limit=1000`
          )
          .then((r) => {
            const rows = r.rows || []
            if (r.last_id < lastId.current) {
              // the platform restarted: its ring started over
              lastId.current = 0
              setEvents([])
              return
            }
            lastId.current = r.last_id || lastId.current
            if (rows.length)
              setEvents((cur) => [...rows, ...cur].slice(0, EVENT_CAP))
          })
      )
      await Promise.all(jobs)
    } catch {
      // transient: the next tick retries
    } finally {
      busy.current = false
    }
  }, [api, caseId, pane])

  useEffect(() => {
    tick()
  }, [tick])

  const monitor = head?.monitor
  const live = head?.live
  const running = monitor?.state === "监控中"
  useEffect(() => {
    if (!running) return
    const t = setInterval(tick, POLL_MS)
    return () => clearInterval(t)
  }, [running, tick])

  async function stop() {
    try {
      await api.post(`/cases/${caseId}/live/stop`, {})
      toast.success("已请求停止，agent 下次上报时结束并自清理")
      tick()
    } catch (err) {
      toast.error(errMsg(err, "停止监控失败"))
    }
  }

  async function resync() {
    try {
      await api.post(`/cases/${caseId}/live/resync`, {})
      toast.success("已要求 agent 重新同步主机状态")
    } catch (err) {
      toast.error(errMsg(err, "请求失败"))
    }
  }

  async function find(needle) {
    try {
      const r = await api.get(
        `/cases/${caseId}/live/find?q=${encodeURIComponent(needle)}`
      )
      setFound({ needle, ...r })
    } catch (err) {
      toast.error(errMsg(err, "查询失败"))
    }
  }

  function openRow(row, title) {
    setOpen({
      row: {
        ...row,
        name: row.name,
        path: row.path,
        score: row.score,
        level: row.level,
        reasons: row.reasons,
      },
      title,
    })
  }

  if (!head)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )

  if (!monitor?.state && !live?.known)
    return (
      <Empty className="flex-1 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radio />
          </EmptyMedia>
          <EmptyTitle>该案例还没有部署实时监控</EmptyTitle>
          <EmptyDescription>
            在主机上运行监控 agent
            后，这里会实时显示它的进程树、网络连接和启动项，以及每一次变化。agent
            只读、只向平台上报，结束后自动从主机删除。重置令牌后复制「持续监控」命令到主机执行即可。
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
        <Stat label="进程">{live?.processes ?? 0}</Stat>
        <Stat label="连接（公网）">
          {live?.connections ?? 0}（{live?.public_connections ?? 0}）
        </Stat>
        <Stat label="启动项">{live?.autoruns ?? 0}</Stat>
        <Stat label="已存事件">{monitor?.events ?? 0}</Stat>
        <Stat label={running ? "最近心跳" : "结束"}>
          {fmtTime(running ? monitor?.last_beat : monitor?.ended)}
        </Stat>
        {running ? (
          <Stat label="最晚到">{fmtTime(monitor?.deadline)}</Stat>
        ) : null}
        {!running && monitor?.end_reason ? (
          <Stat label="结束原因">
            {END_REASONS[monitor.end_reason] || monitor.end_reason}
          </Stat>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <>
              <Button variant="ghost" size="sm" onClick={resync}>
                <RefreshCw data-icon="inline-start" />
                重新同步
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={monitor.stop_requested}
                onClick={() => setConfirmStop(true)}
              >
                <CircleStop data-icon="inline-start" />
                停止监控
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {running && !monitor.online ? (
        <Alert>
          <Radio />
          <AlertTitle>agent 已超过 2 分钟没有上报</AlertTitle>
          <AlertDescription>
            可能是主机关机、断网，或 agent
            被结束。下面显示的是它最后一次上报时的状态。恢复后会自动续报。
          </AlertDescription>
        </Alert>
      ) : null}
      {monitor?.note ? (
        <Alert>
          <Radio />
          <AlertTitle>agent 自诊断（{fmtTime(monitor.note_at)}）</AlertTitle>
          <AlertDescription>{monitor.note}</AlertDescription>
        </Alert>
      ) : null}
      {!running && live?.known ? (
        <Alert>
          <Radio />
          <AlertTitle>监控已结束</AlertTitle>
          <AlertDescription>
            下面是 agent 最后一次上报时的主机状态（{fmtTime(live.state_at)}{" "}
            主机时间），不再更新。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={pane}
          onValueChange={(v) => v && setPane(v)}
        >
          <ToggleGroupItem value="processes">进程</ToggleGroupItem>
          <ToggleGroupItem value="connections">网络</ToggleGroupItem>
          <ToggleGroupItem value="autoruns">启动项</ToggleGroupItem>
          <ToggleGroupItem value="events">事件流</ToggleGroupItem>
          <ToggleGroupItem value="alerts">
            告警关联
            {hits.length ? (
              <Badge variant="destructive" className="ml-1">
                {hits.length}
              </Badge>
            ) : null}
          </ToggleGroupItem>
          <ToggleGroupItem value="history">已存事件</ToggleGroupItem>
        </ToggleGroup>
        {pane !== "history" && pane !== "alerts" ? (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="筛选：进程名 / 路径 / 命令行 / IP / PID"
            className="h-8 w-72"
          />
        ) : null}
        {pane === "events" ? (
          <span className="ml-auto text-xs text-muted-foreground">
            最近 {events.length} 条
          </span>
        ) : null}
      </div>

      {pane === "history" ? (
        <MonitorTab
          api={api}
          caseId={caseId}
          onResetToken={onResetToken}
          onNavigate={onNavigate}
          hostname={hostname}
          embedded
          {...historyProps}
        />
      ) : (
        <div className="min-h-0 thin-scrollbar flex-1 overflow-auto rounded-md border">
          {pane === "processes" ? (
            <ProcessPane
              rows={procs}
              q={q}
              onSelect={(p) => openRow(p, "进程")}
            />
          ) : pane === "connections" ? (
            <ConnPane rows={conns} q={q} onFind={find} />
          ) : pane === "alerts" ? (
            <AlertPane
              indicators={head.indicators}
              hits={hits}
              running={running}
              onFind={find}
              onSelect={(e) => openRow(e, "命中告警指标的事件")}
            />
          ) : pane === "autoruns" ? (
            <AutorunPane
              rows={autoruns}
              q={q}
              onSelect={(a) => openRow(a, "启动项")}
            />
          ) : (
            <EventPane
              rows={events}
              q={q}
              running={running}
              onSelect={(e) => openRow(e, "实时事件")}
            />
          )}
        </div>
      )}

      {found ? (
        <Alert>
          <Crosshair />
          <AlertTitle className="flex items-center gap-2">
            与 {found.needle} 有关的进程
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setFound(null)}
            >
              关闭
            </Button>
          </AlertTitle>
          <AlertDescription>
            {found.processes?.length ? (
              <ul className="flex flex-col gap-0.5">
                {found.processes.map((p) => (
                  <li key={procKey(p)} className="font-mono text-xs">
                    {p.name}（PID {p.pid}）{p.command_line || p.path}
                  </li>
                ))}
              </ul>
            ) : (
              "当前没有运行中的进程与它相连。"
            )}
            {found.events?.length
              ? ` 事件流中另有 ${found.events.length} 条相关记录。`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <RowSheet
        row={open?.row || null}
        title={open?.title}
        onOpenChange={() => setOpen(null)}
        onNavigate={onNavigate}
        hostname={hostname}
      />
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="停止实时监控？"
        description={
          monitor?.online
            ? "agent 会在下一次上报时（几秒内）结束，并从主机删除自身和本地文件。已上报的数据保留。"
            : "agent 当前失联，只能关闭平台侧会话，无法通知它自清理；主机恢复后它会发现会话已结束并自行退出、清理。"
        }
        confirmText="停止监控"
        destructive
        onConfirm={stop}
      />
    </div>
  )
}
