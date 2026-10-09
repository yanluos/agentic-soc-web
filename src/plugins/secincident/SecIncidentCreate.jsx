// 新建安全事件 dialog — the curated create form for the secincident card
// list (the list view has no inline table create-row). Select options come
// from the /meta columns via optionsFor; 事件发生时间 is entered with a
// datetime-local input and stored in the table's `YYYY-MM-DD HH:mm:ss`
// string convention (fromDtLocal).

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
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { fromDtLocal } from "@/utils.js"
import {
  optionsFor,
  QuickSelect,
  RISK_FALLBACK,
  STATUS_FALLBACK,
} from "@/platform"

const SOURCE_FALLBACK = [
  "天眼",
  "天擎",
  "EDR",
  "系统防护",
  "病毒查杀",
  "邮件安全网关",
  "ITDR",
  "回溯告警",
  "员工上报",
]
const ALERT_TYPE_FALLBACK = ["恶意软件", "攻击利用"]

const EMPTY_FORM = {
  标题: "",
  来源: "",
  告警类型: "",
  风险等级: "",
  处置状态: "待跟进",
  事件发生时间: "", // datetime-local, converted on submit
  责任员工: "",
  责任人邮箱: "",
  前台公司: "",
  涉事资产: "",
  威胁指标: "",
  详情: "",
}

export function SecIncidentCreateDialog({
  apiClient,
  setError,
  columns,
  onCreated,
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const set = (field) => (value) =>
    setForm((f) => ({ ...f, [field]: value }))
  const setText = (field) => (e) => set(field)(e.target.value)

  async function handleSubmit() {
    if (!form.标题.trim()) {
      toast.error("请填写标题")
      return
    }
    setSubmitting(true)
    try {
      const body = {}
      for (const [k, v] of Object.entries(form)) {
        const s = typeof v === "string" ? v.trim() : v
        if (s === "" || s === null || s === undefined) continue
        body[k] = k === "事件发生时间" ? fromDtLocal(s) : s
      }
      await apiClient.post("/api/v1/tables/secincident/records", body)
      toast.success("已创建安全事件")
      setOpen(false)
      setForm(EMPTY_FORM)
      onCreated?.()
    } catch (err) {
      setError?.(err.message || "创建失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          新建事件
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建安全事件</DialogTitle>
          <DialogDescription>
            手工登记一条安全事件(如员工上报)。研判结论、处置建议等可在创建后于卡片中补充。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>标题 *</FieldLabel>
            <Input
              value={form.标题}
              onChange={setText("标题")}
              placeholder="一句话描述该事件"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>来源</FieldLabel>
              <QuickSelect
                value={form.来源}
                placeholder="选择来源"
                options={optionsFor(columns, "来源", SOURCE_FALLBACK)}
                onChange={set("来源")}
              />
            </Field>
            <Field>
              <FieldLabel>告警类型</FieldLabel>
              <QuickSelect
                value={form.告警类型}
                placeholder="选择类型"
                options={optionsFor(columns, "告警类型", ALERT_TYPE_FALLBACK)}
                onChange={set("告警类型")}
              />
            </Field>
            <Field>
              <FieldLabel>风险等级</FieldLabel>
              <QuickSelect
                value={form.风险等级}
                placeholder="待定级"
                options={optionsFor(columns, "风险等级", RISK_FALLBACK)}
                onChange={set("风险等级")}
              />
            </Field>
            <Field>
              <FieldLabel>处置状态</FieldLabel>
              <QuickSelect
                value={form.处置状态}
                placeholder="待跟进"
                options={optionsFor(columns, "处置状态", STATUS_FALLBACK)}
                onChange={set("处置状态")}
              />
            </Field>
            <Field>
              <FieldLabel>事件发生时间</FieldLabel>
              <Input
                type="datetime-local"
                value={form.事件发生时间}
                onChange={setText("事件发生时间")}
              />
            </Field>
            <Field>
              <FieldLabel>前台公司</FieldLabel>
              <QuickSelect
                value={form.前台公司}
                placeholder="选择公司"
                options={optionsFor(columns, "前台公司", [])}
                onChange={set("前台公司")}
              />
            </Field>
            <Field>
              <FieldLabel>责任员工</FieldLabel>
              <Input
                value={form.责任员工}
                onChange={setText("责任员工")}
                placeholder="姓名"
              />
            </Field>
            <Field>
              <FieldLabel>责任人邮箱</FieldLabel>
              <Input
                type="email"
                value={form.责任人邮箱}
                onChange={setText("责任人邮箱")}
                placeholder="name@example.com"
              />
            </Field>
            <Field>
              <FieldLabel>涉事资产</FieldLabel>
              <Input
                value={form.涉事资产}
                onChange={setText("涉事资产")}
                placeholder="主机名 / IP"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>威胁指标 (IOC)</FieldLabel>
            <Textarea
              rows={2}
              value={form.威胁指标}
              onChange={setText("威胁指标")}
              placeholder="域名 / IP / hash,多个换行分隔"
            />
          </Field>
          <Field>
            <FieldLabel>详情</FieldLabel>
            <Textarea
              rows={3}
              value={form.详情}
              onChange={setText("详情")}
              placeholder="事件经过、处置与分析记录（支持 markdown）"
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

export default SecIncidentCreateDialog
