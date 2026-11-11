// 案件会话的回合状态（2026-11-06）：放在模块级而不是组件里，关掉事件弹窗不会
// 中断正在回答的 AI——流在后台读完，后端（soc-ai 把案件回合与请求解绑）也会
// 跑完并落库。没有在途回合时不留任何状态（组件卸载即释放）。
//
// 回合结束时若对应弹窗没开，生成一条「AI 已回复」提醒，由列表右上角的
// CaseChatNotices 展示。页面刷新后流断了，但回合还在后端跑：发起过的事件记在
// localStorage（watching），轮询 …/session 的 busy 直到完成再提醒。

import { useEffect, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { getStoredToken } from "@/lib/jwt.js"

const WATCH_KEY = "secincident:case-chat-watching"
const WATCH_TTL_MS = 60 * 60 * 1000 // a turn older than this is not waited for
const POLL_MS = 5000

const turns = new Map() // incidentId → {messages, streaming, wrote, title, ctrl}
const mounted = new Map() // incidentId → open dialogs showing its chat
let notices = [] // [{id, title, at, preview, error}]
let watching = readWatching() // {incidentId: {title, since}}
const listeners = new Set()
let pollTimer = null
// A page unload kills our stream but not the backend turn: keep the
// watching entry so the next page load waits for it.
let unloading = false
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    unloading = true
  })
}

function emit() {
  for (const l of listeners) l()
}
function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function readWatching() {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) || "{}")
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}
function writeWatching(next) {
  watching = next
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(next))
  } catch {
    /* private mode: watching only lives for this page */
  }
}

export function authHeaders() {
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

function setTurn(id, patch) {
  const cur = turns.get(id)
  if (!cur) return
  turns.set(id, {
    ...cur,
    ...(typeof patch === "function" ? patch(cur) : patch),
  })
  emit()
}

function patchLast(id, fn) {
  setTurn(id, (t) => {
    const messages = t.messages.slice()
    messages[messages.length - 1] = fn(messages[messages.length - 1])
    return { messages }
  })
}

// ── hooks ──
export function useCaseTurn(id) {
  return useSyncExternalStore(subscribe, () => turns.get(String(id)) || null)
}
export function useCaseNotices() {
  return useSyncExternalStore(subscribe, () => notices)
}
let pendingSnap = []
function pendingSnapshot() {
  const ids = new Set(Object.keys(watching))
  for (const [id, t] of turns) if (t.streaming) ids.add(id)
  const next = [...ids]
    .map((id) => ({
      id,
      title: turns.get(id)?.title || watching[id]?.title || "",
    }))
    .filter((p) => !mounted.get(p.id))
  if (
    next.length !== pendingSnap.length ||
    next.some((p, i) => p.id !== pendingSnap[i].id)
  )
    pendingSnap = next
  return pendingSnap
}
// usePendingTurns: own turns still running whose dialog is closed.
export function usePendingTurns() {
  return useSyncExternalStore(subscribe, pendingSnapshot)
}

// ── dialog lifecycle ──
export function mountCase(id) {
  id = String(id)
  mounted.set(id, (mounted.get(id) || 0) + 1)
  if (notices.some((n) => n.id === id)) {
    notices = notices.filter((n) => n.id !== id)
  }
  emit()
  return () => {
    const n = (mounted.get(id) || 1) - 1
    if (n > 0) mounted.set(id, n)
    else mounted.delete(id)
    // Nothing in flight → nothing to keep.
    if (!turns.get(id)?.streaming) turns.delete(id)
    emit()
  }
}

// releaseTurn drops a finished turn once its dialog has reloaded the
// persisted transcript.
export function releaseTurn(id) {
  id = String(id)
  if (turns.get(id) && !turns.get(id).streaming) {
    turns.delete(id)
    emit()
  }
}

export function dismissNotice(id) {
  notices = notices.filter((n) => n.id !== String(id))
  emit()
}
export function dismissAllNotices() {
  notices = []
  emit()
}

// plain flattens the answer's markdown for the one-line notice preview.
function plain(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function finish(id, { title, preview, error }) {
  const w = { ...watching }
  delete w[id]
  writeWatching(w)
  if (!mounted.get(id)) {
    notices = [
      {
        id,
        title,
        at: Date.now(),
        preview: plain(preview).slice(0, 80),
        error: !!error,
      },
      ...notices.filter((n) => n.id !== id),
    ]
    toast(error ? `事件 #${id} 案件会话回答中断` : `事件 #${id} 的 AI 已回复`, {
      description: title || undefined,
    })
    turns.delete(id) // dialog closed: release now
  }
  emit()
  ensurePolling()
}

// startTurn sends one message and streams the answer into the store.
export async function startTurn(id, { title, base, message, author, body }) {
  id = String(id)
  if (turns.get(id)?.streaming) return
  const now = Date.now()
  const ctrl = new AbortController()
  turns.set(id, {
    title,
    ctrl,
    streaming: true,
    wrote: false,
    messages: [
      ...base,
      { id: `u${now}`, role: "user", text: message, author },
      { id: `a${now}`, role: "assistant", text: "", toolCalls: [] },
    ],
  })
  writeWatching({ ...watching, [id]: { title, since: now } })
  emit()
  let error = ""
  try {
    const resp = await fetch(`/agent/cases/${id}/chat`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...body }),
      signal: ctrl.signal,
    })
    if (!resp.ok || !resp.body)
      throw new Error((await resp.text()) || `${resp.status}`)
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
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
            patchLast(id, (m) => ({
              ...m,
              text: (m.text || "") + (ev.text || ""),
            }))
            break
          case "thinking_delta":
            patchLast(id, (m) => ({
              ...m,
              thinking: (m.thinking || "") + (ev.text || ""),
            }))
            break
          case "tool_start":
            patchLast(id, (m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls || []),
                { type: "tool_start", name: ev.name, input: ev.input },
              ],
            }))
            break
          case "tool_result":
            if (String(ev.name || "").includes("secincident_case"))
              setTurn(id, { wrote: true })
            patchLast(id, (m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls || []),
                { type: "tool_result", name: ev.name, result: ev.result },
              ],
            }))
            break
          case "error":
            error = ev.message || "AI 错误"
            if (mounted.get(id)) toast.error(error)
            break
          default:
            break
        }
      }
    }
  } catch (err) {
    if (unloading) return
    const stopped = !!turns.get(id)?.stopped
    if (err.name === "AbortError" ? !stopped : err instanceof TypeError) {
      // Our connection broke (network, proxy timeout), the backend turn did
      // not: let the poller report it once the session is idle.
      setTurn(id, { streaming: false, ctrl: null })
      if (!mounted.get(id)) turns.delete(id)
      emit()
      ensurePolling()
      return
    }
    if (err.name !== "AbortError") {
      error = err.message
      toast.error(`对话失败：${err.message}`)
    }
  }
  const t = turns.get(id)
  const last = t?.messages[t.messages.length - 1]
  setTurn(id, { streaming: false, ctrl: null })
  finish(id, { title, preview: last?.text, error })
}

