// Column visibility + drag-and-drop reorder.

import { Eye, EyeOff, GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function FieldsPanel({ viewState }) {
  const { order, hidden, setOrder, toggleHidden, resetView } = viewState
  // Full column list (including hidden) so hidden columns can be toggled back.
  const all = viewState.allColumns
  const hiddenSet = new Set(hidden)

  function move(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const next = order.slice()
    const [it] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, it)
    setOrder(next)
  }

  function onDragStart(e, idx) {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", String(idx))
  }
  function onDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }
  function onDrop(e, idx) {
    e.preventDefault()
    const from = Number(e.dataTransfer.getData("text/plain"))
    if (Number.isFinite(from)) move(from, idx)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">可见列</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOrder(all.map((c) => c.key))
            }}
          >
            全部显示
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              // hide everything that's not in `all` (i.e. all currently visible)
              const allKeys = all.map((c) => c.key)
              // Toggle every visible column off by adding it to hidden.
              allKeys.forEach((k) => {
                if (!hiddenSet.has(k)) toggleHidden(k)
              })
            }}
          >
            全部隐藏
          </Button>
        </div>
      </div>
      <Separator />
      <ul className="flex flex-col gap-1">
        {order.map((key, idx) => {
          const col = all.find((c) => c.key === key)
          if (!col) return null
          const isHidden = hiddenSet.has(key)
          return (
            <li
              key={key}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, idx)}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
            >
              <GripVertical className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{col.label || col.field}</span>
              {col.system ? (
                <Badge variant="secondary" className="text-[10px]">
                  系统
                </Badge>
              ) : null}
              <Switch
                checked={!isHidden}
                onCheckedChange={() => toggleHidden(key)}
                aria-label={`切换 ${col.label || col.field}`}
              />
              {isHidden ? (
                <EyeOff className="size-3.5 text-muted-foreground" />
              ) : (
                <Eye className="size-3.5 text-muted-foreground" />
              )}
            </li>
          )
        })}
      </ul>
      <Separator />
      <Button type="button" variant="outline" size="sm" onClick={resetView}>
        重置视图
      </Button>
    </div>
  )
}

export default FieldsPanel
