import { cn } from "@/lib/utils"

/**
 * 语义色图标按钮（Flat 2.0 立体感）。样式在 index.css「语义色图标按钮」段，
 * 设计规范见 /Users/yanluo/dev/agentic-soc/design/agentic-soc-icon-buttons.html。
 *
 * 颜色即语义：red=破坏性(删除/封禁/禁止) green=确认执行 blue=同步/新增
 * orange=通知告警 purple=AI cyan=查询/导出 gray=中性。
 * 三档强调：工具栏主动作用默认实心；表格行内用 variant="soft"；
 * variant="ghost" 是 chrome 层——静止透明，悬停以语义色浅底显形。
 * 图标传 lucide 组件作 children；必须带 aria-label。
 */
function IconButton({
  color = "gray",
  variant = "solid",
  size = "sm",
  type = "button",
  className,
  ...props
}) {
  return (
    <button
      type={type}
      data-slot="icon-button"
      className={cn(
        "ibtn",
        `ibtn-${color}`,
        `ibtn-${size}`,
        variant === "soft" && "ibtn-soft",
        variant === "ghost" && "ibtn-ghost",
        variant === "outline" && "ibtn-outline",
        className,
      )}
      {...props}
    />
  )
}

export { IconButton }
