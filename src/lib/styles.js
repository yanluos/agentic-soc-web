// Shared layout/effect class strings (shadcn-compatible: effects + semantic
// tokens only, never component colors/typography). Applied to module Cards via
// cn() so the elevation treatment stays consistent and tweakable in one place.
//
// Module cards use shadow layering instead of a hairline border:
//   - `ring-0` removes the base Card outline
//   - `shadow-sm` → `hover:shadow-lg` gives resting + hover elevation
//   - in dark mode a soft *inset* top highlight (blurred, fading inward) adds a
//     sheen that defines the top edge without reading as a hard border line.
//     Inset shadows paint above the background but below content, so they never
//     overlay text. Light mode relies on the drop shadow alone (the card is
//     already lighter than the page, so it separates cleanly).
export const cardHover =
  "ring-0 transition-shadow duration-200 ease-out " +
  "shadow-sm hover:shadow-lg " +
  "dark:shadow-[0_1px_3px_0_rgb(0_0_0/0.5),inset_0_2px_6px_-3px_rgb(255_255_255/0.12)] " +
  "dark:hover:shadow-[0_10px_28px_-6px_rgb(0_0_0/0.6),inset_0_2px_6px_-3px_rgb(255_255_255/0.16)]"

// Persistent "selected/open" elevation — the same values as cardHover's hover
// tier, held without the pointer. Pair with cardHover on surfaces that have a
// selected or expanded state (event cards, pickable list items) so selection
// reads as the card staying afloat.
export const cardLifted =
  "shadow-lg " +
  "dark:shadow-[0_10px_28px_-6px_rgb(0_0_0/0.6),inset_0_2px_6px_-3px_rgb(255_255_255/0.16)]"

// Resting elevation without the hover step — for small non-interactive
// surfaces (chat bubbles, chips) that should read as raised cards.
export const cardStatic =
  "ring-0 shadow-sm " +
  "dark:shadow-[0_1px_3px_0_rgb(0_0_0/0.5),inset_0_2px_6px_-3px_rgb(255_255_255/0.12)]"

// Selectable list rows (sidebar-style raised chips): the content card's top-lit
// look (inset top highlight + soft drop shadows) scaled to row size. Values
// mirror the sidebar active/hover treatment in Layout.jsx AppSidebar — keep the
// two in sync when tuning. Rows need rounded corners and a little breathing
// room (gap/padding on the list) so the shadow can render.
//
// rowActive — the selected row: lifted to the bg-background surface, heavier
// two-layer shadow, plus a 3px primary accent bar on the left edge.
export const rowActive =
  "relative bg-background font-medium " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_1px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.08)] " +
  "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_0_1px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.35),0_6px_16px_rgba(0,0,0,0.45)] " +
  "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary"

// rowHover — non-selected rows on hover: same raised look one elevation tier
// lighter (resting-card vs the active hover-tier), no accent bar.
export const rowHover =
  "hover:bg-background " +
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_1px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.06)] " +
  "dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_1px_rgba(0,0,0,0.5),0_1px_3px_rgba(0,0,0,0.35)]"

// fieldRaised — the borderless raised small field (InlineRename and any other
// h-6/h-7 input): implemented as one CSS class in index.css「小号输入框立体感」
// so shadcn's sm SelectTrigger (matched there by data-slot/data-size) and the
// hand-placed inputs share a single definition. Add it to compact Inputs /
// InputGroups; default-size (h-8) fields keep their outline.
export const fieldRaised = "soc-field-sm"
