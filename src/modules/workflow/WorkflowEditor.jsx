// n8n-style node editor for DAG workflows, built on React Flow.
// Round-trips the backend graph form { nodes:[{id,type,...,position}], edges:[{from,to,when}] }.
// Branching = multiple edges out of a node, each with an optional `when`
// expression; condition nodes emit "true"/"false" for edges to compare.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Wrench,
  Sparkles,
  Bot,
  GitBranch,
  ShieldQuestion,
  Plus,
  Save,
  Play,
  Trash2,
  X,
  Info,
  Pencil,
  RefreshCw,
  Mail,
  MessageSquare,
  MessagesSquare,
  StickyNote,
  Workflow,
  Rss,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { APPIA_COMPANIES } from "@/constants.js"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSeparator,
  FieldError,
} from "@/components/ui/field"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { cn } from "@/lib/utils.js"
import { autoLayout } from "@/modules/workflow/parseWorkflow.js"

const NODE_TYPES = [
  { type: "tool", label: "工具调用", icon: Wrench, desc: "调用一个内置工具（查询数据、封禁、发邮件等）" },
  { type: "analyze", label: "智能研判", icon: Sparkles, desc: "让大模型对上游结果做分析判断，输出结论" },
  { type: "agent", label: "智能体", icon: Bot, desc: "多轮自主调用工具，完成一项复杂任务" },
  { type: "condition", label: "条件分流", icon: GitBranch, desc: "按条件把流程分到不同分支" },
  { type: "approval", label: "人工审批", icon: ShieldQuestion, desc: "暂停流程，等待人工批准后再继续" },
  { type: "note", label: "注释说明", icon: StickyNote, desc: "画布上的说明文字，不参与执行" },
]
const META = Object.fromEntries(NODE_TYPES.map((t) => [t.type, t]))

// Per-node-type accent classes. Full literal strings so Tailwind keeps them.
const ACCENT = {
  tool: { badge: "bg-node-tool/10 text-node-tool", bar: "bg-node-tool" },
  analyze: { badge: "bg-node-analyze/10 text-node-analyze", bar: "bg-node-analyze" },
  agent: { badge: "bg-node-agent/10 text-node-agent", bar: "bg-node-agent" },
  condition: { badge: "bg-node-condition/10 text-node-condition", bar: "bg-node-condition" },
  approval: { badge: "bg-node-approval/10 text-node-approval", bar: "bg-node-approval" },
  note: { badge: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40" },
}
const accentOf = (k) => ACCENT[k] || { badge: "bg-primary/10 text-primary", bar: "bg-primary" }

// First clause of a tool's Chinese description → a short, natural canvas label.
// e.g. "查询 DLP 事件。支持 NocoDB where…" → "查询 DLP 事件".
// Hard-capped so a long first clause can't blow up node cards / select rows.
function toolLabelOf(desc, name) {
  if (!desc) return name
  const seg = desc.split(/[。:：\n（(,，;；]/)[0].trim()
  if (!seg) return name
  return seg.length > 18 ? seg.slice(0, 17) + "…" : seg
}

// ── tool params: JSONC skeleton ──────────────────────────────────────────────
// Typed default for a param the user hasn't filled yet (schema carries no
// `default`, so we infer: array→[], integer→「默认 N」from desc else 0, else "").
function defaultForProp(prop) {
  if (prop?.type === "array") return []
  if (prop?.type === "integer") {
    const m = /默认\s*(\d+)/.exec(prop?.description || "")
    return m ? Number(m[1]) : 0
  }
  return ""
}

// A commented (JSONC) skeleton: every param key, existing value or a typed
// default, each line trailed by `// [必填，]description`. The user only fills values.
function genParamSkeleton(tool, params = {}) {
  const props = tool?.properties || {}
  const required = new Set(tool?.required || [])
  const keys = Object.keys(props)
  if (!keys.length) {
    return params && Object.keys(params).length ? JSON.stringify(params, null, 2) : "{}"
  }
  const lines = keys.map((k, i) => {
    const p = props[k]
    const val = params && k in params ? params[k] : defaultForProp(p)
    const comma = i < keys.length - 1 ? "," : ""
    const note = `${required.has(k) ? "必填，" : ""}${p?.description || ""}`.trim()
    return `  ${JSON.stringify(k)}: ${JSON.stringify(val)}${comma}${note ? `  // ${note}` : ""}`
  })
  return `{\n${lines.join("\n")}\n}`
}

// Strip `//` line and `/* */` block comments, respecting string literals so a
// "http://…" value survives, before JSON.parse.
function stripJsonComments(s) {
  let out = ""
  let inStr = false
  let quote = ""
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const n = s[i + 1]
    if (inStr) {
      out += c
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === quote) inStr = false
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      out += c
      continue
    }
    if (c === "/" && n === "/") {
      while (i < s.length && s[i] !== "\n") i++
      out += "\n"
      continue
    }
    if (c === "/" && n === "*") {
      i += 2
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++
      i += 1
      continue
    }
    out += c
  }
  return out
}

