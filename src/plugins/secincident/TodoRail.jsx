// 待办告警 rails — the left side of the 安全事件 list stacks SIX collapsible
// rails vertically: 最近打开 (the incidents whose detail this browser opened,
// most recent first, any 处置状态 — recentOpened.js), AI 回复 (incidents whose
// case session most recently got an AI answer, any on-call's — GET
// /agent/cases/recent; only with the case-chat grants), then one per
// 风险等级 (高危 / 中危 / 低危 / 误报待办). A collapsed
// rail is a narrow strip (chevron + icon + count badge + vertical label) that
// only fetches its count (limit=1 → pageInfo.totalRows); clicking it unfolds
// it into a column of square cards — the events of that level whose 处置状态
// is 待跟进 | 跟进中 (待跟进 first, newest first), ALL of them laid out in full
// (the column grows with its content and scrolls with the page; nothing is
// clamped to the viewport) — and folds whichever rail was open before (one
// open at a time). All start collapsed; the open rail persists per browser. Everything re-queries
// every minute, when the main list reloads and after an edit in the modal.
//
// Clicking a square opens the same SecIncidentDetailDialog the list cards
// use; edits go through the host's patchRecord/refreshRecord/deleteRecord so
// a row that is also on the main list stays in sync, then the rails re-query
// (a status moved out of 待跟进/跟进中, or a re-graded risk, moves the square).
//
// Rendered through GenericTableModule's `renderAside` (see the plugin
// descriptor); props: columns, reloadToken, patchRecord, refreshRecord,
// deleteRecord + apiClient/setError from the plugin ctx.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Crosshair,
  History,
  MessageSquareText,
  MonitorSmartphone,
  RefreshCw,
  Siren,
} from "lucide-react"

import { buildTablePath, getRecordFields, getRecordId } from "@/platform"
import { Badge } from "@/components/ui/badge"
import { authHeaders } from "@/lib/jwt.js"
import { IconButton } from "@/components/IconButton.jsx"
import { cardHover, cardStatic } from "@/lib/styles"
import { cn } from "@/lib/utils"

import { SecIncidentDetailDialog } from "./SecIncidentDetail.jsx"
import { aiStatusLine, riskVariant, statusVariant } from "./shared.jsx"
import { canUseCaseChat } from "./CaseChat.jsx"
import { useCaseRepliesVersion } from "./caseChatStore.js"
import { forgetOpened, useRecentOpened } from "./recentOpened.js"
import { fmtTime, parseTime } from "./timeline.js"

const OPEN_KEY = "secincident:todo-rail-open" // risk of the unfolded rail, "" = none
const POLL_MS = 60_000
const LIMIT = 500 // "全部展开": well above any level's open backlog
const OPEN_STATUSES = "((处置状态,eq,待跟进)~or(处置状态,eq,跟进中))"

// Rail order = severity. `accent` colors the square's left edge, `icon` the
// strip icon. Every rail starts collapsed.
// List rails are keyed by a fixed id list (newest first) instead of a
// 风险等级 query.
const RECENT = "recent" // 最近打开
const AI_REPLIES = "ai" // AI 回复
const LIST_MAX = 30
const RAILS = [
  {
    risk: RECENT,
    list: true,
    label: "最近打开",
    accent: "border-border",
    icon: "text-primary",
    Icon: History,
    empty: "还没有打开过事件",
  },
  {
    risk: AI_REPLIES,
    list: true,
    label: "AI 回复",
    accent: "border-border",
    icon: "text-primary",
    Icon: MessageSquareText,
    empty: "还没有 AI 回复过的案件会话",
  },
  {
    risk: "高",
    label: "高危待办",
    accent: "border-destructive",
    icon: "text-destructive",
  },
  {
    risk: "中",
    label: "中危待办",
    accent: "border-warning",
    icon: "text-warning-foreground dark:text-warning",
  },
  {
    risk: "低",
    label: "低危待办",
    accent: "border-muted-foreground/40",
    icon: "text-muted-foreground",
  },
  {
    risk: "误报",
    label: "误报待办",
    accent: "border-border",
    icon: "text-muted-foreground",
  },
]

