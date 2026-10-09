// 新建工单 dialog — the curated create form for the tickets card list,
// mirroring SecIncidentCreate. Select options come from the /meta columns via
// optionsFor. Posts to the dedicated /api/v1/tickets endpoint (NOT the generic
// table records path) so the server stamps 创建人 + the initial 处理记录
// timeline entry and defaults 状态 to 待处理.
//
// Also reused by SecIncidentItem's「生成工单」: `initial` pre-fills the form
// (re-applied every time the dialog opens; extra keys like 来源 ride along
// into the POST body even without a bound input), `trigger` swaps the
// default「新建工单」button for a caller-supplied one.

import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { optionsFor, QuickSelect } from "@/platform"
import {
  TICKET_COMPANY_FALLBACK,
  TICKET_PRIORITY_FALLBACK,
  TICKET_TYPE_FALLBACK,
} from "./TicketItem.jsx"

const EMPTY_FORM = {
  标题: "",
  类型: "告警处置",
  优先级: "中",
  负责人: "",
  责任人邮箱: "",
  前台公司: "",
  组织架构: "",
  关联告警: "",
  描述: "",
}

// Merge caller pre-fills over the empty form, dropping blank/nullish values
// so text inputs stay controlled (never receive undefined).
function mergedForm(initial) {
  const f = { ...EMPTY_FORM }
  for (const [k, v] of Object.entries(initial || {})) {
    if (v === null || v === undefined || v === "") continue
    f[k] = String(v)
  }
  return f
}

export function TicketCreateDialog({
  apiClient,
  setError,
  columns,
  onCreated,
  initial,
  trigger,
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => mergedForm(initial))
  const [submitting, setSubmitting] = useState(false)

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))
  const setText = (field) => (e) => set(field)(e.target.value)

  async function handleSubmit() {
    if (!form.标题.trim()) {
      toast.error("请填写标题")
      return
    }
    setSubmitting(true)
    try {
      const body = { 来源: "manual" }
      for (const [k, v] of Object.entries(form)) {
        const s = typeof v === "string" ? v.trim() : v
        if (s === "" || s === null || s === undefined) continue
        body[k] = s
      }
      await apiClient.post("/api/v1/tickets", body)
      toast.success("已创建工单")
      setOpen(false)
      setForm(mergedForm(initial))
      onCreated?.()
    } catch (err) {
      setError?.(err.message || "创建失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Re-seed on every open so the form tracks the current record's
        // pre-fill (and a cancelled edit doesn't leak into the next open).
        if (o) setForm(mergedForm(initial))
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus data-icon="inline-start" />
            新建工单
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建工单</DialogTitle>
          <DialogDescription>
            新工单默认状态为「待处理」；状态流转与处理记录在卡片中操作，全程自动留痕。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>标题 *</FieldLabel>
            <Input
              value={form.标题}
              onChange={setText("标题")}
              placeholder="一句话概括这条工单"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>类型</FieldLabel>
              <QuickSelect
                value={form.类型}
                placeholder="选择类型"
                options={optionsFor(columns, "类型", TICKET_TYPE_FALLBACK)}
                onChange={set("类型")}
              />
            </Field>
            <Field>
              <FieldLabel>优先级</FieldLabel>
              <QuickSelect
                value={form.优先级}
                placeholder="选择优先级"
                options={optionsFor(columns, "优先级", TICKET_PRIORITY_FALLBACK)}
                onChange={set("优先级")}
              />
            </Field>
            <Field>
              <FieldLabel>负责人</FieldLabel>
              <Input
                value={form.负责人}
                onChange={setText("负责人")}
                placeholder="姓名"
              />
            </Field>
            <Field>
              <FieldLabel>责任人邮箱</FieldLabel>
              <Input
                type="email"
                value={form.责任人邮箱}
                onChange={setText("责任人邮箱")}
                placeholder="name@example.com（可选）"
              />
            </Field>
            <Field>
              <FieldLabel>前台公司</FieldLabel>
              <QuickSelect
                value={form.前台公司}
                placeholder="选择公司"
                options={optionsFor(columns, "前台公司", TICKET_COMPANY_FALLBACK)}
                onChange={set("前台公司")}
              />
            </Field>
            <Field>
              <FieldLabel>组织架构</FieldLabel>
              <Input
                value={form.组织架构}
                onChange={setText("组织架构")}
                placeholder="部门路径（可选）"
              />
            </Field>
            <Field>
              <FieldLabel>关联告警 ID</FieldLabel>
              <Input
                value={form.关联告警}
                onChange={setText("关联告警")}
                placeholder="安全事件记录 ID（可选）"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>工单详情</FieldLabel>
            <Textarea
              rows={3}
              value={form.描述}
              onChange={setText("描述")}
              placeholder="背景、影响与要做的事（支持 markdown）"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TicketCreateDialog
