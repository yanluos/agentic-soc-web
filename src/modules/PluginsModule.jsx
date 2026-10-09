// 插件管理 —— the one place to see and administer every backend plugin: enable/
// disable, its manifest (modules / tables / tools / dependencies), its settings
// sections (structured editor when the compiled plugin ships one, generic JSON
// otherwise), plugin-provided operational panels (e.g. Appia 监听订阅) and its
// own health checks. Existence + state come from GET /api/v1/plugins; the
// compiled frontend descriptors (src/plugins/<id>/index.jsx) only add UI.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Blocks,
  BookOpen,
  CheckCircle2,
  Cloud,
  Database,
  HeartPulse,
  Info,
  Plus,
  Puzzle,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconButton } from "@/components/IconButton.jsx"
import {
  RailBody,
  RailCard,
  RailGroup,
  RailList,
  RailRow,
} from "@/components/ListRail.jsx"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { hasModule, usePlugin, PluginBoundary, ConfirmDialog } from "@/platform"
import { GroupCard, SectionJsonEditor } from "@/platform/settingsUi.jsx"
import { PluginDevGuideDialog } from "@/modules/PluginDevGuide.jsx"
import {
  CheckRow,
  StatusBadge,
  overallStatus,
} from "@/modules/HealthModule.jsx"

const TRUST_LABEL = { "first-party": "官方", "third-party": "第三方" }

function Kv({ k, children }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  )
}

function Chips({ items, render, empty = "—" }) {
  if (!items?.length)
    return <span className="text-muted-foreground">{empty}</span>
  return <div className="flex flex-wrap gap-1">{items.map(render)}</div>
}

// pluginState folds enabled/loaded/error into one display state. Colors are
// semantic: running = green, disabled = gray, error = red, pending restart = amber.
export function pluginState(p) {
  if (!p?.enabled)
    return { key: "disabled", label: "已禁用", variant: "secondary" }
  if (p.error) return { key: "error", label: "异常", variant: "destructive" }
  if (p.loaded) return { key: "running", label: "运行中", variant: "success" }
  return { key: "pending", label: "重启后加载", variant: "warning" }
}

function PluginStateBadge({ p, className }) {
  const st = pluginState(p)
  return (
    <Badge variant={st.variant} className={cn("gap-1 font-normal", className)}>
      {st.key === "running" ? (
        <CheckCircle2 className="size-3" />
      ) : st.key === "error" ? (
        <AlertTriangle className="size-3" />
      ) : null}
      {st.label}
    </Badge>
  )
}

// PluginRail — the left-hand plugin list in the platform rail style (see
// components/ListRail.jsx): chip rows with the plugin's icon, name, version,
// a state badge and the enable switch. When remote plugins exist the list is
// folded into 内置 / 远程 folder groups like the workflow list; otherwise flat.
function PluginRail({ plugins, selected, onSelect, onToggle, busy, ui }) {
  const [collapsed, setCollapsed] = useState({})
  const builtin = plugins.filter((p) => p.runtime !== "remote")
  const remote = plugins.filter((p) => p.runtime === "remote")
  const row = (p) => {
    const Icon = ui[p.id]?.icon || Puzzle
    const st = pluginState(p)
    return (
      <RailRow
        key={p.id}
        active={p.id === selected}
        disabled={!p.enabled}
        onClick={() => onSelect(p.id)}
        title={p.description || p.name || p.id}
        trailing={
          <>
            <Badge variant={st.variant} className="text-[10px]">
              {st.label}
            </Badge>
            <Switch
              size="sm"
              checked={!!p.enabled}
              disabled={busy === p.id}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onCheckedChange={(v) => onToggle(p, v)}
              aria-label={`${p.enabled ? "禁用" : "启用"} ${p.name || p.id}`}
            />
          </>
        }
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{p.name || p.id}</span>
        <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
          v{p.version}
        </span>
      </RailRow>
    )
  }
  if (!remote.length) {
    return (
      <RailBody>
        <RailList>{plugins.map(row)}</RailList>
      </RailBody>
    )
  }
  return (
    <RailBody>
      <RailGroup
        label="内置插件"
        icon={Blocks}
        count={builtin.length}
        collapsed={!!collapsed.builtin}
        onToggle={() => setCollapsed((c) => ({ ...c, builtin: !c.builtin }))}
      >
        {builtin.map(row)}
      </RailGroup>
      <RailGroup
        label="远程插件"
        icon={Cloud}
        count={remote.length}
        collapsed={!!collapsed.remote}
        onToggle={() => setCollapsed((c) => ({ ...c, remote: !c.remote }))}
      >
        {remote.map(row)}
      </RailGroup>
    </RailBody>
  )
}

