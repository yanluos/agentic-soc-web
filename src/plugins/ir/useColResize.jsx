// Drag-to-resize columns for the fixed-layout tables of the case detail.
//
// Until a column is dragged the table keeps its default layout (class widths +
// shared remainder, always exactly the pane width). The first drag snapshots
// every header's rendered width into px, after which the table is
// `width: <sum>px; min-width: 100%`: it still fills the pane when the columns
// are narrower than it, and scrolls sideways inside its own box — never the
// page — once the user has made them wider. Widths are remembered per list in
// localStorage; double-clicking a handle restores the default layout.
import { useCallback, useRef, useState } from "react"

const MIN = 40

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null")
    return v && typeof v === "object" ? v : null
  } catch {
    return null
  }
}

function write(key, v) {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v))
    else localStorage.removeItem(key)
  } catch {
    /* private mode — widths just aren't remembered */
  }
}

// useColResize(id, keys) — id names the list ("objects", "findings", …), keys
// are its column keys in order. Stored widths for another column set (a
// column was added/removed) are ignored.
export function useColResize(id, keys) {
  const storageKey = `ir:colw:${id}`
  const [widths, setWidths] = useState(() => {
    const w = read(storageKey)
    return w && keys.every((k) => w[k] > 0) ? w : null
  })
  const lastDown = useRef({ key: "", at: 0 })
  const reset = useCallback(() => {
    setWidths(null)
    write(storageKey, null)
  }, [storageKey])

  const start = useCallback(
    (key, e) => {
      e.preventDefault()
      e.stopPropagation()
      // Second press on the same handle within 350ms = double-click → back to
      // the default layout. Detected here rather than with onDoubleClick: the
      // preventDefault above (needed to stop text selection while dragging)
      // keeps the browser from synthesizing dblclick.
      const now = Date.now()
      const last = lastDown.current
      lastDown.current = { key, at: now }
      if (last.key === key && now - last.at < 350) {
        lastDown.current = { key: "", at: 0 }
        reset()
        return
      }
      const row = e.currentTarget.closest("tr")
      const base = {}
      row?.querySelectorAll("th[data-col]").forEach((th) => {
        base[th.dataset.col] = Math.round(th.getBoundingClientRect().width)
      })
      const x0 = e.clientX
      const w0 = base[key] || MIN
      // Nothing changes (and nothing is stored) until the pointer actually
      // moves, so a plain click or the double-click reset leaves no widths.
      let next = null
      const move = (ev) => {
        next = {
          ...base,
          [key]: Math.max(MIN, Math.round(w0 + ev.clientX - x0)),
        }
        setWidths(next)
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        document.body.style.removeProperty("cursor")
        document.body.style.removeProperty("user-select")
        if (next) write(storageKey, next)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [storageKey, reset]
  )

  const tableStyle = widths
    ? {
        width: keys.reduce((n, k) => n + (widths[k] || 0), 0),
        minWidth: "100%",
      }
    : undefined

  // Spread on every <TableHead>; the header cell must be `relative`.
  const thProps = (key) => ({
    "data-col": key,
    style: widths ? { width: widths[key] } : undefined,
  })

  // The grab strip on a header's right edge.
  const handle = (key) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整列宽，双击恢复默认"
      title="拖动调整列宽，双击恢复默认"
      className="absolute top-0 right-0 flex h-full w-2 cursor-col-resize touch-none justify-end select-none after:h-full after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-primary"
      onPointerDown={(e) => start(key, e)}
      onClick={(e) => e.stopPropagation()}
    />
  )

  return { tableStyle, thProps, handle, customized: !!widths, reset }
}
