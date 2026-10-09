// ScoreBreakdown — how an execution object's final score was assembled:
// stacked contribution bar + legend. Only semantic tokens are used, so the
// segments are distinguished by opacity steps of the foreground colour.
const PARTS = [
  ["exec", "执行"],
  ["trigger", "触发"],
  ["forensic", "取证"],
  ["event", "事件"],
  ["module", "模块"],
  ["memory", "内存"],
  ["yara", "YARA"],
  ["chain", "行为链"],
  ["cluster", "文件簇"],
  ["synergy", "协同"],
]
const SHADES = [
  "bg-primary",
  "bg-primary/85",
  "bg-primary/70",
  "bg-primary/60",
  "bg-primary/50",
  "bg-primary/40",
  "bg-primary/30",
  "bg-primary/25",
  "bg-primary/20",
  "bg-primary/15",
]

export function ScoreBreakdown({ scores }) {
  if (!scores) return null
  const items = PARTS.map(([k, label], i) => ({
    k,
    label,
    v: Number(scores[k]) || 0,
    shade: SHADES[i],
  })).filter((p) => p.v > 0)
  const gross = items.reduce((a, b) => a + b.v, 0) || 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {items.map((p) => (
          <div
            key={p.k}
            className={p.shade}
            style={{ width: `${(p.v / gross) * 100}%` }}
            title={`${p.label} ${p.v}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {items.map((p) => (
          <span key={p.k} className="inline-flex items-center gap-1">
            <span className={`inline-block size-2 rounded-sm ${p.shade}`} />
            {p.label}{" "}
            <span className="text-muted-foreground tabular-nums">+{p.v}</span>
          </span>
        ))}
        {scores.white_reduction ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            白证据{" "}
            <span className="tabular-nums">-{scores.white_reduction}</span>
          </span>
        ) : null}
        {scores.floor ? (
          <span className="text-muted-foreground">底线 {scores.floor}</span>
        ) : null}
        {scores.cap ? (
          <span className="text-muted-foreground">上限 {scores.cap}</span>
        ) : null}
        <span className="ml-auto font-medium tabular-nums">
          最终 {scores.final ?? 0}
        </span>
      </div>
    </div>
  )
}
