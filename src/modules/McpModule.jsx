// MCP 能力 — 三个视图:
// 1.「对外服务」: 操作员自行组装的对外 MCP 组 —— 每组挑选一个工具子集,拥有独立
//    端点 /mcp/tools/{id} 与平台生成的访问密钥(仅生成时展示一次,只存哈希,
//    支持重置);接入配置弹窗上方是 MCP 配置文件、下方是密钥区。
// 2.「工具目录」: 全部可对外工具,按来源(飞连/天眼/天擎/威胁情报/…)分组浏览。
// 3.「接入管理」: 系统内置 MCP 服务 + 已接入的第三方外部 MCP(原有 CRUD)。

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePlugin } from "@/platform"
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  ChevronDown,
  Server,
  Network,
  Plug,
  Globe,
  Wrench,
  Search,
  ShieldCheck,
  KeyRound,
  Radio,
  Boxes,
  CheckCircle2,
  XCircle,
  Cable,
  Copy,
  Eye,
  Shield,
  Radar,
  Ticket,
  Bell,
  MessagesSquare,
  BookOpen,
  Database,
  Send,
  RotateCcw,
  TriangleAlert,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ── 工具来源展示顺序与图标 ─────────────────────────────────────────────────────

const SOURCE_ORDER = ["飞连", "天眼", "天擎", "威胁情报", "探针", "工单", "通知", "Appia", "知识库", "数据表", "本地"]

// 飞连的纸飞机机头朝左上 — lucide 的 Send 机头朝右上,水平镜像它。
function FeilianIcon({ className, ...props }) {
  return <Send {...props} className={cn("-scale-x-100", className)} />
}

const SOURCE_ICON = {
  飞连: FeilianIcon,
  天眼: Eye,
  天擎: Shield,
  威胁情报: Radar,
  探针: Network,
  工单: Ticket,
  通知: Bell,
  Appia: MessagesSquare,
  知识库: BookOpen,
  数据表: Database,
  本地: Boxes,
}

// currentRegistrySources is refreshed by McpModule on every render so the
// helpers below (used deep inside memoized sub-components) see the plugin
// registry without threading a prop through every level.
let currentRegistrySources = []

function sourceIcon(source, registrySources = currentRegistrySources) {
  const fromPlugin = (registrySources || []).find((s) => s.label === source)
  return fromPlugin?.icon || SOURCE_ICON[source] || Boxes
}

// sourceOrder merges plugin-declared sources (by their `order`) with the static
// core order so a new plugin's tools group correctly without editing this file.
function sourceOrder(registrySources) {
  const plugin = [...(registrySources || [])].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)).map((s) => s.label)
  return [...new Set([...plugin, ...SOURCE_ORDER])]
}

// 操作类型徽标 — 后端 catalog 的 op 字段(只读/新增/修改/删除/发送/执行)。
// 颜色即风险语义: 只读中性、新增绿、修改黄、发送灰、删除/执行红。
const OP_BADGE = {
  只读: { variant: "outline", icon: ShieldCheck },
  新增: { variant: "success", icon: Plus },
  修改: { variant: "warning", icon: Pencil },
  删除: { variant: "destructive", icon: Trash2 },
  发送: { variant: "secondary", icon: Send },
  执行: { variant: "destructive", icon: Zap },
}

function OpBadge({ tool }) {
  // 兼容缺 op 的旧后端响应:按 side_effect 回退到二分标识。
  const op = tool.op || (tool.side_effect ? "执行" : "只读")
  const meta = OP_BADGE[op] || OP_BADGE.执行
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant}>
      <Icon />
      {op}
    </Badge>
  )
}

// groupBySource → [ [source, tools[]] ] ordered by SOURCE_ORDER (unknown sources last).
function groupBySource(tools, registrySources = currentRegistrySources) {
  const order = sourceOrder(registrySources)
  const by = new Map()
  for (const t of tools) {
    const key = t.source || "本地"
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(t)
  }
  const known = order.filter((s) => by.has(s)).map((s) => [s, by.get(s)])
  const rest = [...by.keys()]
    .filter((s) => !order.includes(s))
    .sort()
    .map((s) => [s, by.get(s)])
  return [...known, ...rest]
}

