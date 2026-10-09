// Floating AI panel — draggable ball + resizable chat panel, portaled to
// `<body>`. Multi-session, streaming SSE, file upload, slash commands.
//
// Backend: soc-ai at :8081, proxied through Vite (`/agent/*`).
// All sessions/chat/upload are server-driven; this component is pure
// orchestration + UI.

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Bot,
  Minus,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  X,
  Paperclip,
} from "lucide-react"
import { toast } from "sonner"
import { cardStatic } from "@/lib/styles"
import { ChatMessage } from "@/modules/assistant/ChatMessage.jsx"
import { useAgentChat } from "@/modules/assistant/useAgentChat.js"

import { Button } from "@/components/ui/button"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { IconButton } from "@/components/IconButton.jsx"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils.js"

const STORAGE_KEY_RECT = "fai-panel-rect"
const STORAGE_KEY_POS = "fai-ball-pos"
const DEFAULT_SIZE = { w: 420, h: 560 }
const MIN_SIZE = { w: 320, h: 400 }
const BALL_W = 56 // 宽度（圆角正方形）
const BALL_H = 56 // 高度
const EDGE_DOCK = 8 // 与窗口边缘距离 ≤ 此值时收纳隐藏
const DOCK_DELAY = 1500 // 贴边后静置这么久（无拖拽/点击）才收纳

const SLASH_COMMANDS = [
  { cmd: "/model", label: "切换模型" },
  { cmd: "/effort", label: "切换思考深度" },
  { cmd: "/plan", label: "进入计划模式" },
  { cmd: "/compact", label: "压缩历史" },
  { cmd: "/clear", label: "清屏" },
  { cmd: "/new", label: "新建会话" },
  { cmd: "/help", label: "帮助" },
]

