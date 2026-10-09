// Workflow definitions + runs viewer. Left list of definitions, right pane
// shows the SVG flow graph + run history + per-node editor drawer.
//
// All persistence and runtime tooling goes through soc-server's MCP
// (soc-ai is the client); from this UI we hit the /api/v1/workflows/* REST
// routes proxied by Vite.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Plus,
  Pencil,
  Play,
  Settings,
  Save,
  X,
  GitBranch,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Folder,
  FolderPlus,
  FolderMinus,
  MoreHorizontal,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cardHover, rowActive, rowHover } from "@/lib/styles"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WorkflowEditor } from "@/modules/workflow/WorkflowEditor.jsx"
import { stepsToGraph } from "@/modules/workflow/parseWorkflow.js"
import { buildTablePath } from "@/api.js"
import { cn } from "@/lib/utils"
import { statusBadgeVariant } from "@/utils.js"

// Run-history timestamp: "07-24 11:25:03" (year omitted — the list is recent).
function formatRunTime(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const SAMPLE_YAML = `name: sample
steps:
  - tool: query_table_records
  - parallel:
      - tool: send_email
      - tool: notify_slack
  - analyze: summarize
`

// ── friendly cron editor ─────────────────────────────────────────────────────
// A 5-field cron (min hour dom mon dow) is hard for operators to write by hand.
// CronEditor maps the common shapes (每N分钟/每小时/每天/每周/每月) to/from cron,
// with a 自定义 escape hatch for anything else.

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
const pad2 = (n) => String(n).padStart(2, "0")

// parseCron turns a cron string into the editor's {type, ...} state. Anything
// that doesn't fit a known shape falls back to 自定义.
function parseCron(cron) {
  const s = (cron || "").trim()
  if (!s) return { type: "none" }
  const p = s.split(/\s+/)
  if (p.length !== 5) return { type: "custom", custom: s }
  const [mi, ho, dom, mon, dow] = p
  const num = (x) => (/^\d+$/.test(x) ? Number(x) : null)
  if (mon !== "*") return { type: "custom", custom: s }
  // 每 N 分钟: */N * * * *
  const everyN = /^\*\/(\d+)$/.exec(mi)
  if (everyN && ho === "*" && dom === "*" && dow === "*")
    return { type: "minutes", interval: Number(everyN[1]) }
  // 每小时第 M 分: M * * * *
  if (num(mi) !== null && ho === "*" && dom === "*" && dow === "*")
    return { type: "hourly", minute: num(mi) }
  // 每天 / 每周 / 每月 都需要具体的分+时
  if (num(mi) === null || num(ho) === null) return { type: "custom", custom: s }
  if (dom === "*" && dow === "*") return { type: "daily", minute: num(mi), hour: num(ho) }
  if (dom === "*" && num(dow) !== null)
    return { type: "weekly", minute: num(mi), hour: num(ho), dow: num(dow) % 7 }
  if (num(dom) !== null && dow === "*")
    return { type: "monthly", minute: num(mi), hour: num(ho), dom: num(dom) }
  return { type: "custom", custom: s }
}

// buildCron is the inverse: editor state → cron string.
function buildCron(st) {
  switch (st.type) {
    case "none":
      return ""
    case "minutes":
      return `*/${Math.max(1, st.interval || 1)} * * * *`
    case "hourly":
      return `${st.minute ?? 0} * * * *`
    case "daily":
      return `${st.minute ?? 0} ${st.hour ?? 9} * * *`
    case "weekly":
      return `${st.minute ?? 0} ${st.hour ?? 9} * * ${st.dow ?? 1}`
    case "monthly":
      return `${st.minute ?? 0} ${st.hour ?? 9} ${st.dom ?? 1} * *`
    case "custom":
      return (st.custom || "").trim()
    default:
      return ""
  }
}

// describeCron renders a short human label for a cron (used in the subtitle).
function describeCron(cron) {
  const st = parseCron(cron)
  const at = (h, m) => `${pad2(h ?? 0)}:${pad2(m ?? 0)}`
  switch (st.type) {
    case "none":
      return ""
    case "minutes":
      return `每 ${st.interval} 分钟`
    case "hourly":
      return `每小时第 ${st.minute} 分`
    case "daily":
      return `每天 ${at(st.hour, st.minute)}`
    case "weekly":
      return `每${WEEKDAYS[st.dow]} ${at(st.hour, st.minute)}`
    case "monthly":
      return `每月 ${st.dom} 号 ${at(st.hour, st.minute)}`
    default:
      return `cron: ${cron}`
  }
}

// shortRoom truncates a long Appia room id for inline display.
function shortRoom(rid) {
  const s = String(rid || "")
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s
}

// subsForDef returns the Appia listener subscriptions bound to a definition.
// (The binding lives in the subscription registry — a workflow def carries no
// listening declaration itself; see the 服务集成 module.)
function subsForDef(subs, def) {
  if (!def) return []
  return (subs || []).filter((s) => String(s.workflow_id) === String(def.id))
}

// isMessageDriven marks a def DESIGNED to be fired by the Appia listener: its
// source interpolates the listener-provided message input. Dynamic bindings
// (per-ticket DM subs) come and go at runtime — a message-driven workflow must
// keep its 监听 identity even while zero rooms are currently registered.
function isMessageDriven(def) {
  const src = def?.source || ""
  return src.includes("input.text") || src.includes("input.message")
}

// withTriggerNodes prepends ONE display-only "trigger" node summarizing the
// def's Appia listener subscriptions, wired to the graph's entry nodes, so the
// canvas shows how the flow fires. A single node (not one per subscription):
// a workflow may listen to many rooms at once — e.g. 工单追踪 registers one DM
// room per 责任人 — and dozens of nodes would swamp the canvas. It mirrors the
// subscription registry (read-only) and is stripped on save (WorkflowEditor's
// toGraph filters kind "trigger").
//
// Positioning: toRF re-layouts the WHOLE graph if any node lacks a position,
// which would trash a hand-arranged canvas — so when the entry node has a
// persisted position we compute one (to its left) instead of leaving it empty.
function withTriggerNodes(graph, subs, def) {
  // Inject when live bindings exist OR the def is message-driven by design —
  // per-ticket DM subs unregister on close, and the trigger identity must not
  // vanish with them.
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return graph
  if (!subs.length && !isMessageDriven(def)) return graph
  const hasIncoming = new Set((graph.edges || []).map((e) => e.to))
  const entries = graph.nodes.filter((n) => n.type !== "note" && !hasIncoming.has(n.id))
  if (!entries.length) return graph
  const anchor = entries[0]
  const anchorPos =
    anchor.position && !(anchor.position.x === 0 && anchor.position.y === 0) ? anchor.position : null
  const enabled = subs.filter((s) => s.enabled !== false)
  const one = subs[0]
  const text =
    subs.length === 0
      ? "当前无监听房间 · 由工作流运行时动态注册"
      : subs.length === 1
        ? `${one.company} · ${shortRoom(one.room_id)} ${
            (one.keywords || []).length ? `「${one.keywords.join("/")}」` : "全部消息"
          }${one.enabled === false ? "（已停用）" : ""}`
        : `${subs.length} 个房间 · ${enabled.length} 启用`
  const id = "__trigger_appia__"
  const node = {
    id,
    type: "trigger",
    name: "Appia 消息监听",
    text,
    // The full subscription list rides along for the node's read-only panel.
    subs,
    ...(anchorPos ? { position: { x: anchorPos.x - 280, y: anchorPos.y } } : {}),
  }
  const edges = [...(graph.edges || [])]
  for (const e of entries) edges.push({ from: id, to: e.id })
  return { ...graph, nodes: [node, ...graph.nodes], edges }
}

// describeTrigger summarizes how a workflow fires: a registry Appia listener
// subscription takes precedence over the cron `schedule`; a message-driven def
// with no live binding still reads as listener-fired.
function describeTrigger(def, appiaSubs) {
  const mine = subsForDef(appiaSubs, def)
  if (mine.length === 1) {
    const s = mine[0]
    const kw = (s.keywords || []).length ? `「${s.keywords.join("/")}」` : ""
    return `监听 ${s.company} · ${shortRoom(s.room_id)}${kw}`
  }
  if (mine.length > 1) return `监听 ${mine.length} 个 Appia 房间`
  if (isMessageDriven(def)) return "监听触发 · 房间由运行时注册"
  return describeCron(def?.schedule)
}

const CRON_TYPES = [
  { value: "none", label: "不调度（仅手动运行）" },
  { value: "minutes", label: "每隔几分钟" },
  { value: "hourly", label: "每小时" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "custom", label: "自定义 cron 表达式" },
]

// CronEditor is a controlled friendly schedule picker. value/onChange speak the
// raw cron string; internal state is re-derived from value via the `key` the
// parent sets (per definition), so switching definitions re-initialises cleanly.
function CronEditor({ value, onChange }) {
  const init = parseCron(value)
  const [type, setType] = useState(init.type)
  const [interval, setIntervalVal] = useState(init.interval ?? 5)
  const [minute, setMinute] = useState(init.minute ?? 0)
  const [hour, setHour] = useState(init.hour ?? 9)
  const [dow, setDow] = useState(init.dow ?? 1)
  const [dom, setDom] = useState(init.dom ?? 1)
  const [custom, setCustom] = useState(init.type === "custom" ? value : "")

  const emit = (patch) => {
    const next = { type, interval, minute, hour, dow, dom, custom, ...patch }
    onChange(buildCron(next))
  }
  const setTime = (t) => {
    const [h, m] = (t || "0:0").split(":").map((x) => Number(x) || 0)
    setHour(h)
    setMinute(m)
    emit({ hour: h, minute: m })
  }
  const timeVal = `${pad2(hour)}:${pad2(minute)}`

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>调度频率</FieldLabel>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v)
            emit({ type: v })
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRON_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {type === "minutes" ? (
        <Field>
          <FieldLabel>间隔（分钟）</FieldLabel>
          <Input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => {
              const v = Number(e.target.value) || 1
              setIntervalVal(v)
              emit({ interval: v })
            }}
          />
        </Field>
      ) : null}

      {type === "hourly" ? (
        <Field>
          <FieldLabel>每小时的第几分钟</FieldLabel>
          <Input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => {
              const v = Math.min(59, Math.max(0, Number(e.target.value) || 0))
              setMinute(v)
              emit({ minute: v })
            }}
          />
        </Field>
      ) : null}

      {type === "weekly" ? (
        <Field>
          <FieldLabel>星期几</FieldLabel>
          <Select
            value={String(dow)}
            onValueChange={(v) => {
              setDow(Number(v))
              emit({ dow: Number(v) })
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((w, i) => (
                <SelectItem key={i} value={String(i)}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {type === "monthly" ? (
        <Field>
          <FieldLabel>每月几号</FieldLabel>
          <Input
            type="number"
            min={1}
            max={31}
            value={dom}
            onChange={(e) => {
              const v = Math.min(31, Math.max(1, Number(e.target.value) || 1))
              setDom(v)
              emit({ dom: v })
            }}
          />
        </Field>
      ) : null}

      {type === "daily" || type === "weekly" || type === "monthly" ? (
        <Field>
          <FieldLabel>时间</FieldLabel>
          <Input type="time" value={timeVal} onChange={(e) => setTime(e.target.value)} />
        </Field>
      ) : null}

      {type === "custom" ? (
        <Field>
          <FieldLabel>Cron 表达式</FieldLabel>
          <Input
            className="font-mono"
            value={custom}
            placeholder="分 时 日 月 周，如 0 9 * * 1"
            onChange={(e) => {
              setCustom(e.target.value)
              emit({ custom: e.target.value })
            }}
          />
        </Field>
      ) : null}

      {type !== "none" ? (
        <FieldDescription>
          将于「{describeCron(buildCron({ type, interval, minute, hour, dow, dom, custom })) || "—"}」运行
          {type !== "custom" ? (
            <span className="ml-2 font-mono text-muted-foreground">
              {buildCron({ type, interval, minute, hour, dow, dom, custom })}
            </span>
          ) : null}
        </FieldDescription>
      ) : null}
    </FieldGroup>
  )
}

export function WorkflowVizModule({ apiClient, setError }) {
  const [defs, setDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [runs, setRuns] = useState([])

  // Collapsible panes: hiding one gives the other the full column height.
  // The graph card is CSS-hidden (not unmounted) so in-progress canvas edits
  // survive a collapse/expand round-trip.
  const [graphCollapsed, setGraphCollapsed] = useState(false)
  const [runsCollapsed, setRunsCollapsed] = useState(false)

  // Run-history column widths (px) — resizable by dragging a header's right
  // edge. The 错误 column has no fixed width and absorbs the remainder.
  const [runColW, setRunColW] = useState({
    id: 48,
    status: 96,
    created: 150,
    tokens: 80,
    llm: 88,
  })
  const startRunColResize = useCallback(
    (key) => (e) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = runColW[key]
      function onMove(ev) {
        setRunColW((prev) => ({ ...prev, [key]: Math.max(48, startW + ev.clientX - startX) }))
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [runColW],
  )
  const [activeRun, setActiveRun] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [tools, setTools] = useState([])
  const [models, setModels] = useState([])
  const [editing, setEditing] = useState(false) // new (unsaved) graph in the full-screen editor
  const [editEnabled, setEditEnabled] = useState(false) // editing an existing def (else read-only preview)
  const [saving, setSaving] = useState(false)
  const [runPage, setRunPage] = useState(1)
  const [runHasNext, setRunHasNext] = useState(false)
  const [runLoading, setRunLoading] = useState(false)

  const RUN_PAGE_SIZE = 20

  // Appia 监听订阅（订阅注册中心，soc-ai /api/v1/appia/*）——工作流的
  // 监听触发绑定存在这里而非 def 里。null = 不可用（未授权 integrations 模块或
  // 接口不可达），此时隐藏监听相关 UI，只展示 cron。
  const [appiaSubs, setAppiaSubs] = useState(null)
  const reloadSubs = useCallback(() => {
    apiClient
      .get("/api/v1/appia/subscriptions")
      .then((s) => setAppiaSubs(Array.isArray(s) ? s : []))
      .catch(() => setAppiaSubs(null))
  }, [apiClient])
  useEffect(() => {
    reloadSubs()
  }, [reloadSubs])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.get("/api/v1/workflows/")
      const arr = Array.isArray(list) ? list : list?.workflows || list?.definitions || []
      setDefs(arr)
      if (arr.length > 0 && !selected) {
        setSelected(arr[0])
      }
    } catch (err) {
      setError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, setError, selected])

  useEffect(() => {
    reload()
  }, [reload])

  // ── list grouping ──────────────────────────────────────────────────────────
  // A def's group is a plain `group` string persisted on the definition
  // (PATCH {group}); the group list is derived from the defs. Freshly created
  // groups live in extraGroups until a workflow is dropped in (an empty group
  // is session-only — it has no row of its own to persist).
  const [extraGroups, setExtraGroups] = useState([])
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [dropTarget, setDropTarget] = useState(null) // group being dragged over; "" = 未分组 zone
  const [groupDialog, setGroupDialog] = useState(null) // {mode:"create"} | {mode:"rename", from}

  const defGroup = (d) => (d?.group || "").trim()
  const groups = useMemo(() => {
    const seen = []
    for (const d of defs) {
      const g = defGroup(d)
      if (g && !seen.includes(g)) seen.push(g)
    }
    for (const g of extraGroups) if (!seen.includes(g)) seen.push(g)
    return seen
  }, [defs, extraGroups])

  // assignGroup persists a drag: optimistic move, PATCH {group} (group-only —
  // the backend deliberately skips the modules-snapshot refresh for it), reload
  // on failure to converge.
  const assignGroup = useCallback(
    async (defId, group) => {
      const def = defs.find((d) => String(d.id) === String(defId))
      const target = (group || "").trim()
      if (!def || defGroup(def) === target) return
      setDefs((xs) => xs.map((x) => (x.id === def.id ? { ...x, group: target } : x)))
      try {
        await apiClient.patch(`/api/v1/workflows/${def.id}`, { group: target })
      } catch (err) {
        setError?.(err.message)
        reload()
      }
    },
    [defs, apiClient, setError, reload],
  )

  async function renameGroup(from, to) {
    const t = (to || "").trim()
    if (!t || t === from) return
    const members = defs.filter((d) => defGroup(d) === from)
    setDefs((xs) => xs.map((x) => (defGroup(x) === from ? { ...x, group: t } : x)))
    setExtraGroups((gs) => gs.map((g) => (g === from ? t : g)))
    try {
      await Promise.all(
        members.map((d) => apiClient.patch(`/api/v1/workflows/${d.id}`, { group: t })),
      )
      toast.success(`已重命名为「${t}」`)
    } catch (err) {
      setError?.(err.message)
      reload()
    }
  }

  async function dissolveGroup(name) {
    const members = defs.filter((d) => defGroup(d) === name)
    setDefs((xs) => xs.map((x) => (defGroup(x) === name ? { ...x, group: "" } : x)))
    setExtraGroups((gs) => gs.filter((g) => g !== name))
    try {
      await Promise.all(
        members.map((d) => apiClient.patch(`/api/v1/workflows/${d.id}`, { group: "" })),
      )
      toast.success(`已解散「${name}」，成员移回未分组`)
    } catch (err) {
      setError?.(err.message)
      reload()
    }
  }

  // dropZoneProps wires a container (group section / 未分组 zone) as an HTML5
  // drag-and-drop target for workflow rows.
  const dropZoneProps = (name) => ({
    onDragOver: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      if (dropTarget !== name) setDropTarget(name)
    },
    onDragLeave: (e) => {
      if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
        setDropTarget((t) => (t === name ? null : t))
      }
    },
    onDrop: (e) => {
      e.preventDefault()
      setDropTarget(null)
      const id = e.dataTransfer.getData("text/plain")
      if (id) assignGroup(id, name)
    },
  })

  // Reset run history paging whenever the selected definition changes; also
  // refresh the listener subscriptions — workflow runs register/unregister
  // them dynamically (register_appia_listener), so a mount-time snapshot goes
  // stale fast.
  useEffect(() => {
    setRuns([])
    setRunPage(1)
    setRunHasNext(false)
    setActiveRun(null)
    reloadSubs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  // Run history: newest-first (sort=-Id) with cursor-based infinite scroll.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setRunLoading(true)
    const path = buildTablePath("workflow_runs", {
      limit: RUN_PAGE_SIZE,
      page: runPage,
      where: `(def_id,eq,${selected.id})`,
      sort: "-Id",
    })
    apiClient
      .get(path)
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp?.records) ? resp.records : Array.isArray(resp) ? resp : []
        setRuns((prev) => (runPage === 1 ? list : [...prev, ...list]))
        setRunHasNext(typeof resp?.next === "string" && resp.next !== "")
      })
      .catch((err) => {
        if (!cancelled) setError?.(err.message)
      })
      .finally(() => {
        if (!cancelled) setRunLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected?.id, runPage, apiClient, setError])

  // Infinite scroll: load the next run-history page when the sentinel appears.
  const runSentinelRef = useRef(null)
  useEffect(() => {
    const el = runSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && runHasNext && !runLoading) {
          setRunPage((p) => p + 1)
        }
      },
      { rootMargin: "120px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [runHasNext, runLoading])

  // Tools + models for the editor's node config (best-effort).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [t, m] = await Promise.all([
          apiClient.get("/api/v1/workflows/tools").catch(() => []),
          apiClient.get("/api/v1/ai/models").catch(() => []),
        ])
        if (cancelled) return
        setTools(Array.isArray(t) ? t : t?.tools || [])
        const rawModels = Array.isArray(m) ? m : m?.models || m?.records || []
        setModels(
          rawModels
            .map((x) => ({ name: x.name || x.fields?.name || x.Name }))
            .filter((x) => x.name),
        )
      } catch {
        /* ignore — editor still usable without dropdowns */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [apiClient])

  // The backend returns the step tree under `def.parsed` (parsed from the YAML
  // source); fall back to the def itself if it already carries `steps`.
  const parsedDef = useMemo(() => selected?.parsed || selected || null, [selected])
  // Graph-form defs render as-is; linear/YAML defs are converted to a graph so
  // the same React Flow module displays both.
  const isGraph = Array.isArray(selected?.parsed?.nodes) && selected.parsed.nodes.length > 0
  const displayGraph = useMemo(() => {
    if (!selected) return null
    const g = isGraph ? selected.parsed : stepsToGraph(parsedDef)
    // Show the Appia listener trigger as the flow's first step on the canvas.
    return withTriggerNodes(g, subsForDef(appiaSubs, selected), selected)
  }, [selected, isGraph, parsedDef, appiaSubs])

  async function runNow() {
    if (!selected) return
    try {
      await apiClient.post(`/api/v1/workflows/${selected.id}/run`, { input: {} })
      toast.success("已触发运行")
    } catch (err) {
      setError?.(err.message)
    }
  }

  // Persist the editor's graph as a JSON `source` (create when new, else patch).
  async function saveGraph(graph) {
    setSaving(true)
    try {
      const source = JSON.stringify(graph)
      if (!selected) {
        const created = await apiClient.post("/api/v1/workflows/", { source })
        toast.success("已创建")
        setEditing(false)
        await reload()
        setSelected(created)
      } else {
        const updated = await apiClient.patch(`/api/v1/workflows/${selected.id}`, { source })
        toast.success("已保存")
        setEditEnabled(false)
        await reload()
        setSelected(updated)
      }
    } catch (err) {
      setError?.(err.message)
    } finally {
      setSaving(false)
    }
  }

  // New workflow → the editor takes over the whole content area.
  if (editing) {
    return (
      <div className="flex h-[calc(100svh-6rem)] flex-col">
        <Card className={cn(cardHover, "flex min-h-0 flex-1 flex-col py-0")}>
          <CardContent className="min-h-0 flex-1 p-0">
            <WorkflowEditor
              graph={{ name: "未命名工作流", nodes: [], edges: [] }}
              meta={{ name: "未命名工作流" }}
              tools={tools}
              models={models}
              onSave={saveGraph}
              onExit={() => {
                setEditing(false)
                setActiveRun(null)
              }}
              heightClass="h-full"
              saving={saving}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card className={cn(cardHover, "flex min-h-0 flex-col")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">定义</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton color="blue" size="sm" aria-label="新建工作流">
                    <Plus />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setSelected(null)
                      setActiveRun(null)
                      setEditing(true)
                    }}
                  >
                    <GitBranch />
                    可视化新建
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                    <Pencil />
                    YAML 新建
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setGroupDialog({ mode: "create" })}>
                    <FolderPlus />
                    新建分组
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Spinner />
              </div>
            ) : defs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无工作流</p>
            ) : (
              (() => {
                const renderDefRow = (d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(d.id))
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragEnd={() => setDropTarget(null)}
                      onClick={() => {
                        setSelected(d)
                        setActiveRun(null)
                        setEditing(false)
                        setEditEnabled(false)
                      }}
                      className={cn(
                        "flex w-full cursor-grab items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs active:cursor-grabbing",
                        selected?.id === d.id ? rowActive : rowHover,
                      )}
                    >
                      <span className="truncate">{d.name || d.id}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {subsForDef(appiaSubs, d).length > 0 || isMessageDriven(d) ? (
                          <Badge variant="outline" className="text-[10px]">监听</Badge>
                        ) : null}
                        {d.enabled ? (
                          <Badge variant="secondary" className="text-[10px]">启用</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">禁用</Badge>
                        )}
                      </span>
                    </button>
                  </li>
                )
                const ungrouped = defs.filter((d) => !defGroup(d))
                return (
                  <div className="flex flex-col gap-1 p-2">
                    {groups.map((g) => {
                      const members = defs.filter((d) => defGroup(d) === g)
                      const isCollapsed = !!collapsedGroups[g]
                      return (
                        <div
                          key={g}
                          {...dropZoneProps(g)}
                          className={cn(
                            "rounded-md",
                            dropTarget === g && "bg-primary/5 ring-1 ring-primary/40",
                          )}
                        >
                          <div className="flex items-center gap-1 pr-1">
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedGroups((c) => ({ ...c, [g]: !c[g] }))
                              }
                              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="size-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="size-3.5 shrink-0" />
                              )}
                              <Folder className="size-3.5 shrink-0" />
                              <span className="truncate">{g}</span>
                              <span className="shrink-0 text-[10px]">{members.length}</span>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`分组「${g}」操作`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => setGroupDialog({ mode: "rename", from: g })}
                                >
                                  <Pencil />
                                  重命名
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => dissolveGroup(g)}>
                                  <FolderMinus />
                                  解散分组
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {isCollapsed ? null : members.length === 0 ? (
                            <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                              拖动工作流到此分组
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-1 pb-1 pl-3">
                              {members.map(renderDefRow)}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                    <div
                      {...dropZoneProps("")}
                      className={cn(
                        "rounded-md",
                        dropTarget === "" && "bg-primary/5 ring-1 ring-primary/40",
                      )}
                    >
                      {groups.length > 0 ? (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          <Folder className="size-3.5 shrink-0 opacity-50" />
                          <span>未分组</span>
                          <span className="text-[10px]">{ungrouped.length}</span>
                        </div>
                      ) : null}
                      {groups.length > 0 && ungrouped.length === 0 ? (
                        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                          拖到这里移出分组
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">{ungrouped.map(renderDefRow)}</ul>
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </CardContent>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          {selected ? (
            <>
              <Card
                className={cn(
                  cardHover,
                  "flex min-h-0 flex-col py-0",
                  graphCollapsed ? "shrink-0" : "flex-1",
                )}
              >
                <CardContent className={cn("min-h-0 p-0", !graphCollapsed && "flex-1")}>
                  <WorkflowEditor
                    key={selected.id}
                    graph={displayGraph}
                    meta={{
                      name: selected.name || "未命名工作流",
                      defaultModel: selected?.parsed?.default_model,
                      schedule: selected?.schedule,
                      // Preserve non-canvas definition fields opaquely so a Save
                      // from the visual editor never drops them.
                      budget: selected?.parsed?.budget,
                    }}
                    title={selected.name || selected.id}
                    subtitle={`${describeTrigger(selected, appiaSubs) || "未调度"} · ${
                      isGraph
                        ? `${selected.parsed.nodes.length} 节点`
                        : `${parsedDef?.steps?.length || 0} 步`
                    }`}
                    actions={
                      <>
                        <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
                          <Settings data-icon="inline-start" />
                          管理
                        </Button>
                        <Button size="sm" onClick={runNow}>
                          <Play data-icon="inline-start" />
                          运行
                        </Button>
                      </>
                    }
                    collapsed={graphCollapsed}
                    trailingActions={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setGraphCollapsed((v) => !v)}
                        aria-label={graphCollapsed ? "展开工作流画布" : "收起工作流画布"}
                      >
                        {graphCollapsed ? <ChevronDown /> : <ChevronUp />}
                      </Button>
                    }
                    tools={tools}
                    models={models}
                    run={activeRun}
                    readOnly={!editEnabled}
                    onEdit={() => setEditEnabled(true)}
                    onSave={saveGraph}
                    onExit={() => setEditEnabled(false)}
                    heightClass="h-full"
                    saving={saving}
                  />
                </CardContent>
              </Card>

              <Card
                className={cn(
                  cardHover,
                  "flex flex-col",
                  runsCollapsed ? "shrink-0" : graphCollapsed ? "min-h-0 flex-1" : "h-64 shrink-0",
                )}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">运行历史</CardTitle>
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRunsCollapsed((v) => !v)}
                      aria-label={runsCollapsed ? "展开运行历史" : "收起运行历史"}
                    >
                      {runsCollapsed ? <ChevronDown /> : <ChevronUp />}
                    </Button>
                  </CardAction>
                </CardHeader>
                {runsCollapsed ? null : (
                <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        {[
                          { key: "id", label: "#" },
                          { key: "status", label: "状态" },
                          { key: "created", label: "创建时间" },
                          { key: "tokens", label: "Tokens" },
                          { key: "llm", label: "LLM 调用" },
                          { key: "error", label: "错误" },
                        ].map(({ key, label }) => (
                          <TableHead
                            key={key}
                            className="relative"
                            style={runColW[key] ? { width: runColW[key] } : undefined}
                          >
                            <span className="block truncate">{label}</span>
                            {runColW[key] ? (
                              <span
                                onMouseDown={startRunColResize(key)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute inset-y-0 -right-0.5 z-10 w-1.5 cursor-col-resize hover:bg-border"
                                aria-hidden="true"
                              />
                            ) : null}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.length === 0 && !runLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                            暂无运行
                          </TableCell>
                        </TableRow>
                      ) : (
                        runs.map((r) => {
                          const f = r.fields || r
                          return (
                            <TableRow
                              key={r.id}
                              onClick={async () => {
                                try {
                                  const detail = await apiClient.get(
                                    `/api/v1/workflows/runs/${r.id}`,
                                  )
                                  setActiveRun(detail)
                                } catch (err) {
                                  setError?.(err.message)
                                }
                              }}
                              className="cursor-pointer"
                            >
                              <TableCell className="truncate font-mono text-xs">{r.id}</TableCell>
                              <TableCell className="truncate">
                                <Badge variant={statusBadgeVariant(f.status)}>
                                  {f.status || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="truncate font-mono text-xs text-muted-foreground">
                                {formatRunTime(f.CreatedAt)}
                              </TableCell>
                              <TableCell className="truncate">{f.tokens_used ?? f.tokens ?? 0}</TableCell>
                              <TableCell className="truncate">{f.llm_calls || 0}</TableCell>
                              <TableCell className="truncate text-xs text-muted-foreground">
                                {f.error || "—"}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                  <div ref={runSentinelRef} className="h-px" />
                  {runLoading ? (
                    <div className="flex justify-center py-2">
                      <Spinner />
                    </div>
                  ) : null}
                </CardContent>
                )}
              </Card>
            </>
          ) : (
            <Card className={cn(cardHover, "flex flex-1")}>
              <CardContent className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
                选择或创建一个工作流定义
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (yaml) => {
          try {
            await apiClient.post("/api/v1/workflows/", { source: yaml })
            toast.success("已创建")
            setCreateOpen(false)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

      <GroupNameDialog
        state={groupDialog}
        onClose={() => setGroupDialog(null)}
        onSubmit={(name) => {
          const t = (name || "").trim()
          if (!t) return
          if (groupDialog?.mode === "rename") {
            renameGroup(groupDialog.from, t)
          } else {
            setExtraGroups((gs) => (gs.includes(t) ? gs : [...gs, t]))
            setCollapsedGroups((c) => ({ ...c, [t]: false }))
          }
          setGroupDialog(null)
        }}
      />

      <ManageDialog
        open={manageOpen}
        def={selected}
        models={models}
        onOpenChange={setManageOpen}
        onSaved={() => {
          setManageOpen(false)
          reload()
        }}
        onDeleted={async () => {
          setManageOpen(false)
          // Best-effort orphan cleanup: the listener registry outlives the
          // definition — a leftover subscription would keep firing runs of a
          // deleted workflow. Skipped silently without the integrations grant.
          const orphans = subsForDef(appiaSubs, selected)
          for (const s of orphans) {
            try {
              await apiClient.delete(`/api/v1/appia/subscriptions/${s.id}`)
            } catch {
              /* best-effort */
            }
          }
          if (orphans.length) reloadSubs()
          setSelected(null)
          reload()
        }}
        setError={setError}
        apiClient={apiClient}
      />

      <RunResultDialog run={activeRun} onClose={() => setActiveRun(null)} />
    </div>
  )
}

function RunResultDialog({ run, onClose }) {
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>运行结果 · #{run?.id}</DialogTitle>
          <DialogDescription>
            {run?.status ? `状态 ${run.status} · ` : ""}共 {run?.steps?.length || 0} 步
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {Array.isArray(run?.steps) && run.steps.length > 0 ? (
            run.steps.map((s, i) => (
              <div key={i} className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusBadgeVariant(s.status)}>
                    {s.status || "—"}
                  </Badge>
                  <span className="font-medium">
                    {s.name || s.tool || `步骤 ${i + 1}`}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {s.duration_ms ?? 0}ms · {s.tokens ?? 0} tok
                  </span>
                </div>
                {s.input ? (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background p-1.5 text-[11px] text-muted-foreground">
                    输入:{" "}
                    {typeof s.input === "string"
                      ? s.input
                      : JSON.stringify(s.input, null, 2)}
                  </pre>
                ) : null}
                {s.output ? (
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-1.5 text-[11px]">
                    {typeof s.output === "string"
                      ? s.output
                      : JSON.stringify(s.output, null, 2)}
                  </pre>
                ) : null}
                {s.error ? (
                  <p className="mt-1 text-[11px] text-destructive">{s.error}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">该运行没有步骤记录</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// GroupNameDialog names a list group — create ({mode:"create"}) or rename
// ({mode:"rename", from}). A new group starts empty (session-only) until a
// workflow is dropped in, which persists it via the def's group field.
function GroupNameDialog({ state, onClose, onSubmit }) {
  const [name, setName] = useState("")
  useEffect(() => {
    setName(state?.mode === "rename" ? state.from : "")
  }, [state])
  const rename = state?.mode === "rename"
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{rename ? "重命名分组" : "新建分组"}</DialogTitle>
          <DialogDescription>
            {rename
              ? `将「${state.from}」改名，组内工作流一并迁移。`
              : "创建后把左侧工作流拖入即可归组；空分组仅本次会话可见。"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(name)
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="wf-group-name">分组名称</FieldLabel>
              <Input
                id="wf-group-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：威胁研判 / 工单流转"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              <Save data-icon="inline-start" />
              {rename ? "重命名" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ open, onOpenChange, onSubmit }) {
  const [yaml, setYaml] = useState(SAMPLE_YAML)
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建工作流</DialogTitle>
          <DialogDescription>用 YAML 定义步骤序列</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              await onSubmit(yaml)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            className="h-80 font-mono text-xs"
            spellCheck={false}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Sentinel for the workflow default-model picker's "platform default" row.
const DEF_DEFAULT_MODEL = "__default__"

// withDefaultModel rewrites a definition's top-level default_model in its
// source text. Graph defs are JSON (parse → set → re-stringify, same as the
// editor's Save); linear defs are YAML, where the key is a top-level scalar
// line — replace it in place, or insert it after `name:` (or at the top).
// Returns null when nothing changes so the caller can skip the source PATCH.
function withDefaultModel(source, model) {
  const src = source || ""
  if (src.trim().startsWith("{")) {
    const obj = JSON.parse(src)
    if ((obj.default_model || "") === (model || "")) return null
    if (model) obj.default_model = model
    else delete obj.default_model
    return JSON.stringify(obj)
  }
  const line = /^default_model:.*$/m
  const current = (src.match(line)?.[0] || "").replace(/^default_model:\s*/, "").replace(/^["']|["']$/g, "").trim()
  if (current === (model || "")) return null
  const rendered = model ? `default_model: ${JSON.stringify(model)}` : ""
  if (line.test(src)) {
    // Clearing removes the whole line (with its newline) so no blank is left.
    return rendered ? src.replace(line, rendered) : src.replace(/^default_model:.*\n?/m, "")
  }
  if (!model) return null
  const nameLine = /^name:.*$/m
  if (nameLine.test(src)) return src.replace(nameLine, (m) => `${m}\n${rendered}`)
  return `${rendered}\n${src}`
}

function ManageDialog({ open, def, models = [], onOpenChange, onSaved, onDeleted, apiClient, setError }) {
  const [name, setName] = useState("")
  // schedule is the backend field name (the old code sent `cron`, which the API
  // ignored — so editing the schedule never took effect; fixed here).
  const [schedule, setSchedule] = useState("")
  const [enabled, setEnabled] = useState(true)
  // Workflow-level default model (def.default_model): what analyze/agent nodes
  // without their own pick use, before the registry's global default.
  const [defaultModel, setDefaultModel] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (def) {
      setName(def.name || "")
      setSchedule(def.schedule || "")
      setEnabled(!!def.enabled)
      setDefaultModel(def.parsed?.default_model || "")
    }
  }, [def])

  if (!def) return null

  async function handleDelete() {
    try {
      await apiClient.delete(`/api/v1/workflows/${def.id}`)
      toast.success(`已删除「${def.name}」`)
      onDeleted?.()
    } catch (err) {
      setError?.(err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>管理 {def.name}</DialogTitle>
          <DialogDescription>
            修改名称、调度、默认模型和启用状态。Appia 监听绑定在「插件管理」页的 Appia 插件下管理（画布上的触发节点可查看）。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              const body = { name, schedule, enabled }
              // default_model lives inside the definition source, not a
              // column — rewrite the source only when it actually changes.
              const source = withDefaultModel(def.source, defaultModel)
              if (source !== null) body.source = source
              await apiClient.patch(`/api/v1/workflows/${def.id}`, body)
              toast.success("已保存")
              onSaved()
            } catch (err) {
              setError?.(err.message)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="wf-name">名称</FieldLabel>
              <Input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <CronEditor key={def.id} value={def.schedule || ""} onChange={setSchedule} />

          <FieldGroup>
            <Field>
              <FieldLabel>默认模型</FieldLabel>
              <Select
                value={defaultModel || DEF_DEFAULT_MODEL}
                onValueChange={(v) => setDefaultModel(v === DEF_DEFAULT_MODEL ? "" : v)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="平台默认" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEF_DEFAULT_MODEL}>平台默认模型</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                  {defaultModel && !models.some((m) => m.name === defaultModel) ? (
                    <SelectItem value={defaultModel}>{defaultModel}（未注册，运行时回退平台默认）</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <FieldDescription>
                本工作流里没有单独选模型的研判/智能体节点用它；节点自己选的模型优先。
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="wf-enabled"
                checked={enabled}
                onCheckedChange={(c) => setEnabled(!!c)}
              />
              <FieldLabel htmlFor="wf-enabled">启用</FieldLabel>
            </Field>
          </FieldGroup>

          <DialogFooter className="sm:justify-between">
            <ConfirmDeleteButton
              disabled={submitting}
              confirmLabel="确认删除工作流（运行记录保留）"
              onConfirm={handleDelete}
            >
              删除
            </ConfirmDeleteButton>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                保存
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default WorkflowVizModule
