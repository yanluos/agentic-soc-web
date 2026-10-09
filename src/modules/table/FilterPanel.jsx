// Filter popover content. Recursive AND/OR group editor with per-clause
// field/op/value inputs.
//
// Editor callbacks:
//   onUpdate(updatedNode) — replace this node with the given value
//   onDelete()             — remove this node from its parent

import { useState } from "react"
import { ChevronDown, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  dropdownCls,
  veilBarCls,
  VeilSelectItem,
} from "@/modules/table/veilSelect.jsx"
import { Separator } from "@/components/ui/separator"
import {
  addChildToGroup,
  clauseId,
  deleteNode,
  findOp,
  newClause,
  newGroup,
  opsForColumn,
  updateNode,
} from "@/modules/table/filterOps.js"
import { SingleDatePopover } from "@/components/DateRangePicker.jsx"

const MAX_NESTING = 3

// Elevation treatment per lib/styles.js: each nesting level is a bordered
// surface with its own drop shadow (plus a soft inset top sheen in dark mode)
// so popover > group > sub-group > clause read as stacked layers.
const groupCardCls =
  "rounded-lg border p-2 shadow-sm " +
  "dark:shadow-[0_1px_3px_0_rgb(0_0_0/0.5),inset_0_2px_6px_-3px_rgb(255_255_255/0.10)]"
const clauseCardCls =
  "rounded-md border bg-muted/30 p-1.5 shadow-xs " +
  "dark:shadow-[0_1px_2px_0_rgb(0_0_0/0.45),inset_0_1px_4px_-2px_rgb(255_255_255/0.08)]"

// First column that actually supports filtering (the column list now includes
// hidden / system columns, some of which have no filter operators).
function firstFilterableField(columns) {
  const col = columns.find((c) => c.filter && c.filter !== "none") || columns[0]
  return col?.field || ""
}

export function FilterPanel({ tree, columns, onChange }) {
  const isRoot = true
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">筛选条件</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange(
                updateNode(tree, tree.id, (g) => ({
                  ...g,
                  children: [
                    ...g.children,
                    newClause(firstFilterableField(columns), "like", ""),
                  ],
                }))
              )
            }
          >
            <Plus data-icon="inline-start" />
            条件
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange(
                updateNode(tree, tree.id, (g) => ({
                  ...g,
                  children: [...g.children, newGroup("and")],
                }))
              )
            }
          >
            <Plus data-icon="inline-start" />
            分组
          </Button>
          {tree.children.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...tree, children: [] })}
            >
              清空
            </Button>
          ) : null}
        </div>
      </div>
      <Separator />
      {tree.children.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          点击右上角 "条件" 或 "分组" 开始添加。
        </p>
      ) : (
        <GroupEditor
          node={tree}
          columns={columns}
          depth={0}
          isRoot={isRoot}
          onChange={onChange}
          onDelete={isRoot ? null : () => onChange(deleteNode(tree, tree.id))}
        />
      )}
    </div>
  )
}

