// One collapsed row per tool call: friendly name + one-line input digest;
// expands to the full input and result. Results that parse as JSON render
// pretty-printed; the soc-server db envelope ({status, body}) additionally
// surfaces a record-count digest.

import { useState } from "react"
import { ChevronDown, ChevronRight, CircleCheck, CircleX } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils.js"
import { toolMeta } from "./toolMeta.js"

// Pair tool_start/tool_result entries (they arrive interleaved, FIFO per
// name) into [{name, input, result, done}].
export function pairToolCalls(toolCalls) {
  const out = []
  for (const t of toolCalls || []) {
    if (t.type === "tool_result") {
      const open = out.find((c) => c.name === t.name && !c.done)
      if (open) {
        open.result = t.result
        open.done = true
        continue
      }
    }
    out.push({
      name: t.name || t.tool,
      input: t.input,
      result: t.type === "tool_result" ? t.result : null,
      done: t.type === "tool_result",
    })
  }
  return out
}

function inputDigest(input) {
  if (input == null) return ""
  if (typeof input === "string") return input.slice(0, 80)
  if (typeof input === "object") {
    if (typeof input.command === "string") return input.command.slice(0, 80)
    if (typeof input.file_path === "string") return input.file_path.slice(0, 80)
    if (typeof input.path === "string") return input.path.slice(0, 80)
    try {
      return JSON.stringify(input).slice(1, 81)
    } catch {
      return ""
    }
  }
  return String(input).slice(0, 80)
}

function prettyResult(result) {
  if (result == null) return ""
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2)
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

function resultDigest(result) {
  if (typeof result !== "string") return null
  try {
    const parsed = JSON.parse(result)
    if (parsed && typeof parsed === "object" && "status" in parsed && "body" in parsed) {
      const n = parsed.body?.pageInfo?.totalRows
      const got = Array.isArray(parsed.body?.records) ? parsed.body.records.length : null
      if (n != null) return `${parsed.status} · 共 ${n} 条${got != null ? `，返回 ${got} 条` : ""}`
      return `HTTP ${parsed.status}`
    }
  } catch {
    /* not JSON */
  }
  return null
}

const isErrorResult = (result) =>
  typeof result === "string" && /^(error|错误)|失败|cannot |unauthorized/i.test(result.trim().slice(0, 60))

export function ToolCallCard({ call, streaming = false }) {
  const [open, setOpen] = useState(false)
  const meta = toolMeta(call.name)
  const Icon = meta.icon
  const running = !call.done && streaming
  const failed = call.done && isErrorResult(call.result)
  const digest = resultDigest(call.result)

  return (
    <div className="overflow-hidden rounded-md bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/70 transition-colors"
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{meta.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {inputDigest(call.input)}
        </span>
        {running ? (
          <Spinner className="size-3 shrink-0" />
        ) : failed ? (
          <CircleX className="size-3.5 shrink-0 text-destructive" />
        ) : call.done ? (
          <CircleCheck className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5 border-t border-border/50 px-2.5 py-2">
          <div className="font-mono text-[10px] text-muted-foreground">
            {meta.server ? `${meta.server} · ` : ""}
            {meta.raw}
          </div>
          {call.input != null ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 font-mono text-[11px]">
              {typeof call.input === "string" ? call.input : JSON.stringify(call.input, null, 2)}
            </pre>
          ) : null}
          {call.done ? (
            <>
              {digest ? <div className={cn("text-[11px]", failed ? "text-destructive" : "text-muted-foreground")}>{digest}</div> : null}
              <pre
                className={cn(
                  "max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 font-mono text-[11px]",
                  failed && "text-destructive",
                )}
              >
                {prettyResult(call.result)}
              </pre>
            </>
          ) : (
            <div className="text-muted-foreground">{running ? "执行中…" : "等待结果…"}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
