// Singleton chat store for the AI assistant — shared by the full-page
// workbench (AssistantModule) and the FloatingAi panel, and deliberately
// living OUTSIDE React so an in-flight /agent/chat turn survives module
// switches: the workbench unmounts when the user navigates elsewhere, the
// floating ball mounts in its place, and both read/write this one object.
// Before this the stream state was component-local, so leaving the 助手
// module mid-turn dropped the live answer (the backend kept working, but the
// UI lost the stream and only showed the result after re-selecting the
// session once it had been persisted).
//
// Consumers use the `useAgentChat` hook (useAgentChat.js); this file is the
// engine: sessions CRUD, attachments, the SSE reader and the "in-flight turn"
// bookkeeping that lets the streamed messages follow the active session.
//
// Turns are tracked PER SESSION (`turns` map), so several sessions of the same
// user can stream at once — the backend is per-session too (soc-ai activeChats
// + agent-core inFlight both key on sessionId). `state.streaming` is derived:
// "the ACTIVE session has a live turn"; `state.streamingIds` lists every
// session that does, for the rail spinners. Before 2026-09-22 one global
// streaming flag / AbortController made the assistant feel single-threaded:
// while any session streamed, sendMessage in every other session returned
// early and the composer was disabled.

import { toast } from "sonner"
import { normalizeActionEvent } from "@/platform"
import { getStoredToken } from "@/lib/jwt.js"

function authHeaders() {
  return { Authorization: `Bearer ${getStoredToken()}` }
}

async function jsonOrThrow(resp) {
  if (!resp.ok) throw new Error((await resp.text()) || `${resp.status}`)
  return resp.json()
}

// ── state ─────────────────────────────────────────────────────────────
const initialState = () => ({
  models: [],
  defaultModel: "",
  sessions: [],
  activeId: null,
  messages: [],
  streaming: false, // derived in setState: turns.has(activeId)
  streamingIds: [], // every session id with a live turn
  attachments: [],
  sessionModel: "", // model pinned on the active session ("" = platform default)
  sessionEngine: "pi", // agent engine of the active session (pi | claude-code | codex)
})

// Agent engines run by agent-core. Each needs registry models of one wire
// protocol (ai_models.api): Codex speaks the OpenAI Responses API, the other
// two the Anthropic Messages API.
export const ENGINES = [
  { value: "pi", label: "pi", hint: "agent-core 内置的 pi 引擎" },
  { value: "claude-code", label: "Claude Code", hint: "Anthropic Claude Code（需 Anthropic 协议模型）" },
  { value: "codex", label: "Codex", hint: "OpenAI Codex（需 OpenAI Responses 协议模型）" },
]

export const engineLabel = (e) => ENGINES.find((x) => x.value === e)?.label || "pi"

// The registry rows an engine can use, and its fallback model (the platform
// default when its protocol fits, else the first fitting row) — mirrors
// soc-ai's aimodels.PickForEngine.
export function modelsForEngine(models, engine) {
  const want = engine === "codex" ? "openai" : "anthropic"
  return models.filter((m) => (m.api || "anthropic") === want)
}

export function defaultModelForEngine(models, engine) {
  const fit = modelsForEngine(models, engine)
  return fit.find((m) => m.is_default) || fit[0] || null
}

let state = initialState()
const listeners = new Set()

function setState(patch) {
  const next = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }
  next.streaming = turns.has(next.activeId)
  state = next
  for (const l of listeners) l()
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getState() {
  return state
}

// ── non-rendered bookkeeping ──────────────────────────────────────────
let inited = false
let creating = null // in-flight createSession promise
const fresh = new Set() // sessions created in this tab: skip their first history GET
let loadSeq = 0 // discards a stale history GET when the selection moved on
// Live turns, sessionId → { sessionId, userMsg, asstMsg, abortCtl }: each
// turn's two optimistic messages plus its abort handle. Switching to another
// session and back re-appends that session's pair after its history loads,
// and stream patches only touch the last message when it IS the turn's
// asstMsg object (identity check), so a mid-turn selection change can never
// write into the wrong session's pane.
const turns = new Map()

// Re-derive streamingIds after `turns` changed (streaming itself is derived on
// every setState).
function publishTurns() {
  setState({ streamingIds: [...turns.keys()] })
}

