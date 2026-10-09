// RowSheet — full-field drawer for one view row: reasons (with points), the
// score breakdown for execution objects, then every field as key/value.
import { Bot } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { copyToClipboard } from "@/components/CopyText.jsx"
import { LevelBadge } from "./LevelBadge.jsx"
import { ScoreBreakdown } from "./ScoreBreakdown.jsx"

const SKIP = new Set(["reasons", "scores"])

function Value({ v }) {
  if (v == null || v === "")
    return <span className="text-muted-foreground">-</span>
  if (typeof v === "boolean") return v ? "是" : "否"
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">[]</span>
    if (v.every((x) => typeof x !== "object"))
      return <span className="break-all">{v.join(", ")}</span>
    return (
      <pre className="max-h-64 thin-scrollbar overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
        {JSON.stringify(v, null, 2)}
      </pre>
    )
  }
  if (typeof v === "object")
    return (
      <pre className="max-h-64 thin-scrollbar overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
        {JSON.stringify(v, null, 2)}
      </pre>
    )
  return <span className="font-mono text-xs break-all">{String(v)}</span>
}

export function RowSheet({ row, title, onOpenChange, onNavigate, hostname }) {
  const open = !!row
  const reasons = Array.isArray(row?.reasons) ? row.reasons : null
  const entries = row ? Object.entries(row).filter(([k]) => !SKIP.has(k)) : []

  async function toAssistant() {
    const brief = `请分析主机 ${hostname || ""} 应急采集中的这条记录，判断是否恶意并给出处置动作：\n${JSON.stringify(row, null, 2).slice(0, 4000)}`
    const ok = await copyToClipboard(brief)
    if (ok) toast.success("记录已复制为提问，粘贴到 AI 助手即可")
    onNavigate?.("assistant")
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onOpenChange(null)}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {row?.score != null ? (
              <LevelBadge level={row.level} score={row.score} showScore />
            ) : null}
            <span className="truncate">
              {title || row?.name || row?.path || "记录详情"}
            </span>
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">
            {row?.path || row?.value || row?.command_line || ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {row?.scores ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                评分拆解
              </h4>
              <ScoreBreakdown scores={row.scores} />
            </section>
          ) : null}
          {reasons ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                判定原因（{reasons.length}）
              </h4>
              {reasons.length === 0 ? (
                <p className="text-xs text-muted-foreground">无</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {reasons.map((r, i) => (
                    <li
                      key={`${r.code}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          {r.code}
                        </Badge>
                        <span className="truncate">{r.text}</span>
                      </span>
                      <span
                        className={
                          r.points < 0
                            ? "shrink-0 text-muted-foreground tabular-nums"
                            : "shrink-0 font-medium tabular-nums"
                        }
                      >
                        {r.points > 0 ? `+${r.points}` : r.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          <Separator />
          <section className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">
              全部字段
            </h4>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 text-xs">
              {entries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt
                    className="truncate font-mono text-muted-foreground"
                    title={k}
                  >
                    {k}
                  </dt>
                  <dd className="min-w-0">
                    <Value v={v} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        {onNavigate ? (
          <div className="border-t p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toAssistant}
            >
              <Bot data-icon="inline-start" />在 AI 助手中分析
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
