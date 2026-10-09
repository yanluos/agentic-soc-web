// Toolbar above the table. Hosts Filter/Fields/Sort popovers, page-size
// select, refresh + new + the `extraActions` slot for module-specific extras
// (e.g. DLP's sync popover).

import { useState } from "react"
import {
  ListFilter,
  Columns3,
  ArrowUpDown,
  Plus,
  RefreshCw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"
import { FilterPanel } from "@/modules/table/FilterPanel.jsx"
import { FieldsPanel } from "@/modules/table/FieldsPanel.jsx"
import { SortPanel } from "@/modules/table/SortPanel.jsx"
import { countClauses } from "@/modules/table/filterOps.js"

export function TableToolbar({
  title,
  total,
  viewState,
  loading,
  onRefresh,
  showCreate,
  onCreate,
  extraActions,
  showFields = true,
  createSlot,
}) {
  const { filterTree, hidden, sort, setFilterTree, setHidden, setSort } = viewState
  // The filter popover edits a local draft; the tree is committed (and the
  // query re-runs) only when the popover closes.
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState(filterTree)
  const filterCount = countClauses(filterTree)
  const hiddenCount = hidden.length
  const sortActive = !!sort

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {typeof total === "number" ? (
          <span className="text-xs text-muted-foreground">共 {total} 条</span>
        ) : null}
      </div>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <Popover
        open={filterOpen}
        onOpenChange={(open) => {
          if (open) setFilterDraft(filterTree)
          else setFilterTree(filterDraft)
          setFilterOpen(open)
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
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
            columns={viewState.allColumns}
            onChange={setFilterDraft}
          />
        </PopoverContent>
      </Popover>

      {showFields ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Columns3 />
              列
              {hiddenCount > 0 ? (
                <Badge variant="secondary" className="ml-1">
                  {hiddenCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-3" align="start">
            <FieldsPanel viewState={viewState} />
          </PopoverContent>
        </Popover>
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <ArrowUpDown />
            排序
            {sortActive ? (
              <Badge variant="secondary" className="ml-1">
                1
              </Badge>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-3" align="start">
          <SortPanel
            columns={viewState.allColumns}
            sort={sort}
            onChange={setSort}
          />
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {extraActions}

      <div className="ml-auto flex items-center gap-2">
        <IconButton
          color="blue"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新"
        >
          {loading ? <Spinner /> : <RefreshCw />}
        </IconButton>
        {createSlot ??
          (showCreate && onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus data-icon="inline-start" />
              新建
            </Button>
          ) : null)}
      </div>
    </div>
  )
}

export default TableToolbar