const TRANSPORTS = [
  { value: "streamable-http", label: "Streamable HTTP" },
  { value: "sse", label: "SSE" },
]

const AUTH_TYPES = [
  { value: "none", label: "无" },
  { value: "api_key", label: "X-API-Key" },
  { value: "bearer", label: "Bearer Token" },
  { value: "header", label: "自定义 Header" },
]

const TRANSPORT_LABEL = {
  "streamable-http": "Streamable HTTP",
  sse: "SSE",
}

const AUTH_LABEL = {
  none: "免认证",
  api_key: "X-API-Key",
  bearer: "Bearer Token",
  header: "自定义 Header",
}

function statusBadge(s) {
  if (s.status === "ok")
    return (
      <Badge variant="success">
        <CheckCircle2 />
        已连接
      </Badge>
    )
  if (s.status === "disabled") return <Badge variant="outline">已停用</Badge>
  return (
    <Badge variant="destructive">
      <XCircle />
      连接失败
    </Badge>
  )
}

function formatTime(t) {
  if (!t) return ""
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString("zh-CN", { hour12: false })
}

// ── 主模块 ────────────────────────────────────────────────────────────────────

export function McpModule({ apiClient, setError }) {
  currentRegistrySources = usePlugin()?.registry?.sources || []
  const [servers, setServers] = useState([])
  const [groups, setGroups] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      apiClient.get("/api/v1/mcp/groups"),
      apiClient.get("/api/v1/mcp/groups/catalog"),
      apiClient.get("/api/v1/mcp/servers"),
    ])
    const [g, c, s] = results
    if (g.status === "fulfilled") setGroups(Array.isArray(g.value) ? g.value : [])
    if (c.status === "fulfilled") setCatalog(Array.isArray(c.value) ? c.value : [])
    if (s.status === "fulfilled") setServers(Array.isArray(s.value) ? s.value : [])
    const failed = results.find((r) => r.status === "rejected")
    if (failed) setError?.(failed.reason?.message || String(failed.reason))
    setLoading(false)
  }, [apiClient, setError])

  useEffect(() => {
    reload()
  }, [reload])

  const builtins = servers.filter((s) => s.kind === "builtin" && !s.outward)
  const externals = servers.filter((s) => s.kind === "external")

  const stats = useMemo(() => {
    const online = servers.filter((s) => s.status === "ok")
    return {
      groups: groups.length,
      tools: catalog.length,
      online: online.length,
      total: servers.length,
      external: externals.length,
    }
  }, [servers, groups.length, catalog.length, externals.length])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">MCP 能力</h2>
          <p className="text-sm text-muted-foreground">
            组装对外提供的 MCP 工具组，浏览按来源分类的工具目录，管理接入的第三方 MCP
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Globe} label="对外 MCP 组" value={stats.groups} />
        <StatTile icon={Wrench} label="可对外工具" value={stats.tools} />
        <StatTile icon={CheckCircle2} label="在线服务" value={`${stats.online}/${stats.total}`} />
        <StatTile icon={Plug} label="外部接入" value={stats.external} />
      </div>

      <Tabs defaultValue="catalog" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="catalog">工具目录</TabsTrigger>
          <TabsTrigger value="servers">接入管理</TabsTrigger>
          <TabsTrigger value="groups">对外服务</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogPanel catalog={catalog} loading={loading} />
        </TabsContent>

        <TabsContent value="servers">
          <ServersPanel
            apiClient={apiClient}
            setError={setError}
            builtins={builtins}
            externals={externals}
            loading={loading}
            onChanged={reload}
          />
        </TabsContent>

        <TabsContent value="groups">
          <GroupsPanel
            apiClient={apiClient}
            setError={setError}
            groups={groups}
            catalog={catalog}
            loading={loading}
            onChanged={reload}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Tab 1: 对外 MCP 组 ────────────────────────────────────────────────────────