// JSONC skeleton editor for a tool node's params. Keyed by tool at the call site
// so selecting/switching a tool re-scaffolds. Live-validates; never writes a
// dirty value on parse error.
function ToolParamsEditor({ tool, value, readOnly, onChange }) {
  const [text, setText] = useState(() => genParamSkeleton(tool, value || {}))
  const [error, setError] = useState(null)

  const apply = (t) => {
    setText(t)
    if (!t.trim()) {
      setError(null)
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(stripJsonComments(t))
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("参数必须是一个 JSON 对象")
        return
      }
      setError(null)
      onChange(Object.keys(parsed).length ? parsed : undefined)
    } catch (e) {
      setError(`JSON 格式有误：${e.message}`)
    }
  }

  const regenerate = () => {
    let current = value || {}
    try {
      const parsed = JSON.parse(stripJsonComments(text))
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed
    } catch {
      /* keep last good value */
    }
    setText(genParamSkeleton(tool, current))
    setError(null)
    onChange(Object.keys(current).length ? current : undefined)
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>参数</FieldLabel>
      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1">
          <span className="font-mono text-[11px] text-muted-foreground">JSON</span>
          {readOnly ? null : (
            <Button type="button" size="xs" variant="ghost" onClick={regenerate}>
              <RefreshCw data-icon="inline-start" />
              重新生成骨架
            </Button>
          )}
        </div>
        <Textarea
          rows={Math.min(24, Math.max(8, text.split("\n").length + 1))}
          className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
          spellCheck={false}
          value={text}
          disabled={readOnly}
          aria-invalid={error ? true : undefined}
          onChange={(e) => apply(e.target.value)}
        />
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <FieldDescription>已自动生成骨架；注释（//）仅作说明、保存时忽略，填好值即可。</FieldDescription>
      )}
    </Field>
  )
}

// `{ value: "steps.<name>", label }` for every node except `excludeId`,
// disambiguating duplicate labels by falling back to the node id.
function buildNodeRefs(nodes, excludeId) {
  const seen = new Set()
  const out = []
  for (const n of nodes) {
    if (n.id === excludeId) continue
    const name = n.data?.label || n.id
    let ref = `steps.${name}`
    if (seen.has(ref)) ref = `steps.${n.id}`
    seen.add(ref)
    out.push({ value: ref, label: name })
  }
  return out
}

