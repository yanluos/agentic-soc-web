// 安全事件顶栏快速搜索:关键字在详情左栏那些基本信息里模糊匹配(后端 ILIKE)。
// 下拉框列前 20 条命中,点击/回车打开同一个详情模态框;底部「在列表中显示全部」
// 把同一 where 交给宿主 GenericTableModule(setSearchWhere),与筛选面板条件 AND。
// 改关键字后主列表不自动跟随,需再点一次——边打字边刷主列表太跳。
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ListFilter, Search, X } from "lucide-react"

import {
  buildTablePath,
  buildTableRecordPath,
  getRecordFields,
  getRecordId,
} from "@/platform"
import { Badge } from "@/components/ui/badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { riskVariant, statusVariant } from "./shared.jsx"
import { SecIncidentDetailDialog } from "./SecIncidentDetail.jsx"

// 参与匹配的列(id 由后端按 id::text 匹配),顺序 = 命中字段展示的优先级。
export const SEARCH_FIELDS = [
  "id",
  "标题",
  "威胁指标",
  "涉事资产",
  "责任员工",
  "责任人邮箱",
  "前台公司",
  "组织架构",
  "来源",
  "告警类型",
]
const LIST_FIELDS = [...SEARCH_FIELDS.filter((f) => f !== "id"), "风险等级", "处置状态"]
const LIMIT = 20

export function searchWords(q) {
  return String(q || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
}

// 词与词 AND,每个词在各列 OR。值里的 ASCII 括号会截断后端的 leaf 解析,
// 换成 ILIKE 单字符通配 `_`。
export function buildSearchWhere(q) {
  const words = searchWords(q).map((w) => w.replace(/[()]/g, "_"))
  if (!words.length) return ""
  return words
    .map((w) => `(${SEARCH_FIELDS.map((f) => `(${f},like,${w})`).join("~or")})`)
    .join("~and")
}

// 第一个命中关键字的列(标题除外,标题本来就显示);没有则 null。
export function matchedField(id, fields, words) {
  const lw = words.map((w) => w.toLowerCase())
  for (const f of SEARCH_FIELDS) {
    if (f === "标题") continue
    const v = f === "id" ? String(id) : String(fields[f] ?? "")
    if (v && lw.some((w) => v.toLowerCase().includes(w))) return { field: f, value: v }
  }
  return null
}

function Highlight({ text, words }) {
  const parts = useMemo(() => {
    const ws = words.filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (!ws.length) return [text]
    return String(text).split(new RegExp(`(${ws.join("|")})`, "ig"))
  }, [text, words])
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-primary/15 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

export function QuickSearch({
  apiClient,
  setError,
  columns,
  patchRecord,
  refreshRecord,
  deleteRecord,
  searchWhere,
  setSearchWhere,
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(0)
  const [active, setActive] = useState(null) // {id, fields}
  const inputRef = useRef(null)
  const seqRef = useRef(0)

  const words = useMemo(() => searchWords(q), [q])
  const where = useMemo(() => buildSearchWhere(q), [q])
  const applied = !!searchWhere

  // 防抖查询;序号丢弃过期响应。
  useEffect(() => {
    const seq = ++seqRef.current
    if (!where) {
      setResults([])
      setTotal(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      apiClient
        .get(
          buildTablePath("secincident", {
            limit: LIMIT,
            where,
            sort: "-CreatedAt",
            fields: LIST_FIELDS,
          })
        )
        .then((resp) => {
          if (seq !== seqRef.current) return
          const list = Array.isArray(resp?.records) ? resp.records : []
          setResults(list.map((r) => ({ id: getRecordId(r), fields: getRecordFields(r) })))
          const n = Number(resp?.pageInfo?.totalRows)
          setTotal(Number.isFinite(n) ? n : list.length)
          setSel(0)
        })
        .catch((err) => {
          if (seq === seqRef.current) setError?.(err.message || "搜索失败")
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [where, apiClient, setError])

  // `/` 或 ⌘K/Ctrl+K 聚焦(输入框/文本域里打 `/` 不抢)。
  useEffect(() => {
    function onKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // 下拉只拉了展示列;打开详情前取整行。
  const openRecord = useCallback(
    async (r) => {
      setOpen(false)
      try {
        const resp = await apiClient.get(buildTableRecordPath("secincident", r.id))
        setActive({ id: r.id, fields: getRecordFields(resp) || r.fields })
      } catch (err) {
        setError?.(err.message || "加载事件失败")
      }
    },
    [apiClient, setError]
  )

  function applyToList() {
    if (!where) return
    setSearchWhere?.(where)
    setOpen(false)
  }

  function clear() {
    setQ("")
    setResults([])
    setTotal(null)
    if (applied) setSearchWhere?.("")
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setSel((s) => Math.min(s + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[sel]) openRecord(results[sel])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showDrop = open && !!where

  return (
    <>
      <Popover open={showDrop} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <InputGroup className="soc-field-sm h-7 w-64">
            <InputGroupAddon>
              {loading ? <Spinner /> : <Search />}
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={q}
              placeholder="搜索 ID / IP / IOC / 人员 / 公司…"
              aria-label="快速搜索安全事件"
              onChange={(e) => {
                setQ(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
            />
            <InputGroupAddon align="inline-end">
              {applied ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]" title="主列表已按搜索筛选">
                  已筛选
                </Badge>
              ) : null}
              {q || applied ? (
                <InputGroupButton size="icon-xs" aria-label="清空搜索" onClick={clear}>
                  <X />
                </InputGroupButton>
              ) : null}
            </InputGroupAddon>
          </InputGroup>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className="w-[420px] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // 点回输入框不算「外面」,否则一点就关
            if (inputRef.current?.closest("[data-slot=input-group]")?.contains(e.target)) e.preventDefault()
          }}
        >
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {loading ? "搜索中…" : "没有匹配的事件"}
            </div>
          ) : (
            <ul className="thin-scrollbar flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
              {results.map((r, i) => {
                const hit = matchedField(r.id, r.fields, words)
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setSel(i)}
                      onClick={() => openRecord(r)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
                        i === sel && "bg-muted"
                      )}
                    >
                      <Badge variant={riskVariant(r.fields["风险等级"])} className="mt-0.5 h-5 shrink-0 px-1.5 text-[10px]">
                        {r.fields["风险等级"] || "待定级"}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">
                          <span className="font-mono text-muted-foreground">
                            #<Highlight text={String(r.id)} words={words} />
                          </span>{" "}
                          <Highlight text={r.fields["标题"] || "（无标题）"} words={words} />
                        </span>
                        {hit && hit.field !== "id" ? (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {hit.field}：<Highlight text={hit.value} words={words} />
                          </span>
                        ) : null}
                      </span>
                      {r.fields["处置状态"] ? (
                        <Badge variant={statusVariant(r.fields["处置状态"])} className="mt-0.5 h-5 shrink-0 px-1.5 text-[10px]">
                          {r.fields["处置状态"]}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {total ? (
            <button
              type="button"
              onClick={applyToList}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border-t px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ListFilter className="size-3.5" />
              {searchWhere === where ? "主列表已显示这些结果" : `在列表中显示全部 ${total} 条`}
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      {active ? (
        <SecIncidentDetailDialog
          open
          onOpenChange={(o) => {
            if (!o) setActive(null)
          }}
          id={active.id}
          fields={active.fields}
          columns={columns}
          onPatch={
            patchRecord
              ? async (patch) => {
                  await patchRecord(active.id, patch)
                  setActive((a) => (a ? { ...a, fields: { ...a.fields, ...patch } } : a))
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

export default QuickSearch