function GroupsPanel({ apiClient, setError, groups, catalog, loading, onChanged }) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  // accessTarget = { group, token? } — token 仅在刚创建/刚重置时存在,展示一次。
  const [accessTarget, setAccessTarget] = useState(null)

  const sourceOf = useMemo(() => {
    const m = new Map()
    for (const t of catalog) m.set(t.name, t.source || "本地")
    return m
  }, [catalog])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null)
            setEditorOpen(true)
          }}
        >
          <Plus data-icon="inline-start" />
          新建 MCP 组
        </Button>
      </div>

      {loading && groups.length === 0 ? (
        <Card className={cardHover}>
          <CardContent className="flex justify-center py-8">
            <Spinner />
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>暂无对外 MCP 组</EmptyTitle>
            <EmptyDescription>
              点击「新建 MCP 组」，从工具目录中挑选要对外提供的工具，系统会生成独立端点与访问密钥。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            sourceOf={sourceOf}
            onAccess={() => setAccessTarget({ group: g })}
            onEdit={() => {
              setEditTarget(g)
              setEditorOpen(true)
            }}
            onDelete={async () => {
              try {
                await apiClient.delete(`/api/v1/mcp/groups/${g.id}`)
                toast.success("已删除")
                onChanged()
              } catch (err) {
                setError?.(err.message)
              }
            }}
            onToggle={async (enabled) => {
              try {
                await apiClient.patch(`/api/v1/mcp/groups/${g.id}`, {
                  description: g.description,
                  enabled,
                })
                toast.success(enabled ? "已启用" : "已停用")
                onChanged()
              } catch (err) {
                setError?.(err.message)
              }
            }}
          />
        ))
      )}

      <GroupEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        target={editTarget}
        catalog={catalog}
        apiClient={apiClient}
        setError={setError}
        onSaved={(created) => {
          onChanged()
          // 新建成功 → 直接打开接入配置,携带一次性密钥。
          if (created) setAccessTarget(created)
        }}
      />

      <AccessDialog
        open={!!accessTarget}
        onOpenChange={(o) => !o && setAccessTarget(null)}
        group={accessTarget?.group}
        freshToken={accessTarget?.token}
        apiClient={apiClient}
        setError={setError}
        onTokenReset={(token) => {
          setAccessTarget((t) => (t ? { ...t, token } : t))
          onChanged()
        }}
      />

    </div>
  )
}

