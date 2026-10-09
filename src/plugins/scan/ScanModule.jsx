// 主动探测 (fscan) — three tabs:
//   1) 扫描设置   — submit a scan + configure the scanner (allowlist, default
//                   mode, custom weak-credential dictionaries).
//   2) 任务进度   — running/finished jobs + per-job real-time log.
//   3) 脆弱性     — aggregated findings across ALL jobs (not bound to one scan),
//                   rendered as collapsible cards like 工单/安全事件 (fscan 详情
//                   is long free text that a table cell clipped).
// Talks to soc-server /api/v1/scan. The fscan binary runs in the isolated
// fscan-runner sidecar; this UI never touches it directly.

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, Plus, Radar, Ban, Eye, Globe, ChevronDown, ChevronRight, Save, Settings2, Upload, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Card, CardContent } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GenericTableModule } from "@/modules/GenericTableModule.jsx"
import { ScanFindingItem } from "./ScanFindingItem.jsx"
import { statusBadgeVariant } from "@/utils.js"

const MODES = [
  { value: "discover", label: "发现 (端口+服务指纹, 不暴破)" },
  { value: "bruteforce", label: "暴破 (加弱口令核查)" },
  { value: "exploit", label: "全量 (含漏洞利用)" },
]

const PORT_PRESETS = [
  { value: "", label: "默认常用端口" },
  { value: "web", label: "web" },
  { value: "db", label: "db" },
  { value: "1-65535", label: "全端口 (1-65535)" },
]

const TERMINAL = new Set(["succeeded", "failed", "cancelled"])

