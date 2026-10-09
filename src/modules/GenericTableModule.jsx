// Meta-driven table primitive. Fetches /api/v1/tables/{slug}/meta, then
// records on every (filter, sort, page) change. Renders an editable
// shadcn Table with column-resize, inline edit, create row, and delete.
// Passing `renderItem` switches the body from the Table to a card list:
// each record renders via renderItem({record, id, fields, onDelete, onPatch,
// onRefresh})
// while the toolbar (filter/sort), infinite scroll and delete dialog stay.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { onSetFilter, emitTableView } from "@/platform"
import { Save, X, Inbox } from "lucide-react"
import { toast } from "sonner"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dropdownCls, VeilSelectItem } from "@/modules/table/veilSelect.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"

import { TableToolbar } from "@/modules/table/TableToolbar.jsx"
import { useTableViewState } from "@/modules/table/useTableViewState.js"
import { nodeToWhere } from "@/modules/table/filterOps.js"
import {
  toDtLocal,
  fromDtLocal,
  toNocoDateStr,
  formatCell,
  getRecordFields,
  getRecordId,
  normalizeNocoRecords,
} from "@/utils.js"
import {
  buildTableMetaPath,
  buildTablePath,
  buildTableRecordPath,
  toNocoV3Sort,
} from "@/api.js"

const DEFAULT_PAGE_SIZE = 20