export function FloatingAi({ onAction }) {
  const [open, setOpen] = useState(false)
  const [panelMounted, setPanelMounted] = useState(false) // dialog present in DOM
  const [panelEntered, setPanelEntered] = useState(false) // dialog at full scale
  const [interacting, setInteracting] = useState(false)
  const [pos, setPos] = useState(() => readJSON(STORAGE_KEY_POS, defaultPos()))
  const [rect, setRect] = useState(() => {
    const saved = readJSON(STORAGE_KEY_RECT, null)
    return saved || defaultRect(readJSON(STORAGE_KEY_POS, defaultPos()))
  })

  // Chat state lives in the shared store (modules/assistant/chatStore.js):
  // the same sessions/messages/stream the workbench shows, and a turn keeps
  // streaming while the user moves between modules. Only visible while the
  // panel is open (a turn finishing unobserved announces itself by toast).
  const chat = useAgentChat({ onAction, surface: "floating", visible: open })
  const { sessions, activeId, messages, streaming, streamingIds, attachments } = chat
  const [input, setInput] = useState("")
  const [sidebar, setSidebar] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [ballDragging, setBallDragging] = useState(false)
  const [dockSide, setDockSide] = useState(null) // 已收纳到哪条边（延迟生效）

  const panelRef = useRef(null)
  const messagesRef = useRef(null)
  const dragRef = useRef(null)

  // Drive enter/leave: on open, mount then scale up next frame; on close,
  // scale the dialog down (toward the ball) then unmount after the transition.
  useEffect(() => {
    if (open) {
      setPanelMounted(true)
      const id = requestAnimationFrame(() => setPanelEntered(true))
      return () => cancelAnimationFrame(id)
    }
    setPanelEntered(false)
    const id = setTimeout(() => setPanelMounted(false), 160)
    return () => clearTimeout(id)
  }, [open])

  // Cmd/Ctrl+B（App.jsx capture 拦截后转发）开合面板。
  useEffect(() => {
    function onToggle() {
      setOpen((o) => !o)
    }
    window.addEventListener("floating-ai-toggle", onToggle)
    return () => window.removeEventListener("floating-ai-toggle", onToggle)
  }, [])

  // Auto-scroll messages to bottom on new content.
  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages])

  function persistRect(next) {
    setRect(next)
    writeJSON(STORAGE_KEY_RECT, next)
  }
  function persistPos(next) {
    setPos(next)
    writeJSON(STORAGE_KEY_POS, next)
  }

  // ── Ball drag ────────────────────────────────────────────────────────
  function onBallMouseDown(e) {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const startPos = { ...pos }
    let moved = false
    function onMove(ev) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) > 4 && !moved) {
        moved = true
        setBallDragging(true) // 拖拽中不触发贴边收纳
      }
      if (moved) {
        const next = {
          x: Math.max(0, Math.min(window.innerWidth - BALL_W, startPos.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - BALL_H, startPos.y + dy)),
        }
        persistPos(next)
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setBallDragging(false)
      // A click (no drag) maximizes the ball into the panel.
      if (!moved) setOpen(true)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // ── Panel drag (move by header) ──────────────────────────────────────
  function onPanelDragStart(e) {
    if (e.button !== 0) return
    if (e.target.closest("button")) return // don't drag when hitting a control
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...rect }
    setInteracting(true)
    function onMove(ev) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // keep at least ~40px of the panel on-screen
      const x = Math.max(40 - start.w, Math.min(window.innerWidth - 40, start.x + dx))
      const y = Math.max(0, Math.min(window.innerHeight - 40, start.y + dy))
      persistRect({ ...start, x, y })
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setInteracting(false)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // ── Panel resize (4 edges + 4 corners) ───────────────────────────────
  function onResizeStart(dir, e) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...rect }
    setInteracting(true)
    function onMove(ev) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let { x, y, w, h } = start
      if (dir.includes("e")) w = start.w + dx
      if (dir.includes("s")) h = start.h + dy
      if (dir.includes("w")) {
        w = start.w - dx
        x = start.x + dx
      }
      if (dir.includes("n")) {
        h = start.h - dy
        y = start.y + dy
      }
      if (w < MIN_SIZE.w) {
        if (dir.includes("w")) x -= MIN_SIZE.w - w
        w = MIN_SIZE.w
      }
      if (h < MIN_SIZE.h) {
        if (dir.includes("n")) y -= MIN_SIZE.h - h
        h = MIN_SIZE.h
      }
      persistRect({ x, y, w, h })
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setInteracting(false)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // ── Sessions ─────────────────────────────────────────────────────────
  async function createNew() {
    try {
      return await chat.createSession()
    } catch (err) {
      toast.error(`创建会话失败: ${err.message}`)
      return null
    }
  }

  async function deleteSession(id) {
    try {
      await chat.deleteSession(id)
    } catch (err) {
      toast.error(`删除失败: ${err.message}`)
    }
  }

  // ── Send message ─────────────────────────────────────────────────────
  // Slash commands are handled locally; everything else goes through the
  // shared store's sendMessage (session creation, SSE stream, persistence).
  function sendMessage(override) {
    const text = (override ?? input).trim()
    if (!text || streaming) return
    setInput("")
    if (text.startsWith("/") && handleSlash(text)) return
    chat.sendMessage(text)
  }

  // /model            → list the registry's enabled models + this session's pin
  // /model <name>     → pin that model on the session ("默认" / "default" clears)
  // The pin is stored server-side on the session, so the workbench picker
  // shows the same choice.
  async function slashModel(arg) {
    const list = chat.models
    if (!arg) {
      const current = chat.sessionModel || ""
      const lines = list.map((m) => `- ${m.name === current ? "**" : ""}${m.name}${m.name === current ? "** (当前)" : ""}${m.is_default ? " · 平台默认" : ""}  \`${m.default_model}\``)
      chat.pushNote(
        `可用模型：\n${lines.join("\n") || "（注册表为空）"}\n\n当前会话：${current || "跟随默认"}。用 \`/model <名称>\` 切换，\`/model 默认\` 恢复。`,
      )
      return
    }
    const want = arg === "默认" || arg.toLowerCase() === "default" ? "" : arg
    if (want && !list.some((m) => m.name === want)) {
      toast.error(`没有名为「${want}」的已启用模型`)
      return
    }
    if (!chat.activeId && !(await createNew())) return
    try {
      await chat.setSessionModel(want)
      toast.success(want ? `本会话已切换到「${want}」` : "本会话已恢复默认模型")
    } catch {
      /* toasted by the store */
    }
  }

  // Returns true when the text was consumed as a command.
  function handleSlash(text) {
    const [cmd, ...rest] = text.split(/\s+/)
    switch (cmd) {
      case "/model":
        slashModel(rest.join(" ").trim())
        return true
      case "/clear":
        chat.clearMessages()
        toast.success("已清屏")
        return true
      case "/new":
        createNew()
        return true
      case "/help":
        chat.pushNote("可用命令: " + SLASH_COMMANDS.map((c) => c.cmd).join(", "))
        return true
      default:
        toast.info(`命令 ${cmd} 暂未实现,作为普通消息发送`)
        return false
    }
  }

  // 贴边收纳：球静止且紧贴（≤EDGE_DOCK）某条窗口边时，先静置 DOCK_DELAY
  // 再收纳（期间任何拖拽/点击都会取消并重新计时）；离边立即解除
  const dockTarget = !ballDragging && !open ? ballDockSide(pos) : null
  useEffect(() => {
    if (!dockTarget) {
      setDockSide(null)
      return
    }
    if (dockSide === dockTarget) return
    const id = setTimeout(() => setDockSide(dockTarget), DOCK_DELAY)
    return () => clearTimeout(id)
  }, [dockTarget, dockSide])

  return createPortal(
    <>
      {/* Minimized ball — 56px 圆角正方形白面按钮（outline 变体：卡片白面 +
          描边 + 模块选中蓝的 Bot 图标），投影/浮雕/按下收拢全部走 .ibtn 体系
          token。贴边（≤8px）时向边外滑出大半收纳（留 ~20px 把手 + 降透明度），
          悬停滑回全显，拖拽中不收纳；收纳/弹出用带回弹的 spring 缓动 */}
      {!open ? (
        <IconButton
          color="ai"
          variant="outline"
          aria-label="打开 AI 助手"
          onMouseDown={onBallMouseDown}
          className={cn(
            "fixed z-50",
            !ballDragging &&
              "transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            /* 收纳深度：露出宽度 = 圆角半径（0.875rem），切缝正好落在
               圆角弧线与直边的交界点上；fai-docked 给静止把手加重投影 */
            dockSide && "fai-docked",
            dockSide === "left" &&
              "-translate-x-[calc(100%-0.875rem)] opacity-70 hover:translate-x-0 hover:opacity-100",
            dockSide === "right" &&
              "translate-x-[calc(100%-0.875rem)] opacity-70 hover:translate-x-0 hover:opacity-100",
            dockSide === "top" &&
              "-translate-y-[calc(100%-0.875rem)] opacity-70 hover:translate-y-0 hover:opacity-100",
            dockSide === "bottom" &&
              "translate-y-[calc(100%-0.875rem)] opacity-70 hover:translate-y-0 hover:opacity-100",
          )}
          style={{
            left: pos.x,
            top: pos.y,
            "--ib-sz": "3.5rem",
            "--ib-rad": "0.875rem",
            "--ib-glyph": "1.5rem",
          }}
        >
          <Bot />
          {streamingIds.length > 0 ? (
            <span
              aria-label="AI 正在工作"
              title="AI 助手正在工作中"
              className="pointer-events-none absolute -right-1 -top-1 size-3 rounded-full bg-ai ring-2 ring-background animate-pulse"
            />
          ) : null}
        </IconButton>
      ) : null}

      {/* Maximized dialog — scales up from / shrinks toward the ball */}
      {panelMounted ? (
        <div
          ref={panelRef}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-xl bg-popover/90 text-popover-foreground backdrop-blur-md",
            "shadow-2xl ring-1 ring-foreground/10",
            "dark:shadow-[0_16px_40px_-8px_rgb(0_0_0/0.7),inset_0_2px_6px_-3px_rgb(255_255_255/0.14)]",
            !interacting && "transition-[transform,opacity] duration-150 ease-out",
            panelEntered ? "scale-100 opacity-100" : "scale-[0.35] opacity-0",
          )}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            transformOrigin: `${pos.x + BALL_W / 2 - rect.x}px ${pos.y + BALL_H / 2 - rect.y}px`,
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files) chat.addFiles(e.dataTransfer.files)
          }}
        >
          {/* Header — drag to move; minimize shrinks the dialog away */}
          <div
            onMouseDown={onPanelDragStart}
            className="flex cursor-move items-center gap-2 border-b bg-ai/10 px-2 py-1.5"
          >
          <IconButton
            color="gray"
            variant="ghost"
            size="sm"
            onClick={() => setSidebar((v) => !v)}
            aria-label="切换侧边栏"
          >
            {sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}
          </IconButton>
          <Bot className="size-4 text-ai" />
          <span className="flex-1 truncate text-sm font-medium">
            {sessions.find((s) => s.id === activeId)?.title || "AI 助手"}
          </span>
          <IconButton
            color="gray"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              onAction?.({ type: "navigate", module: "assistant" })
            }}
            aria-label="在工作台打开"
          >
            <Maximize2 />
          </IconButton>
          <IconButton
            color="gray"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            aria-label="最小化"
          >
            <Minus />
          </IconButton>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            {sidebar ? (
              <div className="w-44 border-r bg-muted/30 p-2 flex flex-col">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={createNew}
                  className="mb-2"
                >
                  <Plus data-icon="inline-start" />
                  新会话
                </Button>
                <ul className="flex-1 overflow-y-auto">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                        activeId === s.id
                          ? cn("bg-accent text-accent-foreground", cardStatic)
                          : "hover:bg-muted",
                      )}
                      onClick={() => chat.setActiveId(s.id)}
                    >
                      <span className="flex-1 truncate">{s.title || s.id.slice(0, 6)}</span>
                      {streamingIds.includes(s.id) ? <Spinner className="size-3 shrink-0" aria-label="运行中" /> : null}
                      <ConfirmDeleteButton
                        variant="ghost"
                        size="xs"
                        className="opacity-0 group-hover:opacity-100 data-[state=confirm]:opacity-100 data-[state=pending]:opacity-100"
                        onConfirm={() => deleteSession(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Main */}
            <div className="flex flex-1 flex-col">
              <div ref={messagesRef} className="flex-1 overflow-y-auto p-3">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    开始对话…
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {messages.map((m, i) => (
                      <ChatMessage key={i} msg={m} streaming={streaming && i === messages.length - 1} />
                    ))}
                    {streaming ? (
                      <li className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Spinner data-icon="inline-start" /> AI 正在思考…
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>

              {/* Attachments */}
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-t bg-background px-2 py-1">
                  {attachments.map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {a.name}
                      <button
                        type="button"
                        aria-label="移除"
                        onClick={() => chat.removeAttachment(i)}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}

              {/* Slash palette */}
              {showCommands && input.startsWith("/") ? (
                <div className="border-t bg-background">
                  <ul className="max-h-40 overflow-y-auto p-1">
                    {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input))
                      .map((c) => (
                        <li key={c.cmd}>
                          <button
                            type="button"
                            onClick={() => {
                              setInput(c.cmd + " ")
                              setShowCommands(false)
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          >
                            <code className="font-mono text-xs">{c.cmd}</code>
                            <span className="text-xs text-muted-foreground">{c.label}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              {/* Input */}
              <div className="flex items-center gap-1 border-t bg-background p-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      color="gray"
                      variant="ghost"
                      size="sm"
                      aria-label="附加文件"
                    >
                      <Paperclip />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onSelect={() => {
                        const input = document.createElement("input")
                        input.type = "file"
                        input.multiple = true
                        input.onchange = () => {
                          if (input.files) chat.addFiles(input.files)
                        }
                        input.click()
                      }}
                    >
                      选择文件
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    setShowCommands(e.target.value.startsWith("/"))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="说点什么… ( / 查看命令)"
                  className="h-8"
                  disabled={streaming}
                />
                <IconButton
                  color="ai"
                  variant="solid"
                  size="sm"
                  onClick={() => sendMessage()}
                  disabled={streaming || !input.trim()}
                  aria-label="发送"
                >
                  {streaming ? <Spinner /> : <Send />}
                </IconButton>
              </div>
            </div>
          </div>

          {/* Resize handles — 4 edges + 4 corners */}
          {open ? (
            <>
              <div onMouseDown={(e) => onResizeStart("n", e)} className="absolute inset-x-4 top-0 h-1.5 cursor-ns-resize" />
              <div onMouseDown={(e) => onResizeStart("s", e)} className="absolute inset-x-4 bottom-0 h-1.5 cursor-ns-resize" />
              <div onMouseDown={(e) => onResizeStart("w", e)} className="absolute inset-y-4 left-0 w-1.5 cursor-ew-resize" />
              <div onMouseDown={(e) => onResizeStart("e", e)} className="absolute inset-y-4 right-0 w-1.5 cursor-ew-resize" />
              <div onMouseDown={(e) => onResizeStart("nw", e)} className="absolute left-0 top-0 size-3 cursor-nwse-resize" />
              <div onMouseDown={(e) => onResizeStart("ne", e)} className="absolute right-0 top-0 size-3 cursor-nesw-resize" />
              <div onMouseDown={(e) => onResizeStart("sw", e)} className="absolute bottom-0 left-0 size-3 cursor-nesw-resize" />
              <div onMouseDown={(e) => onResizeStart("se", e)} className="absolute bottom-0 right-0 size-3 cursor-nwse-resize" />
            </>
          ) : null}

          {dragOver ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ai/10 text-sm font-medium">
              放下以附加文件
            </div>
          ) : null}
        </div>
      ) : null}

    </>,
    document.body,
  )
}


function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort */
  }
}

function defaultPos() {
  if (typeof window === "undefined") return { x: 0, y: 0 }
  return {
    x: window.innerWidth - BALL_W - 24,
    y: window.innerHeight - BALL_H - 24,
  }
}

function ballDockSide(pos) {
  if (typeof window === "undefined") return null
  if (pos.x <= EDGE_DOCK) return "left"
  if (pos.x >= window.innerWidth - BALL_W - EDGE_DOCK) return "right"
  if (pos.y <= EDGE_DOCK) return "top"
  if (pos.y >= window.innerHeight - BALL_H - EDGE_DOCK) return "bottom"
  return null
}

// Panel rectangle anchored to the ball (expands up-left), clamped to viewport.
function defaultRect(ballPos) {
  const margin = 8
  const innerW = typeof window !== "undefined" ? window.innerWidth : 1280
  const innerH = typeof window !== "undefined" ? window.innerHeight : 800
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
  const w = DEFAULT_SIZE.w
  const h = DEFAULT_SIZE.h
  const x = clamp(ballPos.x + BALL_W - w, margin, Math.max(margin, innerW - w - margin))
  const y = clamp(ballPos.y + BALL_H - h, margin, Math.max(margin, innerH - h - margin))
  return { x, y, w, h }
}
