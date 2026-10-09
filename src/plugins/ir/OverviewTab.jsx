// OverviewTab — Summary count cards + tier distribution, host facts,
// collection errors, and the editable 研判结论 / 处置建议 (PATCH /cases/{id}).
import { useEffect, useState } from "react"
import { AlertTriangle, Save, Ticket } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
}) {
  const f = fields(caseRow)
  const summary = parseJSON(f["统计"], null) || {}
  const [conclusion, setConclusion] = useState(f["研判结论"] || "")
  const [advice, setAdvice] = useState(f["处置建议"] || "")
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState(null)

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

  return (
    <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto pr-1 [&>*]:shrink-0">
      {!uploaded ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>尚未上传采集包</AlertTitle>
          <AlertDescription>
            用采集令牌在受害主机运行 socir 直传，或点右上「上传采集包」手动上传
            JSON。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {COUNTS.map(([k, label]) => (
          <Card key={k} className={cardStatic}>
            <CardContent className="flex flex-col gap-0.5 p-3">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span className="text-lg font-semibold tabular-nums">
                {summary[k] ?? "-"}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {uploaded ? (
        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              执行对象风险分布
              {summary.max_score != null ? (
                <span className="text-xs font-normal text-muted-foreground">
                  最高分 {summary.max_score}{" "}
                  <LevelBadge level={summary.level} score={summary.max_score} />
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {TIERS.map(([k, label, cls]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`inline-block size-2.5 rounded-sm ${cls}`} />
                  {label}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    {summary[k] ?? 0}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className={cardStatic}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">主机与采集</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Fact k="主机名" v={f["主机名"]} />
            <Fact k="IP" v={f["IP"]} />
            <Fact
              k="操作系统"
              v={[f["操作系统"], f["操作系统版本"]].filter(Boolean).join(" ")}
            />
            <Fact k="采集时间" v={fmtTime(f["采集时间"])} />
            <Fact k="采集人 / 账户" v={f["采集人"]} />
            <Fact k="采集工具" v={f["采集工具版本"]} />
            <Fact
              k="采集包"
              v={f["采集包大小"] ? formatBytes(f["采集包大小"]) : ""}
            />
            <Fact k="SHA256" v={f["采集包哈希"]} />
            <Fact k="创建人" v={f["创建人"]} />
            <Fact k="创建时间" v={fmtTime(caseRow?.created_at)} />
            <div className="col-span-2">
              <Fact k="备注" v={f["备注"]} />
            </div>
            {errors?.length ? (
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  采集失败的维度
                </span>
                <ul className="flex flex-col gap-1 text-xs">
                  {errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="warning" className="shrink-0">
                        {e.plane}
                      </Badge>
                      <span className="text-muted-foreground">{e.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

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
      </div>
    </div>
  )
}
