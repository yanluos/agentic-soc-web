// 安全事件列表右上角的「案件会话」提醒（2026-11-06）：本浏览器发起、弹窗已关的
// AI 回合仍在后台回答时显示「AI 回复中」，回答完成后变成带角标的提醒；点开
// 列表里的一条直接打开该事件详情并切到「案件会话」。状态来自 caseChatStore。

import { useState } from "react"
import { BellRing, Bot, Check, CircleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { buildTableRecordPath, getRecordFields } from "@/platform"
import { cn } from "@/lib/utils.js"

import {
  dismissAllNotices,
  dismissNotice,
  useCaseNotices,
  usePendingTurns,
} from "./caseChatStore.js"
import { SecIncidentDetailDialog } from "./SecIncidentDetail.jsx"

function hhmm(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function CaseChatNotices({
  apiClient,
  setError,
  columns,
  patchRecord,
  refreshRecord,
  deleteRecord,
}) {
  const notices = useCaseNotices()
  const pending = usePendingTurns()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(null) // {id, fields}

  if (notices.length === 0 && pending.length === 0 && !active) return null

  async function openIncident(id) {
    setOpen(false)
    dismissNotice(id)
    try {
      const resp = await apiClient.get(buildTableRecordPath("secincident", id))
      const rec = Array.isArray(resp?.records) ? resp.records[0] : resp
      setActive({ id: String(id), fields: getRecordFields(rec) || {} })
    } catch (err) {
      setError?.(err.message || `读取安全事件 #${id} 失败`)
    }
  }

  return (
    <>
      {notices.length > 0 || pending.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={notices.length > 0 ? "default" : "outline"}
              className={cn(
                "relative gap-1.5",
                notices.length > 0 &&
                  "bg-success text-success-foreground hover:bg-success/90"
              )}
              aria-label="案件会话提醒"
            >
              {notices.length > 0 ? (
                <BellRing data-icon="inline-start" />
              ) : (
                <Spinner data-icon="inline-start" />
              )}
              {notices.length > 0 ? "AI 已回复" : "AI 回复中"}
              <Badge
                variant="secondary"
                className="h-4 min-w-4 px-1 text-[10px]"
              >
                {notices.length || pending.length}
              </Badge>
              {notices.length > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-medium">案件会话</span>
              {notices.length > 0 ? (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={dismissAllNotices}
                >
                  全部清除
                </Button>
              ) : null}
            </div>
            <ul className="flex flex-col gap-1">
              {pending.map((p) => (
                <li key={`p-${p.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
                    onClick={() => openIncident(p.id)}
                  >
                    <Spinner className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">
                        #{p.id} {p.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        AI 回复中…
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {notices.map((n) => (
                <li key={`n-${n.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
                    onClick={() => openIncident(n.id)}
                  >
                    {n.error ? (
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">
                        #{n.id} {n.title}
                      </span>
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">
                        {hhmm(n.at)} ·{" "}
                        {n.error ? "回答中断" : n.preview || "AI 已回复"}
                      </span>
                    </span>
                    <Bot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
      {active ? (
        <SecIncidentDetailDialog
          open
          onOpenChange={(o) => {
            if (!o) setActive(null)
          }}
          id={active.id}
          fields={active.fields}
          columns={columns}
          initialPane="chat"
          onPatch={
            patchRecord
              ? async (patch) => {
                  await patchRecord(active.id, patch)
                  setActive((a) =>
                    a ? { ...a, fields: { ...a.fields, ...patch } } : a
                  )
                }
              : undefined
          }
          onRefresh={() => refreshRecord?.(active.id)}
          onDelete={
            deleteRecord
              ? async () => {
                  await deleteRecord(active.id)
                  setActive(null)
                }
              : undefined
          }
          apiClient={apiClient}
          setError={setError}
        />
      ) : null}
    </>
  )
}

export default CaseChatNotices
