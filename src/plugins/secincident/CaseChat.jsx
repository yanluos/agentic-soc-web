// 案件会话（2026-11-06，案件闭环三期）：安全事件详情右栏的第二个视图。一条事件
// 一个共享会话（soc-ai /agent/cases/{id}/session|chat），所有有助手 + 安全事件权限
// 的值班人员看到同一份对话，用户消息带发言人。每轮后端实时注入案件快照（字段/
// 案件纪要/关联对象/最近时间线），AI 用 secincident_case_note 把结论与纪要写回
// 事件——所以写回后调用 onWroteBack 让时间线重拉。
//
// 流协议与 AI 助手相同（data: {"type":"text_delta"…}），渲染复用助手的 ChatMessage。
// 不复用 chatStore：那是按用户会话列表设计的单例，这里只有一个固定会话。

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Bot, RefreshCw, SendHorizontal, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { IconButton } from "@/components/IconButton.jsx"
import { decodeToken, getStoredToken } from "@/lib/jwt.js"
import { hasModule } from "@/platform/permissions.js"
import { ChatMessage } from "@/modules/assistant/ChatMessage.jsx"

const QUICK_PROMPTS = [
  "总结这个案件的现状、已确认的事实和下一步",
  "自上次跟进以来，日志里还有新的相关命中吗？",
  "起草一段发给责任人的处置说明",
]

// canUseCaseChat: the routes need BOTH assistant and table:secincident.
export function canUseCaseChat() {
  const user = decodeToken(getStoredToken())
  return hasModule(user, "assistant") && hasModule(user, "table:secincident")
}

function authHeaders() {
  return { Authorization: `Bearer ${getStoredToken()}` }
}

function parseSSELine(line) {
  const t = line.trim()
  if (!t.startsWith("data:")) return null
  try {
    return JSON.parse(t.slice(5).trim())
  } catch {
    return null
  }
}

export function CaseChat({ incidentId, onWroteBack }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [input, setInput] = useState("")
  const abortRef = useRef(null)
  const endRef = useRef(null)
  const me = decodeToken(getStoredToken())?.username || ""

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/agent/cases/${incidentId}/session`, {
        headers: authHeaders(),
      })
      if (!resp.ok) throw new Error((await resp.text()) || `${resp.status}`)
      const data = await resp.json()
      setMessages(data.displayMessages || [])
      setRemoteBusy(!!data.busy)
    } catch (err) {
      toast.error(`读取案件会话失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    load()
  }, [load])

  // Someone else is mid-turn: poll until their answer lands.
  useEffect(() => {
    if (!remoteBusy || streaming) return
    const t = setTimeout(load, 5000)
    return () => clearTimeout(t)
  }, [remoteBusy, streaming, load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  // Abort only on unmount of the whole dialog (closing it ends the turn —
  // the persisted part is kept server-side).
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (text) => {
    const message = String(text ?? input).trim()
    if (!message || streaming) return
    setInput("")
    const asst = {
      id: `a${Date.now()}`,
      role: "assistant",
      text: "",
      toolCalls: [],
    }
    setMessages((m) => [
      ...m,
      { id: `u${Date.now()}`, role: "user", text: message, author: me },
      asst,
    ])
    const patch = (fn) =>
      setMessages((m) => {
        const next = m.slice()
        next[next.length - 1] = fn(next[next.length - 1])
        return next
      })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStreaming(true)
    let wrote = false
    try {
      const resp = await fetch(`/agent/cases/${incidentId}/chat`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: ctrl.signal,
      })
      if (!resp.ok || !resp.body)
        throw new Error((await resp.text()) || `${resp.status}`)
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          const ev = parseSSELine(line)
          if (!ev) continue
          switch (ev.type) {
            case "text_delta":
              patch((m) => ({ ...m, text: (m.text || "") + (ev.text || "") }))
              break
            case "thinking_delta":
              patch((m) => ({
                ...m,
                thinking: (m.thinking || "") + (ev.text || ""),
              }))
              break
            case "tool_start":
              patch((m) => ({
                ...m,
                toolCalls: [
                  ...(m.toolCalls || []),
                  { type: "tool_start", name: ev.name, input: ev.input },
                ],
              }))
              break
            case "tool_result":
              if (String(ev.name || "").includes("secincident_case"))
                wrote = true
              patch((m) => ({
                ...m,
                toolCalls: [
                  ...(m.toolCalls || []),
                  { type: "tool_result", name: ev.name, result: ev.result },
                ],
              }))
              break
            case "error":
              toast.error(ev.message || "AI 错误")
              break
            default:
              break
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") toast.error(`对话失败：${err.message}`)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
    await load()
    if (wrote) onWroteBack?.()
  }

  const busy = streaming || remoteBusy

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bot />
              </EmptyMedia>
              <EmptyTitle>案件会话</EmptyTitle>
              <EmptyDescription>
                与 AI 围绕本事件协作研判。会话由所有值班人员共享，AI
                每轮都会读取最新的案件纪要、关联工单/应急/封禁与时间线；确认的结论可让它记入时间线。
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => send(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const last = i === messages.length - 1
              return m.role === "user" && m.author ? (
                <li key={m.id || i} className="flex flex-col items-end gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    {m.author}
                  </span>
                  <ul className="w-full">
                    <ChatMessage msg={m} />
                  </ul>
                </li>
              ) : (
                <ChatMessage
                  key={m.id || i}
                  msg={m}
                  streaming={streaming && last && m.role === "assistant"}
                />
              )
            })}
            <li ref={endRef} />
          </ul>
        )}
      </div>

      {remoteBusy && !streaming ? (
        <p className="flex items-center gap-1 text-muted-foreground">
          <Spinner className="size-3" />
          其他值班人员正在与 AI 对话，回答完成后自动刷新…
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
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
          placeholder={
            busy
              ? "AI 正在回答…"
              : "就本事件提问或下达处置意见（Enter 发送，Shift+Enter 换行）"
          }
          disabled={busy}
          rows={2}
          className="min-h-0 resize-none text-xs"
        />
        <div className="flex flex-col gap-1">
          <IconButton
            color="gray"
            variant="ghost"
            size="sm"
            aria-label="刷新会话"
            onClick={load}
            disabled={streaming}
          >
            <RefreshCw />
          </IconButton>
          {streaming ? (
            <IconButton
              color="red"
              variant="soft"
              size="sm"
              aria-label="停止"
              onClick={() => abortRef.current?.abort()}
            >
              <Square />
            </IconButton>
          ) : (
            <IconButton
              color="purple"
              size="sm"
              aria-label="发送"
              onClick={() => send()}
              disabled={busy || !input.trim()}
            >
              <SendHorizontal />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}

export default CaseChat