function readOpenRisk() {
  try {
    const v = localStorage.getItem(OPEN_KEY) || ""
    return RAILS.some((r) => r.risk === v) ? v : ""
  } catch {
    return ""
  }
}
function writeOpenRisk(risk) {
  try {
    localStorage.setItem(OPEN_KEY, risk || "")
  } catch {
    // storage unavailable
  }
}

// useCaseReplies → the incidents whose case session most recently got an AI
// answer ([{id, replied_at, preview, author}], newest first), or null when the
// viewer lacks the case-chat grants (the rail is then hidden). Re-queried on
// the rails' tick, with the main list, and whenever a case turn ends.
function useCaseReplies(tick, reloadToken) {
  const [allowed] = useState(canUseCaseChat)
  const [list, setList] = useState(allowed ? [] : null)
  const version = useCaseRepliesVersion()
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetch(`/agent/cases/recent?limit=${LIST_MAX}`, { headers: authHeaders() })
      .then(async (resp) => {
        if (resp.status === 401 || resp.status === 403) {
          if (!cancelled) setList(null)
          return
        }
        if (!resp.ok) return
        const d = await resp.json()
        if (!cancelled) setList(Array.isArray(d.recent) ? d.recent : [])
      })
      .catch(() => {
        // keep the last list; the next tick retries
      })
    return () => {
      cancelled = true
    }
  }, [allowed, tick, reloadToken, version])
  return list
}

// A 最近打开 square takes the left edge of its own 风险等级's rail.
function accentFor(fields) {
  const risk = String(fields["风险等级"] || "")
  return (
    RAILS.find((r) => !r.list && r.risk === risk)?.accent || "border-border"
  )
}

// 待跟进 ahead of 跟进中 (the server sort is newest-first within).
function rank(fields) {
  return String(fields["处置状态"] || "").includes("待跟进") ? 0 : 1
}

function shortTime(v) {
  const d = parseTime(v)
  if (!d) return ""
  const t = fmtTime(d) // YYYY/MM/DD HH:mm
  return d.getFullYear() === new Date().getFullYear() ? t.slice(5) : t
}

export function TodoRail({
  apiClient,
  setError,
  columns,
  reloadToken,
  patchRecord,
  refreshRecord,
  deleteRecord,
}) {
  const [openRisk, setOpenRisk] = useState(readOpenRisk)
  const [active, setActive] = useState(null) // {id, fields} open in the modal
  const [tick, setTick] = useState(0)
  const recent = useRecentOpened()
  const recentIds = recent.map((e) => e.id).join(",")
  const replies = useCaseReplies(tick, reloadToken)
  const replyIds = replies?.map((e) => e.id).join(",") ?? ""
  const replyMeta = useMemo(
    () => new Map((replies || []).map((e) => [String(e.id), e])),
    [replies]
  )
  const rails = replies ? RAILS : RAILS.filter((r) => r.risk !== AI_REPLIES)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  // Accordion: unfolding one rail folds the other.
  function toggle(rail) {
    setOpenRisk((cur) => {
      const next = cur === rail.risk ? "" : rail.risk
      writeOpenRisk(next)
      return next
    })
  }

  useEffect(() => {
    const t = setInterval(reload, POLL_MS)
    return () => clearInterval(t)
  }, [reload])

  // ── modal plumbing: host helpers first, then our own copy + re-query ──
  async function onPatch(patch) {
    if (!active) return
    await patchRecord(active.id, patch) // PATCH + main-list merge + toast
    setActive((a) => (a ? { ...a, fields: { ...a.fields, ...patch } } : a))
    reload()
  }
  async function onRefresh() {
    if (!active) return
    await refreshRecord(active.id)
    reload()
  }
  async function onDelete() {
    if (!active || !deleteRecord) return
    await deleteRecord(active.id)
    setActive(null)
    reload()
  }

  return (
    <>
      {/* 纵向叠放的六条栏(最近打开 + AI 回复 + 四个风险等级);展开的那条按内容全高铺开,随页面滚动,其余保持窄条 */}
      <div className="flex shrink-0 flex-col items-start gap-2">
        {rails.map((rail) => (
          <RiskRail
            key={rail.risk}
            rail={rail}
            listIds={
              rail.risk === RECENT
                ? recentIds
                : rail.risk === AI_REPLIES
                  ? replyIds
                  : undefined
            }
            replyMeta={rail.risk === AI_REPLIES ? replyMeta : undefined}
            apiClient={apiClient}
            setError={setError}
            open={openRisk === rail.risk}
            onToggle={() => toggle(rail)}
            reloadToken={reloadToken}
            tick={tick}
            onReload={reload}
            activeId={active?.id}
            onOpen={(id, fields) => setActive({ id, fields })}
            onSync={(id, fields) =>
              setActive((a) => (a && a.id === id ? { id, fields } : a))
            }
          />
        ))}
      </div>
      {active ? (
        <SecIncidentDetailDialog
          open
          onOpenChange={(o) => {
            if (!o) setActive(null)
          }}
          id={active.id}
          fields={active.fields}
          columns={columns}
          onPatch={patchRecord ? onPatch : undefined}
          onDelete={deleteRecord ? onDelete : undefined}
          onRefresh={onRefresh}
          apiClient={apiClient}
          setError={setError}
        />
      ) : null}
    </>
  )
}