// Abort a session's live turn and forget it immediately (the fetch's
// AbortError lands later; its finally sees a different/missing turn and
// writes nothing).
function abortTurn(id) {
  const t = turns.get(id)
  if (!t) return
  t.abortCtl.abort()
  turns.delete(id)
  publishTurns()
}

function sessionLabel(id) {
  return state.sessions.find((s) => s.id === id)?.title || String(id).slice(0, 6)
}
let actionHandler = null
const visibleSurfaces = new Set()

export function setActionHandler(fn) {
  actionHandler = fn || null
}

// A surface (workbench / floating panel) tells the store while it is showing
// the conversation, so a turn that finishes with nobody watching can announce
// itself with a toast.
export function setSurfaceVisible(key, visible) {
  if (visible) visibleSurfaces.add(key)
  else visibleSurfaces.delete(key)
}

// Drop everything (logout / user switch). Aborts a live stream.
export function reset() {
  for (const t of turns.values()) t.abortCtl.abort()
  turns.clear()
  creating = null
  fresh.clear()
  inited = false
  loadSeq++
  state = initialState()
  for (const l of listeners) l()
}

// ── init ──────────────────────────────────────────────────────────────
// The model registry is edited on the AI 模型 page while this store lives on,
// so the picker list is re-fetched whenever a chat surface opens or the
// engine changes — not only once per page load (a model added after the
// first fetch used to stay invisible until a reload).
export function refreshModels() {
  fetch("/agent/models", { headers: authHeaders() })
    .then(jsonOrThrow)
    .then((d) => {
      setState({
        models: Array.isArray(d?.models) ? d.models : [],
        defaultModel: d?.default || "",
      })
    })
    .catch(() => {
      /* picker keeps the last list — chat still works on the default */
    })
}

export function ensureInit() {
  if (inited) return
  inited = true
  refreshModels()
  refreshSessions()
    .then((list) => {
      // Never steal the selection from a session created/picked meanwhile.
      if (list.length > 0 && !state.activeId && !creating) setActiveId(list[0].id)
    })
    .catch((err) => toast.error(`加载会话失败: ${err.message}`))
}

// ── sessions ──────────────────────────────────────────────────────────
export async function refreshSessions() {
  const resp = await fetch("/agent/sessions", { headers: authHeaders() })
  const data = await jsonOrThrow(resp)
  const list = Array.isArray(data) ? data : data?.sessions || []
  setState({ sessions: list })
  return list
}

export function setActiveId(id) {
  const seq = ++loadSeq
  setState({ activeId: id })
  if (!id) {
    setState({ messages: [], sessionModel: "", sessionEngine: "pi" })
    return
  }
  if (fresh.has(id)) {
    fresh.delete(id)
    return // createSession already blanked the pane; a live send may be in it
  }
  fetch(`/agent/sessions/${id}`, { headers: authHeaders() })
    .then(jsonOrThrow)
    .then((s) => {
      if (seq !== loadSeq) return
      let msgs = s?.displayMessages || s?.messages || []
      const t = turns.get(id)
      if (t) msgs = [...msgs, t.userMsg, t.asstMsg]
      setState({ messages: msgs, sessionModel: s?.model || "", sessionEngine: s?.engine || "pi" })
    })
    .catch((err) => {
      if (seq === loadSeq) toast.error(`加载消息失败: ${err.message}`)
    })
}

export async function createSession() {
  // Detach from the current session immediately so the pane goes blank and
  // no in-flight send can still target it, then publish the promise so
  // sendMessage/addFiles can await it instead of racing it.
  loadSeq++
  // A new conversation keeps the engine/model picked in the composer; they
  // ride along on its first turn.
  setState({ activeId: null, messages: [] })
  const pending = (async () => {
    const resp = await fetch("/agent/sessions", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: "{}",
    })
    const s = await jsonOrThrow(resp)
    fresh.add(s.id)
    setState((st) => ({ sessions: [s, ...st.sessions] }))
    setActiveId(s.id)
    return s
  })()
  creating = pending
  try {
    return await pending
  } finally {
    if (creating === pending) creating = null
  }
}

