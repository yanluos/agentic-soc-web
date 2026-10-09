// CaseList — the left column, styled like the 工作流 module's 定义 list: a Card
// whose header carries the title/count/新建 button, a compact toolbar with the
// 安全事件-style 筛选 / 排序 popovers (FilterPanel + SortPanel over the ir_cases
// table meta, committed as a NocoDB-style `where` so filtering is server-side),
// and plain rows (rowActive / rowHover) instead of rail chips.
import { useState } from "react"
import { ArrowUpDown, ListFilter, Plus, RefreshCw, Siren } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { cardHover, rowActive, rowHover } from "@/lib/styles"
import { cn } from "@/lib/utils"
import { FilterPanel, IconButton, SortPanel, countClauses } from "@/platform"
import { LevelBadge } from "./LevelBadge.jsx"
import { fields, fmtTime } from "./lib.js"

export function CaseList({
  cases,
  total,
  loading,
  viewState,
  activeId,
  onSelect,
  onCreate,
  onRefresh,
}) {
  const { filterTree, setFilterTree, sort, setSort, allColumns } = viewState
  // The filter popover edits a draft; the tree is committed (and the query
  // re-runs) only when the popover closes — same contract as TableToolbar.
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState(filterTree)
  const filterCount = countClauses(filterTree)

  return (
    <Card className={cn(cardHover, "flex min-h-0 flex-col")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Siren className="size-4 text-muted-foreground" />
            应急案例
            {typeof total === "number" ? (
              <span className="text-xs font-normal text-muted-foreground">
                {total}
              </span>
            ) : null}
          </CardTitle>
          <IconButton
            color="blue"
            size="sm"
            aria-label="新建案例"
            onClick={onCreate}
          >
            <Plus />
          </IconButton>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <Popover
            open={filterOpen}
            onOpenChange={(open) => {
              if (open) setFilterDraft(filterTree)
              else setFilterTree(filterDraft)
              setFilterOpen(open)
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!allColumns.length}>
                <ListFilter />
                筛选
                {filterCount > 0 ? (
                  <Badge variant="secondary" className="ml-1">
                    {filterCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[600px] p-3" align="start">
              <FilterPanel
                tree={filterDraft}
                columns={allColumns}
                onChange={setFilterDraft}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!allColumns.length}>
                <ArrowUpDown />
                排序
                {sort ? (
                  <Badge variant="secondary" className="ml-1">
                    1
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-3" align="start">
              <SortPanel columns={allColumns} sort={sort} onChange={setSort} />
            </PopoverContent>
          </Popover>
          <IconButton
            color="blue"
            size="sm"
            className="ml-auto"
            onClick={onRefresh}
            disabled={loading}
            aria-label="刷新"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </IconButton>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
        {loading && !cases ? (
          <div className="flex items-center justify-center p-4">
            <Spinner />
          </div>
        ) : !cases?.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {filterCount > 0
              ? "没有匹配筛选条件的案例"
              : "暂无案例，点「+」新建并生成采集令牌"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 p-2">
            {cases.map((c) => {
              const f = fields(c)
              const name = f["名称"] || f["主机名"] || `案例 #${c.id}`
              const active = String(c.id) === String(activeId)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-xs",
                      active ? rowActive : rowHover
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <LevelBadge level={f["风险等级"]} />
                        <Badge variant="outline" className="text-[10px]">
                          {f["状态"] || "待研判"}
                        </Badge>
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                      <span className="truncate">
                        {f["主机名"] || "待上传"}
                      </span>
                      <span>·</span>
                      <span className="shrink-0">
                        {fmtTime(f["采集时间"] || c.created_at).slice(0, 16)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
