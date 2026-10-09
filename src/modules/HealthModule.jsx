import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  HeartPulse,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cardHover } from "@/lib/styles"
import { cn } from "@/lib/utils"

const STATUS_META = {
  ok: { label: "正常", variant: "secondary" },
  warn: { label: "注意", variant: "default" },
  error: { label: "异常", variant: "destructive" },
  skipped: { label: "未配置", variant: "outline" },
}

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || "未知", variant: "outline" }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

function formatTime(iso) {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("zh-CN", { hour12: false })
}

export function CheckRow({ check }) {
  const [open, setOpen] = useState(check.status === "error")
  const hasItems = Array.isArray(check.items) && check.items.length > 0

  const row = (
    <div className="flex items-start gap-3 py-2">
      <div className="pt-0.5">
        <StatusBadge status={check.status} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{check.name}</span>
          {check.latency_ms > 0 && (
            <span className="text-xs text-muted-foreground">{check.latency_ms}ms</span>
          )}
        </div>
        {check.detail && (
          <p className="text-xs text-muted-foreground">{check.detail}</p>
        )}
        {check.error && (
          <p className="break-all text-xs text-destructive">{check.error}</p>
        )}
      </div>
      {hasItems && (
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="展开明细">
            <ChevronDown
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
        </CollapsibleTrigger>
      )}
    </div>
  )

  if (!hasItems) return row

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {row}
      <CollapsibleContent>
        <div className="mb-2 ml-4 flex flex-col gap-1 border-l pl-4">
          {check.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <StatusBadge status={item.status} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium">{item.name}</span>
                {item.detail && (
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                )}
                {item.error && (
                  <span className="break-all text-xs text-destructive">{item.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ChecksCard({ icon: Icon, title, description, state }) {
  return (
    <Card className={cardHover}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {title}
          {state.data && <StatusBadge status={overallStatus(state.data.checks)} />}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-8 w-5/6" />
          </div>
        ) : state.error ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="break-all">服务不可达或检查失败: {state.error}</p>
          </div>
        ) : state.data ? (
          <div className="flex flex-col">
            {state.data.checks.map((check, i) => (
              <div key={check.id}>
                {i > 0 && <Separator />}
                <CheckRow check={check} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未检查</p>
        )}
      </CardContent>
    </Card>
  )
}

export function overallStatus(checks = []) {
  if (checks.some((c) => c.status === "error")) return "error"
  if (checks.some((c) => c.status === "warn")) return "warn"
  return "ok"
}

// describeChecks lists the check names the backend actually registered (core +
// plugins), so a new plugin's check shows up here without a frontend edit.
function describeChecks(state, fallback) {
  const names = (state?.data?.checks || []).map((c) => c.name).filter(Boolean)
  return names.length ? names.join(" / ") : fallback
}

export function HealthModule({ apiClient }) {
  const [server, setServer] = useState({ loading: false, data: null, error: "" })
  const [ai, setAi] = useState({ loading: false, data: null, error: "" })
  const [checkedAt, setCheckedAt] = useState(null)
  const loading = server.loading || ai.loading

  const run = useCallback(async () => {
    setServer({ loading: true, data: null, error: "" })
    setAi({ loading: true, data: null, error: "" })
    const [serverRes, aiRes] = await Promise.allSettled([
      apiClient.get("/api/v1/health/checks"),
      apiClient.get("/api/v1/ai/health/checks"),
    ])
    setServer(
      serverRes.status === "fulfilled"
        ? { loading: false, data: serverRes.value, error: "" }
        : { loading: false, data: null, error: serverRes.reason?.message || "未知错误" }
    )
    setAi(
      aiRes.status === "fulfilled"
        ? { loading: false, data: aiRes.value, error: "" }
        : { loading: false, data: null, error: aiRes.reason?.message || "未知错误" }
    )
    setCheckedAt(new Date())
    if (serverRes.status === "rejected" || aiRes.status === "rejected") {
      toast.error("部分健康检查失败")
    }
  }, [apiClient])

  useEffect(() => {
    run()
  }, [run])

  const failedRuns = ai.data?.failed_runs || []

  return (
    <div className="flex flex-col gap-4">
      <Card className={cardHover}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <HeartPulse />
                健康检查
              </CardTitle>
              <CardDescription>
                探测数据库、外部服务凭据(token/密钥)与消息监听连接,并汇总工作流失败历史。
                凭据探测为只读,不发送任何消息;微步/Serper 校验各消耗 1 次配额。
                {checkedAt && ` 上次检查: ${checkedAt.toLocaleTimeString("zh-CN", { hour12: false })}`}
              </CardDescription>
            </div>
            <Button onClick={run} disabled={loading}>
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              立即检查
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChecksCard
          icon={Server}
          title="soc-server 核心服务"
          description={describeChecks(server, "数据库 / 通知通道 / 插件依赖")}
          state={server}
        />
        <ChecksCard
          icon={Sparkles}
          title="soc-ai AI 服务"
          description={describeChecks(ai, "agent-core / 工作流 LLM / 集成")}
          state={ai}
        />
      </div>

      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="text-base">工作流失败历史</CardTitle>
          <CardDescription>
            最近 {failedRuns.length || 0} 条失败运行(最新在前)——详情到「工作流」页对应运行查看步骤级报错
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ai.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-4/5" />
            </div>
          ) : failedRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ai.error ? "soc-ai 不可达,无法读取失败历史" : "没有失败的工作流运行记录"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">时间</TableHead>
                    <TableHead className="w-56">工作流运行</TableHead>
                    <TableHead>错误信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTime(run.started_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{run.name || `run #${run.id}`}</span>
                        {run.dry_run && (
                          <Badge variant="outline" className="ml-2">
                            dry-run
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[32rem] break-all text-xs text-destructive">
                        {run.error || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default HealthModule
