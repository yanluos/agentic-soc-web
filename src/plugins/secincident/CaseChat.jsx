// 案件会话（2026-11-06，案件闭环三期）：安全事件详情右栏的第二个视图。一条事件
// 一个共享会话（soc-ai /agent/cases/{id}/session|chat），所有有助手 + 安全事件权限
// 的值班人员看到同一份对话，用户消息带发言人。每轮后端实时注入案件快照（字段/
// 案件纪要/关联对象/最近时间线），AI 用 secincident_case_note 把结论与纪要写回
// 事件——所以写回后调用 onWroteBack 让时间线重拉。
//
// 流协议与 AI 助手相同（data: {"type":"text_delta"…}），渲染复用助手的 ChatMessage。
// 不复用 chatStore：那是按用户会话列表设计的单例，这里只有一个固定会话。
// 输入区与 AI 助手一致（2026-11-06）：附件（/agent/upload，sessionId=case-<id>，
// 后端只接受本人对本案件的上传）、思考强度、引擎、模型。引擎/模型是会话级的
// 共享设置（PATCH /agent/cases/{id}/session），切换后所有值班人员一致。

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Bot,
  Paperclip,
  Pin,
  RefreshCw,
  SendHorizontal,
  Square,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { Spinner } from "@/components/ui/spinner"
import { IconButton } from "@/components/IconButton.jsx"
import { decodeToken, getStoredToken } from "@/lib/jwt.js"
import { hasModule } from "@/platform/permissions.js"
import { ChatMessage } from "@/modules/assistant/ChatMessage.jsx"
import {
  authHeaders,
  mountCase,
  releaseTurn,
  startTurn,
  stopTurn,
  useCaseTurn,
} from "./caseChatStore.js"
import {
  EFFORTS,
  ENGINES,
  defaultModelForEngine,
  modelsForEngine,
} from "@/modules/assistant/chatStore.js"

// Radix Select items cannot carry "", so the "follow the default" row uses a
// sentinel.
const DEFAULT_MODEL = "__default__"
const MAX_UPLOAD = 50 * 1024 * 1024

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

