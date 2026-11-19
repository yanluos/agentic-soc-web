// OverviewTab — the case at a glance, in the same three parts as the page:
// the case itself (host facts + the editable 研判结论 / 处置建议, PATCH
// /cases/{id}), then one summary card per data source — 实时监控 (the agent's
// current view of the host, GET /cases/{id}/live) and 取证快照 (the uploaded
// package: when it was taken, risk distribution, counts, collection errors).
// Each card links to its group; the two sources are never mixed in one grid.
import { useEffect, useState } from "react"
import { Activity, ArrowRight, Camera, Save, Ticket } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cardStatic } from "@/lib/styles"
import { formatBytes } from "@/utils.js"
import { LevelBadge } from "./LevelBadge.jsx"
import { errMsg, fields, fmtTime, listOf, parseJSON } from "./lib.js"

const COUNTS = [
  ["objects", "执行对象"],
  ["processes", "进程"],
  ["triggers", "触发项"],
  ["events", "事件"],
  ["modules", "模块分析"],
  ["forensics", "取证"],
  ["memory", "内存"],
  ["chains", "行为链"],
  ["indicators", "IOC"],
  ["yara_matched", "YARA 命中"],
]

const TIERS = [
  ["critical", "严重", "bg-destructive"],
  ["high", "高", "bg-destructive/60"],
  ["medium", "中", "bg-warning"],
  ["suspicious", "可疑", "bg-muted-foreground/60"],
  ["low", "低", "bg-muted-foreground/20"],
]

function Fact({ k, v }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {k}
      </span>
      <span
        className="truncate text-xs"
        title={typeof v === "string" ? v : undefined}
      >
        {v || "-"}
      </span>
    </div>
  )
}

