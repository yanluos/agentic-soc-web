// AI model registry CRUD. The "test" button runs a small probe and reports
// latency. One shared pool: every enabled model is selectable by both the AI
// assistant and workflow steps; setting `is_default:true` clears every other
// default (there is exactly one default for both consumers). `api` is the
// row's wire protocol: anthropic (builtin loop / pi / Claude Code engines) or
// openai (Responses API — the Codex engine).

import { useCallback, useEffect, useState } from "react"
import { Plus, Zap, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Card, CardContent } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
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
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const EMPTY = {
  name: "",
  base_url: "",
  api_key: "",
  default_model: "",
  api: "anthropic",
  enabled: true,
  is_default: false,
}

export function AiModelsModule({ apiClient, setError }) {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.get("/api/v1/ai/models")
      setModels(Array.isArray(list) ? list : list?.models || [])
    } catch (err) {
      setError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, setError])

  useEffect(() => {
    reload()
  }, [reload])

  async function runTest(id) {
    setTesting((m) => ({ ...m, [id]: true }))
    setTestResults((m) => ({ ...m, [id]: null }))
    try {
      const r = await apiClient.post(`/api/v1/ai/models/${id}/test`)
      setTestResults((m) => ({ ...m, [id]: r }))
      if (r?.ok) toast.success(`测试通过 (${r.latency_ms ?? "?"} ms)`)
      else toast.error(`测试失败: ${r?.error || "未知错误"}`)
    } catch (err) {
      setTestResults((m) => ({ ...m, [id]: { ok: false, error: err.message } }))
      toast.error(err.message)
    } finally {
      setTesting((m) => ({ ...m, [id]: false }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">AI 模型注册</h2>
          <p className="text-sm text-muted-foreground">
            AI 助手与工作流共用的 LLM 模型池：启用即两边可选，默认模型对两边同时生效
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          新增模型
        </Button>
      </div>

      <Card className={cardHover}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>端点</TableHead>
                <TableHead>默认模型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>测试</TableHead>
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂未注册模型
                  </TableCell>
                </TableRow>
              ) : (
                models.map((m) => {
                  const tr = testResults[m.id]
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {m.name}
                          {m.is_default ? <Badge>默认</Badge> : null}
                          {m.api === "openai" ? (
                            <Badge variant="outline" title="OpenAI Responses 协议，供 Codex 引擎使用">OpenAI</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground" title={m.base_url || "Anthropic 官方"}>
                        {m.base_url || "Anthropic 官方"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {m.default_model}
                      </TableCell>
                      <TableCell>
                        {m.enabled ? (
                          <Badge variant="secondary">已启用</Badge>
                        ) : (
                          <Badge variant="outline">已停用</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => runTest(m.id)}
                            disabled={testing[m.id]}
                          >
                            {testing[m.id] ? <Spinner data-icon="inline-start" /> : <Zap data-icon="inline-start" />}
                            测试
                          </Button>
                          {tr ? (
                            tr.ok ? (
                              <span className="text-xs text-muted-foreground">
                                {tr.latency_ms} ms
                              </span>
                            ) : (
                              <span className="text-xs text-destructive" title={tr.error}>
                                失败
                              </span>
                            )
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <IconButton
                            color="gray"
                            variant="soft"
                            size="sm"
                            onClick={() => setEditTarget(m)}
                            aria-label="编辑"
                          >
                            <Pencil />
                          </IconButton>
                          <ConfirmDeleteButton
                            variant="soft"
                            size="sm"
                            disabled={m.is_default}
                            onConfirm={async () => {
                              try {
                                await apiClient.delete(`/api/v1/ai/models/${m.id}`)
                                toast.success("已删除")
                                reload()
                              } catch (err) {
                                setError?.(err.message)
                              }
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ModelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新增模型"
        onSubmit={async (body) => {
          try {
            await apiClient.post("/api/v1/ai/models", body)
            toast.success("已创建")
            setCreateOpen(false)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

      <ModelDialog
        open={!!editTarget}
        target={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title={editTarget ? `编辑 ${editTarget.name}` : "编辑"}
        onSubmit={async (body) => {
          try {
            await apiClient.patch(`/api/v1/ai/models/${editTarget.id}`, body)
            toast.success("已保存")
            setEditTarget(null)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

    </div>
  )
}

function ModelDialog({ open, onOpenChange, target, title, onSubmit }) {
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      if (target) {
        setForm({
          name: target.name || "",
          base_url: target.base_url || "",
          api_key: target.api_key || "",
          default_model: target.default_model || "",
          api: target.api || "anthropic",
          enabled: !!target.enabled,
          is_default: !!target.is_default,
        })
      } else {
        setForm(EMPTY)
      }
    }
  }, [open, target])

  const isEdit = !!target

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            模型对 AI 助手和工作流同时可用。设为默认时会自动取消其他模型的默认标记。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              const body = { ...form }
              if (isEdit && !body.api_key) delete body.api_key
              await onSubmit(body)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="md-name">名称</FieldLabel>
              <Input
                id="md-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="md-base">Base URL (可选)</FieldLabel>
              <Input
                id="md-base"
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="md-key">API Key</FieldLabel>
              <Input
                id="md-key"
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={isEdit ? "留空保留原值" : "sk-..."}
                autoComplete="off"
                required={!isEdit}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="md-model">默认模型名</FieldLabel>
              <Input
                id="md-model"
                value={form.default_model}
                onChange={(e) => setForm((f) => ({ ...f, default_model: e.target.value }))}
                placeholder="gpt-4o-mini"
                required
              />
              <FieldDescription>与 provider 协议一致的模型标识</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>协议</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={form.api}
                onValueChange={(v) => v && setForm((f) => ({ ...f, api: v }))}
              >
                <ToggleGroupItem value="anthropic">Anthropic Messages</ToggleGroupItem>
                <ToggleGroupItem value="openai">OpenAI Responses</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Anthropic 协议供 pi / Claude Code 引擎与内置工作流使用；OpenAI Responses 协议供 Codex 引擎使用（Base URL 填网关根地址，自动补 /v1）
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="md-enabled"
                checked={form.enabled}
                onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: !!c }))}
              />
              <FieldLabel htmlFor="md-enabled">启用</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="md-default"
                checked={form.is_default}
                onCheckedChange={(c) => setForm((f) => ({ ...f, is_default: !!c }))}
              />
              <FieldLabel htmlFor="md-default">设为默认模型</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AiModelsModule