// OverviewTab — manifest facts: identity, dependencies, modules, tables, content.
function OverviewTab({ p, all }) {
  const dependents = all.filter((q) =>
    (q.depends || []).some((d) => d.id === p.id)
  )
  return (
    <div className="flex flex-col gap-4">
      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
          <CardDescription>{p.description || "（无描述）"}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2">
            <Kv k="插件 ID">
              <code className="text-xs">{p.id}</code>
            </Kv>
            <Kv k="版本">{p.version}</Kv>
            <Kv k="信任级别">{TRUST_LABEL[p.trust] || p.trust || "—"}</Kv>
            <Kv k="运行方式">
              {p.runtime === "remote"
                ? "远程进程（运行时安装）"
                : "进程内（编译期）"}
            </Kv>
            {p.runtime === "remote" ? (
              <Kv k="端点">
                <code className="text-xs">{p.endpoint}</code>
              </Kv>
            ) : null}
            <Kv k="REST 前缀">
              {p.route_prefix ? (
                <code className="text-xs">/api/v1/{p.route_prefix}</code>
              ) : (
                "无"
              )}
            </Kv>
            <Kv k="前端">
              {p.remoteUI
                ? `运行时加载（${p.frontend?.remote_entry}）`
                : p.compiled
                  ? "已编译进控制台"
                  : p.frontend?.remote_entry
                    ? `远程入口未加载（${p.frontend.remote_entry}）`
                    : p.frontend?.modules?.length
                      ? "后端声明了模块，但前端未编译（占位渲染）"
                      : "无前端界面"}
            </Kv>
            <Kv k="出厂内容">
              {[
                p.has_content ? "工作流/技能/知识库" : null,
                p.has_assistant_prompt ? "助手提示片段" : null,
              ]
                .filter(Boolean)
                .join("、") || "无"}
            </Kv>
          </dl>
        </CardContent>
      </Card>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-base">依赖关系</CardTitle>
          <CardDescription>
            硬依赖缺失或被禁用时本插件拒绝加载；可选依赖缺失时功能降级。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2">
            <Kv k="依赖">
              <Chips
                items={p.depends}
                empty="无"
                render={(d) => (
                  <Badge
                    key={d.id}
                    variant={d.optional ? "outline" : "secondary"}
                    className="font-normal"
                  >
                    {d.id} {d.version || ""} {d.optional ? "· 可选" : ""}
                  </Badge>
                )}
              />
            </Kv>
            <Kv k="被依赖">
              <Chips
                items={dependents}
                empty="无"
                render={(q) => (
                  <Badge key={q.id} variant="outline" className="font-normal">
                    {q.name || q.id}
                  </Badge>
                )}
              />
            </Kv>
            <Kv k="提供服务">
              <Chips
                items={p.provides}
                empty="无"
                render={(s) => (
                  <code
                    key={s}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {s}
                  </code>
                )}
              />
            </Kv>
          </dl>
        </CardContent>
      </Card>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-base">模块与数据表</CardTitle>
          <CardDescription>
            模块 id 即可授予用户的权限项；数据表由插件声明并归属其模块。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2">
            <Kv k="权限模块">
              <Chips
                items={p.modules}
                empty="无（工具按核心模块门控）"
                render={(m) => (
                  <Badge key={m.id} variant="secondary" className="font-normal">
                    {m.label || m.id}{" "}
                    <code className="ml-1 text-[10px] opacity-70">{m.id}</code>
                    {m.dangerous ? (
                      <ShieldAlert className="ml-1 size-3 text-destructive" />
                    ) : null}
                  </Badge>
                )}
              />
            </Kv>
            <Kv k="数据表">
              <Chips
                items={p.tables}
                empty="无"
                render={(t) => (
                  <Badge key={t.slug} variant="outline" className="font-normal">
                    <Database className="mr-1 size-3" />
                    {t.label || t.slug}
                    {t.write_guard ? (
                      <span className="ml-1 text-[10px] opacity-70">
                        guard:{t.write_guard}
                      </span>
                    ) : null}
                  </Badge>
                )}
              />
            </Kv>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

// SettingsTab — one card per declared settings section.
function SettingsTab({ p, ui, sectionInfo, apiClient, setError }) {
  const sections = p.settings_sections || []
  if (!sections.length) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Settings2 />
          </EmptyMedia>
          <EmptyTitle>该插件没有可配置项</EmptyTitle>
          <EmptyDescription>
            它未在 manifest 中声明 settings_sections。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((s, i) => {
        const meta = ui.settingsSections?.find((m) => m.key === s.name) || {}
        const info = sectionInfo[s.name]
        const hot = (info?.class || s.class || "hot") === "hot"
        const Editor = ui.settingsEditors?.[s.name]
        const editable = info ? info.editable !== false : true
        return (
          <GroupCard
            key={s.name}
            icon={Settings2}
            title={meta.title || s.name}
            description={meta.desc || `app_settings 分区 ${s.name}`}
            defaultOpen={i === 0}
            badges={
              <>
                <Badge
                  variant={hot ? "default" : "secondary"}
                  className="shrink-0 text-[11px]"
                >
                  {hot ? "热生效" : "重启生效"}
                </Badge>
                {(info?.secret_keys || s.secret_keys)?.length ? (
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    含密钥
                  </Badge>
                ) : null}
              </>
            }
          >
            {!editable ? (
              <p className="text-sm text-muted-foreground">
                该分区不开放在线编辑。
              </p>
            ) : Editor ? (
              <PluginBoundary moduleId={`${p.id}:${s.name}`}>
                <Suspense fallback={<Skeleton className="h-24 w-full" />}>
                  <Editor
                    apiClient={apiClient}
                    setError={setError}
                    sectionKey={s.name}
                  />
                </Suspense>
              </PluginBoundary>
            ) : (
              <SectionJsonEditor
                sectionKey={s.name}
                title={meta.title || s.name}
                apiClient={apiClient}
                setError={setError}
              />
            )}
          </GroupCard>
        )
      })}
    </div>
  )
}

