import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { emitSetFilter } from "@/platform"
import { Construction } from "lucide-react"
import { toast } from "sonner"

import { AppShell } from "@/components/Layout.jsx"
import { LoginOverlay } from "@/components/LoginOverlay.jsx"
import { FloatingAi } from "@/components/FloatingAi.jsx"
import { resetAgentChat } from "@/modules/assistant/useAgentChat.js"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

import { createApiClient } from "@/api.js"
import {
  clearToken,
  getStoredToken,
  isTokenExpired,
} from "@/lib/jwt.js"
import { DEFAULT_DYNAMIC_TABLE_GROUP } from "@/constants.js"
import { buildRegistry, compiledPlugins } from "@/plugins/registry.js"
import { PluginBoundary, PluginContext } from "@/platform"
import { GenericTableModule } from "@/modules/GenericTableModule.jsx"

const DEFAULT_MODULE = "overview"
const NAV_HISTORY_MAX = 50
// Backoff schedule for GET /api/v1/plugins after a failure (~1 min total).
const PLUGINS_FETCH_RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 15000, 15000]
const SETTINGS_API_BASE_KEY = "soc-web-shadcn:apiBase"
const SETTINGS_API_KEY_KEY = "soc-web-shadcn:apiKey"

function readLocalSetting(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocalSetting(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}

function NotImplemented({ moduleId, moduleLabel, reason }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{reason || "该模块尚未实现"}</EmptyTitle>
        <EmptyDescription>
          <span className="font-mono">{moduleId}</span>
          {moduleLabel ? <> · {moduleLabel}</> : null}
          {reason ? null : " 将在后续阶段接入。"}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Badge variant="secondary">{reason ? "插件" : "后续阶段"}</Badge>
      </EmptyContent>
    </Empty>
  )
}

function ModuleFallback() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner className="size-5" />
    </div>
  )
}