function GroupEditor({ node, columns, depth, isRoot, onChange, onDelete }) {
  const setLogic = (logic) =>
    onChange(updateNode(node, node.id, (g) => ({ ...g, logic })))

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        groupCardCls,
        depth % 2 === 1 ? "bg-muted/20" : "bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <Select value={node.logic} onValueChange={setLogic}>
          <SelectTrigger size="sm" className="h-7 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={dropdownCls}>
            <VeilSelectItem value="and">满足全部 (AND)</VeilSelectItem>
            <VeilSelectItem value="or">满足任一 (OR)</VeilSelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {node.children.length} 个子项
        </span>
        {onDelete ? (
          <IconButton
            color="red"
            variant="soft"
            size="sm"
            className="ml-auto"
            onClick={onDelete}
            aria-label="删除该分组"
          >
            <Trash2 />
          </IconButton>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {node.children.map((child) =>
          child.kind === "group" ? (
            <GroupEditor
              key={child.id}
              node={child}
              columns={columns}
              depth={depth + 1}
              isRoot={false}
              onChange={(updated) =>
                onChange(updateNode(node, child.id, () => updated))
              }
              onDelete={() => onChange(deleteNode(node, child.id))}
            />
          ) : (
            <ClauseEditor
              key={child.id}
              clause={child}
              columns={columns}
              onChange={(updated) =>
                onChange(updateNode(node, child.id, () => updated))
              }
              onDelete={() => onChange(deleteNode(node, child.id))}
            />
          )
        )}
        {depth < MAX_NESTING - 1 ? (
          <div className="flex items-center gap-1 pl-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange(
                  addChildToGroup(
                    node,
                    node.id,
                    newClause(firstFilterableField(columns), "like", "")
                  )
                )
              }
            >
              <Plus data-icon="inline-start" />
              条件
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange(addChildToGroup(node, node.id, newGroup("and")))
              }
            >
              <Plus data-icon="inline-start" />
              子分组
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ClauseEditor({ clause, columns, onChange, onDelete }) {
  const column =
    columns.find((c) => c.field === clause.field) || columns[0] || null
  const ops = column ? opsForColumn(column) : []
  const opDef = column ? findOp(column, clause.op) : null

  function setField(field) {
    const newCol = columns.find((c) => c.field === field) || null
    const newOps = newCol ? opsForColumn(newCol) : []
    const first = newOps[0]
    const value = first
      ? first.arity === 0
        ? ""
        : first.inputKind === "pair"
          ? { from: "", to: "" }
          : first.inputKind === "multi"
            ? []
            : ""
      : ""
    onChange({ ...clause, field, op: first?.op || "", value })
  }
  function setOp(op) {
    const def = ops.find((o) => o.op === op)
    let value = clause.value
    if (def?.arity === 0) value = ""
    else if (
      def?.inputKind === "pair" &&
      (typeof value !== "object" || Array.isArray(value))
    )
      value = { from: "", to: "" }
    else if (def?.inputKind === "multi" && !Array.isArray(value)) value = []
    else if (def?.inputKind === "single" && value && typeof value === "object")
      value = ""
    onChange({ ...clause, op, value })
  }

  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-1.5 text-xs",
        clauseCardCls
      )}
    >
      <Select value={clause.field} onValueChange={setField}>
        <SelectTrigger size="sm" className="h-7 w-[120px] shrink-0 text-xs">
          <SelectValue placeholder="选择字段" />
        </SelectTrigger>
        <SelectContent className={dropdownCls}>
          {columns
            .filter((c) => c.filter && c.filter !== "none")
            .map((c) => (
              <VeilSelectItem key={c.field} value={c.field}>
                {c.label || c.field}
              </VeilSelectItem>
            ))}
        </SelectContent>
      </Select>
      <Select value={clause.op} onValueChange={setOp} disabled={!clause.field}>
        <SelectTrigger size="sm" className="h-7 w-[104px] shrink-0 text-xs">
          <SelectValue placeholder="选择运算" />
        </SelectTrigger>
        <SelectContent className={dropdownCls}>
          {ops.map((o) => (
            <VeilSelectItem key={o.op} value={o.op}>
              {o.label}
            </VeilSelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="min-w-0 flex-1">
        <ValueInput
          column={column}
          opDef={opDef}
          value={clause.value}
          onChange={(v) => onChange({ ...clause, value: v })}
        />
      </div>
      <IconButton
        color="red"
        variant="soft"
        size="sm"
        className="shrink-0"
        onClick={onDelete}
        aria-label="删除条件"
      >
        <Trash2 />
      </IconButton>
    </div>
  )
}

function ValueInput({ column, opDef, value, onChange }) {
  if (!column || !opDef) return null
  if (opDef.arity === 0 || opDef.inputKind === "none") return null

  if (opDef.inputKind === "pair") {
    if (column.filter === "date") {
      return (
        <div className="flex w-full items-center gap-1">
          <div className="min-w-0 flex-1">
            <SingleDatePopover
              value={value?.from || ""}
              onChange={(v) => onChange({ from: v, to: value?.to || "" })}
              placeholder="开始"
              className="h-7 w-full text-xs"
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">→</span>
          <div className="min-w-0 flex-1">
            <SingleDatePopover
              value={value?.to || ""}
              onChange={(v) => onChange({ from: value?.from || "", to: v })}
              placeholder="结束"
              className="h-7 w-full text-xs"
            />
          </div>
        </div>
      )
    }
    const fromV = typeof value === "object" && value ? (value.from ?? "") : ""
    const toV = typeof value === "object" && value ? (value.to ?? "") : ""
    const isNumber = column.filter === "number"
    return (
      <div className="flex w-full items-center gap-1">
        <Input
          type={isNumber ? "number" : "text"}
          value={fromV}
          onChange={(e) => onChange({ from: e.target.value, to: toV })}
          placeholder="起"
          className="soc-field-sm h-7 w-full min-w-0 text-xs"
        />
        <span className="shrink-0 text-xs text-muted-foreground">→</span>
        <Input
          type={isNumber ? "number" : "text"}
          value={toV}
          onChange={(e) => onChange({ from: fromV, to: e.target.value })}
          placeholder="止"
          className="soc-field-sm h-7 w-full min-w-0 text-xs"
        />
      </div>
    )
  }

  if (opDef.inputKind === "multi") {
    const options = column.options || []
    if (options.length > 0) {
      return (
        <MultiSelectPopover
          options={options}
          value={value}
          onChange={onChange}
        />
      )
    }
    return (
      <Input
        value={Array.isArray(value) ? value.join(",") : ""}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder="逗号分隔"
        className="soc-field-sm h-7 w-full text-xs"
      />
    )
  }

  if (column.filter === "select" && opDef.inputKind === "single") {
    const options = column.options || []
    // A SingleSelect whose colOptions were never seeded would render an empty,
    // unusable dropdown — degrade to free text (same fallback as the "multi"
    // branch above) so the clause is still typable.
    if (options.length === 0) {
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入值"
          className="soc-field-sm h-7 w-full text-xs"
        />
      )
    }
    return (
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
      >
        <SelectTrigger size="sm" className="soc-field-sm h-7 w-full text-xs">
          <SelectValue placeholder="选择" />
        </SelectTrigger>
        <SelectContent className={dropdownCls}>
          {options.map((o) => (
            <VeilSelectItem key={o.value} value={o.value}>
              {o.label ?? o.value}
            </VeilSelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (column.filter === "date") {
    return (
      <SingleDatePopover
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        className="soc-field-sm h-7 w-full text-xs"
      />
    )
  }

  return (
    <Input
      type={column.filter === "number" ? "number" : "text"}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="soc-field-sm h-7 w-full text-xs"
    />
  )
}

// Dropdown multi-select for "in"/"nin" clauses. Selected options are marked
// with the primary (black-on-light) background; the trigger shows the picked
// values joined, so the clause reads at a glance without opening the list.
function MultiSelectPopover({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const arr = Array.isArray(value) ? value : []
  const toggle = (v) =>
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full justify-between px-2 text-xs font-normal"
        >
          <span
            className={cn(
              "truncate",
              arr.length === 0 && "text-muted-foreground"
            )}
          >
            {arr.length > 0 ? arr.join("、") : "选择"}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-(--radix-popover-trigger-width) min-w-40 p-1",
          dropdownCls
        )}
      >
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {options.map((o) => {
            const selected = arr.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "relative flex items-center justify-between gap-2 rounded-md py-1.5 pr-2 pl-3 text-left text-xs outline-none",
                  selected
                    ? cn("bg-foreground/25 hover:bg-foreground/30", veilBarCls)
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="truncate">{o.label ?? o.value}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