// ToolsTab — the MCP tools the plugin promises (manifest), with side-effect /
// approval markers and legacy aliases.
function ToolsTab({ p }) {
  const tools = p.tools || []
  if (!tools.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        该插件不提供 MCP 工具。
      </p>
    )
  }
  return (
    <Card className={cardHover}>
      <CardHeader>
        <CardTitle className="text-base">MCP 工具</CardTitle>
        <CardDescription>
          注册在 soc-server 数据 MCP 上，soc-ai 按 _meta
          自动桥接进工作流工具注册表；别名保证存量工作流定义可用。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {tools.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center gap-2 py-2">
              <code className="text-sm">{t.name}</code>
              {t.side_effect ? (
                <Badge variant="destructive" className="text-[10px]">
                  副作用
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  只读
                </Badge>
              )}
              {t.requires_approval ? (
                <Badge variant="outline" className="text-[10px]">
                  需审批
                  {typeof t.requires_approval === "object" &&
                  t.requires_approval.param
                    ? `（${t.requires_approval.param} ∈ ${(t.requires_approval.values || []).join("/")}）`
                    : ""}
                </Badge>
              ) : null}
              {(t.aliases || []).map((a) => (
                <Badge
                  key={a}
                  variant="outline"
                  className="text-[10px] font-normal text-muted-foreground"
                >
                  别名 {a}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// HealthTab — runs only this plugin's declared checks (GET /health/checks?ids=).
function HealthTab({ p, apiClient }) {
  const ids = p.health_checks || []
  const [state, setState] = useState({ loading: false, data: null, error: "" })
  const run = useCallback(async () => {
    if (!ids.length) return
    setState({ loading: true, data: null, error: "" })
    try {
      const d = await apiClient.get(
        `/api/v1/health/checks?ids=${encodeURIComponent(ids.join(","))}`
      )
      setState({ loading: false, data: d, error: "" })
    } catch (e) {
      setState({ loading: false, data: null, error: e.message })
    }
  }, [apiClient, ids])
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id])

  if (!ids.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        该插件未声明健康检查。
      </p>
    )
  }
  return (
    <Card className={cardHover}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="size-4" />
          健康检查
          {state.data && (
            <StatusBadge status={overallStatus(state.data.checks)} />
          )}
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={run}
            disabled={state.loading}
          >
            {state.loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            重新检查
          </Button>
        </CardTitle>
        <CardDescription>
          只运行本插件声明的检查项：{ids.join(" / ")}
          。凭据类检查只读探活，不产生业务副作用。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : state.error ? (
          <p className="text-sm text-destructive">检查失败：{state.error}</p>
        ) : state.data ? (
          <div className="flex flex-col">
            {state.data.checks.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <Separator />}
                <CheckRow check={c} />
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// InstallDialog — paste a runtime:"remote" plugin.json → POST /api/v1/plugins.
function InstallDialog({ open, onOpenChange, apiClient, onInstalled }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  async function install() {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      toast.error(`manifest 不是合法 JSON：${e.message}`)
      return
    }
    setBusy(true)
    try {
      const v = await apiClient.post("/api/v1/plugins", parsed)
      toast.success(`远程插件 ${v?.name || v?.id || parsed.id} 已安装并启动`)
      setText("")
      onOpenChange(false)
      onInstalled?.(v?.id || parsed.id)
    } catch (e) {
      toast.error(e.message || "安装失败")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>安装远程插件</DialogTitle>
          <DialogDescription>
            粘贴插件的 plugin.json（runtime 须为 remote，含 endpoint 与
            token_env）。宿主会按 manifest 建表、声明配置分区、 反向代理其
            REST、桥接其 MCP 工具并加载其前端入口；令牌从 soc-server
            进程环境变量 token_env 读取。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="plugin-manifest">plugin.json</FieldLabel>
            <Textarea
              id="plugin-manifest"
              className="min-h-64 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                '{\n  "id": "hello",\n  "runtime": "remote",\n  "endpoint": "http://localhost:8084",\n  ...\n}'
              }
              spellCheck={false}
            />
            <FieldDescription>
              参考
              examples/remote-plugin-hello/plugin.json。第三方插件默认信任级别
              third-party。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={install} disabled={busy || !text.trim()}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PluginsModule({ apiClient, setError, currentUser }) {
  const pluginCtx = usePlugin()
  const registry = pluginCtx?.registry
  const [plugins, setPlugins] = useState(null)
  const [sectionInfo, setSectionInfo] = useState({})
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [uninstallTarget, setUninstallTarget] = useState(null)
  const [purge, setPurge] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, sections] = await Promise.all([
        apiClient.get("/api/v1/plugins"),
        apiClient.get("/api/v1/settings").catch(() => []),
      ])
      const arr = Array.isArray(list) ? list : []
      arr.sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, "zh-CN")
      )
      setPlugins(arr)
      const info = {}
      for (const s of Array.isArray(sections) ? sections : []) info[s.name] = s
      setSectionInfo(info)
      setSelected((cur) =>
        cur && arr.some((p) => p.id === cur) ? cur : arr[0]?.id || null
      )
    } catch (e) {
      setError?.(e.message || "加载插件列表失败")
      setPlugins([])
    }
  }, [apiClient, setError])

  useEffect(() => {
    load()
  }, [load])

  // Per-plugin compiled UI (icon, section meta, structured editors, panels).
  const ui = useMemo(() => registry?.pluginUI || {}, [registry])

  const view = useMemo(() => {
    if (!plugins) return []
    return plugins.map((p) => ({
      ...p,
      compiled: !!ui[p.id]?.compiled,
      remoteUI: !!ui[p.id]?.remote,
    }))
  }, [plugins, ui])

  async function uninstall() {
    const p = uninstallTarget
    if (!p) return
    try {
      await apiClient.delete(
        `/api/v1/plugins/${p.id}?purge=${purge ? "true" : "false"}`
      )
      toast.success(`${p.name || p.id} 已卸载${purge ? "（含数据表）" : ""}`)
      setUninstallTarget(null)
      setPurge(false)
      await load()
      pluginCtx?.reloadPlugins?.()
    } catch (e) {
      toast.error(e.message || "卸载失败")
    }
  }
  const current = view.find((p) => p.id === selected) || null

  async function toggle(p, next) {
    setBusy(p.id)
    try {
      await apiClient.post(
        `/api/v1/plugins/${p.id}/${next ? "enable" : "disable"}`,
        {}
      )
      toast.success(
        next ? `${p.name || p.id} 已启用` : `${p.name || p.id} 已禁用`
      )
      await load()
      pluginCtx?.reloadPlugins?.()
    } catch (e) {
      const msg = String(e?.message || "")
      if (msg.includes("restart_required")) {
        toast.warning("已记录为启用，需重启 soc-server 后加载", {
          description: "本进程尚未初始化过该插件。",
        })
        await load()
      } else if (msg.includes("depend")) {
        toast.error("有其他已启用插件依赖它，无法禁用", { description: msg })
      } else {
        toast.error(msg || "操作失败")
      }
    } finally {
      setBusy(null)
    }
  }

  if (plugins === null) {
    return (
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!plugins.length) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Blocks />
          </EmptyMedia>
          <EmptyTitle>没有已注册的插件</EmptyTitle>
          <EmptyDescription>
            soc-server 未链接任何插件（plugins/all）。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const panels =
    (current &&
      ui[current.id]?.panels?.filter(
        (pn) => !pn.permission || hasModule(currentUser, pn.permission)
      )) ||
    []
  const Icon = (current && ui[current.id]?.icon) || Puzzle

  const enabledCount = view.filter((p) => p.enabled).length

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* The rail sticks to the top of the scrolling <main> and scrolls its own
          rows, so the switches stay reachable while a long settings tab scrolls. */}
      <RailCard
        title="插件"
        count={`${enabledCount}/${view.length} 启用`}
        className="lg:sticky lg:top-0 lg:max-h-[calc(100svh-6rem)] lg:self-start"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton color="blue" size="sm" aria-label="插件操作">
                <Plus />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setInstallOpen(true)}>
                <Cloud />
                安装远程插件
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setGuideOpen(true)}>
                <BookOpen />
                开发规范
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <PluginRail
          plugins={view}
          selected={selected}
          onSelect={setSelected}
          onToggle={toggle}
          busy={busy}
          ui={ui}
        />
      </RailCard>

      {current ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {current.name || current.id}
                </h2>
                <Badge variant="outline" className="font-normal">
                  v{current.version}
                </Badge>
                <PluginStateBadge p={current} />
                {current.trust === "third-party" ? (
                  <Badge variant="destructive" className="font-normal">
                    第三方
                  </Badge>
                ) : null}
                {current.runtime === "remote" ? (
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Cloud className="size-3" />
                    远程
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {current.description}
              </p>
            </div>
            {current.runtime === "remote" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUninstallTarget(current)}
              >
                <Trash2 data-icon="inline-start" />
                卸载
              </Button>
            ) : null}
          </div>
          {current.enabled && current.error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription className="break-all">
                插件异常：{current.error}
              </AlertDescription>
            </Alert>
          ) : null}
          {!current.enabled ? (
            <Alert>
              <Info />
              <AlertDescription>
                插件已禁用：其模块不在侧栏出现，REST 返回 503，MCP 工具从 soc-ai
                工具注册表摘除。配置仍可在此编辑，启用后即生效。
              </AlertDescription>
            </Alert>
          ) : null}

          <Tabs defaultValue="overview" key={current.id}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">
                <Info />
                概览
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 />
                设置
                {current.settings_sections?.length
                  ? ` (${current.settings_sections.length})`
                  : ""}
              </TabsTrigger>
              {panels.map((pn) => {
                const PIcon = pn.icon
                return (
                  <TabsTrigger key={pn.key} value={`panel:${pn.key}`}>
                    {PIcon ? <PIcon /> : null}
                    {pn.label}
                  </TabsTrigger>
                )
              })}
              <TabsTrigger value="tools">
                <Wrench />
                工具{current.tools?.length ? ` (${current.tools.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="health">
                <HeartPulse />
                健康
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <OverviewTab p={current} all={view} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab
                p={current}
                ui={ui[current.id] || {}}
                sectionInfo={sectionInfo}
                apiClient={apiClient}
                setError={setError}
              />
            </TabsContent>
            {panels.map((pn) => {
              const Panel = pn.component
              return (
                <TabsContent key={pn.key} value={`panel:${pn.key}`}>
                  <Card className={cardHover}>
                    <CardContent className="pt-6">
                      <PluginBoundary moduleId={`${current.id}:${pn.key}`}>
                        <Suspense
                          fallback={<Skeleton className="h-32 w-full" />}
                        >
                          <Panel
                            apiClient={apiClient}
                            setError={setError}
                            currentUser={currentUser}
                          />
                        </Suspense>
                      </PluginBoundary>
                    </CardContent>
                  </Card>
                </TabsContent>
              )
            })}
            <TabsContent value="tools">
              <ToolsTab p={current} />
            </TabsContent>
            <TabsContent value="health">
              <HealthTab p={current} apiClient={apiClient} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      <PluginDevGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <InstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        apiClient={apiClient}
        onInstalled={async (id) => {
          await load()
          pluginCtx?.reloadPlugins?.()
          setSelected(id)
        }}
      />
      <ConfirmDialog
        open={!!uninstallTarget}
        onOpenChange={(o) => {
          if (!o) {
            setUninstallTarget(null)
            setPurge(false)
          }
        }}
        destructive
        title={`卸载远程插件 ${uninstallTarget?.name || uninstallTarget?.id || ""}？`}
        description={
          <div className="flex flex-col gap-3">
            <p>
              将停止其工具桥接与 REST
              代理、移除健康检查与模块。配置分区的数据行保留。
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={purge} onCheckedChange={(v) => setPurge(!!v)} />
              同时删除它声明的数据表（不可恢复）
            </label>
          </div>
        }
        confirmText="卸载"
        onConfirm={uninstall}
      />
    </div>
  )
}

export default PluginsModule
