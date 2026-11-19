// CaseDetail — right pane: header (host facts, level, status select, case
// actions) + three groups that keep the two kinds of data apart:
//   概览      — the case itself: what was found, the verdict
//   实时监控  — what the agent sees on the host NOW (LiveConsole; its own
//               panes: 进程 / 网络 / 启动项 / 事件流 / 告警关联 / 已存事件)
//   取证快照  — the uploaded collection package, frozen at collection time
//               (发现 + one pane per analysis view; upload / report / raw
//               package actions live here, they act on the package)
// Both data groups use the same second-level control (an outline
// ToggleGroup), so "进程" under 实时监控 and "进程" under 取证快照 are never
// side by side.
import { useState } from "react"
import {
  Activity,
  Bot,
  Camera,
  Download,
  FileJson,
  KeyRound,
  LayoutDashboard,
  MoreHorizontal,
  Ticket,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ConfirmDialog } from "@/components/ConfirmDialog.jsx"
import { FindingsTab } from "./FindingsTab.jsx"
import { LevelBadge } from "./LevelBadge.jsx"
import { OverviewTab } from "./OverviewTab.jsx"
import { TokenReveal } from "./TokenReveal.jsx"
import { UploadDialog } from "./UploadDialog.jsx"
import { ViewTable } from "./ViewTable.jsx"
import { LiveConsole } from "./LiveConsole.jsx"
import { CASE_STATUSES, VIEWS, errMsg, fields, fmtTime } from "./lib.js"

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function CaseDetail({
  api,
  caseRow,
  onPatched,
  onDeleted,
  onNavigate,
  setError,
}) {
  const f = fields(caseRow)
  const id = caseRow.id
  const [tab, setTab] = useState("overview")
  // which pane of 取证快照 is showing ("findings" or a view key)
  const [snap, setSnap] = useState("findings")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [tokenResult, setTokenResult] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, setPending] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  // Filter trees per list (findings / monitor / each view): tabs unmount
  // their tables, so the trees live here and survive tab switches.
  const [filters, setFilters] = useState({})
  const filterProps = (key) => ({
    filterTree: filters[key],
    onFilterTree: (t) => setFilters((m) => ({ ...m, [key]: t })),
  })
  const uploaded = !!f["采集时间"]
  const hostname = f["主机名"] || ""

  async function reload() {
    try {
      const r = await api.get(`/cases/${id}`)
      onPatched?.(r?.case || r)
    } catch (err) {
      setError?.(errMsg(err, "刷新案例失败"))
    }
    setRefreshKey((k) => k + 1)
  }

  async function run(label, fn) {
    setPending(label)
    try {
      await fn()
    } catch (err) {
      toast.error(errMsg(err, `${label}失败`))
    } finally {
      setPending("")
    }
  }

  const setStatus = (v) =>
    run("更新状态", async () => {
      const r = await api.patch(`/cases/${id}`, { 状态: v })
      onPatched?.(r?.case || r)
      toast.success(`状态已改为「${v}」`)
    })

  const triage = () =>
    run("AI 研判", async () => {
      const r = await api.post(`/cases/${id}/triage`, {})
      toast.success(
        `已发起 AI 研判${r?.run_id ? `（运行 ${r.run_id}）` : ""}，结果会回写到研判结论`
      )
      reload()
    })

  const ticket = () =>
    run("生成工单", async () => {
      const r = await api.post(`/cases/${id}/ticket`, {})
      toast.success(`工单已创建${r?.ticket_id ? ` #${r.ticket_id}` : ""}`)
      reload()
    })

  const report = () =>
    run("下载报告", async () => {
      const blob = await api.getBlob(`/cases/${id}/report`)
      saveBlob(
        blob,
        `IR-${hostname || id}-${fmtTime(f["采集时间"]).slice(0, 10) || "report"}.md`
      )
    })

  const pkg = () =>
    run("下载采集包", async () => {
      const blob = await api.getBlob(`/cases/${id}/package`)
      saveBlob(blob, `socir-${hostname || id}.json`)
    })

  const resetToken = () =>
    run("重置令牌", async () => {
      const r = await api.post(`/cases/${id}/token`, {})
      setTokenResult(r)
      reload()
    })

  async function remove() {
    await api.delete(`/cases/${id}`)
    toast.success("案例已删除")
    onDeleted?.(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">
              {f["名称"] || hostname || `案例 #${id}`}
            </h3>
            <LevelBadge level={f["风险等级"]} score={f["最高分"]} showScore />
            <Select
              value={f["状态"] || "待研判"}
              onValueChange={setStatus}
              disabled={!!pending}
            >
              <SelectTrigger
                size="sm"
                className="h-6 w-24 text-xs"
                aria-label="案例状态"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>#{id}</span>
            {hostname ? (
              <span className="font-mono">{hostname}</span>
            ) : (
              <Badge variant="outline">待上传采集包</Badge>
            )}
            {f["操作系统"] ? (
              <span>
                {[f["操作系统"], f["操作系统版本"]].filter(Boolean).join(" ")}
              </span>
            ) : null}
            {f["IP"] ? <span className="font-mono">{f["IP"]}</span> : null}
            {uploaded ? <span>采集于 {fmtTime(f["采集时间"])}</span> : null}
            {f["关联工单"] ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => onNavigate?.("tickets")}
              >
                <Ticket data-icon="inline-start" />
                工单 #{f["关联工单"]}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!uploaded || !!pending}
            onClick={triage}
          >
            {pending === "AI 研判" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Bot data-icon="inline-start" />
            )}
            AI 研判
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!!pending || !!f["关联工单"]}
            onClick={ticket}
          >
            {pending === "生成工单" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Ticket data-icon="inline-start" />
            )}
            生成工单
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="更多操作"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={resetToken}>
                <KeyRound data-icon="inline-start" />
                重置采集令牌
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 data-icon="inline-start" />
                删除案例
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard data-icon="inline-start" />
            概览
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <Activity data-icon="inline-start" />
            实时监控
            {f["监控状态"] === "监控中" ? (
              <span className="size-1.5 rounded-full bg-success" />
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="snapshot">
            <Camera data-icon="inline-start" />
            取证快照
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex min-h-0 flex-1 flex-col">
          <OverviewTab
            api={api}
            caseRow={caseRow}
            onPatched={onPatched}
            onNavigate={onNavigate}
            refreshKey={refreshKey}
            onOpen={setTab}
          />
        </TabsContent>

        <TabsContent value="monitor" className="flex min-h-0 flex-1 flex-col">
          <LiveConsole
            key={refreshKey}
            api={api}
            caseId={id}
            onResetToken={resetToken}
            onNavigate={onNavigate}
            hostname={f["主机名"]}
            historyProps={filterProps("monitor")}
          />
        </TabsContent>

        <TabsContent
          value="snapshot"
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium">
                {uploaded
                  ? `采集包快照 · 采集于 ${fmtTime(f["采集时间"])}`
                  : "尚未上传采集包"}
              </span>
              <span className="text-xs text-muted-foreground">
                {uploaded
                  ? `${f["采集工具版本"] || "socir"} 在主机上一次性采集并打分的结果，内容固定在采集那一刻，不随主机变化；主机当前的状态看「实时监控」。`
                  : "在主机上运行采集命令后自动上传，也可手动上传采集包 JSON 或离线 zip。"}
              </span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={uploaded ? "outline" : "default"}
                onClick={() => setUploadOpen(true)}
              >
                <Upload data-icon="inline-start" />
                上传采集包
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!uploaded || !!pending}
                onClick={report}
              >
                {pending === "下载报告" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                下载报告
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!uploaded || !!pending}
                onClick={pkg}
              >
                <FileJson data-icon="inline-start" />
                原始采集包
              </Button>
            </div>
          </div>
          {uploaded ? (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={snap}
                onValueChange={(v) => v && setSnap(v)}
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="findings">发现</ToggleGroupItem>
                {VIEWS.map((v) => (
                  <ToggleGroupItem key={v.key} value={v.key}>
                    {v.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {tab !== "snapshot" ? null : snap === "findings" ? (
                <FindingsTab
                  api={api}
                  caseId={id}
                  hostname={hostname}
                  onNavigate={onNavigate}
                  setError={setError}
                  refreshKey={refreshKey}
                  onChanged={reload}
                  {...filterProps("findings")}
                />
              ) : (
                <ViewTable
                  key={`${id}-${snap}`}
                  api={api}
                  caseId={id}
                  view={snap}
                  hostname={hostname}
                  onNavigate={onNavigate}
                  setError={setError}
                  refreshKey={refreshKey}
                  {...filterProps(snap)}
                />
              )}
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <UploadDialog
        api={api}
        caseId={id}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={reload}
      />

      <Dialog
        open={!!tokenResult}
        onOpenChange={(o) => !o && setTokenResult(null)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新的采集令牌</DialogTitle>
            <DialogDescription>旧令牌已立即失效。</DialogDescription>
          </DialogHeader>
          {tokenResult ? (
            <TokenReveal
              api={api}
              token={tokenResult.token}
              command={tokenResult.command}
              linuxCommand={tokenResult.linux_command}
              installLinux={tokenResult.install_command_linux}
              installWindows={tokenResult.install_command_windows}
              watchLinux={tokenResult.watch_command_linux}
              watchWindows={tokenResult.watch_command_windows}
              watchEnabled={tokenResult.watch_enabled}
              watchMaxHours={tokenResult.watch_max_hours}
              serviceLinux={tokenResult.service_command_linux}
              serviceWindows={tokenResult.service_command_windows}
              agentMaxHours={tokenResult.agent_max_hours}
              distAvailable={tokenResult.dist_available}
              expires={fmtTime(
                fields(tokenResult.case)["令牌过期"] || tokenResult.expires
              )}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setTokenResult(null)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="删除该应急案例？"
        description="会一并删除其全部发现和已上传的采集包文件，不可恢复。"
        confirmText="删除"
        destructive
        onConfirm={remove}
      />
    </div>
  )
}
