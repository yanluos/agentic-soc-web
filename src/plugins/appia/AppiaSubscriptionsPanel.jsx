// Appia 消息监听订阅 —— the appia plugin's operational panel on the 插件管理
// page: the subscription registry (room → workflow, keywords, live connection
// status). Talks to the plugin's REST (/api/v1/appia/*), gated on the
// "integrations" grant server-side.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plug, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDeleteButton, IconButton, usePluginApi } from "@/platform"

const emptySubForm = { company: "SSC", room_id: "", keywords: "", workflow_id: "", enabled: true, description: "" }

export function AppiaSubscriptionsPanel({ apiClient, setError }) {
  const api = usePluginApi("appia")
  const [subs, setSubs] = useState(null)
  const [status, setStatus] = useState([])
  const [companies, setCompanies] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [subForm, setSubForm] = useState(emptySubForm)
  const [subSaving, setSubSaving] = useState(false)

  const load = useCallback(async () => {
    if (!api) return
    try {
      const [s, st, wf, cs] = await Promise.all([
        api.get("/subscriptions"),
        api.get("/status").catch(() => []),
        apiClient.get("/api/v1/workflows/").catch(() => []),
        api.get("/companies").catch(() => []),
      ])
      setSubs(Array.isArray(s) ? s : [])
      setStatus(Array.isArray(st) ? st : [])
      setWorkflows(Array.isArray(wf) ? wf : [])
      setCompanies(Array.isArray(cs) ? cs.map((c) => (typeof c === "string" ? c : c.key)) : [])
    } catch (e) {
      setError?.(e.message || "加载订阅失败")
      setSubs([])
    }
  }, [api, apiClient, setError])

  useEffect(() => {
    load()
  }, [load])

  // Refresh live connection status every 15s while the panel is mounted.
  useEffect(() => {
    if (!api) return
    const t = setInterval(() => {
      api
        .get("/status")
        .then((st) => setStatus(Array.isArray(st) ? st : []))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(t)
  }, [api])

  const statusByRoom = useMemo(() => {
    const m = {}
    for (const s of status) m[`${s.company}|${s.room_id}`] = s
    return m
  }, [status])

  function openNew() {
    setEditTarget(null)
    setSubForm({ ...emptySubForm, company: companies[0] || "SSC" })
    setEditOpen(true)
  }
  function openEdit(sub) {
    setEditTarget(sub)
    setSubForm({
      company: sub.company || "SSC",
      room_id: sub.room_id || "",
      keywords: (sub.keywords || []).join(", "),
      workflow_id: sub.workflow_id || "",
      enabled: sub.enabled !== false,
      description: sub.description || "",
    })
    setEditOpen(true)
  }

  async function saveSub() {
    if (!subForm.room_id.trim()) return toast.error("请填写房间 ID")
    if (!subForm.workflow_id) return toast.error("请选择要触发的工作流")
    const wf = workflows.find((w) => String(w.id) === String(subForm.workflow_id))
    const body = {
      company: subForm.company,
      room_id: subForm.room_id.trim(),
      keywords: subForm.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      workflow_id: String(subForm.workflow_id),
      workflow_name: wf?.name || "",
      enabled: subForm.enabled,
      description: subForm.description.trim(),
    }
    if (editTarget) {
      // The dialog doesn't edit context/serial (workflow-managed fields, e.g.
      // per-ticket DM bindings) — carry them through so a PUT can't drop them.
      if (editTarget.context !== undefined) body.context = editTarget.context
      if (editTarget.serial !== undefined) body.serial = editTarget.serial
    }
    setSubSaving(true)
    try {
      if (editTarget) {
        await api.put(`/subscriptions/${editTarget.id}`, body)
        toast.success("订阅已更新")
      } else {
        await api.post("/subscriptions", body)
        toast.success("订阅已创建")
      }
      setEditOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || "保存失败")
    } finally {
      setSubSaving(false)
    }
  }

  async function toggleEnabled(sub, next) {
    try {
      await api.put(`/subscriptions/${sub.id}`, { ...sub, enabled: next })
      await load()
    } catch (e) {
      toast.error(e.message || "更新失败")
    }
  }

  async function confirmDelete(sub) {
    try {
      await api.delete(`/subscriptions/${sub.id}`)
      toast.success("订阅已删除")
      await load()
    } catch (e) {
      toast.error(e.message || "删除失败")
    }
  }

  const enabledSubs = (subs || []).filter((s) => s.enabled !== false)
  const online = enabledSubs.filter((s) => statusByRoom[`${s.company}|${s.room_id}`]?.connected).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          监听进程按订阅对房间保持实时订阅，命中关键词的消息触发所选工作流。
          {subs ? ` ${subs.length} 个订阅 · ${online}/${enabledSubs.length} 在线` : ""}
        </p>
        <IconButton color="gray" variant="ghost" aria-label="刷新" onClick={load}>
          <RefreshCw />
        </IconButton>
        <Button size="sm" onClick={openNew}>
          <Plus data-icon="inline-start" />
          新增订阅
        </Button>
      </div>

      {subs === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : subs.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug />
            </EmptyMedia>
            <EmptyTitle>还没有监听订阅</EmptyTitle>
            <EmptyDescription>新增一条订阅：选择公司、房间与要触发的工作流，监听器会立即对该房间保持实时订阅。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {subs.map((sub) => {
            const st = statusByRoom[`${sub.company}|${sub.room_id}`]
            const connected = st?.connected
            return (
              <li key={sub.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{sub.workflow_name || sub.workflow_id}</span>
                    {sub.enabled ? (
                      connected ? (
                        <Badge variant="secondary" className="text-[10px]">连接中</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">未连接</Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-[10px]">已停用</Badge>
                    )}
                    {sub.context && Object.keys(sub.context).length > 0 ? (
                      <Badge variant="outline" className="text-[10px]">工作流注册</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {sub.company} · {sub.room_id}
                    </span>
                    {(sub.keywords || []).length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {(sub.keywords || []).map((k) => (
                          <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                        ))}
                      </span>
                    ) : (
                      <span>无关键词（每条消息都触发）</span>
                    )}
                  </div>
                  {st?.last_error && !connected ? <span className="text-xs text-destructive">连接错误：{st.last_error}</span> : null}
                </div>
                <Switch className="shrink-0" checked={sub.enabled !== false} onCheckedChange={(v) => toggleEnabled(sub, v)} />
                <IconButton color="blue" variant="ghost" aria-label="编辑" onClick={() => openEdit(sub)}>
                  <Pencil />
                </IconButton>
                <ConfirmDeleteButton variant="ghost" onConfirm={() => confirmDelete(sub)} />
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "编辑监听订阅" : "新增监听订阅"}</DialogTitle>
            <DialogDescription>命中关键词的房间消息将触发所选工作流，消息内容作为运行输入。</DialogDescription>
          </DialogHeader>
          {editTarget?.context && Object.keys(editTarget.context).length > 0 ? (
            <Alert>
              <AlertDescription>
                该订阅由工作流运行时注册，携带上下文绑定（
                <span className="font-mono text-xs">{Object.keys(editTarget.context).join(" / ")}</span>
                ，如工单与责任人 DM 的对应关系）。手工修改公司/房间会破坏这层绑定——如需换人请让工作流走转派流程，这里通常只应临时启停。
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="int-company">Appia 公司账号</FieldLabel>
              <Select value={subForm.company} onValueChange={(v) => setSubForm((f) => ({ ...f, company: v }))}>
                <SelectTrigger id="int-company" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(companies.length ? companies : [subForm.company]).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="int-room">房间 ID（rid）</FieldLabel>
              <Input id="int-room" value={subForm.room_id} onChange={(e) => setSubForm((f) => ({ ...f, room_id: e.target.value }))} placeholder="6710802fbeee3b3cb219ec3f" />
            </Field>
            <Field>
              <FieldLabel htmlFor="int-wf">触发工作流</FieldLabel>
              <Select value={subForm.workflow_id} onValueChange={(v) => setSubForm((f) => ({ ...f, workflow_id: v }))}>
                <SelectTrigger id="int-wf" size="sm" className="w-full">
                  <SelectValue placeholder="选择工作流" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>消息到达时启动该工作流的一个运行，消息挂在 input（input.message / input.text …）。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="int-kw">关键词（逗号分隔）</FieldLabel>
              <Input id="int-kw" value={subForm.keywords} onChange={(e) => setSubForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="验证码, 天擎" />
              <FieldDescription>消息含任一关键词才触发；留空表示房间每条消息都触发。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="int-desc">说明（可选）</FieldLabel>
              <Textarea id="int-desc" value={subForm.description} onChange={(e) => setSubForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="int-enabled" checked={subForm.enabled} onCheckedChange={(v) => setSubForm((f) => ({ ...f, enabled: v }))} />
              <FieldLabel htmlFor="int-enabled">启用（保存后立即生效）</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={saveSub} disabled={subSaving}>
              {subSaving ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default AppiaSubscriptionsPanel
