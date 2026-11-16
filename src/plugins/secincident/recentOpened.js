// 最近打开的安全事件 — a per-browser most-recent-first list of the incidents
// whose detail dialog was opened (from a list card, a 待办 square, a case-chat
// notice …). Feeds the「最近打开」rail. localStorage only: it is a personal
// convenience, not shared state, and an empty/blocked storage just leaves the
// rail empty.

import { useSyncExternalStore } from "react"

const KEY = "secincident:recent-opened"
const EVENT = "secincident:recent-opened"
export const RECENT_MAX = 30

let cache = null // [{id, at}] newest first

function load() {
  if (cache) return cache
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]")
    cache = Array.isArray(v)
      ? v.filter((e) => e && /^\d+$/.test(String(e.id))).slice(0, RECENT_MAX)
      : []
  } catch {
    cache = []
  }
  return cache
}

// markOpened moves the incident to the head of the list.
export function markOpened(id) {
  const key = String(id ?? "")
  if (!/^\d+$/.test(key)) return
  const cur = load()
  if (cur[0]?.id === key) return
  cache = [
    { id: key, at: Date.now() },
    ...cur.filter((e) => e.id !== key),
  ].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // storage unavailable: the list still lives for this page
  }
  window.dispatchEvent(new Event(EVENT))
}

// forgetOpened drops ids that no longer resolve (deleted incidents).
export function forgetOpened(ids) {
  const drop = new Set(ids.map(String))
  if (!drop.size) return
  const cur = load()
  const next = cur.filter((e) => !drop.has(e.id))
  if (next.length === cur.length) return
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb) {
  const onStorage = (e) => {
    if (e.key !== KEY) return
    cache = null // another tab wrote it
    cb()
  }
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", onStorage)
  }
}

// useRecentOpened → [{id, at}] newest first (stable reference between writes).
export function useRecentOpened() {
  return useSyncExternalStore(subscribe, load)
}
