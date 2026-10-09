// Collapsed-by-default thinking display. While streaming it shows an animated
// "正在思考" pill with a live tail of the newest thinking text; once done it
// becomes a quiet expandable summary. Keeps long (often English) reasoning
// from flooding the chat.

import { useState } from "react"
import { Brain, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils.js"

export function ThinkingBlock({ text, streaming = false }) {
  const [open, setOpen] = useState(false)
  if (!text) return null

  const tail = text.replace(/\s+/g, " ").trim().slice(-80)

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground",
          "hover:bg-muted/60 transition-colors",
        )}
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Brain className={cn("size-3 shrink-0", streaming && "animate-pulse text-ai")} />
        {streaming && !open ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="text-ai">正在思考</span>
            <span className="ml-1.5 opacity-60">{tail}</span>
          </span>
        ) : (
          <span>Thinking（{text.length} Token）</span>
        )}
      </button>
      {open ? (
        <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          {text}
        </pre>
      ) : null}
    </div>
  )
}