export function OverviewTab({
  api,
  caseRow,
  onPatched,
  onNavigate,
  refreshKey,
  onOpen,
}) {
  const f = fields(caseRow)
  const summary = parseJSON(f["统计"], null) || {}
  const [conclusion, setConclusion] = useState(f["研判结论"] || "")
  const [advice, setAdvice] = useState(f["处置建议"] || "")
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState(null)
  const [live, setLive] = useState(null)

  // the live summary: once, then every 5s while a session runs
  const monitoring = f["监控状态"] === "监控中"
  useEffect(() => {
    if (!api || !caseRow?.id) return
    let alive = true
    const load = () =>
      api
        .get(`/cases/${caseRow.id}/live`)
        .then((r) => alive && setLive(r))
        .catch(() => alive && setLive({}))
    load()
    if (!monitoring) return () => (alive = false)
    const t = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, caseRow?.id, monitoring, refreshKey])

  useEffect(() => {
    setConclusion(f["研判结论"] || "")
    setAdvice(f["处置建议"] || "")
  }, [caseRow?.id, f["研判结论"], f["处置建议"]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api || !caseRow?.id || !f["采集时间"]) {
      setErrors(null)
      return
    }
    let alive = true
    api
      .get(`/cases/${caseRow.id}/view/errors?limit=100`)
      .then((r) => alive && setErrors(listOf(r)))
      .catch(() => alive && setErrors([]))
    return () => {
      alive = false
    }
  }, [api, caseRow?.id, f["采集时间"], refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    try {
      const r = await api.patch(`/cases/${caseRow.id}`, {
        研判结论: conclusion,
        处置建议: advice,
      })
      toast.success("研判已保存")
      onPatched?.(r)
    } catch (err) {
      toast.error(errMsg(err, "保存失败"))
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    conclusion !== (f["研判结论"] || "") || advice !== (f["处置建议"] || "")
  const tierTotal = TIERS.reduce((a, [k]) => a + (Number(summary[k]) || 0), 0)
  const uploaded = !!f["采集时间"]

  const mon = live?.monitor
  const lv = live?.live
  const everMonitored = !!mon?.state || !!lv?.known

  return (
    <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto pr-1 [&>*]:shrink-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span>研判</span>
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                {f["研判时间"] ? `更新于 ${fmtTime(f["研判时间"])}` : null}
                {f["关联工单"] ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => onNavigate?.("tickets")}
                  >
                    <Ticket data-icon="inline-start" />
                    工单 #{f["关联工单"]}
                  </Button>
                ) : null}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ir-conclusion">研判结论</FieldLabel>
                <Textarea
                  id="ir-conclusion"
                  rows={5}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="AI 研判或人工填写：是否失陷、入侵路径、涉及对象与依据…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ir-advice">处置建议</FieldLabel>
                <Textarea
                  id="ir-advice"
                  rows={4}
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  placeholder="结束进程 PID…、删除计划任务…、封禁 IOC…、隔离主机…"
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || saving}
                  onClick={save}
                >
                  {saving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  保存研判
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">主机与案例</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact k="主机名" v={f["主机名"]} />
            <Fact k="IP" v={f["IP"]} />
            <div className="col-span-2">
              <Fact
                k="操作系统"
                v={[f["操作系统"], f["操作系统版本"]].filter(Boolean).join(" ")}
              />
            </div>
            <Fact k="创建人" v={f["创建人"]} />
            <Fact k="创建时间" v={fmtTime(caseRow?.created_at)} />
            <Fact k="关联工单" v={f["关联工单"] ? `#${f["关联工单"]}` : ""} />
            <Fact
              k="关联安全事件"
              v={f["关联事件"] ? `#${f["关联事件"]}` : ""}
            />
            <div className="col-span-2">
              <Fact k="备注" v={f["备注"]} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" />
                实时监控
                {mon?.state === "监控中" ? (
                  mon.online ? (
                    <Badge variant="success">监控中</Badge>
                  ) : (
                    <Badge variant="warning">失联</Badge>
                  )
                ) : mon?.state === "已停止" ? (
                  <Badge variant="outline">已停止</Badge>
                ) : (
                  <Badge variant="outline">未部署</Badge>
                )}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onOpen?.("monitor")}
              >
                查看
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {everMonitored
                ? mon?.state === "监控中"
                  ? "agent 正在主机上实时上报，下面是它当前看到的状态。"
                  : "监控已结束，下面是 agent 最后一次上报时的状态。"
                : "主机上还没有运行监控 agent。部署后这里显示主机当前的进程、连接和启动项。"}
            </p>
            {everMonitored ? (
              <div className="grid grid-cols-3 gap-3">
                <Fact k="进程" v={String(lv?.processes ?? 0)} />
                <Fact
                  k="连接（公网）"
                  v={`${lv?.connections ?? 0}（${lv?.public_connections ?? 0}）`}
                />
                <Fact k="启动项" v={String(lv?.autoruns ?? 0)} />
                <Fact k="已存事件" v={String(mon?.events ?? 0)} />
                <Fact
                  k="告警指标"
                  v={
                    live?.indicators?.incident_id
                      ? `${(live.indicators.ips?.length || 0) + (live.indicators.hashes?.length || 0)} 个`
                      : "无关联事件"
                  }
                />
                <Fact
                  k={mon?.state === "监控中" ? "最近心跳" : "结束于"}
                  v={fmtTime(
                    mon?.state === "监控中" ? mon?.last_beat : mon?.ended
                  )}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Camera className="size-4 text-muted-foreground" />
                取证快照
                {uploaded ? (
                  summary.max_score != null ? (
                    <LevelBadge
                      level={summary.level}
                      score={summary.max_score}
                      showScore
                    />
                  ) : null
                ) : (
                  <Badge variant="outline">未上传</Badge>
                )}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onOpen?.("snapshot")}
              >
                查看
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {uploaded
                ? `${fmtTime(f["采集时间"])} 在主机上一次性采集的结果（${f["采集工具版本"] || "socir"}${f["采集包大小"] ? `，${formatBytes(f["采集包大小"])}` : ""}），内容固定在采集那一刻。`
                : "尚未上传采集包：在主机上运行采集命令后自动上传，或在「取证快照」里手动上传。"}
            </p>
            {uploaded ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    {tierTotal > 0
                      ? TIERS.map(([k, label, cls]) => {
                          const n = Number(summary[k]) || 0
                          return n ? (
                            <div
                              key={k}
                              className={cls}
                              style={{ width: `${(n / tierTotal) * 100}%` }}
                              title={`${label} ${n}`}
                            />
                          ) : null
                        })
                      : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">执行对象</span>
                    {TIERS.map(([k, label, cls]) => (
                      <span key={k} className="inline-flex items-center gap-1">
                        <span
                          className={`inline-block size-2 rounded-sm ${cls}`}
                        />
                        {label}{" "}
                        <span className="text-muted-foreground tabular-nums">
                          {summary[k] ?? 0}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {COUNTS.map(([k, label]) => (
                    <Fact key={k} k={label} v={String(summary[k] ?? "-")} />
                  ))}
                </div>
                {errors?.length ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      采集失败的维度
                    </span>
                    <ul className="flex flex-col gap-1 text-xs">
                      {errors.map((e, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Badge variant="warning" className="shrink-0">
                            {e.plane}
                          </Badge>
                          <span className="text-muted-foreground">
                            {e.error}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
