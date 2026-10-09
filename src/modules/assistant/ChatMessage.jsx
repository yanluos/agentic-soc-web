// Shared chat message renderer, used by both the full-page AssistantModule
// and the FloatingAi panel so the two surfaces stay visually consistent.
// Assistant messages interleave: thinking (collapsed) → tool cards → markdown.

import { Badge } from "@/components/ui/badge"
import { MarkdownText } from "@/components/MarkdownText.jsx"
import { cardStatic } from "@/lib/styles"
import { cn } from "@/lib/utils.js"
import { ThinkingBlock } from "./ThinkingBlock.jsx"
import { ToolCallCard, pairToolCalls } from "./ToolCallCard.jsx"

export function ChatMessage({ msg, streaming = false, wide = false }) {
  if (msg.role === "user") {
    const attachments = msg.attachments || []
    return (
      <li className="flex flex-col items-end gap-1">
        <div
          className={cn(
            "rounded-lg bg-ai px-3 py-2 text-sm text-ai-foreground whitespace-pre-wrap",
            wide ? "max-w-[70%]" : "max-w-[85%]",
            cardStatic,
          )}
        >
          {msg.text ?? msg.content}
        </div>
        {attachments.length ? (
          <div className="flex flex-wrap gap-1">
            {attachments.map((p, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                📎 {String(p).split("/").pop()}
              </Badge>
            ))}
          </div>
        ) : null}
      </li>
    )
  }

  const text = msg.text ?? msg.content
  const toolCalls = pairToolCalls(msg.toolCalls ?? msg.tools)

  // History artifacts (aborted turns) can be fully empty — render nothing
  // instead of a stray "…" bubble.
  if (!streaming && !text && !msg.thinking && toolCalls.length === 0) return null

  return (
    <li className="flex flex-col items-start gap-1">
      <div
        className={cn(
          "max-w-[85%] rounded-lg bg-card px-3 py-2 text-sm",
          cardStatic,
        )}
      >
        <ThinkingBlock text={msg.thinking} streaming={streaming && !text && toolCalls.length === 0} />
        {toolCalls.length ? (
          <div className="mb-1.5 flex flex-col gap-1">
            {toolCalls.map((c, i) => (
              <ToolCallCard key={i} call={c} streaming={streaming} />
            ))}
          </div>
        ) : null}
        {text ? (
          <MarkdownText>{text}</MarkdownText>
        ) : !streaming ? (
          <span className="text-muted-foreground">…</span>
        ) : null}
        {streaming && !text && toolCalls.length === 0 && !msg.thinking ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : null}
      </div>
    </li>
  )
}