export async function deleteSession(id) {
  abortTurn(id) // a live turn must not outlive (and re-persist) the session
  const resp = await fetch(`/agent/sessions/${id}`, { method: "DELETE", headers: authHeaders() })
  if (!resp.ok && resp.status !== 204) throw new Error(`${resp.status}`)
  setState((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }))
  if (state.activeId === id) setActiveId(null)
}

export async function renameSession(id, title) {
  const resp = await fetch(`/agent/sessions/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  const s = await jsonOrThrow(resp)
  setState((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, title: s.title } : x)) }))
}

// Pin a registry model on the active session ("" = platform default). Without
// a session yet, the choice rides along on the first turn's `model` field,
// which the backend persists onto the session it creates.
export async function setSessionModel(name) {
  const next = name || ""
  const prev = state.sessionModel
  setState({ sessionModel: next })
  const id = state.activeId
  if (!id) return
  try {
    const s = await jsonOrThrow(
      await fetch(`/agent/sessions/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      }),
    )
    setState((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, model: s.model || "" } : x)) }))
  } catch (err) {
    setState({ sessionModel: prev })
    toast.error(`切换模型失败: ${err.message}`)
    throw err
  }
}

// Switch the active session's agent engine. The backend drops a pinned model
// of the other protocol (the reply says which model stays pinned); the next
// turn on a different engine starts a fresh model-side context.
export async function setSessionEngine(engine) {
  const next = engine || "pi"
  refreshModels()
  const prev = { sessionEngine: state.sessionEngine, sessionModel: state.sessionModel }
  const pinned = state.models.find((m) => m.name === state.sessionModel)
  const keepModel = pinned && modelsForEngine([pinned], next).length > 0
  setState({ sessionEngine: next, sessionModel: keepModel ? state.sessionModel : "" })
  const id = state.activeId
  if (!id) return
  try {
    const s = await jsonOrThrow(
      await fetch(`/agent/sessions/${id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ engine: next }),
      }),
    )
    setState((st) => ({
      sessionModel: s.model || "",
      sessions: st.sessions.map((x) => (x.id === id ? { ...x, engine: s.engine, model: s.model || "" } : x)),
    }))
  } catch (err) {
    setState(prev)
    toast.error(`切换引擎失败: ${err.message}`)
    throw err
  }
}

// ── attachments ───────────────────────────────────────────────────────
export async function addFiles(files) {
  // Uploads are stored per session (the backend refuses one without a
  // sessionId), so attaching a file to a not-yet-created conversation must
  // create the session first — same as sendMessage does.
  if (creating) {
    try {
      await creating
    } catch {
      /* surfaced by createSession's caller */
    }
  }
  if (!state.activeId) {
    try {
      await createSession()
    } catch (err) {
      toast.error(`创建会话失败: ${err.message}`)
      return
    }
  }
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`${file.name} 超过 50MB`)
      continue
    }
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("sessionId", state.activeId)
      const resp = await fetch("/agent/upload", { method: "POST", headers: authHeaders(), body: fd })
      const data = await jsonOrThrow(resp)
      setState((st) => ({ attachments: [...st.attachments, { name: file.name, path: data.path || data.url }] }))
      toast.success(`已附加 ${file.name}`)
    } catch (err) {
      toast.error(`上传 ${file.name} 失败: ${err.message}`)
    }
  }
}

export function removeAttachment(idx) {
  setState((st) => ({ attachments: st.attachments.filter((_, i) => i !== idx) }))
}

// ── local-only message edits (slash commands) ─────────────────────────
export function clearMessages() {
  setState({ messages: [] })
}

export function pushNote(text) {
  setState((st) => ({ messages: [...st.messages, { role: "assistant", text, ts: Date.now() }] }))
}

// ── chat ──────────────────────────────────────────────────────────────
// Stops the ACTIVE session's turn only; other sessions keep streaming.
export function stop() {
  turns.get(state.activeId)?.abortCtl.abort()
}

export async function sendMessage(text, { effort } = {}) {
  const message = (text || "").trim()
  // `streaming` = the active session already has a live turn. Other sessions
  // streaming do not block this one.
  if ((!message && state.attachments.length === 0) || state.streaming) return

  // A 新会话 click may still be in flight — wait for it rather than reading
  // a stale activeId and writing into the previous session.
  if (creating) {
    try {
      await creating
    } catch {
      /* surfaced by createSession's caller */
    }
  }
  let sessionId = state.activeId
  if (!sessionId) {
    try {
      sessionId = (await createSession()).id
    } catch (err) {
      toast.error(`创建会话失败: ${err.message}`)
      return
    }
  }
  // Re-check after the awaits: the per-session guard proper (the backend
  // answers 该会话正在对话中 as the safety net).
  if (turns.has(sessionId)) return

  const filePaths = state.attachments.map((a) => a.path)
  const userMsg = { role: "user", text: message || "（请分析附件）", attachments: filePaths, ts: Date.now() }
  const turn = {
    sessionId,
    userMsg,
    asstMsg: { role: "assistant", text: "", thinking: "", toolCalls: [], ts: Date.now() },
    abortCtl: new AbortController(),
  }
  turns.set(sessionId, turn)
  setState((st) => ({
    messages: st.activeId === sessionId ? [...st.messages, userMsg, turn.asstMsg] : st.messages,
    attachments: [],
    streamingIds: [...turns.keys()],
  }))
  const signal = turn.abortCtl.signal

  // Replace the streaming assistant message. Only the pane currently showing
  // that exact object is patched, so a selection change mid-turn is safe.
  const patch = (fn) => {
    const prev = turn.asstMsg
    turn.asstMsg = fn(prev)
    if (state.activeId !== sessionId) return
    setState((st) => {
      const n = st.messages.length
      if (n === 0 || st.messages[n - 1] !== prev) return {}
      const next = st.messages.slice()
      next[n - 1] = turn.asstMsg
      return { messages: next }
    })
  }
  const inPane = () => state.activeId === sessionId

  let aborted = false
  try {
    const resp = await fetch("/agent/chat", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId,
        effort: effort || undefined,
        model: state.sessionModel || undefined,
        engine: state.sessionEngine || undefined,
        filePaths,
      }),
      signal,
    })
    if (!resp.ok || !resp.body) throw new Error((await resp.text()) || `${resp.status}`)

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
            patch((m) => ({ ...m, thinking: (m.thinking || "") + (ev.text || "") }))
            break
          case "tool_start":
            patch((m) => ({
              ...m,
              toolCalls: [...(m.toolCalls || []), { type: "tool_start", name: ev.name, input: ev.input }],
            }))
            break
          case "tool_result":
            patch((m) => ({
              ...m,
              toolCalls: [...(m.toolCalls || []), { type: "tool_result", name: ev.name, result: ev.result }],
            }))
            break
          case "action":
            actionHandler?.(normalizeActionEvent(ev))
            break
          case "system":
            if (ev.action === "cleared" && state.activeId === sessionId) setState({ messages: [] })
            break
          case "error":
            toast.error(inPane() ? ev.message || "AI 错误" : `会话「${sessionLabel(sessionId)}」: ${ev.message || "AI 错误"}`)
            break
          default:
            break
        }
      }
    }
  } catch (err) {
    aborted = err.name === "AbortError"
    if (!aborted) toast.error(`对话失败${inPane() ? "" : `（${sessionLabel(sessionId)}）`}: ${err.message}`)
  } finally {
    // Identity guard: deleteSession/reset may already have dropped this turn.
    if (turns.get(sessionId) === turn) {
      turns.delete(sessionId)
      publishTurns()
    }
  }
  if (aborted) return

  // Refresh titles first (the first message auto-titles the session) so the
  // toast below can name it.
  await refreshSessions().catch(() => {})
  // Announce a turn nobody watched finish: no surface open, or the user is
  // looking at another session.
  const watched = visibleSurfaces.size > 0 && inPane()
  if (!watched) {
    toast.info(`会话「${sessionLabel(sessionId)}」已完成回答`, {
      action: {
        label: "查看",
        onClick: () => {
          setActiveId(sessionId)
          if (visibleSurfaces.size === 0) actionHandler?.({ type: "navigate", module: "assistant" })
        },
      },
    })
  }
}

// Backend frames are `data: {"type":"text_delta",...}` — the event name rides
// in the payload.
function parseSSELine(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("data:")) return null
  try {
    return JSON.parse(trimmed.slice(5).trim())
  } catch {
    return null
  }
}