export function CaseChat({ incidentId, title, onWroteBack }) {
  const [serverMessages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  // The turn lives in caseChatStore, not here: closing the dialog keeps it
  // running (and the backend finishes it even if the tab goes away).
  const turn = useCaseTurn(incidentId)
  const streaming = !!turn?.streaming
  const messages = turn ? turn.messages : serverMessages
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [input, setInput] = useState("")
  const [effort, setEffort] = useState("medium")
  const [engine, setEngine] = useState("pi")
  const [model, setModel] = useState("")
  const [models, setModels] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
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
      setEngine(data.engine || "pi")
      setModel(data.model || "")
    } catch (err) {
      toast.error(`读取案件会话失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetch("/agent/models", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setModels(Array.isArray(d?.models) ? d.models : []))
      .catch(() => {})
  }, [])

  const engineModels = modelsForEngine(models, engine)
  const engineDefault = defaultModelForEngine(models, engine)

  // Engine/model are the shared session's pins.
  const pin = async (patch) => {
    try {
      const resp = await fetch(`/agent/cases/${incidentId}/session`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!resp.ok) throw new Error((await resp.text()) || `${resp.status}`)
      const d = await resp.json()
      setEngine(d.engine || "pi")
      setModel(d.model || "")
    } catch (err) {
      toast.error(`切换失败：${err.message}`)
    }
  }

  const addFiles = async (files) => {
    setUploading(true)
    for (const file of files) {
      if (file.size > MAX_UPLOAD) {
        toast.error(`${file.name} 超过 50MB`)
        continue
      }
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("sessionId", `case-${incidentId}`)
        const resp = await fetch("/agent/upload", {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        })
        if (!resp.ok) throw new Error((await resp.text()) || `${resp.status}`)
        const d = await resp.json()
        setAttachments((a) => [
          ...a,
          { name: d.name || file.name, path: d.path },
        ])
      } catch (err) {
        toast.error(`上传 ${file.name} 失败：${err.message}`)
      }
    }
    setUploading(false)
  }

  const pickFiles = () => {
    const el = document.createElement("input")
    el.type = "file"
    el.multiple = true
    el.onchange = () => el.files && addFiles(Array.from(el.files))
    el.click()
  }

  // Someone else is mid-turn: poll until their answer lands.
  useEffect(() => {
    if (!remoteBusy || streaming) return
    const t = setTimeout(load, 2000)
    return () => clearTimeout(t)
  }, [remoteBusy, streaming, load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  // Register this dialog with the store (clears this incident's 「AI 已回复」
  // notice; a closed dialog with nothing in flight releases its turn state).
  useEffect(() => mountCase(incidentId), [incidentId])

  // Our own turn finished while the dialog is open: reload the persisted
  // transcript, then drop the store copy.
  const wroteBackRef = useRef(onWroteBack)
  wroteBackRef.current = onWroteBack
  const finished = !!turn && !turn.streaming
  const wrote = !!turn?.wrote
  useEffect(() => {
    if (!finished) return
    load().then(() => {
      if (wrote) wroteBackRef.current?.()
      releaseTurn(incidentId)
    })
  }, [finished, wrote, load, incidentId])

  const send = async (text) => {
    const typed = String(text ?? input).trim()
    if ((!typed && attachments.length === 0) || streaming) return
    // The shared transcript names the files (others see what was attached);
    // the path lets the agent Read binaries the inline file context skips.
    const files = attachments
    const message = files.length
      ? `${typed || "请分析附件"}\n\n📎 附件：${files.map((f) => `${f.name}（${f.path}）`).join("、")}`
      : typed
    setInput("")
    setAttachments([])
    startTurn(incidentId, {
      title,
      base: serverMessages,
      message,
      author: me,
      body: { effort, filePaths: files.map((f) => f.path) },
    })
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
                  streaming={busy && last && m.role === "assistant"}
                />
              )
            })}
            {!busy &&
            messages[messages.length - 1]?.role === "assistant" &&
            messages[messages.length - 1]?.text ? (
              <li className="flex justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  title="AI 平时自行判断哪些内容写回事件；这里可以要求它把上一条回答里值得沉淀的内容记入时间线/案件纪要"
                  onClick={() =>
                    send(
                      "【记入案件】请把你上一条回答中值得沉淀的结论记入案件时间线，必要时更新案件纪要。"
                    )
                  }
                >
                  <Pin />
                  记入案件
                </Button>
              </li>
            ) : null}
            <li ref={endRef} />
          </ul>
        )}
      </div>

      {remoteBusy && !streaming ? (
        <p className="flex items-center gap-1 text-muted-foreground">
          <Spinner className="size-3" />
          AI 正在回答（他人发起或页面刷新前发起），完成后自动刷新…
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {attachments.map((a, i) => (
            <Badge key={a.path} variant="secondary" className="gap-1">
              {a.name}
              <button
                type="button"
                aria-label="移除附件"
                onClick={() =>
                  setAttachments((l) => l.filter((_, j) => j !== i))
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files || [])
            if (files.length) {
              e.preventDefault()
              addFiles(files)
            }
          }}
          placeholder={
            busy
              ? "AI 正在回答…"
              : "就本事件提问或下达处置意见（Enter 发送，Shift+Enter 换行，可粘贴文件）"
          }
          disabled={busy}
          rows={2}
          className="max-h-40 min-h-9 text-xs"
        />
        <InputGroupAddon align="block-end" className="flex-wrap">
          <InputGroupButton
            size="icon-xs"
            aria-label="附加文件"
            onClick={pickFiles}
            disabled={busy || uploading}
          >
            {uploading ? <Spinner /> : <Paperclip />}
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
            value={engine}
            onValueChange={(v) => v && v !== engine && pin({ engine: v })}
            disabled={busy}
          >
            <SelectTrigger
              size="sm"
              aria-label="引擎"
              title="案件会话使用的 agent 引擎（所有值班人员共享；切换后从新上下文开始，此前对话以文字带入）"
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
              value={model || DEFAULT_MODEL}
              onValueChange={(v) =>
                v && pin({ model: v === DEFAULT_MODEL ? "" : v })
              }
              disabled={busy}
            >
              <SelectTrigger
                size="sm"
                aria-label="模型"
                title="案件会话使用的模型（所有值班人员共享；默认 = 该引擎的平台默认模型）"
                className="h-6 max-w-40 gap-1 text-[11px] text-muted-foreground"
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : models.length > 0 ? (
            <span className="text-[11px] text-destructive">无可用模型</span>
          ) : null}
          <span className="ml-auto flex items-center gap-1">
            <IconButton
              color="gray"
              variant="ghost"
              size="xs"
              aria-label="刷新会话"
              onClick={load}
              disabled={busy}
            >
              <RefreshCw />
            </IconButton>
            {busy ? (
              <IconButton
                color="red"
                variant="solid"
                size="xs"
                aria-label="停止"
                onClick={() => stopTurn(incidentId).then(load)}
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
                disabled={busy || (!input.trim() && attachments.length === 0)}
              >
                <SendHorizontal />
              </IconButton>
            )}
          </span>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

export default CaseChat
