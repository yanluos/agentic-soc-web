// Live workflow change feed — ONE shared SSE stream (GET /api/v1/workflows/events
// on soc-ai) fanned out to every subscriber in the page (工作流 module, the
// approval bell). fetch() instead of EventSource because the stream needs the
// Bearer header. The connection opens with the first subscriber, closes with
// the last, and reconnects with backoff; every (re)connect delivers a
// {kind:"resync"} so subscribers refetch whatever they may have missed.
//
// Server events: {kind:"run"|"def", op:"created"|"updated"|"deleted"|"step",
// id, def_id?, name?, status?, error?, tokens_used, llm_calls, at}.

import { getStoredToken } from "@/lib/jwt.js"

const listeners = new Set()
let controller = null
let retryTimer = null
let backoff = 1000

function emit(ev) {
  for (const fn of listeners) {
    try {
      fn(ev)
    } catch (err) {
      console.error("workflowEvents listener", err)
    }
  }
}

function scheduleReconnect() {
  if (listeners.size === 0 || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    connect()
  }, backoff)
  backoff = Math.min(backoff * 2, 30000)
}

async function connect() {
  if (controller || listeners.size === 0) return
  const ctl = new AbortController()
  controller = ctl
  try {
    const resp = await fetch("/api/v1/workflows/events", {
      headers: { Authorization: `Bearer ${getStoredToken()}`, Accept: "text/event-stream" },
      signal: ctl.signal,
    })
    // No grant / logged out: don't hammer the endpoint; the next subscribe
    // (e.g. after re-login remounts the page) tries again.
    if (resp.status === 401 || resp.status === 403) {
      controller = null
      return
    }
    if (!resp.ok || !resp.body) throw new Error(`workflow events: HTTP ${resp.status}`)
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let event = "message"
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).trim()
          if (event === "ready") {
            backoff = 1000
            emit({ kind: "resync" })
          } else if (event === "workflow") {
            try {
              emit(JSON.parse(data))
            } catch {
              /* malformed frame — skip */
            }
          }
        } else if (line === "") {
          event = "message"
        }
      }
    }
  } catch {
    if (ctl.signal.aborted) return
  } finally {
    if (controller === ctl) controller = null
  }
  scheduleReconnect()
}

// subscribeWorkflowEvents(fn) → unsubscribe.
export function subscribeWorkflowEvents(fn) {
  listeners.add(fn)
  connect()
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      controller?.abort()
      controller = null
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }
}
