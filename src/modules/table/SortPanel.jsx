// Single-column sort selector. Click a column to cycle asc → desc → none.

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

function cycle(current) {
  if (!current) return "asc"
  if (current === "asc") return "desc"
  return ""
}

export function SortPanel({ columns, sort, onChange }) {
  const field = sort ? (sort.startsWith("-") ? sort.slice(1) : sort) : ""
  const dir = !sort ? "" : sort.startsWith("-") ? "desc" : "asc"

  function pick(f) {
    if (field !== f) {
      onChange(f)
      return
    }
    const next = cycle(dir)
    onChange(next ? (next === "desc" ? `-${f}` : f) : "")
  }

  const candidates = columns.filter(
    (c) => !c.system && c.filter && c.filter !== "none",
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">排序</span>
        {sort ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
          >
            清除
          </Button>
        ) : null}
      </div>
      <Separator />
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">没有可排序的列</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {candidates.map((c) => {
            const isActive = field === c.field
            const showDir = isActive ? dir : ""
            const Icon =
              showDir === "asc" ? ArrowUp : showDir === "desc" ? ArrowDown : ArrowUpDown
            return (
              <li key={c.field}>
                <Button
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => pick(c.field)}
                >
                  <Icon />
                  {c.label || c.field}
                  {showDir ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {showDir === "asc" ? "升序" : "降序"}
                    </span>
                  ) : null}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default SortPanel