export function App() {
  // ----- auth -----
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // ----- routing -----
  // Browser-style module history: `stack` is the visit trail, `index` points at
  // the current entry. navigateTo() truncates any forward tail (like a browser
  // after you go back then click a new link); goBack/goForward just move index.
  const [nav, setNav] = useState({ stack: [DEFAULT_MODULE], index: 0 })
  const activeModule = nav.stack[nav.index]
  const canGoBack = nav.index > 0
  const canGoForward = nav.index < nav.stack.length - 1
  const [dynamicTables, setDynamicTables] = useState([])
  // Backend plugin list (GET /api/v1/plugins): null until fetched; on failure
  // stays null so compiled plugins fail CLOSED (core keeps rendering).
  const [plugins, setPlugins] = useState(null)
  const [pluginsError, setPluginsError] = useState(false)
  // Bumped by the 插件管理 page after enable/disable so the sidebar re-syncs.
  const [pluginsVersion, setPluginsVersion] = useState(0)
  const reloadPlugins = useCallback(() => setPluginsVersion((v) => v + 1), [])
  // Remote plugin descriptors: enabled plugins with frontend.remote_entry and no
  // compiled UI get their ESM bundle import()ed (same-origin, proxied by
  // soc-server; the import map hands it the host's React/SDK).
  const [remoteDescs, setRemoteDescs] = useState({})
  useEffect(() => {
    const compiled = new Set(compiledPlugins.map((p) => p.id))
    const wanted = (plugins || []).filter((p) => p.enabled && p.frontend?.remote_entry && !compiled.has(p.id))
    if (!wanted.length) {
      setRemoteDescs({})
      return
    }
    let cancelled = false
    Promise.all(
      wanted.map((p) =>
        import(/* @vite-ignore */ p.frontend.remote_entry)
          .then((m) => [p.id, m?.default])
          .catch((e) => {
            toast.error(`远程插件 ${p.name || p.id} 前端加载失败：${e.message}`)
            return [p.id, null]
          }),
      ),
    ).then((pairs) => {
      if (cancelled) return
      const next = {}
      for (const [id, d] of pairs) if (d) next[id] = d
      setRemoteDescs(next)
    })
    return () => {
      cancelled = true
    }
  }, [plugins])

  const navigateTo = useCallback((module) => {
    setNav((n) => {
      if (n.stack[n.index] === module) return n
      const stack = [...n.stack.slice(0, n.index + 1), module].slice(
        -NAV_HISTORY_MAX,
      )
      return { stack, index: stack.length - 1 }
    })
  }, [])
  const goBack = useCallback(() => {
    setNav((n) => (n.index > 0 ? { ...n, index: n.index - 1 } : n))
  }, [])
  const goForward = useCallback(() => {
    setNav((n) =>
      n.index < n.stack.length - 1 ? { ...n, index: n.index + 1 } : n,
    )
  }, [])

  // ----- connection settings (local only) -----
  const [apiBase, setApiBase] = useState(() =>
    readLocalSetting(SETTINGS_API_BASE_KEY, ""),
  )
  const [apiKey, setApiKey] = useState(() =>
    readLocalSetting(SETTINGS_API_KEY_KEY, ""),
  )

  useEffect(() => {
    writeLocalSetting(SETTINGS_API_BASE_KEY, apiBase)
  }, [apiBase])
  useEffect(() => {
    writeLocalSetting(SETTINGS_API_KEY_KEY, apiKey)
  }, [apiKey])

  // ----- auth bootstrap -----
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const token = getStoredToken()
      if (!token || isTokenExpired(token)) {
        if (token) clearToken()
        if (!cancelled) setAuthLoading(false)
        return
      }
      try {
        const resp = await fetch("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) {
          clearToken()
          if (!cancelled) setCurrentUser(null)
          return
        }
        const user = await resp.json()
        if (!cancelled) setCurrentUser(user)
      } catch {
        /* network failure — leave logged-out state */
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  // ----- dynamic table registry + plugin list -----
  useEffect(() => {
    if (!currentUser) {
      setDynamicTables([])
      setPlugins(null)
      return
    }
    let cancelled = false
    const headers = { Authorization: `Bearer ${getStoredToken()}` }
    async function loadTables() {
      try {
        const resp = await fetch("/api/v1/tables", { headers })
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled) return
        const list = Array.isArray(data) ? data : data?.tables || []
        setDynamicTables(list)
      } catch {
        /* ignore — sidebar falls back to static modules */
      }
    }
    // Retried with backoff: a backend restart (dev.sh start, soc-server redeploy)
    // makes this fetch fail for a few seconds, and a one-shot failure used to
    // leave `plugins` null until a manual page reload — every plugin module
    // vanished from the sidebar ("插件系统崩了"). Auth failures are not retried.
    let retryTimer = null
    async function loadPlugins(attempt = 0) {
      try {
        const resp = await fetch("/api/v1/plugins", { headers })
        if (!resp.ok) {
          const err = new Error(`HTTP ${resp.status}`)
          err.noRetry = resp.status === 401 || resp.status === 403
          throw err
        }
        const data = await resp.json()
        if (cancelled) return
        setPlugins(Array.isArray(data) ? data : [])
        setPluginsError(false)
      } catch (e) {
        if (cancelled) return
        setPlugins(null)
        setPluginsError(true)
        if (e?.noRetry || attempt >= PLUGINS_FETCH_RETRY_DELAYS_MS.length) return
        retryTimer = setTimeout(() => loadPlugins(attempt + 1), PLUGINS_FETCH_RETRY_DELAYS_MS[attempt])
      }
    }
    loadTables()
    loadPlugins()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [currentUser, pluginsVersion])

  useEffect(() => {
    if (pluginsError) toast.error("插件列表加载失败，扩展模块暂不可用（将自动重试）")
  }, [pluginsError])

  // ----- api client (rebuilt on auth or settings change) -----
  const token = currentUser ? getStoredToken() : ""
  const apiClient = useMemo(
    () => createApiClient({ apiBase, apiKey, token }),
    [apiBase, apiKey, token],
  )

  const setError = useCallback((msg) => toast.error(msg || "出错了"), [])

  // ----- module registry: core + compiled plugins (gated by the backend) + dynamic tables -----
  const registry = useMemo(() => buildRegistry(plugins, remoteDescs), [plugins, remoteDescs])
  const allModules = useMemo(() => {
    const dyn = dynamicTables
      .filter((t) => t.slug && !t.owner && !registry.hiddenTables.has(t.slug) && !registry.byId.has(`table:${t.slug}`))
      .map((t) => ({
        id: `table:${t.slug}`,
        group: t.group || DEFAULT_DYNAMIC_TABLE_GROUP,
        label: t.label || t.slug,
        icon: t.icon || "Table",
      }))
    return [...registry.modules, ...dyn]
  }, [registry, dynamicTables])

  // Filter to modules the current user can see.
  const visibleModules = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.is_admin) return allModules
    const granted = new Set(currentUser.modules || [])
    // A module may borrow another module's grant via `permission` (the
    // settings_* entries ride on the single "settings" grant). An array means
    // any one grant suffices (集成 serves both integrations and settings users).
    return allModules.filter((m) => {
      const perms = Array.isArray(m.permission) ? m.permission : [m.permission || m.id]
      return perms.some((p) => granted.has(p))
    })
  }, [allModules, currentUser])

  useEffect(() => {
    if (!currentUser) return
    // Permission redirect: the current module vanished from the visible set —
    // reset the history rather than push, so back can't return to a module the
    // user may no longer open.
    if (visibleModules.length === 0) {
      setNav({ stack: [DEFAULT_MODULE], index: 0 })
      return
    }
    if (!visibleModules.some((m) => m.id === activeModule)) {
      setNav({ stack: [visibleModules[0].id], index: 0 })
    }
  }, [visibleModules, activeModule, currentUser])

  // ----- handlers -----
  const handleLogin = useCallback((user) => setCurrentUser(user), [])
  const handleLogout = useCallback(() => {
    clearToken()
    resetAgentChat() // drop the shared chat store (aborts a live turn)
    setCurrentUser(null)
    setNav({ stack: [DEFAULT_MODULE], index: 0 })
    toast.info("已退出登录")
  }, [])
  const handleSettingsChange = useCallback(({ apiBase: ab, apiKey: ak }) => {
    setApiBase(ab || "")
    setApiKey(ak || "")
  }, [])

  // Cmd/Ctrl+B 开合 AI 悬浮框。capture 阶段拦截，抢在 shadcn SidebarProvider
  // 同键位的侧栏折叠监听（window bubble 阶段）之前吃掉事件，再转发给
  // FloatingAi（工作台页悬浮球不挂载，事件自然无效果）。
  useEffect(() => {
    if (!currentUser) return
    function onKeyDown(e) {
      if (
        e.key.toLowerCase() === "b" &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent("floating-ai-toggle"))
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [currentUser])

  // ----- AI integration: action dispatcher + ui-state reporter -----
  // Capture per-table view state from GenericTableModule broadcasts; post a
  // snapshot every 500ms so the AI agent has a live view of what the user is
  // looking at.
  const tableViewRef = useRef({})

  useEffect(() => {
    function onTableView(e) {
      const d = e.detail
      if (d?.slug) tableViewRef.current[d.slug] = d
    }
    window.addEventListener("tableview-changed", onTableView)
    return () => {
      window.removeEventListener("tableview-changed", onTableView)
    }
  }, [])

  const handleAgentAction = useCallback(
    (action) => {
      if (!action) return
      if (action.type === "navigate" && action.module) {
        navigateTo(action.module)
        return
      }
      if (action.type === "back") {
        goBack()
        return
      }
      if (action.type === "forward") {
        goForward()
        return
      }
      if (action.type === "set_filter" && action.slug) {
        emitSetFilter({ slug: action.slug, filterTree: action.filterTree ?? action.tree })
        return
      }
    },
    [navigateTo, goBack, goForward],
  )

  // 500ms debounce: send activeModule + tables.
  useEffect(() => {
    if (!currentUser) return
    const id = setInterval(() => {
      const payload = {
        activeModule,
        canGoBack,
        canGoForward,
        tables: tableViewRef.current,
      }
      try {
        fetch("/agent/ui-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getStoredToken()}`,
          },
          body: JSON.stringify(payload),
        }).catch(() => {})
      } catch {
        /* network failure is fine — agent can tolerate stale state */
      }
    }, 500)
    return () => clearInterval(id)
  }, [currentUser, activeModule, canGoBack, canGoForward])

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!currentUser) {
    return <LoginOverlay onLogin={handleLogin} />
  }

  return (
    <AppShell
      allModules={visibleModules}
      activeModule={activeModule}
      onNavigate={navigateTo}
      currentUser={currentUser}
      onLogout={handleLogout}
      apiClient={apiClient}
    >
      <PluginContext.Provider value={{ apiClient, plugins: registry.plugins, registry, reloadPlugins }}>
        <ModuleContent
          activeModule={activeModule}
          allModules={allModules}
          registry={registry}
          dynamicTables={dynamicTables}
          apiClient={apiClient}
          setError={setError}
          apiBase={apiBase}
          apiKey={apiKey}
          currentUser={currentUser}
          onSettingsChange={handleSettingsChange}
          onNavigate={navigateTo}
          onAgentAction={handleAgentAction}
        />
      </PluginContext.Provider>
      {/* Hide the floating ball while the full workbench is open. */}
      {activeModule !== "assistant" ? <FloatingAi onAction={handleAgentAction} /> : null}
    </AppShell>
  )
}

