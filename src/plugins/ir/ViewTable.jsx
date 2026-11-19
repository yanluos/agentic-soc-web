// ViewTable — one server-paged, filterable table over GET /cases/{id}/view/{view}.
// Filtering is the platform's generic FilterPanel (ListFilter → `where`,
// evaluated server-side over the package rows) plus a debounced keyword
// search; sortable score/time headers; 50 rows a page; row click opens
// RowSheet. The table is `table-fixed`: it always fills the pane and never
// grows past it — narrow columns carry a width (COL_WIDTH), the rest share
// what is left and truncate. The 进程 view adds a 树/表 toggle that swaps in
// ProcessTree (view "tree").
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ListTree,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { IconButton } from "@/components/IconButton.jsx"
import { cn } from "@/lib/utils"
import { countClauses, nodeToWhere } from "@/platform"
import { COLUMNS, colWidth } from "./columns.jsx"
import { ListFilter } from "./ListFilter.jsx"
import { VIEW_FILTER_FIELDS, defaultTree } from "./filterFields.js"
import { ProcessTree } from "./ProcessTree.jsx"
import { RowSheet } from "./RowSheet.jsx"
import { VIEWS, errMsg, listOf } from "./lib.js"

const LIMIT = 50

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function ViewTable({
  api,
  caseId,
  view,
  hostname,
  onNavigate,
  setError,
  refreshKey,
  filterTree,
  onFilterTree,
}) {
  const meta = VIEWS.find((v) => v.key === view)
  const columns = COLUMNS[view] || COLUMNS.objects
  const filterFields = VIEW_FILTER_FIELDS[view] || VIEW_FILTER_FIELDS.objects
  const ftree = useMemo(
    () => filterTree || defaultTree(view),
    [filterTree, view]
  )
  const where = useMemo(
    () => nodeToWhere(ftree, true, filterFields),
    [ftree, filterFields]
  )
  const filtered = countClauses(ftree) > 0
  const [q, setQ] = useState("")
  const dq = useDebounced(q)
  const [sort, setSort] = useState(
    meta?.scored || view === "chains" || view === "indicators"
      ? "-score"
      : view === "timeline"
        ? "time"
        : "-score"
  )
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ rows: null, total: 0 })
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState("table") // processes only: table | tree
  const [tree, setTree] = useState(null)
  const reqRef = useRef(0)

  useEffect(() => {
    setOffset(0)
  }, [where, dq, sort, caseId])

  const load = useCallback(async () => {
    if (!api || !caseId) return
    const id = ++reqRef.current
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(offset),
        sort,
      })
      if (where) qs.set("where", where)
      if (dq.trim()) qs.set("q", dq.trim())
      const r = await api.get(`/cases/${caseId}/view/${view}?${qs}`)
      if (id !== reqRef.current) return
      const rows = listOf(r)
      setData({ rows, total: Number(r?.total ?? rows.length) })
    } catch (err) {
      if (id !== reqRef.current) return
      setData({ rows: [], total: 0 })
      setError?.(errMsg(err, "读取视图失败"))
    } finally {
      if (id === reqRef.current) setLoading(false)
    }
  }, [api, caseId, view, where, dq, sort, offset, setError])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (view !== "processes" || mode !== "tree" || !api || !caseId) return
    let alive = true
    api
      .get(`/cases/${caseId}/view/tree?min_score=0&limit=1000`)
      .then((r) => alive && setTree(listOf(r)))
      .catch((err) => alive && setError?.(errMsg(err, "读取进程树失败")))
    return () => {
      alive = false
    }
  }, [api, caseId, view, mode, refreshKey, setError])

  const page = Math.floor(offset / LIMIT) + 1
  const pages = Math.max(1, Math.ceil((data.total || 0) / LIMIT))
  const sortField = sort.replace(/^-/, "")
  const sortDesc = sort.startsWith("-")

  const toggleSort = (field) =>
    setSort((s) => (s === `-${field}` ? field : `-${field}`))

  const empty = useMemo(() => data.rows && data.rows.length === 0, [data.rows])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter
          tree={ftree}
          columns={filterFields}
          onChange={(t) => onFilterTree?.(t)}
        />
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="搜索路径 / 名称 / 命令行"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </InputGroup>
        {view === "processes" ? (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={mode}
            onValueChange={(v) => v && setMode(v)}
            aria-label="显示方式"
          >
            <ToggleGroupItem value="table" aria-label="表格">
              <Table2 />
            </ToggleGroupItem>
            <ToggleGroupItem value="tree" aria-label="进程树">
              <ListTree />
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          共 {data.total} 条
        </span>
        <IconButton
          color="cyan"
          variant="soft"
          size="sm"
          aria-label="刷新"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
        </IconButton>
      </div>

      {view === "processes" && mode === "tree" ? (
        <div className="min-h-0 thin-scrollbar flex-1 overflow-auto rounded-lg border">
          {tree ? (
            <ProcessTree nodes={tree} onSelect={(n) => setSelected(n)} />
          ) : (
            <Skeleton className="m-3 h-40" />
          )}
        </div>
      ) : (
        <div className="min-h-0 thin-scrollbar flex-1 overflow-auto rounded-lg border">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "truncate",
                      colWidth(view, c.key),
                      c.className,
                      c.sort && "cursor-pointer select-none"
                    )}
                    onClick={c.sort ? () => toggleSort(c.sort) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.sort && sortField === c.sort ? (
                        sortDesc ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )
                      ) : null}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows == null ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columns.length}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : empty ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search />
                        </EmptyMedia>
                        <EmptyTitle>没有记录</EmptyTitle>
                        <EmptyDescription>
                          {filtered || dq.trim()
                            ? "没有符合筛选条件的记录，放宽或清空筛选试试；也可能采集包尚未上传。"
                            : "采集包中该维度没有数据。"}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r, i) => (
                  <TableRow
                    key={r.key || r.pid || r.id || i}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn("truncate text-xs", c.className)}
                      >
                        {c.render(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "processes" && mode === "tree" ? null : (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            第 {page} / {pages} 页
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="上一页"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="下一页"
            disabled={page >= pages || loading}
            onClick={() => setOffset((o) => o + LIMIT)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <RowSheet
        row={selected}
        title={meta?.label}
        onOpenChange={setSelected}
        onNavigate={onNavigate}
        hostname={hostname}
      />
    </div>
  )
}
