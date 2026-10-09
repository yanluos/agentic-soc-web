// ListRail — the platform-standard left-hand list rail, lifted from the
// workflow module's「定义」card so every two-pane module (工作流 / 插件管理 /
// 技能与知识库) reads the same: a hover-elevated Card whose compact header
// carries the list title + a count + one primary action (a blue IconButton),
// and whose body is a p-0 scrolling list of raised chip rows (rowActive /
// rowHover from lib/styles) optionally folded into collapsible folder groups.
//
// The workflow module keeps its own inline copy because its rows are drag
// sources and its groups are drop zones; the class strings here mirror it —
// keep the two in sync when tuning.
import { ChevronDown, ChevronRight, Folder } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { cardHover, rowActive, rowHover } from "@/lib/styles"
import { cn } from "@/lib/utils"

// RailHeader — the compact card header shared by RailCard and any pane that
// should read like one (the assistant's chat card): optional `leading` chrome
// (a panel-toggle IconButton), an optional muted `icon`, the text-sm title, a
// small muted `count`, and `action` at the right edge (an IconButton or a
// DropdownMenu wrapping one). `toolbar` (e.g. a search InputGroup) goes on a
// second line.
export function RailHeader({
  leading,
  icon: Icon,
  title,
  count,
  action,
  toolbar,
  className,
}) {
  return (
    <CardHeader className={cn("pb-2", className)}>
      <div className="flex items-center justify-between gap-2">
        {leading}
        <CardTitle className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          {Icon ? (
            <Icon className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="truncate">{title}</span>
          {count != null && count !== "" ? (
            <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </CardTitle>
        {action}
      </div>
      {toolbar ? <div className="pt-1">{toolbar}</div> : null}
    </CardHeader>
  )
}

// RailCard — the container: RailHeader over a p-0 scrolling body that gets the
// rows/groups as children.
export function RailCard({
  leading,
  icon,
  title,
  count,
  action,
  toolbar,
  className,
  contentClassName,
  children,
}) {
  return (
    <Card className={cn(cardHover, "flex min-h-0 flex-col", className)}>
      <RailHeader
        leading={leading}
        icon={icon}
        title={title}
        count={count}
        action={action}
        toolbar={toolbar}
      />
      <CardContent
        className={cn(
          "min-h-0 thin-scrollbar flex-1 overflow-y-auto p-0",
          contentClassName
        )}
      >
        {children}
      </CardContent>
    </Card>
  )
}

// RailBody — the padded column the groups/rows stack in (the workflow list's
// `flex flex-col gap-1 p-2`).
export function RailBody({ className, children }) {
  return (
    <div className={cn("flex flex-col gap-1 p-2", className)}>{children}</div>
  )
}

// RailList — a flat run of rows. `indent` is the nested list inside a group.
export function RailList({ indent, className, children }) {
  return (
    <ul className={cn("flex flex-col gap-1", indent && "pb-1 pl-3", className)}>
      {children}
    </ul>
  )
}

// RailGroup — a folder header (chevron + icon + label + count) over an indented
// row list. Pass `onToggle` to make it collapsible; omit it for a static
// heading (the workflow「未分组」zone). `actions` renders at the header's right
// edge (e.g. a MoreHorizontal menu). `muted` dims the folder icon.
export function RailGroup({
  label,
  count,
  icon: Icon = Folder,
  collapsed = false,
  onToggle,
  muted,
  actions,
  emptyText,
  className,
  children,
}) {
  const hasRows = Array.isArray(children) ? children.some(Boolean) : !!children
  const head = (
    <>
      {onToggle ? (
        collapsed ? (
          <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )
      ) : null}
      <Icon className={cn("size-3.5 shrink-0", muted && "opacity-50")} />
      <span className="truncate">{label}</span>
      {count != null ? (
        <span className="shrink-0 text-[10px]">{count}</span>
      ) : null}
    </>
  )
  return (
    <div className={cn("rounded-md", className)}>
      <div className="flex items-center gap-1 pr-1">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {head}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {head}
          </div>
        )}
        {actions}
      </div>
      {collapsed ? null : hasRows ? (
        <RailList indent>{children}</RailList>
      ) : emptyText ? (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          {emptyText}
        </p>
      ) : null}
    </div>
  )
}

// RailRow — one selectable chip row (renders the <li>). It is a div with the
// button role rather than a <button> so callers can nest real controls (a
// Switch, an IconButton) without invalid interactive nesting — stop
// propagation on those. Children are laid out left→right; put trailing
// badges/controls in `trailing` so they never shrink.
export function RailRow({
  active,
  onClick,
  disabled,
  className,
  children,
  trailing,
  ...rest
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick?.(e)
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          active ? rowActive : rowHover,
          disabled && "text-muted-foreground",
          className
        )}
        {...rest}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {children}
        </span>
        {trailing ? (
          <span className="flex shrink-0 items-center gap-1">{trailing}</span>
        ) : null}
      </div>
    </li>
  )
}

// RailMessage — centered muted copy for empty results; RailLoading — the
// spinner block, both sized like the workflow list's states.
export function RailMessage({ children }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

export function RailLoading() {
  return (
    <div className="flex items-center justify-center p-4">
      <Spinner />
    </div>
  )
}
