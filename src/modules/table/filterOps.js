// Pure filter algebra for table views. No React, no DOM.
//
// Tree shape
// ──────────
//   Clause = { kind: "clause", id, field, op, value }
//   Group  = { kind: "group",  id, logic: "and" | "or", children: (Clause|Group)[] }
//
// The root of any filter tree is always a Group. A Clause has a single value
// or `{ from, to }` for `btw`; `in`/`nin` use a string array.
//
// `nodeToWhere` is the only function that talks to NocoDB — everything else
// is tree bookkeeping the UI calls.

import { toNocoDateStr } from "@/utils.js"

// ── ID generation ─────────────────────────────────────────────────────────
// crypto.randomUUID is available in every modern browser (Vite baseline).
// The counter fallback is a paranoid last resort for locked-down contexts.

let _idCounter = 0
function makeId(prefix) {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}:${crypto.randomUUID()}`
    }
  } catch {
    /* fall through */
  }
  _idCounter += 1
  return `${prefix}:${Date.now()}:${_idCounter}`
}

export function clauseId() {
  return makeId("c")
}
export function groupId() {
  return makeId("g")
}

// ── Tree constructors ────────────────────────────────────────────────────

export function emptyTree() {
  return { kind: "group", id: groupId(), logic: "and", children: [] }
}

export function newClause(field = "", op = "", value = "") {
  return { kind: "clause", id: clauseId(), field, op, value }
}

export function newGroup(logic = "and") {
  return { kind: "group", id: groupId(), logic, children: [] }
}

// ── Operator catalogue ──────────────────────────────────────────────────
// arity:     0 = unary (no value), 1 = single value, 2 = pair (range)
// inputKind: "none" | "single" | "pair" | "multi"

const TEXT_OPS = [
  { op: "like", label: "包含", arity: 1, inputKind: "single" },
  { op: "nlike", label: "不包含", arity: 1, inputKind: "single" },
  { op: "eq", label: "等于", arity: 1, inputKind: "single" },
  { op: "neq", label: "不等于", arity: 1, inputKind: "single" },
  { op: "empty", label: "为空", arity: 0, inputKind: "none" },
  { op: "notempty", label: "不为空", arity: 0, inputKind: "none" },
  { op: "isnull", label: "NULL", arity: 0, inputKind: "none" },
  { op: "notnull", label: "非 NULL", arity: 0, inputKind: "none" },
]

const NUMBER_OPS = [
  { op: "eq", label: "=", arity: 1, inputKind: "single" },
  { op: "neq", label: "≠", arity: 1, inputKind: "single" },
  { op: "gt", label: ">", arity: 1, inputKind: "single" },
  { op: "lt", label: "<", arity: 1, inputKind: "single" },
  { op: "ge", label: "≥", arity: 1, inputKind: "single" },
  { op: "le", label: "≤", arity: 1, inputKind: "single" },
  { op: "btw", label: "区间", arity: 2, inputKind: "pair" },
  { op: "isnull", label: "NULL", arity: 0, inputKind: "none" },
  { op: "notnull", label: "非 NULL", arity: 0, inputKind: "none" },
]

const DATE_OPS = [
  { op: "eq", label: "当日", arity: 1, inputKind: "single" },
  { op: "neq", label: "非当日", arity: 1, inputKind: "single" },
  { op: "gt", label: "之后", arity: 1, inputKind: "single" },
  { op: "lt", label: "之前", arity: 1, inputKind: "single" },
  { op: "ge", label: "当日及之后", arity: 1, inputKind: "single" },
  { op: "le", label: "当日及之前", arity: 1, inputKind: "single" },
  { op: "btw", label: "区间", arity: 2, inputKind: "pair" },
  { op: "isnull", label: "NULL", arity: 0, inputKind: "none" },
  { op: "notnull", label: "非 NULL", arity: 0, inputKind: "none" },
]

const SELECT_OPS = [
  { op: "eq", label: "等于", arity: 1, inputKind: "single" },
  { op: "neq", label: "不等于", arity: 1, inputKind: "single" },
  { op: "in", label: "在 (多选)", arity: 1, inputKind: "multi" },
  { op: "nin", label: "不在", arity: 1, inputKind: "multi" },
  { op: "isnull", label: "为空", arity: 0, inputKind: "none" },
  { op: "notnull", label: "非空", arity: 0, inputKind: "none" },
]

const CHECKBOX_OPS = [
  { op: "eq", label: "为 true", arity: 0, inputKind: "none", constValue: "true" },
  { op: "neq", label: "为 false", arity: 0, inputKind: "none", constValue: "false" },
]

export const OPS_BY_TYPE = {
  text: TEXT_OPS,
  number: NUMBER_OPS,
  date: DATE_OPS,
  select: SELECT_OPS,
  checkbox: CHECKBOX_OPS,
}

export function opsForColumn(column) {
  if (!column) return TEXT_OPS
  return OPS_BY_TYPE[column.filter] || TEXT_OPS
}

export function findOp(column, opToken) {
  return opsForColumn(column).find((o) => o.op === opToken) || null
}

// ── Where serializer ────────────────────────────────────────────────────
// NocoDB v3 format: `(field,op,value)` joined with `~and~` / `~or~`.
// We always return a NocoDB-friendly string; groups wrap themselves in
// parens when nested.

const UNARY_OPS = new Set(["empty", "notempty", "isnull", "notnull"])

/**
 * Serialize a filter tree to a NocoDB v3 `where` clause.
 * Returns "" for empty trees and for clauses that wouldn't filter anything.
 *
 * @param {object} node     filter tree (Group or Clause)
 * @param {boolean} isRoot  true at the top call (controls parens around root)
 * @param {Array}  columns  full column spec list — used to detect native date
 *                          columns so we emit `exactDate` sub-operator syntax.
 */
export function nodeToWhere(node, isRoot = true, columns = []) {
  if (!node) return ""
  if (node.kind === "clause") return clauseToWhere(node, columns)
  if (node.kind !== "group") return ""
  const parts = (node.children || [])
    .map((c) => nodeToWhere(c, false, columns))
    .filter((s) => s && s.length > 0)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]
  const joiner = "~" + (node.logic === "or" ? "or" : "and")
  const joined = parts.join(joiner)
  return isRoot ? joined : `(${joined})`
}

function clauseToWhere(clause, columns = []) {
  if (!clause || !clause.field || !clause.op) return ""
  const f = clause.field
  const op = clause.op

  const col = columns.find((c) => c.field === f)
  const isNativeDateCol = col?.filter === "date"

  // Unary ops — no value: emit `(field,op)`.
  if (UNARY_OPS.has(op)) return `(${f},${op})`

  // `btw` — split into `ge`+`le` pair (NocoDB v3 btw syntax is unreliable).
  if (op === "btw") {
    const v = clause.value || {}
    const fromRaw = (v.from ?? "").toString().trim()
    const toRaw = (v.to ?? "").toString().trim()
    const parts = []
    if (isNativeDateCol) {
      if (fromRaw) parts.push(`(${f},ge,exactDate,${fromRaw})`)
      if (toRaw) parts.push(`(${f},le,exactDate,${toRaw})`)
    } else {
      // Text-stored slash dates (e.g. DLP 告警时间) — normalize dash → slash.
      const from = looksLikeDateString(fromRaw) ? toNocoDateStr(fromRaw) : fromRaw
      const to = looksLikeDateString(toRaw) ? toNocoDateStr(toRaw) : toRaw
      if (from) parts.push(`(${f},ge,${from})`)
      if (to) parts.push(`(${f},le,${to})`)
    }
    if (parts.length === 0) return ""
    if (parts.length === 1) return parts[0]
    return `(${parts.join("~and")})`
  }

  // `in` / `nin` — comma-joined values inside the parentheses.
  if (op === "in" || op === "nin") {
    const arr = Array.isArray(clause.value) ? clause.value : []
    const cleaned = arr.map((v) => String(v).trim()).filter(Boolean)
    if (cleaned.length === 0) return ""
    return `(${f},${op},${cleaned.join(",")})`
  }

  // Single value.
  const v = clause.value
  if (v && typeof v === "object") return ""
  let s = (v ?? "").toString().trim()
  if (s === "") return ""

  if (isNativeDateCol) {
    return `(${f},${op},exactDate,${s})`
  }

  // Text-stored dates: convert dash → slash before sending.
  if (looksLikeDateString(s)) s = toNocoDateStr(s) || s
  // `like` / `nlike` expect `%` wildcards; auto-wrap substring matches.
  if ((op === "like" || op === "nlike") && !s.includes("%")) s = `%${s}%`
  return `(${f},${op},${s})`
}

function looksLikeDateString(s) {
  if (!s) return false
  return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(String(s))
}

// ── Effective-clause counter (for the toolbar badge) ────────────────────

/**
 * Mirror of `clauseToWhere`'s "would this produce a where token?" check.
 * Used by the toolbar's Filters button so the badge only counts clauses
 * that would actually filter data.
 */
function clauseIsEffective(clause) {
  if (!clause.field || !clause.op) return false
  if (UNARY_OPS.has(clause.op)) return true
  const v = clause.value
  if (clause.op === "btw") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false
    return Boolean(v.from?.toString().trim() || v.to?.toString().trim())
  }
  if (clause.op === "in" || clause.op === "nin") {
    return Array.isArray(v) && v.length > 0
  }
  if (v && typeof v === "object") return false
  return (v ?? "").toString().trim() !== ""
}

export function countClauses(node) {
  if (!node) return 0
  if (node.kind === "clause") return clauseIsEffective(node) ? 1 : 0
  if (node.kind !== "group") return 0
  return (node.children || []).reduce((acc, c) => acc + countClauses(c), 0)
}

// ── Schema migration (drop clauses whose field no longer exists) ─────────

export function migrateFilterTree(tree, knownFields) {
  if (!tree || tree.kind !== "group") return emptyTree()
  const fields = knownFields instanceof Set ? knownFields : new Set(knownFields || [])
  return walkClean(tree, fields) || emptyTree()
}

function walkClean(node, fields) {
  if (!node || typeof node !== "object") return null
  if (node.kind === "clause") {
    return fields.has(node.field) ? { ...node, id: node.id || clauseId() } : null
  }
  if (node.kind !== "group") return null
  const children = (Array.isArray(node.children) ? node.children : [])
    .map((c) => walkClean(c, fields))
    .filter(Boolean)
  return {
    kind: "group",
    id: node.id || groupId(),
    logic: node.logic === "or" ? "or" : "and",
    children,
  }
}

// ── Immutable tree mutators (UI ergonomics) ─────────────────────────────

/** Walk to the node with the given id and replace it with `mutator(node)`. */
export function updateNode(tree, id, mutator) {
  if (!tree) return tree
  if (tree.id === id) return mutator(tree)
  if (tree.kind === "group") {
    return {
      ...tree,
      children: (tree.children || []).map((c) => updateNode(c, id, mutator)),
    }
  }
  return tree
}

/** Remove the node with the given id (and any descendants). */
export function deleteNode(tree, id) {
  if (!tree || tree.kind !== "group") return tree
  return {
    ...tree,
    children: (tree.children || [])
      .filter((c) => c.id !== id)
      .map((c) => (c.kind === "group" ? deleteNode(c, id) : c)),
  }
}

/** Append `child` to the Group with id `groupIdToFind`. */
export function addChildToGroup(tree, groupIdToFind, child) {
  return updateNode(tree, groupIdToFind, (g) => ({
    ...g,
    children: [...(g.children || []), child],
  }))
}
