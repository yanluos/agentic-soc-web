// AI 助手 — full-page workbench (sidebar module "assistant").
// Three panes: session rail | chat stream | activity inspector.
// Shares ChatMessage/ToolCallCard/ThinkingBlock with the FloatingAi panel,
// and talks to the same /agent/* backend (agent-core container underneath).

import { useEffect, useRef, useState } from "react"
import {
  Bot,
  Sparkles,
  Plus,
  Send,
  Square,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  X,
  Activity,
  BookOpen,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { IconButton } from "@/components/IconButton.jsx"
import { InlineRename } from "@/components/InlineRename.jsx"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Card, CardContent } from "@/components/ui/card"
import { cardHover, cardStatic } from "@/lib/styles"
import {
  RailBody,
  RailCard,
  RailHeader,
  RailList,
  RailMessage,
  RailRow,
} from "@/components/ListRail.jsx"
import { cn } from "@/lib/utils.js"

import { useAgentChat } from "./useAgentChat.js"
import { ENGINES, defaultModelForEngine, modelsForEngine } from "./chatStore.js"
import { ChatMessage } from "./ChatMessage.jsx"
import { pairToolCalls } from "./ToolCallCard.jsx"
import { toolMeta } from "./toolMeta.js"

const EFFORTS = [
  { value: "low", label: "低强度" },
  { value: "medium", label: "中强度" },
  { value: "high", label: "高强度" },
  { value: "max", label: "最大强度" },
]

// Sentinel for the model picker's "follow the global default" row (a Radix
// Select item cannot carry an empty value).
const DEFAULT_MODEL = "__default__"

const SUGGESTIONS = [
  "查询最近 10 条未处置的安全事件并总结",
  "查一下 IP 10.4.129.26 是谁在用",
  "帮我建一个每天 8 点自动研判安全告警的工作流",
]