function GroupCard({ group, sourceOf, onAccess, onEdit, onDelete, onToggle }) {
  const [open, setOpen] = useState(false)
  const bySource = useMemo(() => {
    const tools = (group.tools || []).map((name) => ({ name, source: sourceOf.get(name) || "本地" }))
    return groupBySource(tools)
  }, [group.tools, sourceOf])

  return (
    <Card className={cardHover}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Globe className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{group.name}</span>
              <Badge>对外提供</Badge>
              {group.enabled ? (
                <Badge variant="success">
                  <CheckCircle2 />
                  已启用
                </Badge>
              ) : (
                <Badge variant="outline">已停用</Badge>
              )}
            </div>
            <code className="text-xs break-all text-muted-foreground">{group.endpoint}</code>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">
                <Wrench />
                {group.tools?.length ?? 0} 个工具
              </Badge>
              {bySource.map(([source, tools]) => {
                const Icon = sourceIcon(source)
                return (
                  <Badge key={source} variant="outline">
                    <Icon />
                    {source} {tools.length}
                  </Badge>
                )
              })}
              {group.token_at ? (
                <Badge variant="outline">
                  <KeyRound />
                  密钥生成于 {formatTime(group.token_at)}
                </Badge>
              ) : null}
            </div>
            {group.description ? (
              <span className="text-sm text-muted-foreground">{group.description}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              checked={!!group.enabled}
              onCheckedChange={onToggle}
              aria-label={group.enabled ? "停用" : "启用"}
            />
            <Button variant="outline" size="sm" onClick={onAccess}>
              <Cable data-icon="inline-start" />
              接入配置
            </Button>
            <IconButton color="gray" variant="soft" size="sm" onClick={onEdit} aria-label="编辑">
              <Pencil />
            </IconButton>
            <ConfirmDeleteButton
              variant="soft"
              size="sm"
              label="删除（端点与密钥立即失效）"
              onConfirm={onDelete}
            />
          </div>
        </div>
      </CardHeader>
      {(group.tools?.length ?? 0) > 0 ? (
        <CardContent>
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                <ChevronDown
                  data-icon="inline-start"
                  className={cn("transition-transform", open && "rotate-180")}
                />
                {open ? "收起工具清单" : `查看 ${group.tools.length} 个工具`}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="flex flex-col gap-3">
                {bySource.map(([source, tools]) => {
                  const Icon = sourceIcon(source)
                  return (
                    <div key={source} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Icon className="size-3.5" />
                        {source}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tools.map((t) => (
                          <Badge key={t.name} variant="secondary" className="font-mono">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      ) : null}
    </Card>
  )
}

// GroupEditorDialog — 新建/编辑一个对外 MCP 组:基本信息 + 按来源分组的工具勾选器。
function GroupEditorDialog({ open, onOpenChange, target, catalog, apiClient, setError, onSaved }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [q, setQ] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isEdit = !!target

  useEffect(() => {
    if (open) {
      setName(target?.name || "")
      setDescription(target?.description || "")
      setEnabled(target ? !!target.enabled : true)
      setSelected(new Set(target?.tools || []))
      setQ("")
    }
  }, [open, target])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return catalog
    return catalog.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.description || "").toLowerCase().includes(needle),
    )
  }, [catalog, q])

  const bySource = useMemo(() => groupBySource(filtered), [filtered])

  function toggle(name, checked) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  function toggleSource(tools, checked) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const t of tools) {
        if (checked) next.add(t.name)
        else next.delete(t.name)
      }
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (selected.size === 0) {
      toast.error("请至少选择一个工具")
      return
    }
    setSubmitting(true)
    try {
      const body = {
        name,
        description,
        tools: [...selected],
        enabled,
      }
      if (isEdit) {
        await apiClient.patch(`/api/v1/mcp/groups/${target.id}`, body)
        toast.success("已保存")
        onOpenChange(false)
        onSaved?.(null)
      } else {
        const r = await apiClient.post("/api/v1/mcp/groups", body)
        toast.success("MCP 组已创建")
        onOpenChange(false)
        onSaved?.({ group: r?.group, token: r?.token })
      }
    } catch (err) {
      setError?.(err.message)
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑 MCP 组「${target.name}」` : "新建对外 MCP 组"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "调整该组对外暴露的工具集合；访问密钥不受编辑影响。"
              : "从目录中挑选要对外提供的工具。创建后系统生成独立端点与访问密钥（密钥仅展示一次）。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="grp-name">名称</FieldLabel>
                <Input
                  id="grp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 威胁情报只读组"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="grp-desc">描述 (可选)</FieldLabel>
                <Input
                  id="grp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="给谁用、提供什么能力"
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch id="grp-enabled" checked={enabled} onCheckedChange={(c) => setEnabled(!!c)} />
              <FieldLabel htmlFor="grp-enabled">启用（停用后端点拒绝访问）</FieldLabel>
            </Field>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                选择工具 <Badge variant="secondary">已选 {selected.size}</Badge>
              </span>
              <InputGroup className="max-w-56">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="搜索工具…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </InputGroup>
            </div>
            <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto rounded-lg border p-3">
              {bySource.length === 0 ? (
                <p className="text-sm text-muted-foreground">没有匹配「{q}」的工具。</p>
              ) : (
                bySource.map(([source, tools]) => {
                  const Icon = sourceIcon(source)
                  const checkedCount = tools.filter((t) => selected.has(t.name)).length
                  const allChecked = checkedCount === tools.length
                  return (
                    <div key={source} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`src-${source}`}
                          checked={allChecked ? true : checkedCount > 0 ? "indeterminate" : false}
                          onCheckedChange={(c) => toggleSource(tools, c === true)}
                          aria-label={`全选 ${source}`}
                        />
                        <label
                          htmlFor={`src-${source}`}
                          className="flex items-center gap-1.5 text-sm font-medium"
                        >
                          <Icon className="size-4 text-muted-foreground" />
                          {source}
                          <span className="text-xs text-muted-foreground">
                            {checkedCount}/{tools.length}
                          </span>
                        </label>
                      </div>
                      <div className="grid gap-1.5 pl-6 sm:grid-cols-2">
                        {tools.map((t) => (
                          <label
                            key={t.name}
                            className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2"
                          >
                            <Checkbox
                              checked={selected.has(t.name)}
                              onCheckedChange={(c) => toggle(t.name, c === true)}
                              aria-label={t.name}
                              className="mt-0.5"
                            />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <code className="font-mono text-xs font-medium break-all">
                                  {t.name}
                                </code>
                                <OpBadge tool={t} />
                              </span>
                              {t.description ? (
                                <span className="line-clamp-2 text-xs text-muted-foreground">
                                  {t.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <FieldDescription>
              「新增 / 修改 / 删除 / 发送 / 执行」类工具会改动系统或外部状态（写数据、发通知、下发封禁），请确认外部调用方可信后再勾选；「只读」类仅查询。
            </FieldDescription>
          </div>

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
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {isEdit ? "保存" : "创建并生成密钥"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// AccessDialog — 获取接入配置:上方 MCP 配置文件,下方访问密钥。
// 密钥只有两种形态: 刚生成(freshToken,完整展示一次) / 已收起(仅尾号 + 重置按钮)。
function AccessDialog({ open, onOpenChange, group, freshToken, apiClient, setError, onTokenReset }) {
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (!group) return null

  const tokenValue = freshToken || "<访问密钥>"
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        [`soc-${group.name || "tools"}`]: {
          type: "streamable-http",
          url: group.endpoint,
          headers: { "X-API-Key": tokenValue },
        },
      },
    },
    null,
    2,
  )

  async function doReset() {
    setResetting(true)
    try {
      const r = await apiClient.post(`/api/v1/mcp/groups/${group.id}/token`)
      toast.success("密钥已重置，旧密钥立即失效")
      setResetOpen(false)
      onTokenReset?.(r?.token)
    } catch (err) {
      setError?.(err.message)
      toast.error(err.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>接入配置 · {group.name}</DialogTitle>
          <DialogDescription>
            外部系统以 <code>X-API-Key</code> 或 <code>Authorization: Bearer</code>{" "}
            携带该组的访问密钥访问下方端点。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <CodeSnippet label="MCP 客户端配置（mcpServers）" code={clientConfig} />

          <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="size-4 text-muted-foreground" />
              访问密钥
            </div>
            {freshToken ? (
              <>
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>密钥仅此一次展示</AlertTitle>
                  <AlertDescription>
                    请立即复制并妥善保存。关闭本窗口后将无法再次查看，只能重置生成新密钥。
                  </AlertDescription>
                </Alert>
                <CodeSnippet label="" code={freshToken} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-muted/50 px-2 py-1 font-mono text-xs">
                    socmcp_ ••••••••••••{group.token_hint || "????"}
                  </code>
                  {group.token_at ? (
                    <span className="text-xs text-muted-foreground">
                      生成于 {formatTime(group.token_at)}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  密钥仅在生成时展示一次，系统只保存其哈希。若已丢失，请重置生成新密钥（旧密钥立即失效）。
                </p>
                <div>
                  <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
                    <RotateCcw data-icon="inline-start" />
                    重置密钥
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>

        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认重置「{group.name}」的访问密钥?</AlertDialogTitle>
              <AlertDialogDescription>
                重置后旧密钥立即失效，所有使用它的外部系统需要换用新密钥。新密钥同样仅展示一次。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={doReset} disabled={resetting}>
                {resetting ? <Spinner data-icon="inline-start" /> : null}
                重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab 2: 工具目录（按来源分组） ─────────────────────────────────────────────

function CatalogPanel({ catalog, loading }) {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return catalog
    return catalog.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.description || "").toLowerCase().includes(needle) ||
        (t.source || "").toLowerCase().includes(needle),
    )
  }, [catalog, q])

  const bySource = useMemo(() => groupBySource(filtered), [filtered])

  if (loading && catalog.length === 0) {
    return (
      <Card className={cardHover}>
        <CardContent className="flex justify-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="搜索工具名称、描述或来源…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
      </div>

      {bySource.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wrench />
            </EmptyMedia>
            <EmptyTitle>没有匹配的工具</EmptyTitle>
            <EmptyDescription>换个关键词试试。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        bySource.map(([source, tools]) => {
          const Icon = sourceIcon(source)
          return (
            <CollapsibleSection key={source} icon={Icon} title={source} count={tools.length}>
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((t) => (
                  <div key={t.name} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="font-mono text-xs font-medium break-all">{t.name}</code>
                          <OpBadge tool={t} />
                        </div>
                        {t.description ? (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {t.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )
        })
      )}
    </div>
  )
}

// ── Tab 3: 接入管理（系统内置 + 第三方外部 MCP，原有能力保留） ──────────────────

function ServersPanel({ apiClient, setError, builtins, externals, loading, onChanged }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          新增外部 MCP
        </Button>
      </div>

      <CollapsibleSection icon={Server} title="系统内置 MCP 服务" count={builtins.length}>
        {loading && builtins.length === 0 ? (
          <Card className={cardHover}>
            <CardContent className="flex justify-center py-8">
              <Spinner />
            </CardContent>
          </Card>
        ) : (
          builtins.map((s) => <ServerCard key={s.id} server={s} />)
        )}
      </CollapsibleSection>

      <CollapsibleSection icon={Plug} title="已配置的外部 MCP 应用" count={externals.length}>
        {externals.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Network />
              </EmptyMedia>
              <EmptyTitle>暂无外部 MCP</EmptyTitle>
              <EmptyDescription>
                点击「新增外部 MCP」接入第三方应用的 MCP 服务器，系统会自动拉取其工具能力。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          externals.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              onEdit={() => setEditTarget(s)}
              onDelete={async () => {
                try {
                  await apiClient.delete(`/api/v1/mcp/servers/${s.id}`)
                  toast.success("已删除")
                  onChanged()
                } catch (err) {
                  setError?.(err.message)
                }
              }}
            />
          ))
        )}
      </CollapsibleSection>

      <ImportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiClient={apiClient}
        setError={setError}
        onImported={onChanged}
      />

      <ServerDialog
        open={!!editTarget}
        target={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title={editTarget ? `编辑 ${editTarget.name}` : "编辑"}
        apiClient={apiClient}
        onSubmit={async (body) => {
          try {
            await apiClient.patch(`/api/v1/mcp/servers/${editTarget.id}`, body)
            toast.success("已保存")
            setEditTarget(null)
            onChanged()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

    </div>
  )
}

// ── 共享小组件 ────────────────────────────────────────────────────────────────

// CollapsibleSection — a titled group of cards that can be folded away.
function CollapsibleSection({ icon: Icon, title, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="secondary">{count}</Badge>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

// StatTile — a compact metric card for the overview strip.
function StatTile({ icon: Icon, label, value }) {
  return (
    <Card className={cn(cardHover, "py-0")}>
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-semibold tabular-nums leading-none">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// Leading glyph per server role: outward-facing → Globe, built-in → Server,
// external third-party → Plug.
function serverIcon(s) {
  if (s.outward) return Globe
  if (s.kind === "builtin") return Server
  return Plug
}

function ServerCard({ server, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const tools = server.tools || []
  const Icon = serverIcon(server)
  const endpoint = server.outward ? server.external_url || server.base_url : server.base_url
  return (
    <Card className={cardHover}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{server.name}</span>
              <Badge variant="outline">{server.kind === "builtin" ? "内置" : "外部"}</Badge>
              {server.outward ? <Badge>对外提供</Badge> : null}
              {statusBadge(server)}
            </div>
            <code className="text-xs break-all text-muted-foreground">{endpoint}</code>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                <Radio />
                {TRANSPORT_LABEL[server.transport] || server.transport}
              </Badge>
              {server.auth_type ? (
                <Badge variant="outline">
                  {server.auth_type === "none" ? <ShieldCheck /> : <KeyRound />}
                  {AUTH_LABEL[server.auth_type] || server.auth_type}
                </Badge>
              ) : null}
              {server.status === "ok" ? (
                <Badge variant="secondary">
                  <Wrench />
                  {tools.length} 个工具
                </Badge>
              ) : null}
            </div>
            {server.description ? (
              <span className="text-sm text-muted-foreground">{server.description}</span>
            ) : null}
          </div>
          {server.kind === "external" ? (
            <div className="flex shrink-0 gap-1">
              <IconButton color="gray" variant="soft" size="sm" onClick={onEdit} aria-label="编辑">
                <Pencil />
              </IconButton>
              <ConfirmDeleteButton variant="soft" size="sm" onConfirm={onDelete} />
            </div>
          ) : null}
        </div>
      </CardHeader>
      {server.status === "error" || (server.status === "ok" && tools.length > 0) ? (
        <CardContent className="flex flex-col gap-3">
          {server.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>探测失败</AlertTitle>
              <AlertDescription className="break-all">{server.error}</AlertDescription>
            </Alert>
          ) : (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <ChevronDown
                    data-icon="inline-start"
                    className={cn("transition-transform", open && "rotate-180")}
                  />
                  {open ? "收起工具列表" : `查看 ${tools.length} 个工具`}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <ToolList tools={tools} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      ) : null}
    </Card>
  )
}

// CodeSnippet — labeled code block with a copy-to-clipboard action.
function CodeSnippet({ label, code }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success("已复制")
    } catch {
      toast.error("复制失败，请手动选择复制")
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        ) : (
          <span />
        )}
        <IconButton color="gray" variant="ghost" size="xs" onClick={copy} aria-label="复制">
          <Copy />
        </IconButton>
      </div>
      <pre className="max-w-full whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

// ToolList — searchable, responsive grid of a server's exposed tools.
function ToolList({ tools }) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return tools
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.description || "").toLowerCase().includes(needle),
    )
  }, [tools, q])

  const grid = (
    <div className="grid gap-2 sm:grid-cols-2">
      {filtered.map((t) => (
        <div key={t.name} className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-1">
              <code className="font-mono text-xs font-medium break-all">{t.name}</code>
              {t.description ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {tools.length > 6 ? (
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="搜索工具名称或描述…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">没有匹配「{q}」的工具。</p>
      ) : (
        grid
      )}
    </div>
  )
}

const EMPTY = {
  name: "",
  base_url: "",
  transport: "streamable-http",
  auth_type: "none",
  auth_header: "",
  auth_token: "",
  enabled: true,
  description: "",
}

function ServerDialog({ open, onOpenChange, target, title, onSubmit, apiClient }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (open) {
      setTestResult(null)
      if (target) {
        setForm({
          name: target.name || "",
          base_url: target.base_url || "",
          transport: target.transport || "streamable-http",
          auth_type: target.auth_type || "none",
          auth_header: target.auth_header || "",
          auth_token: "",
          enabled: !!target.enabled,
          description: target.description || "",
        })
      } else {
        setForm(EMPTY)
      }
    }
  }, [open, target])

  const isEdit = !!target

  async function runTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const body = { ...form }
      if (isEdit) body.id = target.id
      const r = await apiClient.post("/api/v1/mcp/servers/test", body)
      setTestResult(r)
      if (r?.ok) toast.success(`连接成功 · ${r.tools?.length ?? 0} 个工具`)
      else toast.error(`连接失败: ${r?.error || "未知错误"}`)
    } catch (err) {
      setTestResult({ ok: false, error: err.message })
      toast.error(err.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            接入第三方应用的 MCP 服务器；保存前可先「测试连接」验证可达性与凭据。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              const body = { ...form }
              if (isEdit && !body.auth_token) delete body.auth_token
              await onSubmit(body)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mcp-name">名称</FieldLabel>
              <Input
                id="mcp-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-url">MCP 端点 URL</FieldLabel>
              <Input
                id="mcp-url"
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                placeholder="https://example.com/mcp"
                required
              />
            </Field>
            <Field>
              <FieldLabel>传输方式</FieldLabel>
              <Select
                value={form.transport}
                onValueChange={(v) => setForm((f) => ({ ...f, transport: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>认证方式</FieldLabel>
              <Select
                value={form.auth_type}
                onValueChange={(v) => setForm((f) => ({ ...f, auth_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTH_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.auth_type === "header" ? (
              <Field>
                <FieldLabel htmlFor="mcp-header">Header 名</FieldLabel>
                <Input
                  id="mcp-header"
                  value={form.auth_header}
                  onChange={(e) => setForm((f) => ({ ...f, auth_header: e.target.value }))}
                  placeholder="xc-mcp-token"
                  autoComplete="off"
                  required
                />
                <FieldDescription>例如 NocoDB MCP 用 xc-mcp-token</FieldDescription>
              </Field>
            ) : null}
            {form.auth_type !== "none" ? (
              <Field>
                <FieldLabel htmlFor="mcp-token">凭据</FieldLabel>
                <Input
                  id="mcp-token"
                  type="password"
                  value={form.auth_token}
                  onChange={(e) => setForm((f) => ({ ...f, auth_token: e.target.value }))}
                  placeholder={isEdit ? "留空保留原值" : "${ENV_VAR} 或明文"}
                  autoComplete="off"
                />
                <FieldDescription>支持 ${"{ENV_VAR}"} 引用环境变量，避免明文存储。</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="mcp-desc">描述 (可选)</FieldLabel>
              <Input
                id="mcp-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="mcp-enabled"
                checked={form.enabled}
                onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: !!c }))}
              />
              <FieldLabel htmlFor="mcp-enabled">启用（停用后不再探测）</FieldLabel>
            </Field>
          </FieldGroup>

          {testResult ? (
            testResult.ok ? (
              <Alert>
                <AlertTitle>连接成功</AlertTitle>
                <AlertDescription>拉取到 {testResult.tools?.length ?? 0} 个工具。</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>连接失败</AlertTitle>
                <AlertDescription className="break-all">{testResult.error}</AlertDescription>
              </Alert>
            )
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={runTest} disabled={testing || !form.base_url}>
              {testing ? <Spinner data-icon="inline-start" /> : <Plug data-icon="inline-start" />}
              测试连接
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                保存
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const IMPORT_PLACEHOLDER = `{
  "mcpServers": {
    "NocoDB Base - ASOC": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://example.com/mcp/xxxx",
        "--header",
        "xc-mcp-token: YOUR_TOKEN"
      ]
    }
  }
}`

// ImportDialog is the "新增" entry: paste the vendor's mcpServers JSON, the
// backend parses URL/header/auth and registers + probes each server.
function ImportDialog({ open, onOpenChange, apiClient, setError, onImported }) {
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)

  useEffect(() => {
    if (open) {
      setText("")
      setResults(null)
    }
  }, [open])

  async function doImport() {
    setSubmitting(true)
    setResults(null)
    try {
      const r = await apiClient.post("/api/v1/mcp/servers/import", { config: text })
      setResults(r?.results || [])
      if (r?.created > 0) {
        toast.success(`已导入 ${r.created} 个 MCP 服务器`)
        onImported?.()
      } else {
        toast.error("未导入任何服务器")
      }
    } catch (err) {
      setError?.(err.message)
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入 MCP 配置</DialogTitle>
          <DialogDescription>
            粘贴供应商提供的 mcpServers JSON（支持 mcp-remote 桥接或 http/sse 直连），系统自动解析 URL、Header 与认证方式。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={IMPORT_PLACEHOLDER}
          rows={12}
          className="font-mono text-xs"
        />
        {results ? (
          <div className="flex flex-col gap-2">
            {results.map((r) =>
              r.status === "ok" ? (
                <Alert key={r.name}>
                  <AlertTitle>{r.name} · 已导入</AlertTitle>
                  <AlertDescription>{r.tools} 个工具</AlertDescription>
                </Alert>
              ) : (
                <Alert key={r.name} variant="destructive">
                  <AlertTitle>{r.name} · 失败</AlertTitle>
                  <AlertDescription className="break-all">{r.error}</AlertDescription>
                </Alert>
              ),
            )}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            关闭
          </Button>
          <Button onClick={doImport} disabled={submitting || !text.trim()}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default McpModule