function ModuleContent({
  activeModule,
  allModules,
  registry,
  dynamicTables,
  apiClient,
  setError,
  apiBase,
  apiKey,
  currentUser,
  onSettingsChange,
  onNavigate,
  onAgentAction,
}) {
  const module = allModules.find((m) => m.id === activeModule)
  const label = module?.label
  const ctx = {
    apiClient,
    setError,
    currentUser,
    onNavigate,
    onAgentAction,
    plugin: module?.pluginId ? registry.plugins.find((p) => p.id === module.pluginId) || { id: module.pluginId } : null,
    // core-only extras (never passed to plugins by the descriptor contract)
    host: { apiBase, apiKey, onSettingsChange },
  }

  let body
  if (module?.missing) {
    body = <NotImplemented moduleId={activeModule} moduleLabel={label} reason="该插件的前端界面未包含在此构建中" />
  } else if (module?.render) {
    body = module.render(ctx)
  } else if (module?.component) {
    const Component = module.component
    body = <Component {...ctx} />
  } else if (module?.table || activeModule.startsWith("table:")) {
    const slug = module?.table || activeModule.slice("table:".length)
    const meta = dynamicTables.find((t) => t.slug === slug)
    const r = registry.tableRenderers[slug] || {}
    body = (
      <GenericTableModule
        key={slug}
        slug={slug}
        label={module?.table ? label : meta?.label || slug}
        apiClient={apiClient}
        setError={setError}
        renderItem={r.renderItem ? r.renderItem(ctx) : undefined}
        renderCreate={r.renderCreate ? r.renderCreate(ctx) : undefined}
        patchPath={r.patchPath}
        deletePath={r.deletePath}
      />
    )
  } else {
    body = <NotImplemented moduleId={activeModule} moduleLabel={label} />
  }

  return (
    <PluginBoundary moduleId={activeModule} resetKey={activeModule}>
      <Suspense fallback={<ModuleFallback />}>{body}</Suspense>
    </PluginBoundary>
  )
}

export default App
