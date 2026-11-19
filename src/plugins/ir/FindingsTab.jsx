// FindingsTab — materialized findings (ir_findings rows), filtered with the
// platform's generic FilterPanel (ListFilter → `where`), multi-select and bulk
// verdicts (PATCH /findings/{id}). Fixed-layout table: fills the pane, never
// grows past it.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, CheckCheck, RefreshCw, ShieldOff, Wrench } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IconButton } from "@/components/IconButton.jsx"
import { cn } from "@/lib/utils"
import { countClauses, nodeToWhere } from "@/platform"
import { LevelBadge } from "./LevelBadge.jsx"
import { ListFilter } from "./ListFilter.jsx"
import { FINDING_FILTER_FIELDS, defaultTree } from "./filterFields.js"
import { RowSheet } from "./RowSheet.jsx"
import {
  errMsg,
  fields,
  findingTypeLabel,
  fmtTime,
  listOf,
  parseJSON,
  truncate,
} from "./lib.js"

function statusVariant(s) {
  switch (s) {
    case "确认恶意":
      return "destructive"
    case "已处置":
      return "success"
    case "误报":
      return "secondary"
    default:
      return "outline"
  }
}

export function FindingsTab({
  api,
  caseId,
  hostname,
  onNavigate,
  setError,
  refreshKey,
  onChanged,
  filterTree,
  onFilterTree,
}) {
  const tree = useMemo(
    () => filterTree || defaultTree("findings"),
    [filterTree]
  )
  const where = useMemo(
    () => nodeToWhere(tree, true, FINDING_FILTER_FIELDS),
    [tree]
  )
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    if (!api || !caseId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ case_id: String(caseId) })
      if (where) qs.set("where", where)
      const r = await api.get(`/findings?${qs}`)
      setRows(listOf(r))
      setSel(new Set())
    } catch (err) {
      setRows([])
      setError?.(errMsg(err, "读取发现失败"))
    } finally {
      setLoading(false)
    }
  }, [api, caseId, where, setError])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const allChecked = useMemo(
    () => rows?.length > 0 && rows.every((r) => sel.has(r.id)),
    [rows, sel]
  )

  async function bulk(newStatus) {
    if (sel.size === 0) return
    setBusy(true)
    let ok = 0
    for (const id of sel) {
      try {
        await api.patch(`/findings/${id}`, { 状态: newStatus })
        ok++
      } catch (err) {
        toast.error(`#${id}: ${errMsg(err)}`)
      }
    }
    setBusy(false)
    toast.success(`${ok} 条发现已标记为「${newStatus}」`)
    onChanged?.()
    load()
  }

  function toggleAll(v) {
    setSel(v ? new Set(rows.map((r) => r.id)) : new Set())
  }

  function rowToSheet(r) {
    const f = fields(r)
    const detail = parseJSON(f["详情"], null)
    return {
      id: r.id,
      类型: findingTypeLabel(f["类型"]),
      名称: f["名称"],
      路径: f["路径"],
      命令行: f["命令行"],
      score: Number(f["风险分"]) || 0,
      level: f["风险等级"],
      状态: f["状态"],
      研判备注: f["研判备注"],
      研判人: f["研判人"],
      研判时间: f["研判时间"],
      reasons: detail?.reasons || parseJSON(f["原因码"], []),
      scores: detail?.scores,
      详情: detail,
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter
          tree={tree}
          columns={FINDING_FILTER_FIELDS}
          onChange={(t) => onFilterTree?.(t)}
        />
        {sel.size > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              已选 {sel.size}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => bulk("确认恶意")}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              确认恶意
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => bulk("误报")}
            >
              <ShieldOff data-icon="inline-start" />
              误报
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => bulk("已处置")}
            >
              <Wrench data-icon="inline-start" />
              已处置
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => bulk("待确认")}
            >
              <CheckCheck data-icon="inline-start" />
              重置
            </Button>
          </div>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          共 {rows?.length ?? 0} 条
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
      <div className="min-h-0 thin-scrollbar flex-1 overflow-auto rounded-lg border">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="全选"
                  disabled={!rows?.length}
                />
              </TableHead>
              <TableHead className="w-16">等级</TableHead>
              <TableHead className="w-14 text-right">分数</TableHead>
              <TableHead className="w-20">类型</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>路径 / 命令行</TableHead>
              <TableHead>原因</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-32">研判</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows == null ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Check />
                      </EmptyMedia>
                      <EmptyTitle>没有发现</EmptyTitle>
                      <EmptyDescription>
                        {countClauses(tree) > 0
                          ? "没有符合筛选条件的发现，放宽或清空筛选试试。"
                          : null}
                        上传采集包后，分数达到阈值的对象/触发项/事件等会物化为发现。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const f = fields(r)
                const codes = parseJSON(f["原因码"], [])
                const codeList = Array.isArray(codes)
                  ? codes
                      .map((c) => (typeof c === "string" ? c : c?.code))
                      .filter(Boolean)
                  : []
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    data-state={sel.has(r.id) ? "selected" : undefined}
                    onClick={() => setOpen(rowToSheet(r))}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={sel.has(r.id)}
                        onCheckedChange={(v) =>
                          setSel((s) => {
                            const n = new Set(s)
                            if (v) n.add(r.id)
                            else n.delete(r.id)
                            return n
                          })
                        }
                        aria-label={`选择 #${r.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={f["风险等级"]} score={f["风险分"]} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {f["风险分"] ?? 0}
                    </TableCell>
                    <TableCell className="truncate text-xs">
                      {findingTypeLabel(f["类型"])}
                    </TableCell>
                    <TableCell
                      className="truncate text-xs font-medium"
                      title={f["名称"]}
                    >
                      {f["名称"] || "-"}
                    </TableCell>
                    <TableCell
                      className="truncate font-mono text-[11px]"
                      title={f["命令行"] || f["路径"]}
                    >
                      {f["命令行"] || f["路径"] || "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="flex flex-wrap gap-1">
                        {codeList.slice(0, 4).map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {c}
                          </Badge>
                        ))}
                        {codeList.length > 4 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{codeList.length - 4}
                          </span>
                        ) : null}
                        {codeList.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {truncate(f["原因"], 60) || "-"}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(f["状态"])}>
                        {f["状态"] || "待确认"}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate text-[11px] text-muted-foreground">
                      {f["研判人"]
                        ? `${f["研判人"]} ${fmtTime(f["研判时间"]).slice(5, 16)}`
                        : "-"}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <RowSheet
        row={open}
        title="发现详情"
        onOpenChange={setOpen}
        onNavigate={onNavigate}
        hostname={hostname}
      />
    </div>
  )
}
