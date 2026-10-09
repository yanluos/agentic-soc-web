// CopyText — click-to-copy inline text for list-card headers (安全事件 / 工单
// meta rows): renders its children as a quiet button that copies `value`
// (defaults to the children's text) and toasts. Hover shows a dotted
// underline + copy cursor so the affordance is discoverable without adding
// icons to every field. Works on plain-http LAN origins too, where
// navigator.clipboard is undefined (non-secure context), via the
// execCommand fallback.
import { toast } from "sonner"

import { cn } from "@/lib/utils"

export async function copyToClipboard(text) {
  const s = String(text ?? "")
  if (!s) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = s
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (node.props?.children != null) return textOf(node.props.children)
  return ""
}

export function CopyText({ value, label, className, children, ...props }) {
  async function copy(e) {
    e.stopPropagation()
    const text = value ?? textOf(children)
    if (!String(text).trim()) return
    const ok = await copyToClipboard(text)
    if (ok) {
      const shown = String(text)
      toast.success(
        `已复制${label ? ` ${label}` : ""}：${shown.length > 60 ? `${shown.slice(0, 60)}…` : shown}`
      )
    } else {
      toast.error("复制失败，请手动选择复制")
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={`点击复制${label ? ` ${label}` : ""}`}
      className={cn(
        "inline-flex max-w-full min-w-0 cursor-copy items-center gap-1 rounded-sm text-left decoration-dotted underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
