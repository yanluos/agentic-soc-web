// Shared dropdown treatment for every table-view select (filter clauses,
// operators, values, inline edit cells).
//
// Surfaces are frosted glass: translucent popover bg with backdrop blur, a
// deeper drop shadow than the flat default, and the dark-mode inset top sheen
// from lib/styles.js — so open lists read as a pane floating above the panel.
//
// Selected items are marked by a translucent-foreground veil plus a dark left
// edge bar (the sidebar's active-indicator pattern from Layout.jsx) instead of
// the default ✓ indicator.

import { cn } from "@/lib/utils"
import { SelectItem } from "@/components/ui/select"

export const dropdownCls =
  "bg-popover/85 backdrop-blur-md shadow-lg " +
  "dark:shadow-[0_10px_28px_-6px_rgb(0_0_0/0.6),inset_0_2px_6px_-3px_rgb(255_255_255/0.14)]"

export const veilBarCls =
  "before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] " +
  "before:-translate-y-1/2 before:rounded-r-full before:bg-foreground"

// The first child span of SelectItem is the ✓ indicator, hidden here to
// reclaim its padding. `mb-1 last:mb-0` (not `my-*`, which margin-collapses)
// keeps item spacing identical to the multi-select popover's gap-1.
export function VeilSelectItem({ className, ...props }) {
  return (
    <SelectItem
      className={cn(
        "mb-1 pl-3 pr-1.5 text-xs last:mb-0 data-[state=checked]:bg-foreground/25",
        "data-[state=checked]:before:absolute data-[state=checked]:before:left-0 data-[state=checked]:before:top-1/2 data-[state=checked]:before:h-4 data-[state=checked]:before:w-[3px] data-[state=checked]:before:-translate-y-1/2 data-[state=checked]:before:rounded-r-full data-[state=checked]:before:bg-foreground",
        "[&>span:first-child]:hidden",
        className,
      )}
      {...props}
    />
  )
}
