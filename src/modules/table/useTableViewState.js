// Persistent table view state, keyed by table slug.
// localStorage shape: `{ widths, order, hidden, filterTree, sort }`.
// On column-schema change we drop dangling references and append new columns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { emptyTree, migrateFilterTree } from "@/modules/table/filterOps.js"

const STORAGE_PREFIX = "tableview:"

// NocoDB system/bookkeeping columns hidden by default on a fresh view.
const SYSTEM_FIELDS = new Set([
  "id",
  "createdat",
  "updatedat",
  "created_at",
  "updated_at",
  "createdby",
  "updatedby",
  "nc_created_by",
  "nc_updated_by",
  "nc_order",
  "nc_row_meta",
])

function isSystemField(col) {
  const cands = [col.field, col.key, col.label, col.title, col.column_name, col.name]
  return cands.some((c) => c && SYSTEM_FIELDS.has(String(c).toLowerCase()))
}

function loadPersisted(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object") return null
    return obj
  } catch {
    return null
  }
}

function persist(slug, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify(data))
  } catch {
    /* quota / disabled — best-effort */
  }
}

export function useTableViewState(slug, columns) {
  const [widths, setWidths] = useState({})
  const [order, setOrder] = useState([])
  const [hidden, setHidden] = useState([])
  const [filterTree, setFilterTree] = useState(() => emptyTree())
  const [sort, setSort] = useState("")

  // Re-init when slug or column schema changes. Fingerprint guards against
  // a meta reload that reuses the same columns: it would otherwise clobber
  // in-memory edits before the debounced persist has a chance to write them.
  const fingerprintRef = useRef(null)

  useEffect(() => {
    if (!columns || columns.length === 0) return
    const fingerprint = `${slug}::${columns.map((c) => c.key).join(",")}`
    if (fingerprintRef.current === fingerprint) return
    fingerprintRef.current = fingerprint

    const keys = new Set(columns.map((c) => c.key))
    const fields = new Set(columns.map((c) => c.field))
    const persisted = loadPersisted(slug) || {}

    const cleanWidths = {}
    for (const [k, v] of Object.entries(persisted.widths || {})) {
      if (keys.has(k) && typeof v === "number" && v >= 60) cleanWidths[k] = v
    }

    const persistedOrder = Array.isArray(persisted.order) ? persisted.order : []
    const orderFiltered = persistedOrder.filter((k) => keys.has(k))
    const missing = columns.map((c) => c.key).filter((k) => !orderFiltered.includes(k))
    const cleanOrder = [...orderFiltered, ...missing]

    const persistedHidden = (
      Array.isArray(persisted.hidden) ? persisted.hidden : []
    ).filter((k) => keys.has(k))
    // Always hide NocoDB system/bookkeeping columns by default (merged with
    // whatever the user has hidden). They can still be toggled on per session.
    const sysKeys = columns.filter((c) => isSystemField(c)).map((c) => c.key)
    const cleanHidden = Array.from(new Set([...persistedHidden, ...sysKeys]))

    const cleanTree = migrateFilterTree(persisted.filterTree, fields)

    let cleanSort = typeof persisted.sort === "string" ? persisted.sort : ""
    const sortField = cleanSort.startsWith("-") ? cleanSort.slice(1) : cleanSort
    if (sortField && !fields.has(sortField)) cleanSort = ""

    setWidths(cleanWidths)
    setOrder(cleanOrder)
    setHidden(cleanHidden)
    setFilterTree(cleanTree)
    setSort(cleanSort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, columns])

  // Debounced persistence: 300 ms after the last change.
  const persistTimer = useRef(null)
  useEffect(() => {
    if (!fingerprintRef.current?.startsWith(`${slug}::`)) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persist(slug, { widths, order, hidden, filterTree, sort })
    }, 300)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [slug, widths, order, hidden, filterTree, sort])

  // ── Public setters ────────────────────────────────────────────────────
  const setWidth = useCallback((key, px) => {
    setWidths((w) => ({ ...w, [key]: Math.max(60, Math.round(px)) }))
  }, [])

  const toggleHidden = useCallback((key) => {
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))
  }, [])

  const setFilterTreeSafe = useCallback((tree) => {
    setFilterTree(tree || emptyTree())
  }, [])

  const resetView = useCallback(() => {
    if (!columns) return
    setWidths({})
    setOrder(columns.map((c) => c.key))
    setHidden([])
    setFilterTree(emptyTree())
    setSort("")
    try {
      localStorage.removeItem(STORAGE_PREFIX + slug)
    } catch {
      /* best-effort */
    }
  }, [slug, columns])

  // Derived: ordered full column list (including hidden).
  const allColumns = useMemo(() => {
    if (!columns) return []
    const byKey = new Map(columns.map((c) => [c.key, c]))
    return order.map((k) => byKey.get(k)).filter(Boolean)
  }, [columns, order])

  // Derived: ordered, visible column list.
  const visibleColumns = useMemo(() => {
    const hiddenSet = new Set(hidden)
    return allColumns.filter((c) => !hiddenSet.has(c.key))
  }, [allColumns, hidden])

  return {
    widths,
    setWidth,
    order,
    setOrder,
    hidden,
    setHidden,
    toggleHidden,
    allColumns,
    visibleColumns,
    filterTree,
    setFilterTree: setFilterTreeSafe,
    sort,
    setSort,
    resetView,
  }
}