export function GenericTableModule({
  slug,
  label,
  apiClient,
  setError,
  extraToolbarActions,
  showCreate = true,
  showDelete = true,
  showEdit = true,
  renderItem,
  renderCreate,
  // Optional PATCH-path override (id → path) for tables whose edits must go
  // through a dedicated business endpoint (e.g. tickets: server-side 处理记录
  // timeline stamping) instead of the raw generic-table record PATCH.
  patchPath,
  // Optional DELETE-path override (id → path), same reason as patchPath. The
  // generic record route now refuses writes for tables owned by a typed module
  // (write_guard in the backend's nocodb.tables[]), so any such table must pass
  // this or deletion returns 405.
  deletePath,
}) {
  const [columns, setColumns] = useState([])
  const [metaLoading, setMetaLoading] = useState(true)
  const [records, setRecords] = useState([])
  const [pageInfo, setPageInfo] = useState({ totalRows: 0, hasNextPage: false })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [recordsLoading, setRecordsLoading] = useState(false)

  const viewState = useTableViewState(slug, columns)

  // ── Meta ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      setMetaLoading(true)
      try {
        const meta = await apiClient.get(buildTableMetaPath(slug))
        if (cancelled) return
        const cols = Array.isArray(meta?.columns)
          ? meta.columns
          : meta?.fields || []
        setColumns(cols)
      } catch (err) {
        setError?.(err.message || "加载表元数据失败")
      } finally {
        if (!cancelled) setMetaLoading(false)
      }
    }
    loadMeta()
    return () => {
      cancelled = true
    }
  }, [slug, apiClient, setError])

  // ── Records ───────────────────────────────────────────────────────────
  const lastQueryRef = useRef("")
  const sigRef = useRef("") // signature of the active query (where|sort|pageSize)
  const [reloadToken, setReloadToken] = useState(0)
  // Monotonic id of the latest records request: a response that comes back
  // after a newer request (or a slug switch) started is dropped instead of
  // overwriting the current table's rows.
  const reqSeqRef = useRef(0)

  // Slug switch on a reused instance: drop the previous table's rows and
  // query keys so nothing from it is shown or deduped against.
  useEffect(() => {
    setRecords([])
    setPageInfo({ totalRows: 0, hasNextPage: false })
    setPage(1)
    lastQueryRef.current = ""
    sigRef.current = ""
    reqSeqRef.current += 1
  }, [slug])

  const loadRecords = useCallback(async () => {
    if (columns.length === 0) return
    const where = nodeToWhere(viewState.filterTree, true, columns)
    const sort = viewState.sort
    const sig = `${where}|${sort}|${pageSize}`
    // Query changed while scrolled to a later page: wait for the page-reset
    // effect to bring us to page 1 before fetching (avoids a stale append).
    if (sigRef.current !== sig && page !== 1) return
    sigRef.current = sig

    const path = buildTablePath(slug, {
      limit: pageSize,
      page,
      where: where || undefined,
      sort: sort || undefined,
    })
    const key = `${slug}|${sig}|${page}|${reloadToken}`
    if (lastQueryRef.current === key) return
    lastQueryRef.current = key

    const seq = ++reqSeqRef.current
    setRecordsLoading(true)
    try {
      const resp = await apiClient.get(path)
      if (seq !== reqSeqRef.current) return // superseded by a newer request
      const list = normalizeNocoRecords(resp)
      // page 1 replaces; later pages append (infinite scroll).
      setRecords((prev) => (page === 1 ? list : [...prev, ...list]))
      // NocoDB v3 returns a `next` cursor (empty on the last page) and no
      // total count; fall back to legacy pageInfo shapes when present.
      const hasNextPage =
        (typeof resp?.next === "string" && resp.next !== "") ||
        resp?.pageInfo?.hasNextPage === true ||
        resp?.page_info?.has_next_page === true ||
        resp?.pageInfo?.isLastPage === false
      const total =
        resp?.pageInfo?.totalRows ?? resp?.page_info?.total_rows ?? null
      setPageInfo({ totalRows: total, hasNextPage })
    } catch (err) {
      if (seq !== reqSeqRef.current) return
      setError?.(err.message || "加载数据失败")
    } finally {
      if (seq === reqSeqRef.current) setRecordsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slug,
    apiClient,
    columns,
    page,
    pageSize,
    viewState.filterTree,
    viewState.sort,
    reloadToken,
  ])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // Reset to the first page when filter/sort/pageSize change.
  useEffect(() => {
    setPage(1)
  }, [viewState.filterTree, viewState.sort, pageSize])

  // Reload from the top (after a mutation or manual refresh).
  const reloadFromTop = useCallback(() => {
    sigRef.current = ""
    setPage(1)
    setReloadToken((t) => t + 1)
  }, [])

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          pageInfo.hasNextPage &&
          !recordsLoading
        ) {
          setPage((p) => p + 1)
        }
      },
      { rootMargin: "300px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [pageInfo.hasNextPage, recordsLoading])

  // Listen for AI filter dispatches.
  useEffect(
    () => onSetFilter(slug, (tree) => viewState.setFilterTree(tree)),
    [slug, viewState]
  )

  // Dispatch tableview-changed so the AI state reporter picks up our state.
  useEffect(() => {
    emitTableView({
      slug,
      filterTree: viewState.filterTree,
      sort: viewState.sort,
      hidden: viewState.hidden,
    })
  }, [slug, viewState.filterTree, viewState.sort, viewState.hidden])

  function handleRefresh() {
    reloadFromTop()
  }

  // ── Create row state ────────────────────────────────────────────────
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({})
  function startCreate() {
    const empty = {}
    for (const c of columns) {
      if (c.editable) empty[c.field] = ""
    }
    setDraft(empty)
    setCreating(true)
  }
  async function commitCreate() {
    try {
      const body = normalizeDraftForCreate(draft, columns)
      await apiClient.post(`/api/v1/tables/${slug}/records`, body)
      toast.success("已创建")
      setCreating(false)
      setDraft({})
      reloadFromTop()
    } catch (err) {
      setError?.(err.message || "创建失败")
    }
  }

  // ── Inline edit state ───────────────────────────────────────────────
  const [edit, setEdit] = useState({ id: null, field: null })
  const [editValue, setEditValue] = useState("")
  function startEdit(record, col) {
    if (!col.editable) return
    const fields = getRecordFields(record)
    setEdit({ id: getRecordId(record), field: col.field })
    setEditValue(coerceForEdit(fields[col.field], col))
  }
  async function commitEdit() {
    if (!edit.id) return
    const col = columns.find((c) => c.field === edit.field)
    try {
      const value = coerceForSubmit(editValue, col)
      // Honor patchPath here too — otherwise inline cell edits would slip past
      // the dedicated business endpoint that patchRecord() below routes through.
      const path = patchPath
        ? patchPath(edit.id)
        : buildTableRecordPath(slug, edit.id)
      await apiClient.patch(path, { [edit.field]: value })
      setEdit({ id: null, field: null })
      setEditValue("")
      reloadFromTop()
    } catch (err) {
      setError?.(err.message || "更新失败")
    }
  }
  function cancelEdit() {
    setEdit({ id: null, field: null })
    setEditValue("")
  }

  // ── Delete ───────────────────────────────────────────────────────────
  // 行内 ✅ 确认后直接执行（ConfirmDeleteButton 负责二次确认）；renderItem 拿到的
  // onDelete 同样是「已确认才调用」的语义，卡片里用同一个按钮包一层即可。
  async function confirmDelete(id) {
    if (!id) return
    try {
      await apiClient.delete(
        deletePath ? deletePath(id) : buildTableRecordPath(slug, id)
      )
      toast.success("已删除")
      reloadFromTop()
    } catch (err) {
      setError?.(err.message || "删除失败")
    }
  }

  // ── Patch (list-mode quick edit) ─────────────────────────────────────
  // Updates the record in place instead of reloadFromTop so an edit deep in
  // the infinite-scrolled list doesn't snap the view back to page 1.
  const patchRecord = useCallback(
    async (id, patch) => {
      try {
        const path = patchPath ? patchPath(id) : buildTableRecordPath(slug, id)
        const resp = await apiClient.patch(path, patch)
        // Prefer the response's fresh fields when the endpoint returns the
        // updated record (dedicated endpoints may add server-computed fields,
        // e.g. a timeline entry); otherwise merge the optimistic patch.
        const fresh =
          resp?.fields && typeof resp.fields === "object" ? resp.fields : patch
        setRecords((prev) =>
          prev.map((r) => {
            if (getRecordId(r) !== id) return r
            if (r.fields && typeof r.fields === "object") {
              return { ...r, fields: { ...r.fields, ...fresh } }
            }
            return { ...r, ...fresh }
          })
        )
        toast.success("已保存")
      } catch (err) {
        setError?.(err.message || "更新失败")
        throw err
      }
    },
    [apiClient, slug, setError, patchPath]
  )

  // ── Refresh one record ───────────────────────────────────────────────
  // Re-reads a single row and swaps its fields in place — for changes made
  // outside this UI (e.g. a workflow the card triggered wrote the row back).
  const refreshRecord = useCallback(
    async (id) => {
      try {
        const resp = await apiClient.get(buildTableRecordPath(slug, id))
        const fresh = getRecordFields(resp)
        if (!fresh || typeof fresh !== "object") return
        setRecords((prev) =>
          prev.map((r) => {
            if (getRecordId(r) !== id) return r
            if (r.fields && typeof r.fields === "object") {
              return { ...r, fields: fresh }
            }
            return { ...r, ...fresh }
          })
        )
      } catch (err) {
        setError?.(err.message || "刷新失败")
      }
    },
    [apiClient, slug, setError]
  )

  // ── Column resize ───────────────────────────────────────────────────
  const resizingRef = useRef(null)
  function onResizeStart(e, col) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = viewState.widths[col.key] || col.width || 120
    resizingRef.current = { startX, startW, key: col.key }
    function onMove(ev) {
      const r = resizingRef.current
      if (!r) return
      const dx = ev.clientX - r.startX
      viewState.setWidth(r.key, r.startW + dx)
    }
    function onUp() {
      resizingRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const totalLabel = useMemo(() => {
    if (recordsLoading && records.length === 0) return "—"
    return pageInfo.totalRows ?? records.length
  }, [recordsLoading, pageInfo.totalRows, records.length])

  // Total table width = sum of column widths (+ action col). The table keeps
  // these fixed widths and scrolls horizontally inside its page-width wrapper;
  // min-w-full makes it fill the page when the columns are narrower.
  const tableWidth = useMemo(() => {
    const cols = viewState.visibleColumns.reduce(
      (sum, c) => sum + (viewState.widths[c.key] || c.width || 120),
      0
    )
    return cols + 44
  }, [viewState.visibleColumns, viewState.widths])

  if (metaLoading) {
    return (
      <Card className={cardHover}>
        <CardContent className="flex flex-col gap-2 p-6">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (columns.length === 0) {
    return (
      <Card className={cardHover}>
        <CardContent className="p-6 text-sm text-muted-foreground">
          表 {slug} 暂无可用字段。
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <TableToolbar
        title={label}
        total={totalLabel}
        viewState={viewState}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        loading={recordsLoading}
        onRefresh={handleRefresh}
        showCreate={showCreate && !renderItem}
        onCreate={startCreate}
        extraActions={extraToolbarActions}
        showFields={!renderItem}
        createSlot={
          renderItem && renderCreate
            ? renderCreate({ columns, onCreated: reloadFromTop })
            : undefined
        }
      />
      {renderItem ? (
        <div className="flex flex-col gap-2">
          {recordsLoading && records.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`sk-${i}`}
                className={cn(
                  "flex flex-col gap-2 rounded-lg bg-card p-3",
                  cardHover
                )}
              >
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          ) : records.length === 0 ? (
            <div className={cn("rounded-lg bg-card", cardHover)}>
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Inbox className="size-8 text-muted-foreground/60" />
                <div className="font-medium text-foreground">暂无数据</div>
                <div>调整筛选条件或同步数据后重试</div>
              </div>
            </div>
          ) : (
            records.map((record) => {
              const id = getRecordId(record)
              return renderItem({
                record,
                id,
                fields: getRecordFields(record),
                columns,
                onDelete: showDelete ? () => confirmDelete(id) : undefined,
                onPatch: showEdit
                  ? (patch) => patchRecord(id, patch)
                  : undefined,
                onRefresh: () => refreshRecord(id),
              })
            })
          )}
        </div>
      ) : (
        <div className={cn("overflow-hidden rounded-lg bg-card", cardHover)}>
          <Table
            className="min-w-full table-fixed text-xs"
            style={{ width: tableWidth }}
          >
            <colgroup>
              {viewState.visibleColumns.map((c) => (
                <col
                  key={c.key}
                  style={{ width: viewState.widths[c.key] || c.width || 120 }}
                />
              ))}
              <col style={{ width: 44 }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                {viewState.visibleColumns.map((c) => (
                  <TableHead
                    key={c.key}
                    className="relative truncate font-normal"
                  >
                    <span>{c.label || c.field}</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onMouseDown={(e) => onResizeStart(e, c)}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                    />
                  </TableHead>
                ))}
                <TableHead className="w-11" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {creating ? (
                <TableRow className="bg-muted/30">
                  {viewState.visibleColumns.map((c) => (
                    <TableCell key={c.key} className="p-1">
                      {c.editable ? (
                        <EditCell
                          column={c}
                          value={draft[c.field] ?? ""}
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, [c.field]: v }))
                          }
                        />
                      ) : null}
                    </TableCell>
                  ))}
                  <TableCell className="p-1">
                    <div className="flex items-center gap-1">
                      <IconButton
                        color="green"
                        size="sm"
                        onClick={commitCreate}
                        aria-label="保存新建"
                      >
                        <Save />
                      </IconButton>
                      <IconButton
                        color="gray"
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setCreating(false)
                          setDraft({})
                        }}
                        aria-label="取消"
                      >
                        <X />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {recordsLoading && records.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {viewState.visibleColumns.map((c) => (
                      <TableCell key={c.key}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={viewState.visibleColumns.length + 1}
                    className="p-0"
                  >
                    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                      <Inbox className="size-8 text-muted-foreground/60" />
                      <div className="font-medium text-foreground">
                        暂无数据
                      </div>
                      <div>调整筛选条件或点击 新建 添加记录</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const id = getRecordId(record)
                  const fields = getRecordFields(record)
                  return (
                    <TableRow key={id}>
                      {viewState.visibleColumns.map((c) => {
                        const v = fields[c.field]
                        const isEditing =
                          edit.id === id && edit.field === c.field
                        return (
                          <TableCell
                            key={c.key}
                            className="truncate align-middle"
                            onDoubleClick={() =>
                              showEdit && startEdit(record, c)
                            }
                          >
                            {isEditing ? (
                              <EditCell
                                column={c}
                                value={editValue}
                                onChange={setEditValue}
                                autoFocus
                                onCommit={commitEdit}
                                onCancel={cancelEdit}
                              />
                            ) : (
                              <CellValue column={c} value={v} />
                            )}
                          </TableCell>
                        )
                      })}
                      <TableCell className="p-1">
                        {showDelete ? (
                          <ConfirmDeleteButton
                            variant="soft"
                            size="sm"
                            label="删除该行"
                            onConfirm={() => confirmDelete(id)}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
        {recordsLoading ? (
          <span className="flex items-center gap-1">
            <Spinner data-icon="inline-start" /> 加载中…
          </span>
        ) : pageInfo.hasNextPage ? (
          <span>向下滚动加载更多</span>
        ) : records.length > 0 ? (
          <span>已全部加载 · 共 {pageInfo.totalRows ?? records.length} 条</span>
        ) : null}
      </div>
    </div>
  )
}

function CellValue({ column, value }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>
  }
  if (column.filter === "date" || column.field?.includes("时间")) {
    return <span>{toNocoDateStr(value) || String(value)}</span>
  }
  if (column.key === "文件大小（bytes）" || /bytes/i.test(column.field || "")) {
    return <span>{formatBytes(value)}</span>
  }
  return <span className="truncate">{formatCell(value)}</span>
}

function formatBytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return String(n)
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`
  return `${(v / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function coerceForEdit(value, column) {
  if (column?.editable === "datetime" || column?.filter === "date") {
    return toDtLocal(value) || ""
  }
  if (value === null || value === undefined) return ""
  return String(value)
}

function coerceForSubmit(value, column) {
  if (column?.editable === "datetime" || column?.filter === "date") {
    return fromDtLocal(value)
  }
  return value
}

function normalizeDraftForCreate(draft, columns) {
  const out = {}
  for (const c of columns) {
    if (!c.editable) continue
    const v = draft[c.field]
    if (c.editable === "datetime" || c.filter === "date") {
      out[c.field] = fromDtLocal(v || "") || null
    } else {
      out[c.field] = v ?? ""
    }
  }
  return out
}

function EditCell({ column, value, onChange, autoFocus, onCommit, onCancel }) {
  if (column.editable === "select" && column.options) {
    return (
      <Select
        value={value || ""}
        onValueChange={onChange}
        onOpenChange={(o) => {
          if (!o) onCommit?.()
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-full">
          <SelectValue placeholder="选择" />
        </SelectTrigger>
        <SelectContent className={dropdownCls}>
          {column.options.map((o) => (
            <VeilSelectItem key={o.value} value={o.value}>
              {o.label ?? o.value}
            </VeilSelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (column.editable === "datetime" || column.filter === "date") {
    return (
      <Input
        type="datetime-local"
        value={value || ""}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit?.()
          if (e.key === "Escape") onCancel?.()
        }}
        className="soc-field-sm h-7"
      />
    )
  }
  const isNumber = column.editable === "number" || column.filter === "number"
  return (
    <Input
      type={isNumber ? "number" : "text"}
      value={value || ""}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit?.()
        if (e.key === "Escape") onCancel?.()
      }}
      className="soc-field-sm h-7"
    />
  )
}

export default GenericTableModule
