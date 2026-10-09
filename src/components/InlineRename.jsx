// InlineRename — a compact in-place text editor that replaces a list row's
// label while it is being renamed (the assistant's session rail; use it
// anywhere a window.prompt would otherwise pop). Mounts focused with the
// current value selected; Enter commits (IME composition-safe), Escape
// cancels, blur commits. Fires exactly one of onCommit/onCancel, then the
// caller unmounts it. Pointer/keyboard events are stopped so the host row
// (a RailRow with its own click/keydown) does not react to the editing.
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { fieldRaised } from "@/lib/styles"
import { cn } from "@/lib/utils"

export function InlineRename({
  value,
  placeholder,
  onCommit,
  onCancel,
  className,
  ...props
}) {
  const [draft, setDraft] = useState(value || "")
  const ref = useRef(null)
  const settled = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const commit = () => {
    if (settled.current) return
    settled.current = true
    onCommit?.(draft.trim())
  }
  const cancel = () => {
    if (settled.current) return
    settled.current = true
    onCancel?.()
  }

  return (
    <Input
      ref={ref}
      value={draft}
      placeholder={placeholder}
      aria-label="重命名"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          cancel()
        }
      }}
      onBlur={commit}
      // Sized to sit inside a text-xs list row: the row's height stays put
      // and the field reads as the label turned editable. No border — the
      // platform's raised-chip shadow (fieldRaised) defines the edge.
      className={cn(
        "h-6 flex-1 rounded-md px-1.5 py-0 text-xs md:text-xs",
        fieldRaised,
        className
      )}
      {...props}
    />
  )
}