// One 风险等级 rail: a strip while collapsed (count only), a column of
// squares while open. Owns its query; the open state is the parent's
// (accordion).
function RiskRail({
  rail,
  listIds,
  replyMeta,
  apiClient,
  setError,
  open,
  onToggle,
  reloadToken,
  tick,
  onReload,
  activeId,
  onOpen,
  onSync,
}) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const syncRef = useRef(onSync)
  syncRef.current = onSync
  useEffect(() => {
    if (!apiClient) return
    const isList = !!rail.list
    const ids = isList ? (listIds || "").split(",").filter(Boolean) : []
    if (isList && (!open || !ids.length)) {
      // the count is the local list; nothing to fetch until it is unfolded
      setTotal(ids.length)
      setRecords([])
      setLoaded(open)
      return
    }
    let cancelled = false
    setLoading(true)
    const path = buildTablePath("secincident", {
      limit: isList ? ids.length : open ? LIMIT : 1,
      where: isList
        ? `(id,in,${ids.join(",")})`
        : `(风险等级,eq,${rail.risk})~and${OPEN_STATUSES}`,
      sort: "-CreatedAt",
      fields: open ? undefined : ["标题"],
    })
    apiClient
      .get(path)
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp?.records) ? resp.records : []
        const n = Number(resp?.pageInfo?.totalRows)
        setTotal(Number.isFinite(n) ? n : list.length)
        if (rail.risk === RECENT) {
          // deleted incidents drop out of the local list
          const found = new Set(list.map((r) => String(getRecordId(r))))
          forgetOpened(ids.filter((id) => !found.has(id)))
        }
        if (open) {
          const order = new Map(ids.map((id, i) => [id, i]))
          const sorted = [...list].sort((a, b) =>
            isList
              ? order.get(String(getRecordId(a))) -
                order.get(String(getRecordId(b)))
              : rank(getRecordFields(a)) - rank(getRecordFields(b))
          )
          setRecords(sorted)
          setLoaded(true)
          // keep the open modal on the freshest copy of its row
          for (const r of sorted) {
            const id = String(getRecordId(r))
            syncRef.current(id, getRecordFields(r))
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError?.(err.message || `读取${rail.label}失败`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiClient, setError, reloadToken, tick, open, rail, listIds])

  const Icon = rail.Icon || Siren
  const isList = !!rail.list

  if (!open) {
    return (
      <div
        className={cn(
          "flex w-9 shrink-0 flex-col items-center gap-1.5 rounded-lg bg-card py-1.5",
          cardStatic
        )}
      >
        <IconButton
          color="gray"
          variant="ghost"
          size="sm"
          aria-label={`展开${rail.label}栏`}
          onClick={onToggle}
        >
          <ChevronDown />
        </IconButton>
        <Icon className={cn("size-4", rail.icon)} />
        {total != null ? (
          <Badge
            variant={
              total
                ? isList
                  ? "secondary"
                  : riskVariant(rail.risk)
                : "outline"
            }
            className="px-1.5 text-[10px]"
          >
            {total}
          </Badge>
        ) : null}
        <span
          className="text-[11px] text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          {rail.label}
        </span>
      </div>
    )
  }

  return (
    <aside className={cn("flex w-48 flex-col rounded-lg bg-card", cardStatic)}>
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <IconButton
          color="gray"
          variant="ghost"
          size="sm"
          aria-label={`收起${rail.label}栏`}
          onClick={onToggle}
        >
          <ChevronUp />
        </IconButton>
        <Icon className={cn("size-4 shrink-0", rail.icon)} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {rail.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {total ?? "—"}
        </span>
        <IconButton
          color="gray"
          variant="ghost"
          size="sm"
          aria-label={`刷新${rail.label}`}
          onClick={onReload}
          disabled={loading}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {loaded && records.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {rail.empty || `没有待处理的${rail.label.slice(0, 2)}事件`}
          </div>
        ) : null}
        {records.map((r) => {
          const id = String(getRecordId(r))
          const fields = getRecordFields(r)
          return (
            <TodoSquare
              key={id}
              id={id}
              fields={fields}
              accent={isList ? accentFor(fields) : rail.accent}
              showRisk={isList}
              reply={replyMeta?.get(id)}
              active={activeId === id}
              onOpen={() => onOpen(id, fields)}
            />
          )
        })}
        {!isList && loaded && total > records.length ? (
          <div className="text-center text-[11px] text-muted-foreground">
            仅加载最新 {records.length} 条，共 {total} 条
          </div>
        ) : null}
      </div>
    </aside>
  )
}

// One square: status pill + time on top, the title in the middle, IOC/资产
// under it, the AI status line pinned to the bottom edge.
function TodoSquare({ id, fields, accent, showRisk, reply, active, onOpen }) {
  const title = fields["标题"] || "未命名安全事件"
  const ioc = String(fields["威胁指标"] || "").trim()
  const asset = String(fields["涉事资产"] || "").trim()
  const when = shortTime(
    reply?.replied_at || fields["事件发生时间"] || fields["CreatedAt"]
  )
  const status = fields["处置状态"] || "待跟进"
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`打开事件 #${id}「${title}」`}
      className={cn(
        "flex aspect-square w-full cursor-pointer flex-col gap-1 rounded-lg border-l-2 bg-card p-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        accent,
        cardHover,
        active && "ring-1 ring-ring/40"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          {showRisk ? (
            <Badge
              variant={riskVariant(fields["风险等级"])}
              className="text-[10px]"
            >
              {fields["风险等级"] || "待定级"}
            </Badge>
          ) : null}
          <Badge variant={statusVariant(status)} className="text-[10px]">
            {status}
          </Badge>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {when}
        </span>
      </div>
      <div className="line-clamp-3 leading-snug font-medium">{title}</div>
      <div className="flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground">
        {ioc ? (
          <span className="flex min-w-0 items-center gap-1">
            <Crosshair className="size-3 shrink-0" />
            <span className="truncate font-mono">{ioc}</span>
          </span>
        ) : null}
        {asset ? (
          <span className="flex min-w-0 items-center gap-1">
            <MonitorSmartphone className="size-3 shrink-0" />
            <span className="truncate">{asset}</span>
          </span>
        ) : null}
      </div>
      {reply ? (
        <span className="mt-auto flex min-w-0 items-start gap-1 text-[11px] text-muted-foreground">
          <MessageSquareText className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-2">
            {reply.author ? `${reply.author} 问 · ` : ""}
            {reply.preview}
          </span>
        </span>
      ) : (
        <span className="mt-auto flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Bot className="size-3 shrink-0" />
          <span className="truncate">{aiStatusLine(fields)}</span>
        </span>
      )}
    </button>
  )
}

export default TodoRail