// stopTurn ends the case session's running turn (whoever started it):
// closing the dialog no longer does.
export async function stopTurn(id) {
  id = String(id)
  try {
    await fetch(`/agent/cases/${id}/stop`, {
      method: "POST",
      headers: authHeaders(),
    })
  } catch {
    /* the abort below still ends our own stream */
  }
  setTurn(id, { stopped: true })
  turns.get(id)?.ctrl?.abort()
}

// ── after a reload: wait for turns the stream no longer covers ──
async function pollWatching() {
  pollTimer = null
  const now = Date.now()
  for (const [id, w] of Object.entries(watching)) {
    if (turns.get(id)?.streaming) continue
    if (now - (w.since || 0) > WATCH_TTL_MS) {
      const next = { ...watching }
      delete next[id]
      writeWatching(next)
      emit()
      continue
    }
    try {
      const resp = await fetch(`/agent/cases/${id}/session`, {
        headers: authHeaders(),
      })
      if (!resp.ok) continue
      const d = await resp.json()
      if (!d.busy) {
        const msgs = d.displayMessages || []
        finish(id, { title: w.title, preview: msgs[msgs.length - 1]?.text })
      }
    } catch {
      /* try again next tick */
    }
  }
  ensurePolling()
}

function ensurePolling() {
  const idle = Object.keys(watching).every((id) => turns.get(id)?.streaming)
  if (idle || pollTimer) return
  pollTimer = setTimeout(pollWatching, POLL_MS)
}

ensurePolling()

// ── per-card activity: which incidents' case sessions are answering now ──
// GET /agent/cases/active covers every on-call's turns; polled only while
// some card is mounted (the list is on screen), stopped when none is.
const ACTIVE_POLL_MS = 5000
let activeIds = new Set()
let sessionIds = new Set() // incidents with a saved case conversation
let activeSubs = 0
let activeTimer = null
let activeDenied = false // no assistant grant: the cards just stay quiet

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

async function pollActive() {
  activeTimer = null
  if (!activeSubs || activeDenied) return
  try {
    const resp = await fetch("/agent/cases/active", { headers: authHeaders() })
    if (resp.status === 401 || resp.status === 403) {
      activeDenied = true
      return
    }
    if (resp.ok) {
      const d = await resp.json()
      const next = new Set((d.active || []).map(String))
      const nextSessions = new Set((d.sessions || []).map(String))
      if (!sameSet(next, activeIds) || !sameSet(nextSessions, sessionIds)) {
        activeIds = next
        sessionIds = nextSessions
        emit()
      }
    }
  } catch {
    /* next tick */
  }
  if (activeSubs && !activeTimer)
    activeTimer = setTimeout(pollActive, ACTIVE_POLL_MS)
}

function activityOf(id) {
  if (turns.get(id)?.streaming || activeIds.has(id) || watching[id])
    return "busy"
  if (notices.some((n) => n.id === id)) return "replied"
  if (sessionIds.has(id) || turns.get(id)?.messages?.length) return "has"
  return ""
}

// useCaseActivity → "busy" (an AI turn is running on this incident's case
// session) | "replied" (our turn finished while its dialog was closed) |
// "has" (a saved conversation exists) | "".
export function useCaseActivity(id, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    activeSubs += 1
    if (activeSubs === 1 && !activeTimer) pollActive()
    return () => {
      activeSubs -= 1
      if (!activeSubs && activeTimer) {
        clearTimeout(activeTimer)
        activeTimer = null
      }
    }
  }, [enabled])
  return useSyncExternalStore(subscribe, () =>
    enabled ? activityOf(String(id)) : ""
  )
}