export function AssistantModule({ onAction }) {
  // Shared store — the stream keeps running when this page unmounts.
  const chat = useAgentChat({ onAction, surface: "workbench" })
  const [input, setInput] = useState("")
  const [effort, setEffort] = useState("medium")
  const engineModels = modelsForEngine(chat.models, chat.sessionEngine)
  const engineDefault = defaultModelForEngine(chat.models, chat.sessionEngine)
  const [showSessions, setShowSessions] = useState(true)
  const [showActivity, setShowActivity] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(null) // session id being renamed in place

  // Smart stick-to-bottom: only auto-scroll when the user is already near
  // the bottom, so reading history isn't yanked away by streaming updates.
  const scrollRef = useRef(null)
  const nearBottomRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function send(text) {
    const value = (text ?? input).trim()
    if (!value && chat.attachments.length === 0) return
    if (value === "/new") {
      chat
        .createSession()
        .catch((err) => toast.error(`创建会话失败: ${err.message}`))
      setInput("")
      return
    }
    nearBottomRef.current = true
    chat.sendMessage(value, { effort })
    setInput("")
  }

  function pickFiles() {
    const el = document.createElement("input")
    el.type = "file"
    el.multiple = true
    el.onchange = () => el.files && chat.addFiles(el.files)
    el.click()
  }

  const lastAssistant = [...chat.messages]
    .reverse()
    .find((m) => m.role === "assistant")
  const activity = pairToolCalls(lastAssistant?.toolCalls)

  return (
    <div
      className="flex h-[calc(100svh-5rem)] min-h-0 gap-3 md:h-[calc(100svh-6rem)]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) chat.addFiles(e.dataTransfer.files)
      }}
    >
      {/* ── Session rail ─────────────────────────────────────────────── */}
      {showSessions ? (
        <RailCard
          title="会话"
          count={chat.sessions.length || null}
          className="w-64 shrink-0"
          action={
            <IconButton
              color="blue"
              size="sm"
              aria-label="新会话"
              onClick={() => chat.createSession()}
            >
              <Plus />
            </IconButton>
          }
        >
          {chat.sessions.length === 0 ? (
            <RailMessage>暂无会话</RailMessage>
          ) : (
            <RailBody>
              <RailList>
                {chat.sessions.map((s) => (
                  <RailRow
                    key={s.id}
                    active={chat.activeId === s.id}
                    onClick={() => chat.setActiveId(s.id)}
                    onDoubleClick={() => setRenaming(s.id)}
                    className="group"
                    title={renaming === s.id ? undefined : s.title || s.id}
                    trailing={
                      renaming === s.id ? null : (
                        <>
                          {chat.streamingIds.includes(s.id) ? (
                            <Spinner className="size-3 shrink-0" aria-label="运行中" />
                          ) : null}
                          <IconButton
                            color="gray"
                            variant="ghost"
                            size="xs"
                            aria-label="重命名"
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenaming(s.id)
                            }}
                          >
                            <Pencil />
                          </IconButton>
                          <ConfirmDeleteButton
                            variant="ghost"
                            size="xs"
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=confirm]:opacity-100 data-[state=pending]:opacity-100"
                            onConfirm={() =>
                              chat.deleteSession(s.id).catch((err) => {
                                toast.error(`删除失败: ${err.message}`)
                              })
                            }
                          />
                        </>
                      )
                    }
                  >
                    {renaming === s.id ? (
                      // In-place rename: the label turns into a compact field;
                      // Enter/blur commit, Esc cancels (see InlineRename).
                      <InlineRename
                        value={s.title || ""}
                        placeholder={s.id.slice(0, 6)}
                        onCancel={() => setRenaming(null)}
                        onCommit={(title) => {
                          setRenaming(null)
                          if (!title || title === (s.title || "")) return
                          chat
                            .renameSession(s.id, title)
                            .catch((err) =>
                              toast.error(`重命名失败: ${err.message}`)
                            )
                        }}
                      />
                    ) : (
                      <span className="truncate">
                        {s.title || s.id.slice(0, 6)}
                      </span>
                    )}
                  </RailRow>
                ))}
              </RailList>
            </RailBody>
          )}
        </RailCard>
      ) : null}

      {/* ── Chat pane — the platform card (cardHover + RailHeader), body =
          scrolling message stream, footer = the composer ──────────────── */}
      <Card
        className={cn(cardHover, "relative flex min-w-0 flex-1 flex-col gap-2")}
      >
        <RailHeader
          leading={
            <IconButton
              color="gray"
              variant="ghost"
              size="sm"
              aria-label="切换会话栏"
              onClick={() => setShowSessions((v) => !v)}
            >
              {showSessions ? <PanelLeftClose /> : <PanelLeftOpen />}
            </IconButton>
          }
          icon={Bot}
          title={
            chat.sessions.find((s) => s.id === chat.activeId)?.title ||
            "AI 助手"
          }
          count={chat.streaming ? "运行中" : null}
          action={
            <span className="flex shrink-0 items-center gap-1">
              {chat.streaming ? <Spinner className="size-3.5" /> : null}
              <IconButton
                color="gray"
                variant="ghost"
                size="sm"
                aria-label="技能与知识库"
                onClick={() =>
                  onAction?.({ type: "navigate", module: "knowledge" })
                }
              >
                <BookOpen />
              </IconButton>
              <IconButton
                color="gray"
                variant="ghost"
                size="sm"
                aria-label="切换活动面板"
                className="hidden xl:inline-flex"
                onClick={() => setShowActivity((v) => !v)}
              >
                {showActivity ? <PanelRightClose /> : <PanelRightOpen />}
              </IconButton>
            </span>
          }
        />

        <CardContent
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 thin-scrollbar flex-1 overflow-y-auto"
        >
          {chat.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Sparkles />
                  </EmptyMedia>
                  <EmptyTitle>SOC AI 助手</EmptyTitle>
                  <EmptyDescription>
                    可以查询
                    DLP/天眼告警、定位身份、创建工作流、封禁域名,并直接操作左侧各模块界面。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    onClick={() => send(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {chat.messages.map((m, i) => (
                <ChatMessage
                  key={m.id || i}
                  msg={m}
                  wide
                  streaming={chat.streaming && i === chat.messages.length - 1}
                />
              ))}
            </ul>
          )}
        </CardContent>

        {/* attachments strip */}
        {chat.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1 px-4">
            {chat.attachments.map((a, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {a.name}
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => chat.removeAttachment(i)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}

        {/* composer — one bordered group: textarea on top, toolbar below */}
        <CardContent>
          <InputGroup>
            <InputGroupTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="向 AI 助手提问… (Enter 发送,Shift+Enter 换行,/clear 清空)"
              rows={1}
              className="max-h-40 min-h-9"
              disabled={chat.streaming}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="附加文件"
                onClick={pickFiles}
              >
                <Paperclip />
              </InputGroupButton>
              <Select value={effort} onValueChange={(v) => v && setEffort(v)}>
                <SelectTrigger
                  size="sm"
                  aria-label="思考强度"
                  className="h-6 gap-1 text-[11px] text-muted-foreground"
                >
                  <SelectValue placeholder="思考强度" />
                </SelectTrigger>
                <SelectContent>
                  {EFFORTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={chat.sessionEngine || "pi"}
                onValueChange={(v) => v && chat.setSessionEngine(v).catch(() => {})}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="引擎"
                  title="本会话使用的 agent 引擎（切换后从新上下文开始）"
                  className="h-6 gap-1 text-[11px] text-muted-foreground"
                >
                  <SelectValue placeholder="引擎" />
                </SelectTrigger>
                <SelectContent>
                  {ENGINES.map((e) => (
                    <SelectItem key={e.value} value={e.value} title={e.hint}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {engineModels.length > 0 ? (
                <Select
                  value={chat.sessionModel || DEFAULT_MODEL}
                  onValueChange={(v) =>
                    v && chat.setSessionModel(v === DEFAULT_MODEL ? "" : v)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="模型"
                    title="本会话使用的模型（默认 = 该引擎的平台默认模型）"
                    className="h-6 max-w-48 gap-1 text-[11px] text-muted-foreground"
                  >
                    <SelectValue placeholder="模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_MODEL}>
                      默认{engineDefault ? ` · ${engineDefault.name}` : ""}
                    </SelectItem>
                    {engineModels.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name}
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          {m.default_model}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : chat.models.length > 0 ? (
                <span className="text-[11px] text-destructive">
                  无可用模型（需在 AI 模型中添加{chat.sessionEngine === "codex" ? " OpenAI " : " Anthropic "}协议模型）
                </span>
              ) : null}
              <span className="ml-auto">
                {chat.streaming ? (
                  <IconButton
                    color="red"
                    variant="solid"
                    size="xs"
                    aria-label="停止"
                    onClick={chat.stop}
                  >
                    <Square />
                  </IconButton>
                ) : (
                  <IconButton
                    color="ai"
                    variant="solid"
                    size="xs"
                    aria-label="发送"
                    onClick={() => send()}
                    disabled={!input.trim() && chat.attachments.length === 0}
                  >
                    <Send />
                  </IconButton>
                )}
              </span>
            </InputGroupAddon>
          </InputGroup>
        </CardContent>

        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-ai/10 text-sm font-medium">
            放下以附加文件
          </div>
        ) : null}
      </Card>

      {/* ── Activity inspector ───────────────────────────────────────── */}
      {showActivity ? (
        <RailCard
          icon={Activity}
          title="本轮活动"
          count={activity.length || null}
          className="hidden w-72 shrink-0 xl:flex"
        >
          {activity.length === 0 ? (
            <RailMessage>最近一轮回答没有调用工具。</RailMessage>
          ) : (
            <RailBody>
              <ol className="flex flex-col gap-1">
                {activity.map((c, i) => {
                  const meta = toolMeta(c.name)
                  const Icon = meta.icon
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
                        cardStatic
                      )}
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {meta.label}
                      </span>
                      {c.done ? null : chat.streaming ? (
                        <Spinner className="size-3 shrink-0" />
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            </RailBody>
          )}
        </RailCard>
      ) : null}
    </div>
  )
}
