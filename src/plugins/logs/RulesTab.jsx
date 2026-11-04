// 解析规则 — operator parse rules for the logs plugin (/api/v1/logs/rules):
// left rail = rule list (启用 switch, order, compile errors), right = editor
// (match conditions, regex with named groups, kv switch, key renames) with a
// test box that runs the UNSAVED rule against a sample line, and a「解析测试」
// box at the top that runs any sample through the live pipeline (builtin
// decoders + enabled rules) so operators can see which fields a device yields.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw, FlaskConical, Regex, Save, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDeleteButton, TopBarPortal, cardHover, cn } from "@/platform"

const EMPTY_RULE = {
  name: "",
  enabled: true,
  order: 100,
  match: { source_type: "", app: "", source: "", contains: "", regex: "" },
  pattern: "",
  kv: false,
  map: {},
  note: "",
}

// the editor keeps the rename map as "old=new" lines
function mapToLines(m) {
  return Object.entries(m || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}
function linesToMap(text) {
  const out = {}
  for (const line of (text || "").split("\n")) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf("=")
    if (i <= 0) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

export function RulesTab({ api, setError }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null) // null = nothing, "new" = creating
  const [form, setForm] = useState(null)
  const [mapText, setMapText] = useState("")
  const [saving, setSaving] = useState(false)
  const [sample, setSample] = useState("")
  const [sampleType, setSampleType] = useState("")
  const [ruleTest, setRuleTest] = useState(null)
  const [liveTest, setLiveTest] = useState(null)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get("/rules"))
    } catch (err) {
      setError?.(err.message || "读取解析规则失败")
    } finally {
      setLoading(false)
    }
  }, [api, setError])

  useEffect(() => {
    load()
  }, [load])

  const rules = data?.rules || []
  const errors = data?.errors || {}
  const types = data?.source_types || []
  const canonical = data?.canonical_fields || []

  function open(rule) {
    setSelectedId(rule ? rule.id : "new")
    const f = rule ? { ...EMPTY_RULE, ...rule, match: { ...EMPTY_RULE.match, ...(rule.match || {}) } } : { ...EMPTY_RULE }
    setForm(f)
    setMapText(mapToLines(f.map))
    setRuleTest(null)
  }

  const payload = useMemo(() => (form ? { ...form, order: Number(form.order) || 0, map: linesToMap(mapText) } : null), [form, mapText])

  async function save() {
    if (!payload) return
    setSaving(true)
    try {
      if (selectedId === "new") {
        const created = await api.post("/rules", payload)
        toast.success("规则已创建")
        await load()
        open(created)
      } else {
        await api.put(`/rules/${selectedId}`, payload)
        toast.success("规则已保存")
        await load()
      }
    } catch (err) {
      toast.error(err.message || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function toggle(rule, enabled) {
    try {
      await api.patch(`/rules/${rule.id}`, { enabled })
      load()
    } catch (err) {
      toast.error(err.message || "更新失败")
    }
  }

  async function remove(rule) {
    await api.delete(`/rules/${rule.id}`)
    toast.success(`已删除 ${rule.name}`)
    if (selectedId === rule.id) {
      setSelectedId(null)
      setForm(null)
    }
    load()
  }

  async function runTest(withRule) {
    if (!sample.trim()) {
      toast.error("先粘贴一条样例日志")
      return
    }
    setTesting(true)
    try {
      const body = { sample, source_type: sampleType }
      if (withRule) body.rule = payload
      const r = await api.post("/parse/test", body)
      if (withRule) setRuleTest(r)
      else setLiveTest(r)
    } catch (err) {
      toast.error(err.message || "测试失败")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBarPortal>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新
          </Button>
          <Button size="sm" onClick={() => open(null)}>
            <Plus data-icon="inline-start" />
            新建规则
          </Button>
        </div>
      </TopBarPortal>

      {data?.registry_error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>规则表读取失败：{data.registry_error}</AlertDescription>
        </Alert>
      ) : null}

      {/* sample + live parse test (shared sample with the rule editor) */}
      <Card className={cardHover}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="size-4" /> 解析测试
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
            <Textarea
              rows={3}
              className="font-mono text-xs"
              placeholder={`粘贴一条原始日志（含 syslog 头），例如：\n<13>Nov  4 10:00:01 host01 sshd[123]: Failed password for root from 10.0.0.9 port 2222 ssh2`}
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              aria-label="样例日志"
            />
            <div className="flex flex-col gap-2">
              <Select value={sampleType || "__none"} onValueChange={(v) => setSampleType(v === "__none" ? "" : v)}>
                <SelectTrigger size="sm" aria-label="模拟来源类型">
                  <SelectValue placeholder="模拟来源类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">来源类型：unknown</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      来源类型：{t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => runTest(false)} disabled={testing}>
                {testing ? <Spinner data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
                用当前生效规则解析
              </Button>
            </div>
          </div>
          {liveTest ? <TestResult r={liveTest} /> : null}
          <p className="text-[11px] text-muted-foreground">
            内置解析器始终生效：JSON 消息体、LEEF、key=value 对（≥2 对）、sshd 登录/sudo/HTTP 访问日志；之后按顺序套用启用的规则，最后把 src/srcip/SrcIp
            之类的厂商键名归一为统一字段：{canonical.join("、")}。
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className={cn(cardHover, "self-start")}>
          <CardHeader>
            <CardTitle className="text-sm">规则 ({rules.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Regex />
                  </EmptyMedia>
                  <EmptyTitle>还没有解析规则</EmptyTitle>
                  <EmptyDescription>内置解析器已经覆盖 CEF/LEEF/JSON/key=value/sshd；设备私有格式用正则命名分组补。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {rules.map((r) => (
                  <li key={r.id} className={cn("flex items-center gap-2 border-b px-3 py-2 last:border-b-0", selectedId === r.id && "bg-muted")}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(r)}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">#{r.order}</span>
                        <span className="truncate">{r.name}</span>
                        {errors[r.id] ? (
                          <Badge variant="destructive" className="text-[10px]">
                            无效
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate pl-10 text-[10px] text-muted-foreground">{matchSummary(r.match)}</div>
                    </button>
                    <Switch checked={!!r.enabled} onCheckedChange={(v) => toggle(r, v)} aria-label="启用" />
                    <ConfirmDeleteButton size="xs" onConfirm={() => remove(r)} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={cardHover}>
          {form ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{selectedId === "new" ? "新建规则" : `编辑：${form.name}`}</span>
                  {selectedId !== "new" && errors[selectedId] ? <span className="text-xs font-normal text-destructive">{errors[selectedId]}</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <FieldGroup>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_100px_120px]">
                    <Field>
                      <FieldLabel htmlFor="rule-name">名称</FieldLabel>
                      <Input id="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="华为防火墙策略日志" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-order">顺序</FieldLabel>
                      <Input id="rule-order" type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="rule-enabled">启用</FieldLabel>
                      <Switch id="rule-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                    </Field>
                  </div>

                  <div className="text-xs font-medium text-muted-foreground">匹配条件（都留空 = 所有日志；填了的须同时满足）</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field>
                      <FieldLabel>来源类型</FieldLabel>
                      <Select value={form.match.source_type || "__any"} onValueChange={(v) => setForm({ ...form, match: { ...form.match, source_type: v === "__any" ? "" : v } })}>
                        <SelectTrigger aria-label="来源类型">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any">任意</SelectItem>
                          {types.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                          <SelectItem value="unknown">unknown（未登记）</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-app">程序 (app)</FieldLabel>
                      <Input id="rule-app" value={form.match.app} onChange={(e) => setForm({ ...form, match: { ...form.match, app: e.target.value } })} placeholder="sshd" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-source">来源名称</FieldLabel>
                      <Input id="rule-source" value={form.match.source} onChange={(e) => setForm({ ...form, match: { ...form.match, source: e.target.value } })} placeholder="fw-core-01" />
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="rule-contains">消息包含</FieldLabel>
                      <Input id="rule-contains" value={form.match.contains} onChange={(e) => setForm({ ...form, match: { ...form.match, contains: e.target.value } })} placeholder="POLICYDENY" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-mregex">消息正则</FieldLabel>
                      <Input id="rule-mregex" className="font-mono" value={form.match.regex} onChange={(e) => setForm({ ...form, match: { ...form.match, regex: e.target.value } })} placeholder="^%%01SEC" />
                    </Field>
                  </div>

                  <div className="text-xs font-medium text-muted-foreground">提取</div>
                  <Field>
                    <FieldLabel htmlFor="rule-pattern">正则（命名分组 = 字段名）</FieldLabel>
                    <Textarea
                      id="rule-pattern"
                      rows={3}
                      className="font-mono text-xs"
                      value={form.pattern}
                      onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                      placeholder={`user (?P<user>\\S+) from (?P<src_ip>[\\d.]+) port (?P<src_port>\\d+)`}
                    />
                    <FieldDescription>Go 正则语法；分组名直接作为字段名，优先用统一字段名（src_ip/dst_ip/user/action…）以便跨设备筛选。可留空只做 kv 提取或重命名。</FieldDescription>
                  </Field>
                  <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="rule-kv">key=value 提取</FieldLabel>
                      <Switch id="rule-kv" checked={form.kv} onCheckedChange={(v) => setForm({ ...form, kv: v })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-map">字段重命名（每行 原键=新键）</FieldLabel>
                      <Textarea id="rule-map" rows={3} className="font-mono text-xs" value={mapText} onChange={(e) => setMapText(e.target.value)} placeholder={"SrcZone=src_zone\nPolicy=rule_name"} />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="rule-note">备注</FieldLabel>
                    <Input id="rule-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </Field>
                </FieldGroup>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={save} disabled={saving || !form.name.trim()}>
                    {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                    {selectedId === "new" ? "创建" : "保存"}
                  </Button>
                  <Button variant="outline" onClick={() => runTest(true)} disabled={testing}>
                    {testing ? <Spinner data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
                    用上面的样例测试此规则（未保存也可）
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedId(null)
                      setForm(null)
                    }}
                  >
                    关闭
                  </Button>
                </div>
                {ruleTest ? <TestResult r={ruleTest} showMatch /> : null}
              </CardContent>
            </>
          ) : (
            <CardContent>
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Regex />
                  </EmptyMedia>
                  <EmptyTitle>选一条规则编辑，或新建</EmptyTitle>
                  <EmptyDescription>先在上方粘贴一条设备日志做「解析测试」，看内置解析器已经提取了什么，再为缺的字段写规则。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}

function matchSummary(m) {
  if (!m) return "所有日志"
  const parts = []
  if (m.source_type) parts.push(`类型=${m.source_type}`)
  if (m.app) parts.push(`app=${m.app}`)
  if (m.source) parts.push(`来源=${m.source}`)
  if (m.contains) parts.push(`含「${m.contains}」`)
  if (m.regex) parts.push(`正则 ${m.regex}`)
  return parts.length ? parts.join(" · ") : "所有日志"
}

function TestResult({ r, showMatch }) {
  const ev = r.event || {}
  const entries = Object.entries(r.fields || {}).sort(([a], [b]) => (a.startsWith("_") === b.startsWith("_") ? a.localeCompare(b) : a.startsWith("_") ? 1 : -1))
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {showMatch ? <Badge variant={r.rule_matched ? "success" : "destructive"}>{r.rule_matched ? "规则命中" : "规则未命中（匹配条件不满足）"}</Badge> : null}
        <span className="text-muted-foreground">
          信封：{ev.format} · host={ev.hostname || "-"} · app={ev.app || "-"} · severity={ev.severity}
        </span>
        {r.parsers ? <Badge variant="outline">内置: {r.parsers}</Badge> : null}
        {r.rules ? <Badge variant="outline">规则: {r.rules}</Badge> : null}
      </div>
      <div className="font-mono text-[11px] break-all text-muted-foreground">消息：{ev.message}</div>
      {entries.length === 0 ? (
        <div className="text-muted-foreground">没有提取出任何字段。</div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-background">
          <Table>
            <TableBody>
              {entries.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="w-44 py-1 font-mono text-[11px] text-muted-foreground">{k}</TableCell>
                  <TableCell className="py-1 font-mono text-[11px] break-all">{v === "" ? "(空)" : v}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
