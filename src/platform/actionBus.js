// Action bus between the AI assistant and UI modules.
//
// Backend SSE frames look like `{"type":"action","action":"navigate","payload":{...}}`.
// `normalizeActionEvent` flattens one into `{ type: "navigate", module: ... }` so
// both the workbench and the floating panel hand App.jsx the same envelope.
// Set-filter dispatches ride a window CustomEvent so GenericTableModule can
// stay decoupled from the assistant; the payload key is `filterTree`, matching
// soc-ai's ui-action handler.

const SET_FILTER_EVENT = "agent-set-filter"
const TABLEVIEW_EVENT = "tableview-changed"

export function normalizeActionEvent(frame) {
  if (!frame || typeof frame !== "object") return null
  if (frame.type && frame.type !== "action") return frame // already flattened
  return { type: frame.action, ...(frame.payload || {}) }
}

export function emitSetFilter({ slug, filterTree }) {
  if (!slug) return
  window.dispatchEvent(new CustomEvent(SET_FILTER_EVENT, { detail: { slug, filterTree } }))
}

export function onSetFilter(slug, handler) {
  function listener(e) {
    const detail = e.detail
    if (!detail || detail.slug !== slug || !detail.filterTree) return
    handler(detail.filterTree)
  }
  window.addEventListener(SET_FILTER_EVENT, listener)
  return () => window.removeEventListener(SET_FILTER_EVENT, listener)
}

export function emitTableView(detail) {
  window.dispatchEvent(new CustomEvent(TABLEVIEW_EVENT, { detail }))
}

export function onTableView(handler) {
  const listener = (e) => handler(e.detail)
  window.addEventListener(TABLEVIEW_EVENT, listener)
  return () => window.removeEventListener(TABLEVIEW_EVENT, listener)
}