// ── agent tools allow-list ───────────────────────────────────────────────────
// Checkbox list of tools for an agent node's allow-list.
function ToolPicker({ tools, selected, readOnly, onChange }) {
  const set = new Set(selected)
  const toggle = (name) => {
    const next = new Set(set)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange([...next])
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="font-normal">{set.size} 已选</Badge>
        {readOnly ? null : (
          <div className="flex gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange(tools.map((t) => t.name))}>
              全选
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange([])}>
              清空
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="h-80 rounded-md border">
        {tools.map((t) => (
          <div
            key={t.name}
            onClick={() => !readOnly && toggle(t.name)}
            className="flex cursor-pointer items-start gap-2 border-b px-2 py-1.5 last:border-b-0 hover:bg-muted/50"
          >
            <Checkbox checked={set.has(t.name)} className="pointer-events-none mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <span className="truncate">{toolLabelOf(t.description, t.name)}</span>
                {t.side_effect ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">写操作</Badge>
                ) : null}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{t.name}</span>
            </span>
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}

// ── condition / edge `when` ──────────────────────────────────────────────────
// Pre-filled template `{{ steps.<ref> }} 包含 "值"` (DSL string, not JSON).
function templateFor(srcRef) {
  return `{{ steps.${srcRef || "节点名"} }} 包含 "值"`
}

// Edits a condition / edge-`when` DSL string. Condition nodes auto-prefill a
// template; edges from a condition node get a 成立/不成立 toggle; everything
// else is a mono input with a 「插入模板」button + clickable reference chips.
function ConditionField({ value, onChange, nodeRefs = [], readOnly, autofill, srcRef, isBranch }) {
  // One-time template prefill for an empty condition node (component is keyed by
  // node.id at the call site, so this fires once per node).
  useEffect(() => {
    if (autofill && !value) onChange(templateFor(srcRef))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isBranch) {
    const branch = value.includes('"true"') ? "true" : value.includes('"false"') ? "false" : ""
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        value={branch}
        disabled={readOnly}
        onValueChange={(v) => v && onChange(`{{ steps.${srcRef} }} 等于 "${v}"`)}
      >
        <ToggleGroupItem value="true">成立</ToggleGroupItem>
        <ToggleGroupItem value="false">不成立</ToggleGroupItem>
      </ToggleGroup>
    )
  }

  // Swap the existing {{ steps.… }} reference (or insert a fresh template).
  const insertRef = (refValue) => {
    const token = `{{ ${refValue} }}`
    const cur = value || ""
    onChange(
      /\{\{\s*steps\.[^}]*\}\}/.test(cur)
        ? cur.replace(/\{\{\s*steps\.[^}]*\}\}/, token)
        : `${token} 包含 "值"`,
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupInput
          className="font-mono text-xs"
          value={value || ""}
          placeholder={templateFor(srcRef)}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
        {readOnly || value ? null : (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs" onClick={() => onChange(templateFor(srcRef))}>
              插入模板
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {!readOnly && nodeRefs.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">引用：</span>
          {nodeRefs.map((r) => (
            <Badge
              key={r.value}
              variant="secondary"
              className="cursor-pointer text-[11px] font-normal hover:bg-secondary/70"
              onClick={() => insertRef(r.value)}
            >
              {r.label}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const STATUS_RING = {
  succeeded: "ring-2 ring-primary",
  failed: "ring-2 ring-destructive",
  running: "ring-2 ring-ring",
  waiting: "ring-2 ring-ring",
  skipped: "opacity-50",
}
// Status corner dot (clearer than the ring alone for at-a-glance run state).
const STATUS_DOT = {
  succeeded: "bg-primary",
  failed: "bg-destructive",
  running: "bg-ring animate-pulse",
  waiting: "bg-ring",
}

// approvalNodeSummary names the configured notify channels so the canvas tells
// at a glance how an approval will reach people (e.g. "审批通知：邮件 · 钉钉").
function approvalNodeSummary(data) {
  const channels = data.notifyChannels?.length
    ? data.notifyChannels
    : data.notify
      ? ["email"]
      : []
  if (!channels.length) return "未配置通知渠道"
  const labels = { email: "邮件", dingtalk: "钉钉", appia: "Appia" }
  return "审批通知：" + channels.map((c) => labels[c] || c).join(" · ")
}

// dispatch_workflow_runs spawns a sub-workflow per record — surface the target
// workflow name on the canvas so the "calls another workflow" relationship is
// explicit rather than buried in params.
const isDispatchNode = (data) =>
  data.kind === "tool" && data.tool === "dispatch_workflow_runs"

// toolNodeSummary picks the secondary line of a tool node: the friendly label
// when the title is still generic, otherwise the raw tool name (mono) — never
// the same text the title already shows.
function toolNodeSummary(data) {
  if (isDispatchNode(data)) {
    const wf = data.params?.workflow
    return { text: wf ? `▶ 运行：${wf}` : "▶ 运行子工作流", mono: false }
  }
  const friendly = data.toolLabel || ""
  if (friendly && data.label !== friendly) return { text: friendly, mono: false }
  if (data.tool) return { text: data.tool, mono: true }
  return null
}

// ── custom node ─────────────────────────────────────────────────────────────
function WfNode({ data, selected }) {
  const meta = META[data.kind] || META.tool
  // A sub-workflow dispatch reads as its own kind of step: a distinct icon +
  // accent so it stands out from ordinary tool calls.
  const dispatch = isDispatchNode(data)
  // Display-only Appia listener trigger (injected from the subscription
  // registry, never part of the saved definition): dashed card, source-only
  // handle, primary accent.
  const trigger = data.kind === "trigger"
  const Icon = trigger ? Rss : dispatch ? Workflow : meta.icon
  const accent = dispatch ? ACCENT.agent : accentOf(data.kind)
  // Note nodes render as a borderless sticky annotation: full multi-line text,
  // no connection handles, no status overlay — pure canvas documentation.
  if (data.kind === "note") {
    return (
      <div
        className={cn(
          "w-[260px] rounded-lg border border-dashed bg-muted/50 px-3 py-2.5",
          selected && "ring-2 ring-ring",
        )}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <StickyNote className="size-3.5 shrink-0" />
          <span className="text-[11px] font-medium">{data.label || "注释"}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
          {data.text || "（点击节点编辑说明文字）"}
        </p>
      </div>
    )
  }
  const toolSummary = data.kind === "tool" ? toolNodeSummary(data) : null
  const summary = trigger
    ? data.text || "命中订阅的消息触发本工作流"
    : toolSummary?.text ||
      (data.kind === "approval" && approvalNodeSummary(data)) ||
      data.condition ||
      (data.prompt ? data.prompt.slice(0, 40) : "") ||
      meta.desc
  // Truncated text gets a native tooltip with the full title + tool name.
  const hoverTitle = [
    data.label,
    data.kind === "tool" ? data.tool : "",
    trigger ? `${data.text || ""}\n监听触发来自订阅注册中心，在「管理」或服务集成页编辑` : "",
    dispatch && data.params?.workflow ? `调用子工作流：${data.params.workflow}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  return (
    <div
      title={hoverTitle}
      className={cn(
        "relative w-[200px] overflow-hidden rounded-lg border bg-card py-2 pl-4 pr-3 shadow-sm transition-shadow hover:shadow-md",
        trigger && "border-dashed",
        selected && "ring-2 ring-ring",
        data.status && STATUS_RING[data.status],
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", accent.bar)} />
      {data.status && STATUS_DOT[data.status] ? (
        <span className={cn("absolute right-2 top-2 size-2 rounded-full", STATUS_DOT[data.status])} />
      ) : null}
      {trigger ? null : (
        <Handle type="target" position={Position.Left} className="!size-2.5 !bg-muted-foreground" />
      )}
      <div className="flex items-center gap-2">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", accent.badge)}>
          <Icon className="size-4" />
        </span>
        <span className="truncate text-sm font-medium">{data.label}</span>
        {trigger ? (
          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
            触发
          </Badge>
        ) : null}
      </div>
      {summary ? (
        <p className={cn("mt-1 truncate text-[11px] text-muted-foreground", toolSummary?.mono && "font-mono")}>
          {summary}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!size-2.5 !bg-muted-foreground" />
    </div>
  )
}

const nodeTypes = { wf: WfNode }

// ── graph <-> React Flow conversion ─────────────────────────────────────────
function toRF(graph) {
  const gnodes = graph?.nodes || []
  const gedges = graph?.edges || []
  const needLayout = gnodes.some((n) => !n.position || (n.position.x === 0 && n.position.y === 0))
  const pos = needLayout ? autoLayout(gnodes, gedges) : {}
  const nodes = gnodes.map((n) => ({
    id: n.id,
    type: "wf",
    position: n.position && !needLayout ? n.position : pos[n.id] || { x: 0, y: 0 },
    data: {
      kind: n.type || (n.tool ? "tool" : "tool"),
      label: n.name || n.tool || n.id,
      tool: n.tool || "",
      params: n.params,
      prompt: n.prompt || "",
      input: n.input || "",
      model: n.model || "",
      tools: n.tools || [],
      // trigger 展示节点携带的订阅清单（只读展示；一个工作流可监听多个房间）。
      subs: n.subs || undefined,
      maxIterations: n.max_iterations || 0,
      engine: n.engine || "",
      effort: n.effort || "",
      notify: n.notify || "",
      notifyChannels: n.notify_channels || [],
      appiaCompany: n.appia_company || "",
      appiaRoomId: n.appia_room_id || "",
      outcome: n.outcome || "",
      condition: n.condition || "",
      text: n.text || "",
    },
  }))
  const edges = gedges.map((e, i) => ({
    id: `e${i}_${e.from}_${e.to}`,
    source: e.from,
    target: e.to,
    label: e.when || undefined,
    data: { when: e.when || "" },
    markerEnd: { type: "arrowclosed" },
  }))
  return { nodes, edges }
}

function toGraph(meta, rfNodes, rfEdges) {
  // Trigger nodes are display-only mirrors of the Appia subscription registry
  // (injected by WorkflowVizModule) — a definition must never persist them.
  const triggerIds = new Set(rfNodes.filter((n) => n.data?.kind === "trigger").map((n) => n.id))
  rfNodes = rfNodes.filter((n) => !triggerIds.has(n.id))
  rfEdges = rfEdges.filter((e) => !triggerIds.has(e.source) && !triggerIds.has(e.target))
  return {
    name: meta.name,
    default_model: meta.defaultModel || undefined,
    schedule: meta.schedule || undefined,
    // Per-run `budget` has no node on the graph, so preserve it verbatim or a
    // Save would silently drop it. (The realtime Appia trigger renders as a
    // display-only node, filtered out above — the binding lives in the
    // subscription registry, not the definition.)
    budget: meta.budget || undefined,
    nodes: rfNodes.map((n) => {
      const d = n.data || {}
      const out = {
        id: n.id,
        type: d.kind,
        name: d.label || undefined,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      }
      if (d.kind === "tool") {
        out.tool = d.tool
        if (d.params) out.params = d.params
      }
      if (d.kind === "analyze" || d.kind === "agent") {
        out.prompt = d.prompt
        if (d.input) out.input = d.input
        if (d.model) out.model = d.model
        if (d.effort) out.effort = d.effort
      }
      if (d.kind === "agent") {
        if (d.engine) out.engine = d.engine
        // Both engines take the same registry tool names. For the pi engine
        // an empty list means the backend's read-only defaults; listed tools
        // are added on top (this is how an outreach node gets send_appia).
        // Dropping the list on an engine switch silently disarmed 工单进度追踪
        // on 2026-09-11 — never discard it here.
        out.tools = d.tools?.length ? d.tools : undefined
        if (d.maxIterations) out.max_iterations = d.maxIterations
      }
      if (d.kind === "approval") {
        // The approval card body IS this prompt (interpolated by the engine).
        // It was never written back here, so any editor save silently erased
        // it — 2026-09-11 封禁审批 cards went out with no target/reason twice.
        if (d.prompt) out.prompt = d.prompt
        if (d.notify) out.notify = d.notify
        if (d.notifyChannels?.length) out.notify_channels = d.notifyChannels
        if (d.appiaCompany) out.appia_company = d.appiaCompany
        if (d.appiaRoomId) out.appia_room_id = d.appiaRoomId
        if (d.outcome) out.outcome = d.outcome
      }
      if (d.kind === "condition") out.condition = d.condition
      if (d.kind === "note") out.text = d.text || ""
      return out
    }),
    edges: rfEdges.map((e) => ({
      from: e.source,
      to: e.target,
      when: e.data?.when || undefined,
    })),
  }
}

// ── editor ──────────────────────────────────────────────────────────────────
export function WorkflowEditor({
  graph,
  meta,
  tools = [],
  models = [],
  run,
  onSave,
  onExit,
  onEdit,
  readOnly = false,
  heightClass = "h-[560px]",
  saving,
  title,
  subtitle,
  actions,
  trailingActions,
  collapsed,
}) {
  return (
    <ReactFlowProvider>
      <EditorInner
        graph={graph}
        meta={meta}
        tools={tools}
        models={models}
        run={run}
        onSave={onSave}
        onExit={onExit}
        onEdit={onEdit}
        readOnly={readOnly}
        heightClass={heightClass}
        saving={saving}
        title={title}
        subtitle={subtitle}
        actions={actions}
        trailingActions={trailingActions}
        collapsed={collapsed}
      />
    </ReactFlowProvider>
  )
}

function EditorInner({ graph, meta, tools, models, run, onSave, onExit, onEdit, readOnly, heightClass, saving, title, subtitle, actions, trailingActions, collapsed }) {
  const initial = useMemo(() => toRF(graph), [graph])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [sel, setSel] = useState(null) // { kind:'node'|'edge', id }

  // tool name → { ...tool, label } with a short natural-language label.
  const toolMap = useMemo(() => {
    const m = {}
    for (const t of tools) m[t.name] = { ...t, label: toolLabelOf(t.description, t.name) }
    return m
  }, [tools])

  // Re-init when switching definitions.
  useEffect(() => {
    const rf = toRF(graph)
    setNodes(rf.nodes)
    setEdges(rf.edges)
    setSel(null)
  }, [graph, setNodes, setEdges])

  // Humanize tool nodes once the tool catalog loads: fill in a Chinese summary
  // and, if the node still carries a raw/generic name, upgrade its title too.
  useEffect(() => {
    if (!Object.keys(toolMap).length) return
    setNodes((ns) =>
      ns.map((n) => {
        if (n.data.kind !== "tool" || !n.data.tool) return n
        const t = toolMap[n.data.tool]
        if (!t) return n
        const generic = !n.data.label || n.data.label === n.data.tool || n.data.label === "工具调用" || n.data.label === "工具"
        return {
          ...n,
          data: { ...n.data, toolLabel: t.label, toolDesc: t.description, label: generic ? t.label : n.data.label },
        }
      }),
    )
  }, [toolMap, setNodes])

  // Overlay run status onto nodes (by node_id).
  useEffect(() => {
    const byNode = {}
    for (const s of run?.steps || []) {
      const nid = s.node_id || s.nodeId
      if (nid) byNode[nid] = s.status
    }
    setNodes((ns) =>
      ns.map((n) => ({ ...n, data: { ...n.data, status: byNode[n.id] || undefined } })),
    )
  }, [run, setNodes])

  const onConnect = useCallback(
    (c) => {
      if (readOnly) return
      setEdges((eds) => addEdge({ ...c, data: { when: "" }, markerEnd: { type: "arrowclosed" } }, eds))
    },
    [setEdges, readOnly],
  )

  function addNode(kind, presetTool = "") {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`
    const label =
      presetTool === "dispatch_workflow_runs" ? "运行子工作流" : META[kind]?.label || kind
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "wf",
        position: { x: 80 + ns.length * 24, y: 80 + ns.length * 24 },
        data: { kind, label, tool: presetTool, prompt: "", input: "", model: "", tools: [], condition: "", notify: "", notifyChannels: [], appiaCompany: "", appiaRoomId: "", outcome: "", text: "" },
      },
    ])
  }

  function patchNode(id, patch) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
  }
  function patchEdge(id, patch) {
    setEdges((es) =>
      es.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, ...patch }, label: patch.when || undefined } : e,
      ),
    )
  }
  function removeNode(id) {
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
    setSel(null)
  }
  function removeEdge(id) {
    setEdges((es) => es.filter((e) => e.id !== id))
    setSel(null)
  }
  function deleteSel() {
    if (!sel) return
    if (sel.kind === "node") removeNode(sel.id)
    else removeEdge(sel.id)
  }

  function handleSave() {
    onSave?.(toGraph(meta, nodes, edges))
  }

  const selNode = sel?.kind === "node" ? nodes.find((n) => n.id === sel.id) : null
  const selEdge = sel?.kind === "edge" ? edges.find((e) => e.id === sel.id) : null

  const edgeSrcNode = selEdge ? nodes.find((n) => n.id === selEdge.source) : null
  const edgeSrcIsCondition = edgeSrcNode?.data?.kind === "condition"
  const edgeSrcRef = edgeSrcNode ? edgeSrcNode.data?.label || edgeSrcNode.id : ""
  const edgeNodeRefs = buildNodeRefs(nodes)

  return (
    <div className={cn("flex flex-col overflow-hidden", collapsed ? "h-auto" : heightClass)}>
      <div className="flex items-center gap-2 border-b bg-background px-2 py-1.5">
        {title ? (
          <div className="mr-1 flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold leading-tight">{title}</span>
            {subtitle ? (
              <span className="truncate font-mono text-[11px] leading-tight text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
          </div>
        ) : null}
        {readOnly ? (
          <span className="text-xs text-muted-foreground">只读预览</span>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus data-icon="inline-start" />
                  添加节点
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {NODE_TYPES.map((t) => (
                  <DropdownMenuItem key={t.type} onSelect={() => addNode(t.type)}>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", accentOf(t.type).badge)}>
                      <t.icon className="size-3.5" />
                    </span>
                    <span>{t.label}</span>
                    <HoverCard openDelay={120} closeDelay={60}>
                      <HoverCardTrigger asChild>
                        <span
                          className="ml-auto flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Info className="size-3.5" />
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" align="start" className="w-64">
                        <div className="flex items-start gap-2">
                          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", accentOf(t.type).badge)}>
                            <t.icon className="size-4" />
                          </span>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium">{t.label}</span>
                            <span className="text-xs text-muted-foreground">{t.desc}</span>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </DropdownMenuItem>
                ))}
                {/* Sub-workflow dispatch: a tool node preset to dispatch_workflow_runs,
                    surfaced as its own palette item so "calls another workflow" is
                    a first-class step. */}
                <DropdownMenuItem
                  key="subflow"
                  onSelect={() => addNode("tool", "dispatch_workflow_runs")}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded", ACCENT.agent.badge)}>
                    <Workflow className="size-3.5" />
                  </span>
                  <span>运行子工作流</span>
                  <HoverCard openDelay={120} closeDelay={60}>
                    <HoverCardTrigger asChild>
                      <span
                        className="ml-auto flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Info className="size-3.5" />
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent side="right" align="start" className="w-64">
                      <div className="flex items-start gap-2">
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", ACCENT.agent.badge)}>
                          <Workflow className="size-4" />
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">运行子工作流</span>
                          <span className="text-xs text-muted-foreground">
                            批量启动另一个工作流：对上游查询结果中的每条记录各起一个运行（如调度器为每条告警启动一次研判）。在参数里选择目标工作流。
                          </span>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {sel ? (
              <Button size="sm" variant="destructive" onClick={deleteSel}>
                <Trash2 data-icon="inline-start" />
                删除所选
              </Button>
            ) : null}
          </>
        )}
        <Badge variant="secondary" className="ml-auto font-normal">
          {nodes.length} 节点 · {edges.length} 连线
        </Badge>
        <Separator orientation="vertical" className="!h-5" />
        {actions}
        {readOnly ? (
          onEdit ? (
            <Button size="sm" onClick={onEdit}>
              <Pencil data-icon="inline-start" />
              修改
            </Button>
          ) : null
        ) : (
          <>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save data-icon="inline-start" />
              保存
            </Button>
            {onExit ? (
              <Button size="sm" variant="ghost" onClick={onExit}>
                <X data-icon="inline-start" />
                退出
              </Button>
            ) : null}
          </>
        )}
        {trailingActions}
      </div>

      <div className={cn("relative flex-1", collapsed && "hidden")}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSel({ kind: "node", id: n.id })}
          onEdgeClick={(_, e) => setSel({ kind: "edge", id: e.id })}
          onPaneClick={() => setSel(null)}
          onNodesDelete={() => setSel(null)}
          onEdgesDelete={() => setSel(null)}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          edgesFocusable={!readOnly}
          deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable className="!bg-muted" />
        </ReactFlow>
      </div>

      {/* node config — a roomy centered modal (was a right-side sheet) so
          prompts / params / tool lists get real editing space */}
      <Dialog open={!!selNode} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-3xl">
          {selNode ? (
            <NodeConfig
              key={selNode.id}
              node={selNode}
              tools={tools}
              models={models}
              nodeRefs={buildNodeRefs(nodes, selNode.id)}
              readOnly={readOnly}
              onChange={(patch) => patchNode(selNode.id, patch)}
              onDelete={() => removeNode(selNode.id)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* edge config */}
      <Sheet open={!!selEdge} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>连线走向条件</SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {selEdge?.source} → {selEdge?.target}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <Field>
              <FieldLabel>满足什么条件才走这条线</FieldLabel>
              <ConditionField
                key={selEdge?.id}
                value={selEdge?.data?.when || ""}
                nodeRefs={edgeNodeRefs}
                readOnly={readOnly}
                srcRef={edgeSrcRef}
                isBranch={edgeSrcIsCondition}
                onChange={(v) => patchEdge(selEdge.id, { when: v })}
              />
              <FieldDescription>
                {edgeSrcIsCondition
                  ? "上游是条件分流节点，选择走「成立 / 不成立」分支。"
                  : "留空表示无条件通过；可用运算符 等于 / 不等于 / 包含 / 匹配。"}
              </FieldDescription>
            </Field>
            {readOnly ? null : (
              <Button
                variant="destructive"
                size="sm"
                className="mt-4 w-full"
                onClick={() => removeEdge(selEdge.id)}
              >
                <Trash2 data-icon="inline-start" />
                删除这条连线
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// TriggerConfig — 触发节点的只读面板。监听绑定不在工作流里配置：一个工作流可能
// 同时监听多个房间（如工单追踪为每个责任人 DM 动态注册订阅），绑定属于订阅注册
// 中心，由服务集成页（操作员手工绑定）或工作流运行时（register_appia_listener）
// 管理，画布上只做展示。
function TriggerConfig({ node }) {
  const d = node.data
  const subs = Array.isArray(d.subs) ? d.subs : []
  const accent = accentOf("trigger")
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", accent.badge)}>
            <Rss className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{d.label || "Appia 消息监听"}</DialogTitle>
            <DialogDescription>
              {subs.length} 条监听绑定 · {subs.filter((s) => s.enabled !== false).length} 启用
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      {subs.length ? (
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
          {subs.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs">
                  {s.company} · {s.room_id}
                </span>
                {s.enabled === false ? (
                  <Badge variant="outline" className="text-[10px]">
                    已停用
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    启用
                  </Badge>
                )}
                {s.context && Object.keys(s.context).length > 0 ? (
                  <Badge variant="outline" className="text-[10px]">
                    工作流注册
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(s.keywords || []).length > 0 ? (
                  (s.keywords || []).map((k) => (
                    <Badge key={k} variant="secondary" className="text-[10px]">
                      {k}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[11px] text-muted-foreground">无关键词（每条消息都触发）</span>
                )}
                {s.description ? (
                  <span className="truncate text-[11px] text-muted-foreground">· {s.description}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        一个工作流可以同时监听多个房间（如按工单动态注册的责任人 DM），所以房间与关键词不在
        工作流里配置：操作员手工绑定请到「服务集成」页；工作流运行时用
        register_appia_listener / unregister_appia_listener 自行注册与切换。带「工作流注册」
        标记的绑定携带上下文（如工单 ID），请勿手工改动。
      </p>
    </>
  )
}

// Sentinel for the node model picker's "follow the default" row (a Radix
// Select item cannot carry an empty value).
const NODE_DEFAULT_MODEL = "__default__"
// Thinking-depth picker sentinel + levels (mirrors modules/assistant EFFORTS).
const NODE_DEFAULT_EFFORT = "__default_effort__"
const EFFORT_LEVELS = [
  { value: "low", label: "低强度" },
  { value: "medium", label: "中强度" },
  { value: "high", label: "高强度" },
  { value: "max", label: "最大强度" },
]

function NodeConfig({ node, tools, models, nodeRefs = [], readOnly, onChange, onDelete }) {
  const d = node.data
  const kind = d.kind
  const meta = META[kind]
  const Icon = meta?.icon
  const accent = accentOf(kind)
  const selTool = tools.find((t) => t.name === d.tool)
  // Appia listener trigger: display-only — bindings live in the subscription
  // registry, not the definition.
  if (kind === "trigger") {
    return <TriggerConfig node={node} />
  }
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", accent.badge)}>
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{meta?.label || kind} 节点</DialogTitle>
            <DialogDescription className="font-mono text-xs">{node.id}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>名称</FieldLabel>
          <Input value={d.label || ""} disabled={readOnly} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <FieldSeparator>配置</FieldSeparator>

        {kind === "tool" ? (
          <>
            <Field>
              <FieldLabel>工具</FieldLabel>
              <Select
                value={d.tool || ""}
                disabled={readOnly}
                onValueChange={(v) => {
                  // Prune params that don't belong to the newly chosen tool.
                  const next = tools.find((t) => t.name === v)
                  const allowed = new Set(Object.keys(next?.properties || {}))
                  const pruned = {}
                  for (const [k, val] of Object.entries(d.params || {})) {
                    if (allowed.has(k)) pruned[k] = val
                  }
                  // Sync the canvas card immediately: refresh the cached
                  // friendly label/desc, and upgrade a still-generic title
                  // (default kind label, raw tool name, or the previous
                  // tool's auto label) to the new tool's label.
                  const nextLabel = next ? toolLabelOf(next.description, next.name) : ""
                  const generic =
                    !d.label || d.label === "工具调用" || d.label === d.tool || d.label === d.toolLabel
                  onChange({
                    tool: v,
                    params: Object.keys(pruned).length ? pruned : undefined,
                    toolLabel: nextLabel,
                    toolDesc: next?.description || "",
                    ...(generic && nextLabel ? { label: nextLabel } : {}),
                  })
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  {/* Custom single-line display — the default would clone the
                      item's two-line block into the 32px trigger. */}
                  <SelectValue placeholder="选择要调用的工具">
                    {selTool ? (
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{toolLabelOf(selTool.description, selTool.name)}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{selTool.name}</span>
                      </span>
                    ) : (
                      d.tool
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[480px]">
                  {tools.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{toolLabelOf(t.description, t.name)}</span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{t.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selTool?.description ? (
                <FieldDescription>{selTool.description}</FieldDescription>
              ) : null}
            </Field>

            {selTool ? (
              <ToolParamsEditor
                key={d.tool}
                tool={selTool}
                value={d.params}
                readOnly={readOnly}
                onChange={(params) => onChange({ params })}
              />
            ) : null}
          </>
        ) : null}

        {kind === "analyze" || kind === "agent" ? (
          <>
            <Field>
              <FieldLabel>提示词</FieldLabel>
              <Textarea
                rows={10}
                placeholder="告诉模型要做什么，例如：判断以下告警的风险等级（高/中/低）"
                value={d.prompt || ""}
                disabled={readOnly}
                onChange={(e) => onChange({ prompt: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>输入内容</FieldLabel>
              <Textarea rows={4} value={d.input || ""} disabled={readOnly} onChange={(e) => onChange({ input: e.target.value })} />
              <FieldDescription>留空则自动使用上游节点的输出。可用 {`{{ steps.节点名 }}`} 引用某个节点的结果。</FieldDescription>
            </Field>
            {/* Every analyze/agent node — builtin loop AND engine:claude (the
                engine passes the row's model/base_url/api_key to agent-core) —
                may pin a registry model; empty = the workflow's default_model,
                else the registry's global default. */}
            <Field>
              <FieldLabel>模型</FieldLabel>
              <Select
                value={d.model || NODE_DEFAULT_MODEL}
                disabled={readOnly}
                onValueChange={(v) => onChange({ model: v === NODE_DEFAULT_MODEL ? "" : v })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="默认" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NODE_DEFAULT_MODEL}>默认（工作流默认 → 平台默认）</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                  {d.model && !models.some((m) => m.name === d.model) ? (
                    <SelectItem value={d.model}>{d.model}（未注册，运行时回退默认）</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </Field>
            {/* Thinking depth — the same four levels as the assistant composer.
                engine:claude forwards it to agent-core; the builtin loop maps
                high/max to an Anthropic thinking budget. Empty = 中强度. */}
            <Field>
              <FieldLabel>思考强度</FieldLabel>
              <Select
                value={d.effort || NODE_DEFAULT_EFFORT}
                disabled={readOnly}
                onValueChange={(v) => onChange({ effort: v === NODE_DEFAULT_EFFORT ? "" : v })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NODE_DEFAULT_EFFORT}>默认（中强度）</SelectItem>
                  {EFFORT_LEVELS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                低/中强度不请求扩展思考（由模型/网关默认决定，始终思考的模型如 GLM 会照常思考）；高/最大强度开启扩展思考，更慢更贵但研判更细。
              </FieldDescription>
            </Field>
          </>
        ) : null}

        {kind === "agent" ? (
          <>
            <Field>
              <FieldLabel>执行引擎</FieldLabel>
              <Select
                value={d.engine || "builtin"}
                disabled={readOnly}
                onValueChange={(v) => onChange({ engine: v === "builtin" ? "" : v })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="builtin">内置循环（按选定工具多轮调用）</SelectItem>
                  <SelectItem value="claude">pi Agent（容器内自主研判，只读工具）</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {d.engine === "claude"
                  ? "任务整体交给 agent-core 容器里的 pi agent:自主查询身份/天眼等只读数据后给出结论。无副作用能力,封禁/通知等仍用「工具」+「人工审批」节点。"
                  : "由工作流引擎驱动模型多轮调用下方勾选的工具,权限按发起人模块校验。"}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>允许使用的工具</FieldLabel>
              <ToolPicker
                tools={tools}
                selected={d.tools || []}
                readOnly={readOnly}
                onChange={(arr) => onChange({ tools: arr })}
              />
              <FieldDescription>
                {d.engine === "claude"
                  ? "pi Agent 默认只有只读查询工具；勾选的工具（如 send_appia / add_ticket_comment）会追加进去，外呼、改工单等副作用能力必须在此勾选。"
                  : "留空表示不限；勾选后智能体只能调用选中的工具。"}
              </FieldDescription>
            </Field>
          </>
        ) : null}

        {kind === "condition" ? (
          <Field>
            <FieldLabel>分流条件</FieldLabel>
            <ConditionField
              value={d.condition || ""}
              nodeRefs={nodeRefs}
              readOnly={readOnly}
              autofill
              onChange={(v) => onChange({ condition: v })}
            />
            <FieldDescription>
              已预填模板，点「引用」芯片换成真实节点名、再改比较值即可。运算符可用
              等于 / 不等于 / 包含 / 匹配。本节点输出 true（成立）/ false（不成立），
              从本节点拉出的连线可直接选「成立 / 不成立」。
            </FieldDescription>
          </Field>
        ) : null}

        {kind === "approval" ? (
          <ApprovalConfig d={d} readOnly={readOnly} onChange={onChange} />
        ) : null}

        {kind === "note" ? (
          <Field>
            <FieldLabel>说明文字</FieldLabel>
            <Textarea
              rows={10}
              placeholder="写给查看流程图的人，例如：本工作流每分钟自动触发…"
              value={d.text || ""}
              disabled={readOnly}
              onChange={(e) => onChange({ text: e.target.value })}
            />
            <FieldDescription>仅在画布上展示，不参与执行，也无需连线。</FieldDescription>
          </Field>
        ) : null}

        {readOnly ? null : (
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 data-icon="inline-start" />
              删除此节点
            </Button>
          </div>
        )}
      </FieldGroup>
    </>
  )
}

const APPROVAL_CHANNEL_OPTIONS = [
  { value: "email", label: "邮件", icon: Mail },
  { value: "dingtalk", label: "钉钉", icon: MessageSquare },
  { value: "appia", label: "Appia", icon: MessagesSquare },
]

// ApprovalConfig edits an approval node's notification routing: which channels
// carry the 允许/禁止 one-click links, plus the per-channel addressing (email
// recipients / Appia chatroom). DingTalk needs no addressing — it uses the
// robot webhook from系统设置.
function ApprovalConfig({ d, readOnly, onChange }) {
  // Back-compat: old definitions only carry an email in `notify`.
  const channels = d.notifyChannels?.length ? d.notifyChannels : d.notify ? ["email"] : []
  return (
    <>
      <Alert>
        <Info />
        <AlertDescription>
          流程到此暂停。通知中附「✅ 允许 / ❌ 禁止」链接，审批人点击即可完成审批：
          批准后继续执行后续步骤，拒绝则取消本次运行。
        </AlertDescription>
      </Alert>
      <Field>
        <FieldLabel>通知渠道</FieldLabel>
        <ToggleGroup
          type="multiple"
          variant="outline"
          className="w-full"
          value={channels}
          disabled={readOnly}
          onValueChange={(arr) => onChange({ notifyChannels: arr })}
        >
          {APPROVAL_CHANNEL_OPTIONS.map(({ value, label, icon: ChannelIcon }) => (
            <ToggleGroupItem key={value} value={value} className="flex-1">
              <ChannelIcon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          {channels.length
            ? "可多选；钉钉走系统设置里的群机器人，无需额外配置。"
            : "尚未选择渠道——暂停时不会发送任何通知，只能登录平台手动审批。"}
        </FieldDescription>
      </Field>
      {channels.includes("email") ? (
        <Field data-invalid={!d.notify || undefined}>
          <FieldLabel>审批人邮箱</FieldLabel>
          <Input
            placeholder="security@example.com"
            value={d.notify || ""}
            disabled={readOnly}
            aria-invalid={!d.notify || undefined}
            onChange={(e) => onChange({ notify: e.target.value })}
          />
          <FieldDescription>多个邮箱用英文逗号分隔。</FieldDescription>
        </Field>
      ) : null}
      {channels.includes("appia") ? (
        <>
          <Field data-invalid={!d.appiaCompany || undefined}>
            <FieldLabel>Appia 发送账号</FieldLabel>
            <Select
              value={d.appiaCompany || ""}
              disabled={readOnly}
              onValueChange={(v) => onChange({ appiaCompany: v })}
            >
              <SelectTrigger size="sm" className="w-full" aria-invalid={!d.appiaCompany || undefined}>
                <SelectValue placeholder="选择公司账号" />
              </SelectTrigger>
              <SelectContent>
                {APPIA_COMPANIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>对应系统设置「Appia 聊天室」里按公司配置的账号。</FieldDescription>
          </Field>
          <Field data-invalid={!d.appiaRoomId || undefined}>
            <FieldLabel>Appia 聊天室 ID</FieldLabel>
            <Input
              placeholder="如 GENERAL 或房间随机 ID"
              value={d.appiaRoomId || ""}
              disabled={readOnly}
              aria-invalid={!d.appiaRoomId || undefined}
              onChange={(e) => onChange({ appiaRoomId: e.target.value })}
            />
          </Field>
        </>
      ) : null}
      <Field data-invalid={!d.prompt || undefined}>
        <FieldLabel>审批说明（卡片正文）</FieldLabel>
        <Textarea
          rows={5}
          placeholder={"如：🚫 拟封禁：{{ steps.triage.封禁对象 }}（{{ steps.triage.封禁类型 }}）\n封禁原因：{{ steps.triage.封禁原因 }}\n研判结论：{{ steps.triage.研判结论 }}"}
          value={d.prompt || ""}
          disabled={readOnly}
          aria-invalid={!d.prompt || undefined}
          onChange={(e) => onChange({ prompt: e.target.value })}
        />
        <FieldDescription>
          审批人在 Appia / 邮件 / 平台铃铛里看到的正文，支持 {"{{ steps.<id>.<字段> }}"} / {"{{ input.x }}"} 插值。
          留空时卡片只显示触发输入（调度派发的运行只有 record_id），审批人看不到要处置的对象。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>审批回执模板（可选）</FieldLabel>
        <Textarea
          rows={2}
          placeholder="如 {{ steps.wait.summary }} —— 运行结束后回写到每个收到审批通知的渠道"
          value={d.outcome || ""}
          disabled={readOnly}
          onChange={(e) => onChange({ outcome: e.target.value })}
        />
        <FieldDescription>
          支持 {"{{ steps.<id>.<字段> }}"} / {"{{ input.x }}"} 插值；留空则回执为通用的「已批准 / 已拒绝」。
        </FieldDescription>
      </Field>
    </>
  )
}

export default WorkflowEditor
