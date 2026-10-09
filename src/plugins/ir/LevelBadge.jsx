import { Badge } from "@/components/ui/badge"
import { levelForScore, levelOf } from "./lib.js"

// LevelBadge renders a tier pill; pass `level` (enum or 中文) or `score`.
export function LevelBadge({ level, score, showScore = false, className }) {
  const l = levelOf(level) || (score != null ? levelForScore(score) : null)
  if (!l) return <span className="text-muted-foreground">-</span>
  return (
    <Badge variant={l.variant} className={className}>
      {l.label}
      {showScore && score != null ? (
        <span className="tabular-nums">{score}</span>
      ) : null}
    </Badge>
  )
}
