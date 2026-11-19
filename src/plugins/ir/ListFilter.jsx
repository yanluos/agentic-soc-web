// ListFilter — the 筛选 button of the case-detail lists: the platform's generic
// FilterPanel in a popover. Same contract as TableToolbar / CaseList: the
// popover edits a draft, the tree is committed (and the list re-queried) when
// it closes.
import { useState } from "react"
import { ListFilter as ListFilterIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FilterPanel, countClauses } from "@/platform"

export function ListFilter({ tree, columns, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(tree)
  const count = countClauses(tree)

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(tree)
        else onChange(draft)
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilterIcon data-icon="inline-start" />
          筛选
          {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-3" align="start">
        <FilterPanel tree={draft} columns={columns} onChange={setDraft} />
      </PopoverContent>
    </Popover>
  )
}
