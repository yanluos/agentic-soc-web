import { useCallback, useEffect, useState } from "react"
import {
  KeyRound,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ChevronRight,
  ChevronDown,
  Bell,
  Check,
  X as XIcon,
  RefreshCw,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { getStoredToken } from "@/lib/jwt.js"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ThemeSubMenu } from "@/components/ModeToggle.jsx"
import { TopBarSlotContext } from "@/components/TopBarSlot.jsx"
import { moduleGroups, resolveIcon } from "@/constants.js"
import { useAutofillSync, fieldValue } from "@/hooks/use-autofill-sync.js"
import { subscribeWorkflowEvents } from "@/lib/workflowEvents.js"

const GROUP_COLLAPSED_KEY = "sidebar:groupCollapsed"
const SIDEBAR_WIDTH_KEY = "sidebar:width"
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 360
const SIDEBAR_DEFAULT_WIDTH = 240
const SIDEBAR_GROUPS = moduleGroups

// ---------------------------------------------------------------------------
// AppShell — layout root (SidebarProvider + Sidebar + SidebarInset + content)
// ---------------------------------------------------------------------------

export function AppShell({
  children,
  allModules,
  activeModule,
  onNavigate,
  currentUser,
  onLogout,
  apiClient,
  appVersion = "v0.1",
}) {
  // 顶栏插槽节点(callback ref 存进 state,挂上后模块的 TopBarPortal 才会重渲染进去)。
  const [topBarSlot, setTopBarSlot] = useState(null)
  // Resizable sidebar width (persisted).
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return raw >= SIDEBAR_MIN_WIDTH && raw <= SIDEBAR_MAX_WIDTH
      ? raw
      : SIDEBAR_DEFAULT_WIDTH
  })
  function persistSidebarWidth(w) {
    const clamped = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, w))
    setSidebarWidth(clamped)
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
    } catch {
      /* best-effort */
    }
  }

  return (
    <SidebarProvider
      className="h-svh flex-col overflow-hidden"
      style={{ "--header-height": "3rem", "--sidebar-width": `${sidebarWidth}px` }}
    >
      <TopBar
        currentUser={currentUser}
        onLogout={onLogout}
        apiClient={apiClient}
        slotRef={setTopBarSlot}
      />
      {/* min-h-0 (not overflow-hidden) so the content card's shadow can bleed
          onto the chrome; the card clips its own content. */}
      <div className="flex min-h-0 flex-1 bg-sidebar">
        <AppSidebar
          className="!top-12 !h-[calc(100svh-3rem)] !border-r-0"
          allModules={allModules}
          activeModule={activeModule}
          onNavigate={onNavigate}
          appVersion={appVersion}
          onResize={persistSidebarWidth}
        />
        {/* The content panel owns both divider lines: its border-t + border-l
            meet in a rounded top-left corner, so the topbar/sidebar junction is
            an arc instead of a hard T. The topbar and sidebar share bg-sidebar
            (no border between them) and read as one L-shaped chrome around the
            card; the corner notch outside the arc shows the wrapper's
            bg-sidebar. */}
        {/* z-40 lifts the card (and its shadow) above the fixed sidebar (z-10)
            and sticky topbar (z-30); portaled overlays live at z-50+.
            Top-lit look: an inset hairline highlight along the top edge, and
            drop shadows offset down-left so the card shades the sidebar. */}
        <SidebarInset className="overflow-hidden md:z-40 md:rounded-tl-xl md:border-l md:border-t md:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_1px_rgba(0,0,0,0.06),-3px_4px_10px_rgba(0,0,0,0.05),-10px_16px_36px_rgba(0,0,0,0.08)] md:dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_0_1px_rgba(0,0,0,0.5),-3px_4px_10px_rgba(0,0,0,0.35),-10px_16px_36px_rgba(0,0,0,0.5)]">
          <main className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 md:p-6">
            <TopBarSlotContext.Provider value={topBarSlot}>
              {children}
            </TopBarSlotContext.Provider>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

function AppSidebar({ className, allModules, activeModule, onNavigate, appVersion, onResize }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUP_COLLAPSED_KEY) || "{}")
    } catch {
      return {}
    }
  })

  function toggleGroup(id) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(GROUP_COLLAPSED_KEY, JSON.stringify(next))
      } catch {
        /* best-effort */
      }
      return next
    })
  }

  // Drag the right edge to resize. Sidebar left edge is at x=0, so the new
  // width equals the pointer's clientX.
  function onResizeStart(e) {
    if (e.button !== 0) return
    e.preventDefault()
    function onMove(ev) {
      onResize?.(ev.clientX)
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
    }
    document.body.style.cursor = "ew-resize"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <Sidebar collapsible="icon" className={className}>
      <SidebarContent className="pt-2">
        {SIDEBAR_GROUPS.map((group) => {
          const groupModules = allModules.filter((m) => m.group === group.id)
          if (groupModules.length === 0) return null
          const isOpen = !collapsed[group.id]
          return (
            <Collapsible
              key={group.id}
              open={isOpen}
              onOpenChange={() => toggleGroup(group.id)}
              className="group/collapsible"
            >
              <SidebarGroup className="py-1">
                <SidebarGroupLabel
                  asChild
                  className="cursor-pointer select-none text-xs font-medium text-sidebar-foreground/60"
                >
                  <CollapsibleTrigger>
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight className="size-3.5 opacity-0 transition-all group-hover/collapsible:opacity-50 group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                {/* tapered underline: fades at both ends, solid in the middle */}
                <div className="mx-3 mt-0.5 mb-1 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent group-data-[collapsible=icon]:hidden" />
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1">
                      {groupModules.map((m) => {
                        const Icon = resolveIcon(m.icon)
                        const isActive = m.id === activeModule
                        return (
                          <SidebarMenuItem key={m.id}>
                            <SidebarMenuButton
                              isActive={isActive}
                              tooltip={m.label}
                              onClick={() => onNavigate(m.id)}
                              className={cn(
                                "relative h-9 text-xs data-[active=true]:font-medium",
                                // accent bar on the card's left edge
                                "data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1/2 data-[active=true]:before:h-5 data-[active=true]:before:w-[3px] data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-sidebar-primary group-data-[collapsible=icon]:before:hidden",
                                // raised-card active state: same top-lit look as the
                                // content card (SidebarInset above), scaled to item size.
                                // `!` beats the variant's data-active:bg-sidebar-accent.
                                // Shadow values mirror rowActive/rowHover in lib/styles.js
                                // (data-attribute syntax forced the duplication) — keep in sync.
                                "data-[active=true]:bg-background!",
                                "data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_1px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.08)]",
                                "dark:data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_0_1px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.35),0_6px_16px_rgba(0,0,0,0.45)]",
                                // hover (non-active): same raised look, one elevation
                                // tier lighter — resting-card vs the active hover-tier.
                                "data-[active=false]:hover:bg-background!",
                                "data-[active=false]:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_1px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.06)]",
                                "dark:data-[active=false]:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_1px_rgba(0,0,0,0.5),0_1px_3px_rgba(0,0,0,0.35)]"
                              )}
                            >
                              <Icon />
                              <span>{m.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-2 px-1.5 text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
            <span>Agentic SOC Console</span>
            <span>{appVersion}</span>
          </div>
          <SidebarTrigger
            aria-label="折叠侧边栏"
            className="size-6 shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground group-data-[collapsible=icon]:mx-auto"
          />
        </div>
      </SidebarFooter>
      {/* Drag handle to resize the sidebar width */}
      <button
        type="button"
        aria-label="调整侧边栏宽度"
        onMouseDown={onResizeStart}
        className="absolute inset-y-0 right-0 z-20 w-1 cursor-ew-resize bg-transparent transition-colors hover:bg-sidebar-border group-data-[collapsible=icon]:hidden"
      />
    </Sidebar>
  )
}

// ---------------------------------------------------------------------------
// TopBar — sidebar trigger + command palette trigger + theme + user menu
// ---------------------------------------------------------------------------

// ApprovalInbox — bell button + popover listing workflow runs paused at an
// approval step; the user approves/rejects the proposed block right here. The
// list is the shared queue (approval isn't per-user); callers without the
// workflow_viz module just see an empty inbox (the fetch 403s silently).
// formatApprovalTime renders created_at as "MM-DD HH:mm" (the queue is recent).
function formatApprovalTime(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function ApprovalInbox({ apiClient }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [loading, setLoading] = useState(false)
  // Per-card expansion: collapsed cards clamp the body text; expanding removes
  // the clamp and reveals the meta rows (workflow / run id / time).
  const [expanded, setExpanded] = useState({})

  const load = useCallback(async () => {
    if (!apiClient) return
    setLoading(true)
    try {
      const data = await apiClient.get("/api/v1/workflows/approvals")
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([]) // no permission / offline → empty inbox, no error toast
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  // Live: soc-ai pushes every run status change (lib/workflowEvents.js) — a run
  // entering or leaving waiting_approval (decided via Appia / email one-click /
  // another tab) refreshes the queue. The 60s poll is only a fallback for a
  // dropped stream; opening the panel also refreshes.
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    let debounce = null
    const unsubscribe = subscribeWorkflowEvents((ev) => {
      if (ev.kind === "resync" || (ev.kind === "run" && ev.op !== "step")) {
        clearTimeout(debounce)
        debounce = setTimeout(load, 500)
      }
    })
    return () => {
      clearInterval(t)
      clearTimeout(debounce)
      unsubscribe()
    }
  }, [load])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function decide(runId, action) {
    setBusy(runId)
    try {
      await apiClient.post(
        `/api/v1/workflows/runs/${runId}/${action}`,
        action === "reject" ? { reason: "平台拒绝" } : {},
      )
      toast.success(action === "reject" ? "已拒绝" : "已批准，工作流继续执行")
      setItems((xs) => xs.filter((x) => x.run_id !== runId))
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const count = items.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          color="orange"
          variant="soft"
          size="sm"
          aria-label={`待处理消息${count ? `（${count}）` : ""}`}
          className="relative"
        >
          <Bell />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(94vw,40rem)] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">待处理消息</span>
            <Badge
              variant={count ? "default" : "secondary"}
              className="font-normal"
            >
              {count}
            </Badge>
          </div>
          <IconButton
            color="blue"
            variant="soft"
            size="sm"
            aria-label="刷新"
            disabled={loading}
            onClick={load}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
          </IconButton>
        </div>
        <div className="thin-scrollbar max-h-[min(80vh,46rem)] overflow-y-auto overscroll-contain">
          {count === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-10 text-center">
              <Bell className="size-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">暂无待处理消息</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-2">
            {items.map((it) => {
              // Title/description come from the backend projection of the
              // approval step (step name + interpolated description) — no
              // domain-specific wording lives in the inbox.
              const title = it.title || "工作流审批"
              const isOpen = !!expanded[it.run_id]
              const metaRows = [
                ["工作流", it.workflow],
                ["运行 ID", it.run_id],
                ["创建时间", formatApprovalTime(it.created_at)],
              ].filter((r) => r && r[1])
              return (
              <div key={it.run_id} className="rounded-lg border bg-card p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((m) => ({ ...m, [it.run_id]: !m[it.run_id] }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <ShieldCheck className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {title}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <p
                  className={cn(
                    "mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-foreground",
                    !isOpen && "line-clamp-3",
                  )}
                >
                  {it.description || "等待人工审批"}
                </p>
                {isOpen && metaRows.length > 0 ? (
                  <dl className="mt-2 flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs">
                    {metaRows.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
                        <dd className="min-w-0 break-all">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <div className="mt-2.5 flex gap-2">
                  <Button
                    size="xs"
                    disabled={busy === it.run_id}
                    onClick={() => decide(it.run_id, "approve")}
                  >
                    {busy === it.run_id ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    批准
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy === it.run_id}
                    onClick={() => decide(it.run_id, "reject")}
                  >
                    <XIcon data-icon="inline-start" />
                    拒绝
                  </Button>
                </div>
              </div>
              )
            })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TopBar({
  currentUser,
  onLogout,
  apiClient,
  slotRef,
}) {
  const [pwOpen, setPwOpen] = useState(false)
  const [otpOpen, setOtpOpen] = useState(false)
  const { state: sidebarState } = useSidebar()
  const user = currentUser || {}
  const username = user.username || "?"
  const initials = username.slice(0, 2).toUpperCase()
  const isAdmin = !!user.is_admin

  return (
    // Same bg as the sidebar — together they form the L-shaped chrome around
    // the rounded content card, whose own border-t is the divider on md+.
    // Mobile has no sidebar/card, so keep a plain border-b there.
    <header className="sticky top-0 z-30 flex h-12 w-full items-center gap-2 border-b bg-sidebar px-3 md:border-b-0 md:pl-0">
      {/* Desktop collapse lives in the sidebar footer; this is the only way to
          open the offcanvas sidebar on mobile, so keep it there. */}
      <SidebarTrigger aria-label="切换侧边栏" className="md:hidden" />
      {/* On md+ the brand zone is exactly as wide as the sidebar below it —
          tracking both drag-resize (--sidebar-width) and icon-collapse — so
          whatever follows starts flush with the content card's left edge and
          stays put while the sidebar is resized. */}
      <div
        className={cn(
          "flex items-center gap-2 md:shrink-0 md:self-stretch md:overflow-hidden md:pl-3",
          sidebarState === "collapsed"
            ? "md:w-(--sidebar-width-icon)"
            : "md:w-(--sidebar-width)",
        )}
      >
        <span
          className={cn(
            "text-base font-semibold tracking-tight whitespace-nowrap",
            sidebarState === "collapsed" && "md:hidden",
          )}
        >
          Agentic SOC
        </span>
      </div>
      {/* 模块工具栏插槽(TopBarPortal 渲染进来):紧跟品牌区,md:pl-4 + header
          gap ≈ 内容卡片的 md:p-6 内衬,与卡片内容左缘对齐。 */}
      <div ref={slotRef} className="flex min-w-0 flex-1 items-center md:pl-4 md:pr-4" />
      <div className="flex shrink-0 items-center gap-2">
        <ApprovalInbox apiClient={apiClient} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              color="gray"
              variant="ghost"
              size="md"
              aria-label="用户菜单"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-foreground text-background text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-sm font-medium">{username}</span>
              <span>
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {isAdmin ? "管理员" : "普通用户"}
                </Badge>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
              <KeyRound />
              修改密码
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOtpOpen(true)}>
              <ShieldCheck />
              两步验证
            </DropdownMenuItem>
            <ThemeSubMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        username={user.username || ""}
      />
      <TwoFactorDialog
        open={otpOpen}
        onOpenChange={setOtpOpen}
        username={user.username || ""}
      />
    </header>
  )
}

function ChangePasswordDialog({ open, onOpenChange, username }) {
  const [oldPw, setOldPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // 接住密码管理器的填充(见 use-autofill-sync.js)
  const oldPwRef = useAutofillSync(setOldPw)
  const newPwRef = useAutofillSync(setNewPw)
  const confirmRef = useAutofillSync(setConfirm)

  function reset() {
    setOldPw("")
    setNewPw("")
    setConfirm("")
    setError("")
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    const oldVal = fieldValue(oldPwRef, oldPw)
    const newVal = fieldValue(newPwRef, newPw)
    const confirmVal = fieldValue(confirmRef, confirm)
    if (!oldVal) {
      setError("请输入当前密码")
      return
    }
    if (newVal !== confirmVal) {
      setError("两次输入的密码不一致")
      return
    }
    setSubmitting(true)
    try {
      const resp = await fetch("/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getStoredToken()}`,
        },
        body: JSON.stringify({
          old_password: oldVal,
          new_password: newVal,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let msg
        try {
          const parsed = JSON.parse(text)
          msg = parsed.error || parsed.message || text
        } catch {
          msg = text || `${resp.status} ${resp.statusText}`
        }
        throw new Error(msg)
      }
      toast.success("密码已修改")
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err.message || "未知错误")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>请输入当前密码和新密码。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {/* Hidden but real username field — the documented way to tell a
              password manager WHICH item this change-password form updates. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username || ""}
            readOnly
            hidden
          />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="old-pw">当前密码</FieldLabel>
              <Input
                ref={oldPwRef}
                id="old-pw"
                name="current-password"
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-pw">新密码</FieldLabel>
              <Input
                ref={newPwRef}
                id="new-pw"
                name="new-password"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-pw">确认新密码</FieldLabel>
              <Input
                ref={confirmRef}
                id="confirm-pw"
                name="confirm-new-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              确认
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// TwoFactorDialog — TOTP 两步验证管理。启用:setup 拿密钥 → 认证器扫码 →
// 输码 enable;停用:输当前密码 disable。状态每次打开时从 /auth/me 现取,
// 不依赖 App 里可能过期的 user 快照。
// ---------------------------------------------------------------------------

function TwoFactorDialog({ open, onOpenChange, username }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [setup, setSetup] = useState(null) // {secret, otpauth_url} — 启用流程进行中
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // 接住密码管理器 / 认证器的填充(见 use-autofill-sync.js)
  const codeRef = useAutofillSync(setCode)
  const passwordRef = useAutofillSync(setPassword)

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${getStoredToken()}`,
  })

  useEffect(() => {
    if (!open) return
    setSetup(null)
    setCode("")
    setPassword("")
    setError("")
    setLoading(true)
    fetch("/auth/me", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((me) => setEnabled(!!me.otp_enabled))
      .catch(() => setError("加载两步验证状态失败"))
      .finally(() => setLoading(false))
  }, [open])

  async function post(path, body) {
    const resp = await fetch(path, {
      method: "POST",
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!resp.ok) {
      const text = await resp.text()
      let msg
      try {
        msg = JSON.parse(text).error || text
      } catch {
        msg = text || `${resp.status} ${resp.statusText}`
      }
      throw new Error(msg)
    }
    return resp.json()
  }

  async function handleStartSetup() {
    setError("")
    setSubmitting(true)
    try {
      setSetup(await post("/auth/otp/setup"))
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEnable(e) {
    e.preventDefault()
    setError("")
    const codeVal = fieldValue(codeRef, code)
    if (codeVal.trim().length !== 6) {
      setError("请输入认证器中的 6 位验证码")
      return
    }
    setSubmitting(true)
    try {
      await post("/auth/otp/enable", { secret: setup.secret, code: codeVal.trim() })
      toast.success("两步验证已启用")
      setEnabled(true)
      setSetup(null)
      setCode("")
    } catch (err) {
      setError(err.message === "invalid otp code" ? "验证码不正确,请重试" : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisable(e) {
    e.preventDefault()
    setError("")
    const pwVal = fieldValue(passwordRef, password)
    if (!pwVal) {
      setError("请输入当前密码")
      return
    }
    setSubmitting(true)
    try {
      await post("/auth/otp/disable", { password: pwVal })
      toast.success("两步验证已停用")
      setEnabled(false)
      setPassword("")
    } catch (err) {
      setError(
        err.message === "current password is incorrect" ? "当前密码不正确" : err.message,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>两步验证</DialogTitle>
          <DialogDescription>
            使用认证器 App(Google Authenticator、1Password 等)的动态验证码保护登录
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <ShieldAlert data-icon="inline-start" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : enabled ? (
          <form onSubmit={handleDisable} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Badge>
                <ShieldCheck data-icon="inline-start" />
                已启用
              </Badge>
              <span className="text-sm text-muted-foreground">
                登录时需要输入动态验证码
              </span>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="otp-disable-pw">当前密码</FieldLabel>
                <Input
                  ref={passwordRef}
                  id="otp-disable-pw"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="停用需验证密码"
                  required
                />
              </Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ShieldOff data-icon="inline-start" />
                )}
                停用两步验证
              </Button>
            </div>
          </form>
        ) : setup ? (
          <form onSubmit={handleEnable} className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border bg-white p-3">
                <QRCodeSVG value={setup.otpauth_url} size={168} />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                用认证器 App 扫码,或手动输入密钥:
                <br />
                <code className="font-mono text-[11px] break-all">{setup.secret}</code>
              </p>
            </div>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username || ""}
              readOnly
              hidden
            />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="otp-enable-code">动态验证码</FieldLabel>
                <Input
                  ref={codeRef}
                  id="otp-enable-code"
                  name="otp_code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="输入 App 中的 6 位数字完成绑定"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center font-mono tracking-[0.5em]"
                  autoFocus
                  required
                />
              </Field>
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setSetup(null)
                  setCode("")
                  setError("")
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ShieldCheck data-icon="inline-start" />
                )}
                验证并启用
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">未启用</Badge>
              <span className="text-sm text-muted-foreground">
                启用后,登录还需输入认证器动态验证码
              </span>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleStartSetup} disabled={submitting}>
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ShieldCheck data-icon="inline-start" />
                )}
                启用两步验证
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

