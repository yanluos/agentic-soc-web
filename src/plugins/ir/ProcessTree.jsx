// ProcessTree — collapsible parent→child list from view "tree" (ProcessNode[]).
import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LevelBadge } from "./LevelBadge.jsx"
import { truncate } from "./lib.js"

function Node({ node, depth, onSelect, defaultOpen }) {
  const kids = node.children || []
  const [open, setOpen] = useState(
    defaultOpen || node.score >= 20 || kids.some((k) => k.score >= 20)
  )
  return (
    <li>
      <div
        className="flex items-center gap-1 rounded-md py-0.5 pr-2 text-xs hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {kids.length ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={open ? "折叠" : "展开"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : (
          <span className="inline-block size-6 shrink-0" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect?.(node)}
        >
          <span className={node.score >= 40 ? "font-medium" : ""}>
            {node.name}
          </span>
          <span className="text-muted-foreground tabular-nums">{node.pid}</span>
          <span
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={node.path}
          >
            {truncate(node.path, 70)}
          </span>
        </button>
        {node.score > 0 || node.level ? (
          <LevelBadge level={node.level} score={node.score} showScore />
        ) : null}
      </div>
      {open && kids.length ? (
        <ul>
          {kids.map((k) => (
            <Node key={k.pid} node={k} depth={depth + 1} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function ProcessTree({ nodes, onSelect }) {
  if (!nodes?.length)
    return (
      <p className="p-4 text-sm text-muted-foreground">采集包未包含进程树。</p>
    )
  return (
    <ul className="flex flex-col">
      {nodes.map((n) => (
        <Node key={n.pid} node={n} depth={0} onSelect={onSelect} defaultOpen />
      ))}
    </ul>
  )
}
