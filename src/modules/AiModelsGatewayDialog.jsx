// 按网关管理模型：填网关地址 + API Key → 拉取网关的模型清单（GET /v1/models）→
// 勾选（可先批量测试）→ 同步。同步语义见 soc-ai internal/aimodels/gateway.go：
// 勾选 = 该网关下启用的模型，缺的建行；取消勾选的已注册行只停用不删除（工作流/会话
// 按名称引用）；该网关所有行的地址与 Key 一并更新，所以换 Key 就是再同步一次。

import { useEffect, useMemo, useState } from "react"
import { CircleCheck, CircleX, RefreshCw, Search, Zap } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

// 与后端 probeBatch 一致：一次请求最多测 8 个（soc-ai 请求超时 30s）。
const PROBE_BATCH = 8
const PROBE_PARALLEL = 3

const EMPTY = { name: "", base_url: "", api_key: "" }

export function GatewayDialog({ open, onOpenChange, gateway, apiClient, onSynced }) {
  const [form, setForm] = useState(EMPTY)
  const [models, setModels] = useState(null) // discover 结果
  const [selected, setSelected] = useState(() => new Set())
  const [apis, setApis] = useState({}) // model → anthropic|openai
  const [probe, setProbe] = useState({}) // model → {ok, latency_ms, error} | "pending"
  const [query, setQuery] = useState("")
  const [discovering, setDiscovering] = useState(false)
  const [probing, setProbing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const isEdit = !!gateway

  useEffect(() => {
    if (!open) return
    setForm(gateway ? { name: gateway.name, base_url: gateway.base_url, api_key: "" } : EMPTY)
    setModels(null)
    setSelected(new Set())
    setApis({})
    setProbe({})
    setQuery("")
    if (gateway) discover({ name: gateway.name, base_url: gateway.base_url, api_key: "" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gateway])

  function body(extra) {
    return { name: form.name.trim(), base_url: form.base_url.trim(), api_key: form.api_key.trim(), ...extra }
  }

  async function discover(f = body()) {
    if (!f.name || !f.base_url) {
      toast.error("请先填写网关名称和地址")
      return
    }
    setDiscovering(true)
    try {
      const r = await apiClient.post("/api/v1/ai/models/gateways/discover", f)
      const list = r?.models || []
      setModels(list)
      setApis(Object.fromEntries(list.map((m) => [m.model, m.api])))
      setProbe({})
      // 已有注册行时保持现状（启用的勾上）；全新网关默认全选，测试后剔除不通的
      const anyRegistered = list.some((m) => m.registered)
      setSelected(
        new Set(
          list
            .filter((m) => (anyRegistered ? m.registered && m.enabled : m.upstream))
            .map((m) => m.model),
        ),
      )
    } catch (err) {
      toast.error(`获取模型失败：${err.message}`)
    } finally {
      setDiscovering(false)
    }
  }

  const visible = useMemo(() => {
    if (!models) return []
    const q = query.trim().toLowerCase()
    return q ? models.filter((m) => m.model.toLowerCase().includes(q)) : models
  }, [models, query])

  const newCount = models?.filter((m) => !m.registered).length ?? 0

  function toggle(model, on) {
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(model)
      else n.delete(model)
      return n
    })
  }

  function setVisible(on) {
    setSelected((s) => {
      const n = new Set(s)
      for (const m of visible) {
        if (on) n.add(m.model)
        else n.delete(m.model)
      }
      return n
    })
  }

  async function runProbe() {
    const targets = visible.filter((m) => selected.has(m.model) && m.upstream).map((m) => m.model)
    if (targets.length === 0) {
      toast.error("没有可测试的勾选模型")
      return
    }
    setProbing(true)
    setProbe((p) => ({ ...p, ...Object.fromEntries(targets.map((m) => [m, "pending"])) }))
    const batches = []
    for (let i = 0; i < targets.length; i += PROBE_BATCH) batches.push(targets.slice(i, i + PROBE_BATCH))
    const failed = []
    let next = 0
    async function worker() {
      while (next < batches.length) {
        const batch = batches[next++]
        try {
          const res = await apiClient.post(
            "/api/v1/ai/models/gateways/probe",
            body({ models: batch.map((m) => ({ model: m, api: apis[m] })) }),
          )
          setProbe((p) => ({ ...p, ...Object.fromEntries(res.map((r) => [r.model, r])) }))
          failed.push(...res.filter((r) => !r.ok).map((r) => r.model))
        } catch (err) {
          setProbe((p) => ({ ...p, ...Object.fromEntries(batch.map((m) => [m, { ok: false, error: err.message }])) }))
          failed.push(...batch)
        }
      }
    }
    await Promise.all(Array.from({ length: PROBE_PARALLEL }, worker))
    setProbing(false)
    if (failed.length) {
      setSelected((s) => {
        const n = new Set(s)
        failed.forEach((m) => n.delete(m))
        return n
      })
      toast.warning(`${targets.length - failed.length} 个通过，${failed.length} 个未通过（已取消勾选）`)
    } else {
      toast.success(`${targets.length} 个模型全部通过`)
    }
  }

  async function sync() {
    setSyncing(true)
    try {
      const r = await apiClient.post(
        "/api/v1/ai/models/gateways/sync",
        body({ models: [...selected].map((m) => ({ model: m, api: apis[m] })) }),
      )
      const parts = [`新增 ${r.created?.length ?? 0}`, `更新 ${r.updated?.length ?? 0}`, `停用 ${r.disabled?.length ?? 0}`]
      toast.success(`已同步：${parts.join("，")}`)
      if (r.kept_default?.length) toast.info(`默认模型 ${r.kept_default.join("、")} 未勾选，但仍保持启用`)
      onSynced?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(`同步失败：${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.model))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `管理网关 ${gateway.name}` : "从网关同步模型"}</DialogTitle>
          <DialogDescription>
            填写网关地址与 API Key 后获取网关上的模型清单，勾选要启用的模型并同步。取消勾选的已注册模型会被停用（不删除）。
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="gw-name">网关名称</FieldLabel>
            <Input
              id="gw-name"
              value={form.name}
              disabled={isEdit}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="claw"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gw-base">网关地址</FieldLabel>
            <Input
              id="gw-base"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              placeholder="https://api.example.com"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gw-key">API Key</FieldLabel>
            <Input
              id="gw-key"
              type="password"
              autoComplete="off"
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder={isEdit ? "留空沿用已保存的 Key" : "留空沿用该地址下已注册模型的 Key"}
            />
          </Field>
          <FieldDescription className="sm:col-span-3">
            地址填网关根地址（末尾的 /v1 会自动去掉）。修改 Key 后同步，会更新该网关下所有模型的 Key。
          </FieldDescription>
        </FieldGroup>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => discover()} disabled={discovering}>
            {discovering ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            获取模型清单
          </Button>
          {models ? (
            <>
              <InputGroup className="min-w-40 flex-1">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="筛选模型，如 deepseek"
                />
              </InputGroup>
              <Button size="sm" variant="outline" onClick={() => setVisible(!allVisibleSelected)}>
                {allVisibleSelected ? "取消全选" : "全选"}
              </Button>
              <Button size="sm" variant="outline" onClick={runProbe} disabled={probing}>
                {probing ? <Spinner data-icon="inline-start" /> : <Zap data-icon="inline-start" />}
                测试勾选
              </Button>
            </>
          ) : null}
        </div>

        {models ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {visible.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">没有匹配的模型</div>
            ) : (
              <ul className="divide-y">
                {visible.map((m) => {
                  const pr = probe[m.model]
                  const api = apis[m.model] || "anthropic"
                  return (
                    <li key={m.model} className="flex items-center gap-3 px-3 py-1.5">
                      <Checkbox
                        id={`gw-m-${m.model}`}
                        checked={selected.has(m.model)}
                        onCheckedChange={(c) => toggle(m.model, !!c)}
                      />
                      <label htmlFor={`gw-m-${m.model}`} className="min-w-0 flex-1 truncate font-mono text-xs">
                        {m.model}
                        {m.row_name && m.row_name !== m.model ? (
                          <span className="ml-2 font-sans text-muted-foreground">（{m.row_name}）</span>
                        ) : null}
                      </label>
                      {!m.upstream ? (
                        <Badge variant="destructive" title="网关清单里已没有这个模型">网关已下架</Badge>
                      ) : !m.registered ? (
                        <Badge variant="outline">新</Badge>
                      ) : !m.enabled ? (
                        <Badge variant="outline">已停用</Badge>
                      ) : (
                        <Badge variant="secondary">已启用</Badge>
                      )}
                      <button
                        type="button"
                        className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                        title="点击切换协议：Anthropic Messages（pi / Claude Code / 内置工作流）或 OpenAI Responses（Codex）"
                        onClick={() =>
                          setApis((a) => ({ ...a, [m.model]: api === "openai" ? "anthropic" : "openai" }))
                        }
                      >
                        {api === "openai" ? "OpenAI" : "Anthropic"}
                      </button>
                      <span className="flex w-20 justify-end text-xs">
                        {pr === "pending" ? (
                          <Spinner />
                        ) : pr?.ok ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <CircleCheck className="size-3.5" />
                            {(pr.latency_ms / 1000).toFixed(1)}s
                          </span>
                        ) : pr ? (
                          <span className="flex items-center gap-1 text-destructive" title={pr.error}>
                            <CircleX className="size-3.5" />
                            失败
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {models ? `共 ${models.length} 个，新 ${newCount} 个，已勾选 ${selected.size} 个` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
              取消
            </Button>
            <Button onClick={sync} disabled={!models || syncing || probing}>
              {syncing ? <Spinner data-icon="inline-start" /> : null}
              同步（启用 {selected.size} 个）
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default GatewayDialog