function fmtSize(n) {
  if (!n && n !== 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function jobFromRecord(r) {
  const f = r.fields || {}
  return {
    id: String(r.id),
    targets: f["目标"] || "",
    ports: f["端口"] || "",
    mode: f["模式"] || "",
    status: f["状态"] || "",
    createdBy: f["发起人"] || "",
    startedAt: f["发起时间"] || "",
    finishedAt: f["完成时间"] || "",
    findingN: f["发现数"] ?? 0,
    error: f["错误"] || "",
    extraFlags: f["额外参数"] || "",
  }
}

// stripCredFlags removes credential flags (-pwd/-pwda/-pwdf/-user/-usera/-userf)
// and their value from a flag string. Used when re-running a job: the stored
// 额外参数 includes the auto-appended dict flags, which the current 扫描器设置
// will re-add — keeping them would double up (and clutter the field).
function stripCredFlags(s) {
  const cred = new Set(["-pwd", "-pwda", "-pwdf", "-user", "-usera", "-userf"])
  const toks = (s || "").split(/\s+/).filter(Boolean)
  const out = []
  for (let i = 0; i < toks.length; i++) {
    if (cred.has(toks[i])) {
      i++ // also skip the following value token
      continue
    }
    if ([...cred].some((c) => toks[i].startsWith(c + "="))) continue
    out.push(toks[i])
  }
  return out.join(" ")
}

export function ScanModule({ apiClient, setError }) {
  const [config, setConfig] = useState(null)

  const loadConfig = useCallback(async () => {
    try {
      const c = await apiClient.get("/api/v1/scan/config")
      setConfig(c)
      return c
    } catch (err) {
      setError?.(err.message || "读取扫描配置失败")
      return null
    }
  }, [apiClient, setError])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  return (
    <div className="p-4">
      <Tabs defaultValue="scan" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="scan">扫描</TabsTrigger>
          <TabsTrigger value="vulns">脆弱性</TabsTrigger>
        </TabsList>

        <TabsContent value="scan">
          <ScanTab apiClient={apiClient} setError={setError} config={config} onConfigChange={setConfig} reloadConfig={loadConfig} />
        </TabsContent>
        <TabsContent value="vulns">
          <VulnsTab apiClient={apiClient} setError={setError} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─────────────────────────── Tab 1: 扫描设置 ───────────────────────────

function ScanTab({ apiClient, setError, config, onConfigChange, reloadConfig }) {
  // submit form
  const [targets, setTargets] = useState("")
  const [ports, setPorts] = useState("")
  const [mode, setMode] = useState("discover")
  const [extraFlags, setExtraFlags] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // scanner config form
  const [cidrText, setCidrText] = useState("")
  const [cfgMode, setCfgMode] = useState("discover")
  const [pwText, setPwText] = useState("")
  const [userText, setUserText] = useState("")
  const [savingCfg, setSavingCfg] = useState(false)
  // uploaded dictionary files
  const [dicts, setDicts] = useState([])
  const [pwFile, setPwFile] = useState("")
  const [userFile, setUserFile] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  // dialogs
  const [newOpen, setNewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  // jobs
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [detailJob, setDetailJob] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const pollRef = useRef(null)

  // seed the config form + default mode from loaded config
  useEffect(() => {
    if (!config) return
    setCidrText((config.allowed_cidrs || []).join("\n"))
    setCfgMode(config.default_mode || "discover")
    setPwText((config.extra_passwords || []).join("\n"))
    setUserText((config.extra_usernames || []).join("\n"))
    setPwFile(config.pwd_dict_file || "")
    setUserFile(config.user_dict_file || "")
    setMode((m) => m || config.default_mode || "discover")
  }, [config])

  const loadDicts = useCallback(async () => {
    try {
      const d = await apiClient.get("/api/v1/scan/dicts")
      setDicts(d?.files || [])
    } catch {
      /* non-fatal */
    }
  }, [apiClient])

  useEffect(() => {
    loadDicts()
  }, [loadDicts])

  const uploadDict = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      e.target.value = "" // allow re-uploading the same filename
      if (!file) return
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        await apiClient.upload("/api/v1/scan/dicts", fd)
        toast.success(`已上传 ${file.name}`)
        loadDicts()
      } catch (err) {
        toast.error(err.message || "上传失败")
      } finally {
        setUploading(false)
      }
    },
    [apiClient, loadDicts],
  )

  const deleteDict = useCallback(
    async (name, path) => {
      try {
        await apiClient.delete(`/api/v1/scan/dicts/${encodeURIComponent(name)}`)
        toast.success("已删除")
        if (pwFile === path) setPwFile("")
        if (userFile === path) setUserFile("")
        loadDicts()
      } catch (err) {
        toast.error(err.message || "删除失败")
      }
    },
    [apiClient, loadDicts, pwFile, userFile],
  )

  const loadJobs = useCallback(async () => {
    try {
      const data = await apiClient.get("/api/v1/scan/jobs?limit=100")
      setJobs((data?.records || []).map(jobFromRecord))
    } catch (err) {
      setError?.(err.message || "读取扫描任务失败")
    } finally {
      setLoadingJobs(false)
    }
  }, [apiClient, setError])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  useEffect(() => {
    const active = jobs.some((j) => !TERMINAL.has(j.status))
    if (!active) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    if (pollRef.current) return
    pollRef.current = setInterval(loadJobs, 6000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [jobs, loadJobs])

  const lines = (s) =>
    s
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)

  const submit = useCallback(async () => {
    if (!targets.trim()) {
      toast.error("请填写扫描目标")
      return
    }
    setSubmitting(true)
    try {
      await apiClient.post("/api/v1/scan/jobs", {
        targets: targets.trim(),
        ports: ports.trim(),
        mode,
        extra_flags: extraFlags.trim(),
      })
      toast.success("扫描任务已提交")
      setTargets("")
      setExtraFlags("")
      setNewOpen(false)
      loadJobs()
    } catch (err) {
      toast.error(err.message || "提交失败")
    } finally {
      setSubmitting(false)
    }
  }, [apiClient, targets, ports, mode, extraFlags, loadJobs])

  const saveConfig = useCallback(async () => {
    setSavingCfg(true)
    try {
      const updated = await apiClient.put("/api/v1/scan/config", {
        allowed_cidrs: lines(cidrText),
        default_mode: cfgMode,
        extra_passwords: lines(pwText),
        extra_usernames: lines(userText),
        pwd_dict_file: pwFile,
        user_dict_file: userFile,
      })
      onConfigChange?.(updated)
      toast.success("已保存 (即时生效, 无需重启)")
    } catch (err) {
      toast.error(err.message || "保存失败")
    } finally {
      setSavingCfg(false)
    }
  }, [apiClient, cidrText, cfgMode, pwText, userText, pwFile, userFile, onConfigChange])

  // rerun fills the 新建扫描 form with a past job's params and opens it for
  // confirmation (the user submits). Credential flags are stripped so the
  // current 扫描器设置 dict re-applies cleanly instead of doubling.
  const rerun = useCallback((j) => {
    setTargets(j.targets || "")
    setPorts(j.ports || "")
    setMode(j.mode || "discover")
    setExtraFlags(stripCredFlags(j.extraFlags))
    setNewOpen(true)
  }, [])

  const doCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      await apiClient.post(`/api/v1/scan/jobs/${cancelTarget.id}/cancel`)
      toast.success("已取消")
      loadJobs()
    } catch (err) {
      toast.error(err.message || "取消失败")
    } finally {
      setCancelTarget(null)
    }
  }, [apiClient, cancelTarget, loadJobs])

  const dangerousMode = mode === "bruteforce" || mode === "exploit"
  const approvalModes = config?.approval_modes || []

  return (
    <>
      {/* 扫描任务 */}
      <Card className={cardHover}>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">扫描任务</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 data-icon="inline-start" />
                扫描器设置
              </Button>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus data-icon="inline-start" />
                新建扫描
              </Button>
              <IconButton color="cyan" variant="ghost" aria-label="刷新" onClick={loadJobs}>
                <RefreshCw />
              </IconButton>
            </div>
          </div>
          <Separator />
          {loadingJobs ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : jobs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Radar />
                </EmptyMedia>
                <EmptyTitle>暂无扫描任务</EmptyTitle>
                <EmptyDescription>点右上角「新建扫描」发起一次主动探测。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>目标</TableHead>
                  <TableHead>模式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发现</TableHead>
                  <TableHead>发起时间</TableHead>
                  <TableHead>发起人</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">{j.targets}</TableCell>
                    <TableCell>{j.mode}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(j.status)}>{j.status}</Badge>
                    </TableCell>
                    <TableCell>{j.findingN}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.startedAt}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.createdBy}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <IconButton color="blue" variant="soft" size="sm" aria-label="重新发起" onClick={() => rerun(j)}>
                          <RotateCcw />
                        </IconButton>
                        <IconButton color="cyan" variant="soft" size="sm" aria-label="查看日志" onClick={() => setDetailJob(j)}>
                          <Eye />
                        </IconButton>
                        {!TERMINAL.has(j.status) && (
                          <IconButton color="red" variant="soft" size="sm" aria-label="取消" onClick={() => setCancelTarget(j)}>
                            <Ban />
                          </IconButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新建扫描 弹窗 (整个发起扫描表单) */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建扫描</DialogTitle>
            <DialogDescription>设置目标与模式后发起。扫描器/字典配置在「扫描器设置」里。</DialogDescription>
          </DialogHeader>

          {config && (config.allowed_cidrs?.length ? (
            <Alert>
              <AlertTitle>授权网段</AlertTitle>
              <AlertDescription>
                仅可扫描: <span className="font-mono">{config.allowed_cidrs.join(", ")}</span>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>未配置授权网段</AlertTitle>
              <AlertDescription>先在「扫描器设置」配置授权目标网段,否则扫描会被拒绝。</AlertDescription>
            </Alert>
          ))}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="scan-targets">扫描目标</FieldLabel>
              <Textarea
                id="scan-targets"
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                placeholder="IP / CIDR / 范围, 逗号或换行分隔, e.g. 10.0.0.0/24, 10.1.2.3, 10.1.2.10-50"
                style={{ height: "5rem" }}
                className="min-h-0 resize-y overflow-auto field-sizing-fixed"
              />
              <FieldDescription>只支持 IP / CIDR / 范围(域名无法按网段校验)。</FieldDescription>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="scan-ports">端口</FieldLabel>
                <Select value={ports || "__default__"} onValueChange={(v) => setPorts(v === "__default__" ? "" : v)}>
                  <SelectTrigger id="scan-ports">
                    <SelectValue placeholder="默认常用端口" />
                  </SelectTrigger>
                  <SelectContent>
                    {PORT_PRESETS.map((p) => (
                      <SelectItem key={p.value || "default"} value={p.value || "__default__"}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>或在附加参数里用 -p 指定自定义端口。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="scan-mode">扫描模式</FieldLabel>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger id="scan-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {dangerousMode ? "攻击性模式,会用弱口令字典暴破/利用,请确保已获授权。" : "仅发现探测,风险低。"}
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="scan-extra">附加参数 (可选)</FieldLabel>
              <Input
                id="scan-extra"
                value={extraFlags}
                onChange={(e) => setExtraFlags(e.target.value)}
                placeholder="附加 fscan 参数, e.g. -np -t 200 (会被审计记录)"
              />
              <FieldDescription>
                字典请在「扫描器设置」里配置(会自动带上);此处不要再写 -pwda/-pwdf/-usera/-userf,否则与自动追加冲突会被跳过。
              </FieldDescription>
            </Field>

            {dangerousMode && approvalModes.includes(mode) && (
              <Alert variant="destructive">
                <AlertTitle>需审批</AlertTitle>
                <AlertDescription>
                  {mode === "exploit" ? "全量(含利用)" : "暴破"}模式属高危操作,应在工作流中经审批把关。
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              发起扫描
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 扫描器设置 弹窗 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>扫描器设置</DialogTitle>
            <DialogDescription>授权网段、自定义字典、默认模式。保存后即时生效,无需重启。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cfg-cidrs">授权网段 (allowed_cidrs)</FieldLabel>
              <Textarea
                id="cfg-cidrs"
                value={cidrText}
                onChange={(e) => setCidrText(e.target.value)}
                placeholder={"每行一个 CIDR/IP, e.g.\n10.0.0.0/8\n192.168.0.0/16"}
                style={{ height: "8rem" }}
                className="min-h-0 resize-y overflow-auto font-mono field-sizing-fixed"
              />
              <FieldDescription className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setCidrText("0.0.0.0/0")}>
                  <Globe data-icon="inline-start" />
                  全网段 (0.0.0.0/0)
                </Button>
                <span>留空则拒绝所有扫描(fail-closed);全网段最宽松,请确保已获授权。</span>
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="cfg-mode">默认扫描模式</FieldLabel>
              <Select value={cfgMode} onValueChange={setCfgMode}>
                <SelectTrigger id="cfg-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>自定义弱口令字典</FieldLabel>
                <Button variant="outline" className="justify-between" onClick={() => setPwOpen(true)}>
                  <span>编辑弱口令字典</span>
                  <Badge variant="secondary">{lines(pwText).length} 条</Badge>
                </Button>
                <FieldDescription>暴破/全量时追加 (-pwda)。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>自定义用户名字典</FieldLabel>
                <Button variant="outline" className="justify-between" onClick={() => setUserOpen(true)}>
                  <span>编辑用户名字典</span>
                  <Badge variant="secondary">{lines(userText).length} 条</Badge>
                </Button>
                <FieldDescription>暴破/全量时追加 (-usera)。</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel>字典文件 (大字典上传)</FieldLabel>
              <input ref={fileRef} type="file" className="hidden" onChange={uploadDict} />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={!config?.dict_upload_enabled || uploading}
                >
                  {uploading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                  上传字典文件
                </Button>
                {!config?.dict_upload_enabled && (
                  <span className="text-xs text-muted-foreground">未启用:需在 config 里配置 scan.dict_dir</span>
                )}
              </div>
              {dicts.length > 0 && (
                <div className="flex flex-col divide-y rounded-md border">
                  {dicts.map((f) => (
                    <div key={f.name} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono" title={f.path}>
                        {f.name} <span className="text-muted-foreground">({fmtSize(f.size)})</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={pwFile === f.path ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setPwFile(pwFile === f.path ? "" : f.path)}
                        >
                          密码
                        </Button>
                        <Button
                          variant={userFile === f.path ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setUserFile(userFile === f.path ? "" : f.path)}
                        >
                          用户
                        </Button>
                        <ConfirmDeleteButton variant="ghost" size="sm" onConfirm={() => deleteDict(f.name, f.path)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <FieldDescription>
                上传后点「密码」/「用户」设为默认字典,暴破/全量时自动 -pwdf/-userf(保存设置后生效)。
                {pwFile && (
                  <>
                    {" "}
                    当前密码字典: <span className="font-mono">{pwFile}</span>。
                  </>
                )}
                {userFile && (
                  <>
                    {" "}
                    用户名字典: <span className="font-mono">{userFile}</span>。
                  </>
                )}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={reloadConfig}>
              <RefreshCw data-icon="inline-start" />
              重置
            </Button>
            <Button onClick={saveConfig} disabled={savingCfg}>
              {savingCfg ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DictEditDialog
        open={pwOpen}
        title="弱口令字典"
        placeholder={"每行一个密码, 追加到 fscan 内置字典\nWinter2024!\nCompany@123"}
        value={pwText}
        onCancel={() => setPwOpen(false)}
        onApply={(v) => {
          setPwText(v)
          setPwOpen(false)
        }}
      />
      <DictEditDialog
        open={userOpen}
        title="用户名字典"
        placeholder={"每行一个用户名, 追加到内置\nsvc_admin\nit_admin"}
        value={userText}
        onCancel={() => setUserOpen(false)}
        onApply={(v) => {
          setUserText(v)
          setUserOpen(false)
        }}
      />

      <JobLogDialog apiClient={apiClient} job={detailJob} onClose={() => setDetailJob(null)} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消扫描任务?</AlertDialogTitle>
            <AlertDialogDescription>
              将中止对 <span className="font-mono">{cancelTarget?.targets}</span> 的扫描。已产出的结果会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>确认取消</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// 弹出式字典编辑框：编辑草稿，「应用」写回上层 state（随「保存设置」一起持久化）。
function DictEditDialog({ open, title, placeholder, value, onCancel, onApply }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])
  const count = draft.split(/[\n,]+/).filter((x) => x.trim()).length
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>每行一个,暴破/全量模式时追加到 fscan 内置字典。当前 {count} 条。</DialogDescription>
        </DialogHeader>
        {/* 固定高度 + field-sizing-fixed 覆盖基类的 field-sizing-content，让超长内容在框内滚动而不是把弹窗撑高 */}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          style={{ height: "24rem" }}
          className="min-h-0 resize-none overflow-auto font-mono field-sizing-fixed"
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => onApply(draft)}>应用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Tab 2: 任务进度 ───────────────────────────

function JobLogDialog({ apiClient, job, onClose }) {
  const [log, setLog] = useState({ lines: [], status: "", finding_count: 0, line_count: 0 })
  const [collapsed, setCollapsed] = useState(false)
  const pollRef = useRef(null)
  const boxRef = useRef(null)
  const stickRef = useRef(true)

  useEffect(() => {
    if (!job) {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    setLog({ lines: [], status: job.status, finding_count: job.findingN, line_count: 0 })
    stickRef.current = true
    let cancelled = false
    const tick = async () => {
      try {
        const d = await apiClient.get(`/api/v1/scan/jobs/${job.id}/log`)
        if (cancelled) return
        setLog(d)
        if (TERMINAL.has(d.status) && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch {
        /* transient */
      }
    }
    tick()
    pollRef.current = setInterval(tick, 2500)
    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [job, apiClient])

  useEffect(() => {
    if (stickRef.current && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [log.lines])

  const onScroll = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }, [])

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>扫描日志</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {job?.targets} · {job?.mode} · <Badge variant={statusBadgeVariant(job?.status)}>{job?.status}</Badge>
          </DialogDescription>
        </DialogHeader>
        {job?.error && (
          <Alert variant="destructive">
            <AlertTitle>错误</AlertTitle>
            <AlertDescription className="font-mono text-xs break-all">{job.error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {!TERMINAL.has(log.status) && log.status && <Spinner className="size-3" />}
              <span>实时日志</span>
              <span>·</span>
              <span>已产出发现 {log.finding_count}</span>
              {log.line_count > 0 && (
                <>
                  <span>·</span>
                  <span>{log.line_count} 行</span>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? <ChevronRight data-icon="inline-start" /> : <ChevronDown data-icon="inline-start" />}
              {collapsed ? "展开日志" : "收起日志"}
            </Button>
          </div>
          {!collapsed && (
            <pre
              ref={boxRef}
              onScroll={onScroll}
              style={{ height: "18rem" }}
              className="w-full shrink-0 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre"
            >
              {log.lines?.length ? log.lines.join("\n") : "（暂无输出，扫描启动中…）"}
            </pre>
          )}
          {!TERMINAL.has(log.status) && log.status && !collapsed && (
            <span className="text-xs text-muted-foreground">
              日志每 2.5 秒刷新（滚到底部自动跟随最新行，向上滚动可查看历史）。脆弱性结果见「脆弱性」标签页。
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Tab 3: 脆弱性 ───────────────────────────

// 脆弱性 = 聚合的 fscan_findings 表,复用 GenericTableModule(与 工单/安全事件
// 同一套 FilterPanel 过滤器 + 无限滚动),并走它的 renderItem 卡片列表模式:
// fscan 的「详情」是长文本(日志行/URL/整条厂商 JSON),表格单元格会把它裁掉,
// 所以这里改成可折叠卡片 —— 头部摘要 + 展开后完整详情(见 ScanFindingItem)。
// findings 由扫描器写入,不做行内编辑;卡片底部两个操作:生成工单(POST
// /api/v1/tickets)与删除(误报/重扫后过期)——删除走 /api/v1/scan/findings/{id},
// 因为通用记录路由对该表(write_guard=module)拒写。
function VulnsTab({ apiClient, setError }) {
  return (
    <GenericTableModule
      slug="fscan_findings"
      label="脆弱性"
      apiClient={apiClient}
      setError={setError}
      showCreate={false}
      showEdit={false}
      // 删除改道模块端点:通用记录路由对该表(write_guard=module)只读。
      deletePath={(id) => `/api/v1/scan/findings/${id}`}
      renderItem={(item) => (
        <ScanFindingItem
          key={item.id}
          apiClient={apiClient}
          setError={setError}
          {...item}
        />
      )}
    />
  )
}
